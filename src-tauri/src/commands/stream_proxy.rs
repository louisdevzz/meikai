use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct CachedStream {
    pub audio_url: String,
    pub audio_mime: String,
    pub video_url: Option<String>,
    pub video_mime: Option<String>,
    pub referer: Option<String>,
    pub use_ios_ua: bool,
    pub duration_seconds: u32,
    pub created_at: Instant,
}

static PROXY_PORT: AtomicU16 = AtomicU16::new(0);
static PROXY_INIT_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static STREAM_CACHE: OnceLock<RwLock<HashMap<String, CachedStream>>> = OnceLock::new();
static IOS_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static DESKTOP_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn cache() -> &'static RwLock<HashMap<String, CachedStream>> {
    STREAM_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn http_client_for(use_ios: bool) -> &'static reqwest::Client {
    if use_ios {
        IOS_HTTP_CLIENT.get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)")
                .build()
                .expect("Failed to build iOS proxy reqwest client")
        })
    } else {
        DESKTOP_HTTP_CLIENT.get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
                .build()
                .expect("Failed to build desktop proxy reqwest client")
        })
    }
}

pub async fn register_external_stream(key: &str, entry: CachedStream) {
    cache().write().await.insert(key.to_string(), entry);
}

pub async fn get_cached_stream(key: &str) -> Option<CachedStream> {
    let guard = cache().read().await;
    guard
        .get(key)
        .filter(|e| e.created_at.elapsed() < Duration::from_secs(7200))
        .cloned()
}

fn clean_mime(raw: &str, default_mime: &str) -> String {
    let base = raw.split(';').next().unwrap_or(default_mime).trim();
    if base.is_empty() {
        default_mime.to_string()
    } else {
        base.to_string()
    }
}

fn extract_clen_from_url(raw_url: &str) -> Option<u64> {
    url::Url::parse(raw_url).ok().and_then(|u| {
        u.query_pairs()
            .find(|(k, _)| k == "clen")
            .and_then(|(_, v)| v.parse::<u64>().ok())
    })
}

/// Resolve fresh stream URLs via RustyPipe and cache them
pub async fn resolve_and_cache(video_id: &str) -> Result<CachedStream, String> {
    let rp = rustypipe::client::RustyPipe::new();
    let player = rp
        .query()
        .player(video_id)
        .await
        .map_err(|e| format!("RustyPipe error: {e}"))?;

    let audio_choice = player
        .audio_streams
        .iter()
        .filter(|s| s.mime.contains("mp4"))
        .max_by_key(|s| s.bitrate)
        .or_else(|| player.audio_streams.iter().max_by_key(|s| s.bitrate));

    let (audio_url, audio_mime) = if let Some(s) = audio_choice {
        (s.url.clone(), clean_mime(&s.mime, "audio/mp4"))
    } else if let Some(v) = player.video_streams.first() {
        (v.url.clone(), clean_mime(&v.mime, "video/mp4"))
    } else {
        return Err("No playable audio stream found".to_string());
    };

    let video_choice = player
        .video_streams
        .iter()
        .filter(|v| v.mime.contains("mp4"))
        .max_by_key(|v| v.height)
        .or_else(|| {
            player
                .video_only_streams
                .iter()
                .filter(|v| v.mime.contains("mp4") && v.height <= 1080)
                .max_by_key(|v| v.height)
        })
        .or_else(|| player.video_streams.first());

    let (video_url, video_mime) = match video_choice {
        Some(v) => (Some(v.url.clone()), Some(clean_mime(&v.mime, "video/mp4"))),
        None => (None, None),
    };

    let cached = CachedStream {
        audio_url,
        audio_mime,
        video_url,
        video_mime,
        referer: None,
        use_ios_ua: true,
        duration_seconds: player.details.duration,
        created_at: Instant::now(),
    };

    cache()
        .write()
        .await
        .insert(video_id.to_string(), cached.clone());

    Ok(cached)
}

async fn get_or_resolve(video_id: &str, force_refresh: bool) -> Result<CachedStream, String> {
    if !force_refresh {
        let guard = cache().read().await;
        if let Some(entry) = guard.get(video_id) {
            if entry.created_at.elapsed() < Duration::from_secs(7200) {
                return Ok(entry.clone());
            }
        }
    }
    resolve_and_cache(video_id).await
}

/// Start the local HTTP range-capable streaming proxy if not yet running, returning its bound port
pub async fn ensure_proxy_started() -> Result<u16, String> {
    let existing = PROXY_PORT.load(Ordering::SeqCst);
    if existing != 0 {
        return Ok(existing);
    }

    let lock = PROXY_INIT_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = lock.lock().await;

    let double_check = PROXY_PORT.load(Ordering::SeqCst);
    if double_check != 0 {
        return Ok(double_check);
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local stream proxy: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to inspect proxy port: {e}"))?
        .port();

    PROXY_PORT.store(port, Ordering::SeqCst);
    tracing::info!("Local media stream proxy listening on 127.0.0.1:{port}");

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tokio::spawn(async move {
                        let _ = handle_connection(stream).await;
                    });
                }
                Err(e) => {
                    tracing::warn!("Stream proxy accept error: {e}");
                }
            }
        }
    });

    Ok(port)
}

