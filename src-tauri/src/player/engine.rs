use crate::commands::stream_proxy;
use crate::providers::{soundcloud, tiktok};
use reqwest::header;
use rodio::{Decoder, DeviceSinkBuilder, Player};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NativePlaybackSnapshot {
    pub track_id: Option<String>,
    pub is_playing: bool,
    pub is_buffering: bool,
    pub current_time: f64,
    pub duration: f64,
    pub ended: bool,
    pub error: Option<String>,
    pub video_url: Option<String>,
}

enum EngineCmd {
    LoadAndPlay {
        generation: u64,
        track_id: String,
        bytes: Vec<u8>,
        hint: String,
        duration_hint: f64,
        volume: f32,
        speed: f32,
        video_url: Option<String>,
    },
    Pause,
    Resume,
    Seek(f64),
    SetVolume(f32),
    SetSpeed(f32),
    Stop,
}

static SNAPSHOT: OnceLock<Mutex<NativePlaybackSnapshot>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static CMD_TX: OnceLock<mpsc::Sender<EngineCmd>> = OnceLock::new();
static SHARED_HTTP: OnceLock<reqwest::Client> = OnceLock::new();

fn snapshot() -> &'static Mutex<NativePlaybackSnapshot> {
    SNAPSHOT.get_or_init(|| Mutex::new(NativePlaybackSnapshot::default()))
}

fn http_client() -> &'static reqwest::Client {
    SHARED_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .expect("Failed to build audio downloader client")
    })
}

fn ios_http_client() -> &'static reqwest::Client {
    static IOS_HTTP: OnceLock<reqwest::Client> = OnceLock::new();
    IOS_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)")
            .build()
            .expect("Failed to build iOS audio downloader client")
    })
}

fn ensure_audio_thread() -> &'static mpsc::Sender<EngineCmd> {
    CMD_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<EngineCmd>();
        std::thread::spawn(move || {
            let mut sink_handle = match DeviceSinkBuilder::open_default_sink() {
                Ok(mut h) => {
                    h.log_on_drop(false);
                    Some(h)
                }
                Err(e) => {
                    let mut snap = snapshot().lock().unwrap();
                    snap.error = Some(format!("Audio device error: {e}"));
                    snap.is_buffering = false;
                    None
                }
            };

            let mut active_player: Option<Player> = None;
            let mut active_generation: u64 = 0;

            loop {
                match rx.recv_timeout(Duration::from_millis(80)) {
                    Ok(cmd) => match cmd {
                        EngineCmd::LoadAndPlay {
                            generation,
                            track_id,
                            bytes,
                            hint,
                            duration_hint,
                            volume,
                            speed,
                            video_url,
                        } => {
                            if generation < GENERATION.load(Ordering::SeqCst) {
                                continue;
                            }
                            active_generation = generation;
                            if let Some(old) = active_player.take() {
                                old.stop();
                            }

                            if sink_handle.is_none() {
                                if let Ok(mut h) = DeviceSinkBuilder::open_default_sink() {
                                    h.log_on_drop(false);
                                    sink_handle = Some(h);
                                }
                            }

                            let Some(ref handle) = sink_handle else {
                                let mut snap = snapshot().lock().unwrap();
                                snap.is_buffering = false;
                                snap.is_playing = false;
                                snap.error = Some("No audio output device available".to_string());
                                continue;
                            };

                            let byte_len = bytes.len() as u64;
                            let mut builder = Decoder::builder()
                                .with_data(Cursor::new(bytes))
                                .with_byte_len(byte_len)
                                .with_seekable(true)
                                .with_gapless(true);
                            if !hint.is_empty() {
                                builder = builder.with_hint(&hint);
                            }

                            let built = builder.build().or_else(|_| {
                                // Retry without hint if container differed
                                Err("Decode error")
                            });

                            match built {
                                Ok(source) => {
                                    use rodio::Source;
                                    let decoded_dur = source
                                        .total_duration()
                                        .map(|d| d.as_secs_f64())
                                        .filter(|&d| d > 0.5)
                                        .unwrap_or(duration_hint);

                                    let player = Player::connect_new(&handle.mixer());
                                    player.set_volume(volume);
                                    player.set_speed(speed);
                                    player.append(source);
                                    player.play();

                                    let mut snap = snapshot().lock().unwrap();
                                    snap.track_id = Some(track_id);
                                    snap.is_buffering = false;
                                    snap.is_playing = true;
                                    snap.current_time = 0.0;
                                    snap.duration = decoded_dur;
                                    snap.ended = false;
                                    snap.error = None;
                                    snap.video_url = video_url;

                                    active_player = Some(player);
                                }
                                Err(e) => {
                                    let mut snap = snapshot().lock().unwrap();
                                    snap.is_buffering = false;
                                    snap.is_playing = false;
                                    snap.error = Some(format!("Audio decode error: {e}"));
                                }
                            }
                        }
                        EngineCmd::Pause => {
                            if let Some(ref p) = active_player {
                                p.pause();
                            }
                            let mut snap = snapshot().lock().unwrap();
                            snap.is_playing = false;
                        }
                        EngineCmd::Resume => {
                            if let Some(ref p) = active_player {
                                p.play();
                            }
                            let mut snap = snapshot().lock().unwrap();
                            if active_player.is_some() {
                                snap.is_playing = true;
                            }
                        }
                        EngineCmd::Seek(secs) => {
                            if let Some(ref p) = active_player {
                                let target = Duration::from_secs_f64(secs.max(0.0));
                                let _ = p.try_seek(target);
                                let mut snap = snapshot().lock().unwrap();
                                snap.current_time = secs.max(0.0);
                            }
                        }
                        EngineCmd::SetVolume(vol) => {
                            if let Some(ref p) = active_player {
                                p.set_volume(vol.clamp(0.0, 2.0));
                            }
                        }
                        EngineCmd::SetSpeed(rate) => {
                            if let Some(ref p) = active_player {
                                p.set_speed(rate.clamp(0.25, 4.0));
                            }
                        }
                        EngineCmd::Stop => {
                            if let Some(old) = active_player.take() {
                                old.stop();
                            }
                            let mut snap = snapshot().lock().unwrap();
                            snap.is_playing = false;
                            snap.is_buffering = false;
                            snap.current_time = 0.0;
                        }
                    },
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }

                // Update live playback position & detect natural completion
                if let Some(ref p) = active_player {
                    let current_gen = GENERATION.load(Ordering::SeqCst);
                    if active_generation == current_gen {
                        let pos = p.get_pos().as_secs_f64();
                        let paused = p.is_paused();
                        let empty = p.empty();
                        let mut snap = snapshot().lock().unwrap();
                        if !snap.is_buffering {
                            snap.current_time = pos;
                            if empty && !paused {
                                snap.is_playing = false;
                                snap.ended = true;
                            } else {
                                snap.is_playing = !paused && !empty;
                            }
                        }
                    }
                }
            }
        });
        tx
    })
}

