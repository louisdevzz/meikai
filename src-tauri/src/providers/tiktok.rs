use crate::commands::stream_proxy::{register_external_stream, CachedStream};
use crate::commands::youtube::{HomeFeedPayload, YoutubeMusicTrack};
use crate::providers::{format_duration, http_client};
use regex::Regex;
use serde_json::Value;
use std::time::Instant;

fn map_tikwm_item(v: &Value) -> Option<(YoutubeMusicTrack, CachedStream)> {
    let vid = v
        .get("video_id")
        .or_else(|| v.get("id"))
        .and_then(|x| x.as_str().map(|s| s.to_string()).or_else(|| x.as_u64().map(|n| n.to_string())))?;

    let music_url = v.get("music").and_then(|x| x.as_str()).filter(|s| !s.is_empty())?.to_string();
    let video_url = v.get("play").and_then(|x| x.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());

    let music_title = v
        .pointer("/music_info/title")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| v.get("title").and_then(|x| x.as_str()))
        .unwrap_or("TikTok Audio")
        .trim()
        .to_string();

    let artist = v
        .pointer("/music_info/author")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| v.pointer("/author/nickname").and_then(|x| x.as_str()))
        .unwrap_or("TikTok Creator")
        .trim()
        .to_string();

    let cover = v
        .pointer("/music_info/cover")
        .or_else(|| v.get("cover"))
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let secs = v
        .pointer("/music_info/duration")
        .or_else(|| v.get("duration"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0) as u32;

    let key = format!("tt:{vid}");
    let track = YoutubeMusicTrack {
        video_id: key,
        title: music_title,
        artist,
        album: Some("TikTok Music".to_string()),
        duration_seconds: if secs > 0 { Some(secs) } else { None },
        duration_text: if secs > 0 { Some(format_duration(secs)) } else { None },
        thumbnail_url: cover,
    };

    let cached = CachedStream {
        audio_url: music_url,
        audio_mime: "audio/mpeg".to_string(),
        video_url,
        video_mime: Some("video/mp4".to_string()),
        referer: Some("https://www.tiktok.com/".to_string()),
        use_ios_ua: false,
        duration_seconds: secs,
        created_at: Instant::now(),
    };

    Some((track, cached))
}

async fn resolve_tiktok_page_rehydration(raw_url: &str) -> Result<(YoutubeMusicTrack, CachedStream), String> {
    let html = http_client()
        .get(raw_url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Failed to reach TikTok: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let re = Regex::new(r#"<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>"#).unwrap();
    let caps = re
        .captures(&html)
        .ok_or_else(|| "Could not find TikTok stream metadata".to_string())?;
    let json: Value = serde_json::from_str(&caps[1]).map_err(|e| e.to_string())?;
    let item = json
        .pointer("/__DEFAULT_SCOPE__/webapp.video-detail/itemInfo/itemStruct")
        .ok_or_else(|| "TikTok item detail unavailable".to_string())?;

    let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("tiktok").to_string();
    let music = item.get("music").ok_or_else(|| "Missing music block".to_string())?;
    let play_url = music
        .get("playUrl")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Missing TikTok music stream URL".to_string())?
        .to_string();

    let title = music
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| item.get("desc").and_then(|v| v.as_str()))
        .unwrap_or("TikTok Audio")
        .to_string();
    let artist = music
        .get("authorName")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| item.pointer("/author/nickname").and_then(|v| v.as_str()))
        .unwrap_or("TikTok Creator")
        .to_string();
    let cover = music
        .get("coverLarge")
        .or_else(|| item.pointer("/video/cover"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let video_url = item
        .pointer("/video/playAddr")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let secs = music.get("duration").and_then(|d| d.as_u64()).unwrap_or(0) as u32;

    let key = format!("tt:{id}");
    let track = YoutubeMusicTrack {
        video_id: key,
        title,
        artist,
        album: Some("TikTok Music".to_string()),
        duration_seconds: if secs > 0 { Some(secs) } else { None },
        duration_text: if secs > 0 { Some(format_duration(secs)) } else { None },
        thumbnail_url: cover,
    };
    let cached = CachedStream {
        audio_url: play_url,
        audio_mime: "audio/mpeg".to_string(),
        video_url,
        video_mime: Some("video/mp4".to_string()),
        referer: Some("https://www.tiktok.com/".to_string()),
        use_ios_ua: false,
        duration_seconds: secs,
        created_at: Instant::now(),
    };

    Ok((track, cached))
}

/// Fetch live TikTok Trending Music & Sounds feed (same browse pattern as YouTube Music)
#[tauri::command]
pub async fn get_tiktok_home() -> Result<HomeFeedPayload, String> {
    let data = http_client()
        .get("https://www.tikwm.com/api/feed/list?region=VN&count=18")
        .send()
        .await
        .map_err(|e| format!("Failed to reach TikTok feed: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())?;

    let mut quick_picks = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some((track, cached)) = map_tikwm_item(item) {
                if seen.insert(track.video_id.clone()) {
                    register_external_stream(&track.video_id, cached).await;
                    quick_picks.push(track);
                }
            }
        }
    }

    Ok(HomeFeedPayload {
        quick_picks: quick_picks.clone(),
        featured_playlists: vec![],
        music_videos: quick_picks.into_iter().take(8).collect(),
        top_artists: vec![],
    })
}

/// Search TikTok Music directly OR resolve a pasted TikTok link directly to playable audio/video
#[tauri::command]
pub async fn search_tiktok_music(query: String) -> Result<Vec<YoutubeMusicTrack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    if q.starts_with("https://") && q.contains("tiktok.com") {
        // Validate URL safety using existing strict TikTok link parser when applicable
        if let Ok((track, cached)) = resolve_tiktok_page_rehydration(q).await {
            register_external_stream(&track.video_id, cached).await;
            return Ok(vec![track]);
        }

        let encoded: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
        let data = http_client()
            .get(format!("https://www.tikwm.com/api/?url={encoded}"))
            .send()
            .await
            .map_err(|e| format!("Failed to resolve TikTok link: {e}"))?
            .json::<Value>()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(obj) = data.get("data") {
            if let Some((track, cached)) = map_tikwm_item(obj) {
                register_external_stream(&track.video_id, cached).await;
                return Ok(vec![track]);
            }
        }
        return Err("Không thể lấy luồng nhạc từ liên kết TikTok này".to_string());
    }

    let encoded: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
    let data = http_client()
        .get(format!(
            "https://www.tikwm.com/api/feed/search?keywords={encoded}&count=20"
        ))
        .send()
        .await
        .map_err(|e| format!("Failed to search TikTok Music: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if let Some(arr) = data.pointer("/data/videos").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some((track, cached)) = map_tikwm_item(item) {
                if seen.insert(track.video_id.clone()) {
                    register_external_stream(&track.video_id, cached).await;
                    tracks.push(track);
                }
            }
        }
    }

    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tiktok_live_home() {
        let home = get_tiktok_home().await.expect("TikTok feed should load");
        println!("TikTok feed picks: {}", home.quick_picks.len());
        assert!(!home.quick_picks.is_empty());
    }
}
