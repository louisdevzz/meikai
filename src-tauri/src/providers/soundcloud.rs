use crate::commands::youtube::{ChartPlaylistItem, HomeFeedPayload, PlaylistDetails, YoutubeMusicTrack};
use crate::providers::{format_duration, http_client};
use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;
use tokio::sync::RwLock;

static SC_CLIENT_ID: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn client_id_store() -> &'static RwLock<Option<String>> {
    SC_CLIENT_ID.get_or_init(|| RwLock::new(None))
}

async fn get_client_id(force_refresh: bool) -> Result<String, String> {
    if !force_refresh {
        if let Some(cid) = client_id_store().read().await.as_ref() {
            return Ok(cid.clone());
        }
    }

    let html = http_client()
        .get("https://soundcloud.com/discover")
        .send()
        .await
        .map_err(|e| format!("SoundCloud fetch failed: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let script_re = Regex::new(r#"https://a-v2\.sndcdn\.com/assets/[^"]+\.js"#).unwrap();
    let cid_re = Regex::new(r#"client_id:"([a-zA-Z0-9]{32})""#).unwrap();

    let scripts: Vec<&str> = script_re.find_iter(&html).map(|m| m.as_str()).collect();
    for script_url in scripts.into_iter().rev().take(6) {
        if let Ok(resp) = http_client().get(script_url).send().await {
            if let Ok(js) = resp.text().await {
                if let Some(caps) = cid_re.captures(&js) {
                    let cid = caps[1].to_string();
                    *client_id_store().write().await = Some(cid.clone());
                    return Ok(cid);
                }
            }
        }
    }

    Err("Could not extract SoundCloud client_id".to_string())
}

fn upgrade_artwork(url_opt: Option<&str>) -> Option<String> {
    url_opt
        .filter(|u| !u.is_empty())
        .map(|u| u.replace("-large.", "-t500x500."))
}

fn map_sc_track(v: &Value) -> Option<YoutubeMusicTrack> {
    let id = v.get("id")?.as_u64()?;
    let title = v.get("title")?.as_str()?.trim().to_string();
    if title.is_empty() {
        return None;
    }
    let artist = v
        .pointer("/user/username")
        .and_then(|x| x.as_str())
        .unwrap_or("SoundCloud Artist")
        .to_string();
    let duration_ms = v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
    let secs = (duration_ms / 1000) as u32;
    let thumb = upgrade_artwork(v.get("artwork_url").and_then(|a| a.as_str()))
        .or_else(|| upgrade_artwork(v.pointer("/user/avatar_url").and_then(|a| a.as_str())));

    Some(YoutubeMusicTrack {
        video_id: format!("sc:{id}"),
        title,
        artist,
        album: v.pointer("/publisher_metadata/album_title").and_then(|a| a.as_str()).map(|s| s.to_string()),
        duration_seconds: Some(secs),
        duration_text: Some(format_duration(secs)),
        thumbnail_url: thumb,
    })
}

async fn sc_get_json(url: &str) -> Result<Value, String> {
    let mut cid = get_client_id(false).await?;
    let sep = if url.contains('?') { '&' } else { '?' };
    let full = format!("{url}{sep}client_id={cid}");
    let resp = http_client().get(&full).send().await.map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
        cid = get_client_id(true).await?;
        let retry = format!("{url}{sep}client_id={cid}");
        return http_client()
            .get(&retry)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<Value>()
            .await
            .map_err(|e| e.to_string());
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

/// Resolve direct playable stream URL and MIME type for a SoundCloud track ID
pub async fn resolve_soundcloud_stream(raw_id: &str) -> Result<(String, String, u32, bool), String> {
    let sc_id = raw_id.strip_prefix("sc:").unwrap_or(raw_id);
    let track = sc_get_json(&format!("https://api-v2.soundcloud.com/tracks/{sc_id}")).await?;
    let cid = get_client_id(false).await?;
    let auth = track
        .get("track_authorization")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let duration_secs = (track.get("duration").and_then(|d| d.as_u64()).unwrap_or(0) / 1000) as u32;

    let transcodings = track
        .pointer("/media/transcodings")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No SoundCloud streams found".to_string())?;

    // Prefer progressive MP3 first (supports arbitrary Range seeking cleanly), then HLS AAC/MP3
    let mut sorted: Vec<&Value> = transcodings.iter().collect();
    sorted.sort_by_key(|t| {
        let proto = t.pointer("/format/protocol").and_then(|v| v.as_str()).unwrap_or("");
        let mime = t.pointer("/format/mime_type").and_then(|v| v.as_str()).unwrap_or("");
        match (proto, mime.contains("mp4")) {
            ("progressive", _) => 0,
            ("hls", true) => 1,
            _ => 2,
        }
    });

    for tr in sorted {
        if let Some(base_url) = tr.get("url").and_then(|u| u.as_str()) {
            let sep = if base_url.contains('?') { '&' } else { '?' };
            let resolve_url = format!("{base_url}{sep}client_id={cid}&track_authorization={auth}");
            if let Ok(resp) = http_client().get(&resolve_url).send().await {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(stream_url) = json.get("url").and_then(|u| u.as_str()) {
                            let proto = tr.pointer("/format/protocol").and_then(|v| v.as_str()).unwrap_or("hls");
                            let mime = tr.pointer("/format/mime_type").and_then(|v| v.as_str()).unwrap_or("audio/mpeg");
                            return Ok((
                                stream_url.to_string(),
                                mime.split(';').next().unwrap_or("audio/mpeg").trim().to_string(),
                                duration_secs,
                                proto == "hls",
                            ));
                        }
                    }
                }
            }
        }
    }

    Err("Failed to resolve playable SoundCloud stream".to_string())
}

/// Search live SoundCloud tracks
#[tauri::command]
pub async fn search_soundcloud(query: String) -> Result<Vec<YoutubeMusicTrack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let encoded: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
    let data = sc_get_json(&format!(
        "https://api-v2.soundcloud.com/search/tracks?q={encoded}&limit=25"
    ))
    .await?;

    let mut tracks = Vec::new();
    if let Some(items) = data.get("collection").and_then(|c| c.as_array()) {
        for it in items {
            if let Some(t) = map_sc_track(it) {
                tracks.push(t);
            }
        }
    }
    Ok(tracks)
}

/// Fetch live SoundCloud Home Feed (Trending tracks + Curated Playlists)
#[tauri::command]
pub async fn get_soundcloud_home() -> Result<HomeFeedPayload, String> {
    let (tracks_res, playlists_res, mixed_res) = tokio::join!(
        sc_get_json("https://api-v2.soundcloud.com/search/tracks?q=vietnam+remix+lofi&limit=16"),
        sc_get_json("https://api-v2.soundcloud.com/search/playlists_without_albums?q=top+hits+lofi+chill&limit=10"),
        sc_get_json("https://api-v2.soundcloud.com/mixed-selections?limit=6"),
    );

    let mut quick_picks = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    if let Ok(data) = tracks_res {
        if let Some(arr) = data.get("collection").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(t) = map_sc_track(item) {
                    if seen_ids.insert(t.video_id.clone()) {
                        quick_picks.push(t);
                    }
                }
            }
        }
    }

    let mut featured_playlists = Vec::new();
    let mut seen_pl = std::collections::HashSet::new();

    if let Ok(mixed) = mixed_res {
        if let Some(arr) = mixed.get("collection").and_then(|v| v.as_array()) {
            for sel in arr {
                if let Some(items) = sel.pointer("/items/collection").and_then(|v| v.as_array()) {
                    for pl in items {
                        if let Some(id) = pl.get("id").and_then(|v| v.as_u64()) {
                            let bid = format!("scpl:{id}");
                            if seen_pl.insert(bid.clone()) {
                                let title = pl.get("title").and_then(|v| v.as_str()).unwrap_or("SoundCloud Mix").to_string();
                                let sub = pl.pointer("/user/username").and_then(|v| v.as_str()).unwrap_or("SoundCloud").to_string();
                                let thumb = upgrade_artwork(pl.get("artwork_url").and_then(|v| v.as_str()))
                                    .or_else(|| upgrade_artwork(pl.pointer("/tracks/0/artwork_url").and_then(|v| v.as_str())));
                                featured_playlists.push(ChartPlaylistItem {
                                    browse_id: bid,
                                    title,
                                    subtitle: format!("SoundCloud • {sub}"),
                                    thumbnail_url: thumb,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(pls) = playlists_res {
        if let Some(arr) = pls.get("collection").and_then(|v| v.as_array()) {
            for pl in arr {
                if let Some(id) = pl.get("id").and_then(|v| v.as_u64()) {
                    let bid = format!("scpl:{id}");
                    if seen_pl.insert(bid.clone()) {
                        let title = pl.get("title").and_then(|v| v.as_str()).unwrap_or("SoundCloud Playlist").to_string();
                        let sub = pl.pointer("/user/username").and_then(|v| v.as_str()).unwrap_or("SoundCloud").to_string();
                        let count = pl.get("track_count").and_then(|v| v.as_u64()).unwrap_or(0);
                        let thumb = upgrade_artwork(pl.get("artwork_url").and_then(|v| v.as_str()))
                            .or_else(|| upgrade_artwork(pl.pointer("/tracks/0/artwork_url").and_then(|v| v.as_str())));
                        featured_playlists.push(ChartPlaylistItem {
                            browse_id: bid,
                            title,
                            subtitle: format!("{sub} • {count} tracks"),
                            thumbnail_url: thumb,
                        });
                    }
                }
            }
        }
    }

    Ok(HomeFeedPayload {
        quick_picks,
        featured_playlists,
        music_videos: vec![],
        top_artists: vec![],
    })
}

/// Fetch tracks inside a SoundCloud playlist
#[tauri::command]
pub async fn get_soundcloud_playlist(browse_id: String) -> Result<PlaylistDetails, String> {
    let sc_id = browse_id.strip_prefix("scpl:").unwrap_or(&browse_id);
    let data = sc_get_json(&format!("https://api-v2.soundcloud.com/playlists/{sc_id}")).await?;

    let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("SoundCloud Playlist").to_string();
    let user = data.pointer("/user/username").and_then(|v| v.as_str()).unwrap_or("SoundCloud");
    let thumb = upgrade_artwork(data.get("artwork_url").and_then(|v| v.as_str()))
        .or_else(|| upgrade_artwork(data.pointer("/tracks/0/artwork_url").and_then(|v| v.as_str())));

    let mut tracks = Vec::new();
    let mut missing_ids = Vec::new();

    if let Some(arr) = data.get("tracks").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(t) = map_sc_track(item) {
                tracks.push(t);
            } else if let Some(id) = item.get("id").and_then(|v| v.as_u64()) {
                missing_ids.push(id.to_string());
            }
        }
    }

    if !missing_ids.is_empty() {
        let batch = missing_ids.into_iter().take(25).collect::<Vec<_>>().join(",");
        if let Ok(extra) = sc_get_json(&format!("https://api-v2.soundcloud.com/tracks?ids={batch}")).await {
            if let Some(arr) = extra.as_array() {
                for item in arr {
                    if let Some(t) = map_sc_track(item) {
                        tracks.push(t);
                    }
                }
            }
        }
    }

    Ok(PlaylistDetails {
        browse_id,
        title,
        subtitle: format!("SoundCloud • {user}"),
        thumbnail_url: thumb,
        tracks,
    })
}

/// Fetch related tracks for SoundCloud Radio/Next
#[tauri::command]
pub async fn get_soundcloud_radio_next(video_id: String) -> Result<Vec<YoutubeMusicTrack>, String> {
    let sc_id = video_id.strip_prefix("sc:").unwrap_or(&video_id);
    let data = sc_get_json(&format!(
        "https://api-v2.soundcloud.com/tracks/{sc_id}/related?limit=20"
    ))
    .await?;

    let mut tracks = Vec::new();
    if let Some(arr) = data.get("collection").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(t) = map_sc_track(item) {
                tracks.push(t);
            }
        }
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_soundcloud_live_home_and_stream() {
        let home = get_soundcloud_home().await.expect("SoundCloud home should load");
        println!("SC home picks: {}, playlists: {}", home.quick_picks.len(), home.featured_playlists.len());
        assert!(!home.quick_picks.is_empty());
        let first = &home.quick_picks[0];
        let (url, mime, _, _) = resolve_soundcloud_stream(&first.video_id)
            .await
            .expect("SoundCloud stream should resolve");
        println!("SC resolved stream: mime={mime} url_ok={}", url.starts_with("http"));
        assert!(url.starts_with("http"));
    }
}