async fn download_hls_fmp4(m3u8_url: &str) -> Result<Vec<u8>, String> {
    let manifest = http_client()
        .get(m3u8_url)
        .send()
        .await
        .map_err(|e| format!("HLS manifest fetch error: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut init_url: Option<String> = None;
    let mut seg_urls: Vec<String> = Vec::new();

    for line in manifest.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("#EXT-X-MAP:URI=\"") {
            if let Some(end_idx) = rest.find('"') {
                init_url = Some(rest[..end_idx].to_string());
            }
        } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            seg_urls.push(trimmed.to_string());
        }
    }

    if seg_urls.is_empty() {
        return Err("No audio segments found in HLS playlist".to_string());
    }

    // Download init segment + media segments concurrently in bounded batches
    let mut urls_in_order = Vec::with_capacity(seg_urls.len() + 1);
    if let Some(init) = init_url {
        urls_in_order.push(init);
    }
    urls_in_order.extend(seg_urls);

    let total_parts = urls_in_order.len();
    let mut parts: Vec<Option<Vec<u8>>> = vec![None; total_parts];
    let mut join_set = tokio::task::JoinSet::new();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(8));

    for (idx, u) in urls_in_order.into_iter().enumerate() {
        let sem = semaphore.clone();
        join_set.spawn(async move {
            let _permit = sem.acquire_owned().await.map_err(|e| e.to_string())?;
            let bytes = http_client()
                .get(&u)
                .send()
                .await
                .map_err(|e| format!("Segment {idx} error: {e}"))?
                .error_for_status()
                .map_err(|e| format!("Segment {idx} HTTP status: {e}"))?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;
            Ok::<(usize, Vec<u8>), String>((idx, bytes.to_vec()))
        });
    }

    while let Some(res) = join_set.join_next().await {
        let (idx, data) = res.map_err(|e| e.to_string())??;
        parts[idx] = Some(data);
    }

    let total_len: usize = parts.iter().filter_map(|p| p.as_ref().map(|v| v.len())).sum();
    let mut stitched = Vec::with_capacity(total_len);
    for p in parts.into_iter().flatten() {
        stitched.extend_from_slice(&p);
    }

    Ok(stitched)
}