async fn write_error_response(stream: &mut TcpStream, status: &str, msg: &str) {
    let body = msg.as_bytes();
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

async fn handle_connection(mut stream: TcpStream) -> Result<(), String> {
    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 2048];
    loop {
        let n = stream.read(&mut tmp).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 16384 {
            break;
        }
    }

    let req_str = String::from_utf8_lossy(&buf);
    let mut lines = req_str.split("\r\n");
    let request_line = match lines.next() {
        Some(l) if !l.trim().is_empty() => l,
        _ => return Ok(()),
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_uppercase();
    let target = parts.next().unwrap_or("/");

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return Ok(());
    }

    let mut range_header: Option<String> = None;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("range") {
                range_header = Some(v.trim().to_string());
            }
        }
    }

    // Parse /stream/<video_id>?kind=audio|video
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let video_id = match path.strip_prefix("/stream/") {
        Some(id) if !id.is_empty() => id.trim().to_string(),
        _ => {
            write_error_response(&mut stream, "404 Not Found", "Invalid stream path").await;
            return Ok(());
        }
    };

    let is_video = query.split('&').any(|kv| kv == "kind=video");

    let mut entry = match get_or_resolve(&video_id, false).await {
        Ok(c) => c,
        Err(e) => {
            write_error_response(&mut stream, "502 Bad Gateway", &e).await;
            return Ok(());
        }
    };

    let (mut upstream_url, mut content_mime) = if is_video {
        match (&entry.video_url, &entry.video_mime) {
            (Some(u), Some(m)) => (u.clone(), m.clone()),
            _ => {
                write_error_response(&mut stream, "404 Not Found", "No video stream").await;
                return Ok(());
            }
        }
    } else {
        (entry.audio_url.clone(), entry.audio_mime.clone())
    };

    // Translate HEAD into a minimal upstream GET probe (googlevideo returns 403 for HEAD)
    if method == "HEAD" {
        let mut total_len = extract_clen_from_url(&upstream_url);
        if total_len.is_none() {
            let mut probe_req = http_client_for(entry.use_ios_ua)
                .get(&upstream_url)
                .header("Range", "bytes=0-0");
            if let Some(ref rf) = entry.referer {
                probe_req = probe_req.header("Referer", rf);
            }
            if let Ok(probe) = probe_req.send().await
            {
                if let Some(cr) = probe
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                {
                    if let Some((_, total)) = cr.rsplit_once('/') {
                        total_len = total.trim().parse::<u64>().ok();
                    }
                }
            }
        }

        let mut hdrs = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_mime}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n"
        );
        if let Some(len) = total_len {
            hdrs.push_str(&format!("Content-Length: {len}\r\n"));
        }
        hdrs.push_str("\r\n");
        let _ = stream.write_all(hdrs.as_bytes()).await;
        return Ok(());
    }

    // Forward GET cleanly: googlevideo requires a Range header on c=IOS URLs (otherwise 403)
    let client_sent_range = range_header.is_some();
    let effective_range = range_header.unwrap_or_else(|| "bytes=0-".to_string());

    let mut attempt = 0u8;
    let upstream_resp = loop {
        let mut req = http_client_for(entry.use_ios_ua).get(&upstream_url);
        if entry.use_ios_ua || client_sent_range {
            req = req.header("Range", &effective_range);
        }
        if let Some(ref rf) = entry.referer {
            req = req.header("Referer", rf);
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                write_error_response(&mut stream, "502 Bad Gateway", &e.to_string()).await;
                return Ok(());
            }
        };

        let status = resp.status();
        if (status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::GONE)
            && attempt == 0
            && !video_id.contains(':')
        {
            attempt += 1;
            if let Ok(fresh) = get_or_resolve(&video_id, true).await {
                entry = fresh;
                if is_video {
                    if let (Some(u), Some(m)) = (&entry.video_url, &entry.video_mime) {
                        upstream_url = u.clone();
                        content_mime = m.clone();
                    }
                } else {
                    upstream_url = entry.audio_url.clone();
                    content_mime = entry.audio_mime.clone();
                }
                continue;
            }
        }
        break resp;
    };

    let status = upstream_resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        let reason = status.canonical_reason().unwrap_or("Upstream Error");
        eprintln!("[stream_proxy] Upstream error {code} {reason} for {video_id}");
        write_error_response(&mut stream, &format!("{code} {reason}"), "Upstream stream failed").await;
        return Ok(());
    }

    let status_line = if client_sent_range && status == reqwest::StatusCode::PARTIAL_CONTENT {
        "HTTP/1.1 206 Partial Content"
    } else {
        "HTTP/1.1 200 OK"
    };

    let mut hdrs = format!(
        "{status_line}\r\nContent-Type: {content_mime}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n"
    );

    if let Some(cl) = upstream_resp.headers().get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(s) = cl.to_str() {
            hdrs.push_str(&format!("Content-Length: {s}\r\n"));
        }
    }
    if client_sent_range {
        if let Some(cr) = upstream_resp.headers().get(reqwest::header::CONTENT_RANGE) {
            if let Ok(s) = cr.to_str() {
                hdrs.push_str(&format!("Content-Range: {s}\r\n"));
            }
        }
    }
    hdrs.push_str("\r\n");

    if stream.write_all(hdrs.as_bytes()).await.is_err() {
        return Ok(());
    }

    let mut resp = upstream_resp;
    while let Ok(Some(chunk)) = resp.chunk().await {
        if stream.write_all(&chunk).await.is_err() {
            break;
        }
    }

    Ok(())
}