async fn download_youtube_audio_full(url: &str) -> Result<Vec<u8>, String> {
    let clen = url::Url::parse(url)
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "clen")
                .and_then(|(_, v)| v.parse::<u64>().ok())
        })
        .ok_or_else(|| "Missing clen in YouTube stream URL".to_string())?;

    let chunk_size: u64 = 524_288; // 512 KB bounded chunks
    let mut all = Vec::with_capacity(clen as usize);
    let mut offset: u64 = 0;

    while offset < clen {
        let end = (offset + chunk_size - 1).min(clen - 1);
        let ranged_url = url::Url::parse_with_params(url, [("range", &format!("{offset}-{end}"))])
            .map_err(|e| e.to_string())?;

        let resp = ios_http_client()
            .get(ranged_url)
            .header(header::ORIGIN, "https://www.youtube.com")
            .header(header::REFERER, "https://www.youtube.com/")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("YouTube stream HTTP {}", resp.status()));
        }

        let b = resp.bytes().await.map_err(|e| e.to_string())?;
        if b.is_empty() {
            break;
        }
        all.extend_from_slice(&b);
        offset += b.len() as u64;
    }

    Ok(all)
}

fn clean_fallback_query(title: &str, artist: &str) -> String {
    let first_artist = artist
        .split([',', '&', '•'])
        .map(|s| s.trim())
        .find(|s| !s.is_empty() && !s.eq_ignore_ascii_case("và") && !s.eq_ignore_ascii_case("and"))
        .unwrap_or("");
    format!("{} {}", title.trim(), first_artist).trim().to_string()
}

fn verify_decodable(bytes: &[u8], hint: &str) -> bool {
    if bytes.len() < 4096 {
        return false;
    }
    let mut builder = Decoder::builder()
        .with_data(Cursor::new(bytes.to_vec()))
        .with_byte_len(bytes.len() as u64)
        .with_seekable(true);
    if !hint.is_empty() {
        builder = builder.with_hint(hint);
    }
    builder.build().is_ok()
}

async fn fetch_soundcloud_best_bytes(query: &str) -> Result<(Vec<u8>, String, f64), String> {
    let sc_tracks = soundcloud::search_soundcloud(query.to_string()).await?;
    if sc_tracks.is_empty() {
        return Err("No matching tracks found on SoundCloud".to_string());
    }

    // Prefer full-length tracks (>= 45s) over 30s previews when available
    let mut ordered = sc_tracks;
    ordered.sort_by_key(|t| if t.duration_seconds.unwrap_or(0) >= 45 { 0 } else { 1 });

    for candidate in ordered.into_iter().take(6) {
        if let Ok((url, mime, dur, is_hls)) =
            soundcloud::resolve_soundcloud_stream(&candidate.video_id).await
        {
            let bytes = if is_hls {
                download_hls_fmp4(&url).await
            } else {
                http_client()
                    .get(&url)
                    .header(header::REFERER, "https://soundcloud.com/")
                    .send()
                    .await
                    .map_err(|e| e.to_string())
                    .and_then(|r| {
                        r.error_for_status()
                            .map_err(|e| format!("SoundCloud HTTP: {e}"))
                    })?
                    .bytes()
                    .await
                    .map(|b| b.to_vec())
                    .map_err(|e| e.to_string())
            };

            if let Ok(buf) = bytes {
                let hint = if mime.contains("mp4") || is_hls {
                    "mp4".to_string()
                } else {
                    "mp3".to_string()
                };
                if verify_decodable(&buf, &hint) {
                    return Ok((buf, hint, dur as f64));
                }
            }
        }
    }

    Err("Could not download decodable SoundCloud audio bytes".to_string())
}

async fn fetch_playable_audio(
    video_id: &str,
    title: Option<&str>,
    artist: Option<&str>,
) -> Result<(Vec<u8>, String, f64, Option<String>), String> {
    let query_str = clean_fallback_query(title.unwrap_or(""), artist.unwrap_or(""));

    // 1. TikTok
    if video_id.starts_with("tt:") {
        if stream_proxy::get_cached_stream(video_id).await.is_none() {
            if let Some(t) = title {
                let _ = tiktok::search_tiktok_music(t.to_string()).await;
            }
        }
        let cached = stream_proxy::get_cached_stream(video_id)
            .await
            .ok_or_else(|| "TikTok stream expired — please reload from TikTok tab".to_string())?;
        let bytes = http_client()
            .get(&cached.audio_url)
            .header(header::REFERER, "https://www.tiktok.com/")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| format!("TikTok CDN HTTP: {e}"))?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec();
        let port = stream_proxy::ensure_proxy_started().await.unwrap_or(0);
        let v_url = if port > 0 && cached.video_url.is_some() {
            Some(format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video"))
        } else {
            None
        };
        return Ok((bytes, "mp3".to_string(), cached.duration_seconds as f64, v_url));
    }

    // 2. SoundCloud
    if video_id.starts_with("sc:") {
        let (url, mime, dur, is_hls) = soundcloud::resolve_soundcloud_stream(video_id).await?;
        let bytes = if is_hls {
            download_hls_fmp4(&url).await?
        } else {
            http_client()
                .get(&url)
                .header(header::REFERER, "https://soundcloud.com/")
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| format!("SoundCloud HTTP: {e}"))?
                .bytes()
                .await
                .map_err(|e| e.to_string())?
                .to_vec()
        };
        let hint = if mime.contains("mp4") || is_hls {
            "mp4".to_string()
        } else {
            "mp3".to_string()
        };
        return Ok((bytes, hint, dur as f64, None));
    }

    // 3. Spotify -> match on SoundCloud first, fallback YouTube
    if video_id.starts_with("sp:") && !query_str.is_empty() {
        if let Ok((b, h, d)) = fetch_soundcloud_best_bytes(&query_str).await {
            return Ok((b, h, d, None));
        }
        if let Ok(yt_list) =
            crate::commands::youtube::search_youtube_music(query_str.clone(), Some("songs".to_string())).await
        {
            if let Some(best) = yt_list.first() {
                if let Ok(cached) = stream_proxy::resolve_and_cache(&best.video_id).await {
                    if let Ok(b) = download_youtube_audio_full(&cached.audio_url).await {
                        return Ok((b, "mp4".to_string(), cached.duration_seconds as f64, None));
                    }
                }
            }
        }
        return Err("No playable stream found for Spotify track".to_string());
    }

    // 4. YouTube Music -> try full YouTube download first; if blocked past 1MB (403 without PO token), auto-resolve via SoundCloud
    let yt_cached = stream_proxy::resolve_and_cache(video_id).await;
    let mut video_proxy_url = None;

    if let Ok(ref cached) = yt_cached {
        if cached.video_url.is_some() {
            if let Ok(port) = stream_proxy::ensure_proxy_started().await {
                video_proxy_url = Some(format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video"));
            }
        }
        if let Ok(bytes) = download_youtube_audio_full(&cached.audio_url).await {
            if verify_decodable(&bytes, "mp4") {
                return Ok((
                    bytes,
                    "mp4".to_string(),
                    cached.duration_seconds as f64,
                    video_proxy_url,
                ));
            }
        }
    }

    if !query_str.is_empty() {
        if let Ok((bytes, hint, dur)) = fetch_soundcloud_best_bytes(&query_str).await {
            return Ok((bytes, hint, dur, video_proxy_url));
        }
    }

    Err(yt_cached
        .err()
        .unwrap_or_else(|| "YouTube stream blocked (403) and no fallback found".to_string()))
}

#[tauri::command]
pub async fn native_play_track(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    volume: Option<f32>,
    speed: Option<f32>,
) -> Result<NativePlaybackSnapshot, String> {
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let tx = ensure_audio_thread().clone();
    let _ = tx.send(EngineCmd::Stop);

    {
        let mut snap = snapshot().lock().unwrap();
        snap.track_id = Some(video_id.clone());
        snap.is_buffering = true;
        snap.is_playing = false;
        snap.current_time = 0.0;
        snap.ended = false;
        snap.error = None;
    }

    let vol = volume.unwrap_or(0.85);
    let spd = speed.unwrap_or(1.0);
    let vid_clone = video_id.clone();

    tokio::spawn(async move {
        let fetched =
            fetch_playable_audio(&vid_clone, title.as_deref(), artist.as_deref()).await;

        if GENERATION.load(Ordering::SeqCst) != gen {
            return; // User switched track while loading
        }

        match fetched {
            Ok((bytes, hint, duration_hint, video_url)) => {
                let _ = tx.send(EngineCmd::LoadAndPlay {
                    generation: gen,
                    track_id: vid_clone,
                    bytes,
                    hint,
                    duration_hint,
                    volume: vol,
                    speed: spd,
                    video_url,
                });
            }
            Err(e) => {
                let mut snap = snapshot().lock().unwrap();
                if snap.track_id.as_deref() == Some(&vid_clone) {
                    snap.is_buffering = false;
                    snap.is_playing = false;
                    snap.error = Some(e);
                }
            }
        }
    });

    Ok(snapshot().lock().unwrap().clone())
}

#[tauri::command]
pub fn native_pause() {
    let _ = ensure_audio_thread().send(EngineCmd::Pause);
}

#[tauri::command]
pub fn native_resume() {
    let _ = ensure_audio_thread().send(EngineCmd::Resume);
}

#[tauri::command]
pub fn native_seek(seconds: f64) {
    let _ = ensure_audio_thread().send(EngineCmd::Seek(seconds));
}

#[tauri::command]
pub fn native_set_volume(volume: f32) {
    let _ = ensure_audio_thread().send(EngineCmd::SetVolume(volume));
}

#[tauri::command]
pub fn native_set_speed(speed: f32) {
    let _ = ensure_audio_thread().send(EngineCmd::SetSpeed(speed));
}

#[tauri::command]
pub fn native_get_playback_state() -> NativePlaybackSnapshot {
    snapshot().lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rodio_decodes_soundcloud_and_tiktok() {
        // Test SoundCloud HLS fMP4 decode ("xương rồng (intro)" - Dangrangto)
        let sc_tracks = soundcloud::search_soundcloud("xương rồng Dangrangto".to_string())
            .await
            .expect("SC search should work");
        assert!(!sc_tracks.is_empty());
        let (bytes, hint, dur, _) = fetch_playable_audio(
            &sc_tracks[0].video_id,
            Some(&sc_tracks[0].title),
            Some(&sc_tracks[0].artist),
        )
        .await
        .expect("Should fetch SoundCloud audio bytes");

        println!("SC bytes: {}, hint: {}, dur: {dur}", bytes.len(), hint);
        assert!(bytes.len() > 100_000);
        let sc_len = bytes.len() as u64;

        let dec = Decoder::builder()
            .with_data(Cursor::new(bytes))
            .with_byte_len(sc_len)
            .with_seekable(true)
            .with_hint(&hint)
            .build();
        assert!(dec.is_ok(), "Rodio failed to decode SoundCloud fMP4: {:?}", dec.err());

        // Test fallback path for YouTube track "Bông Hoa Đẹp Nhất" (fTXd-DpN3AI)
        let yt_res = fetch_playable_audio("fTXd-DpN3AI", Some("Bông Hoa Đẹp Nhất"), Some("Quân A.P"))
            .await
            .expect("Should resolve playable audio for YT track");
        let len = yt_res.0.len() as u64;
        println!("YT track resolved audio len: {}, hint: {}, dur: {}", len, yt_res.1, yt_res.2);
        let dec2 = Decoder::builder()
            .with_data(Cursor::new(yt_res.0))
            .with_byte_len(len)
            .with_seekable(true)
            .with_hint(&yt_res.1)
            .build();
        assert!(dec2.is_ok(), "Rodio failed to decode YT track audio: {:?}", dec2.err());

        // Test exact live query with dirty artist string from UI ("Dangrangto, và, DONAL, trái tim băng bó")
        let live_res = fetch_playable_audio("skvHQIt-XyI", Some("xương rồng (intro)"), Some("Dangrangto, và, DONAL, trái tim băng bó"))
            .await
            .expect("Live skvHQIt-XyI should fetch");
        let l_len = live_res.0.len() as u64;
        println!("skvHQIt-XyI len={l_len} hint={} dur={} head={:02x?}", live_res.1, live_res.2, &live_res.0[..live_res.0.len().min(16)]);
        let dec3 = Decoder::builder()
            .with_data(Cursor::new(live_res.0))
            .with_byte_len(l_len)
            .with_seekable(true)
            .with_hint(&live_res.1)
            .build();
        assert!(dec3.is_ok(), "Rodio failed to decode skvHQIt-XyI: {:?}", dec3.err());
    }
}
