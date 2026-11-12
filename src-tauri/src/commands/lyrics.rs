use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LyricLine {
    pub time: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LyricsResponse {
    pub synced: bool,
    pub lines: Vec<LyricLine>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoStats {
    pub likes: u64,
    pub dislikes: u64,
    pub view_count: u64,
    pub rating: f64,
}

fn parse_lrc(lrc: &str) -> Vec<LyricLine> {
    let mut result = Vec::new();
    for raw_line in lrc.lines() {
        let line = raw_line.trim();
        if !line.starts_with('[') {
            continue;
        }
        if let Some(end_bracket) = line.find(']') {
            let tag = &line[1..end_bracket];
            let text = line[end_bracket + 1..].trim();
            if text.is_empty() {
                continue;
            }
            // Parse mm:ss.xx
            let parts: Vec<&str> = tag.split(':').collect();
            if parts.len() == 2 {
                if let (Ok(mins), Ok(secs)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                    result.push(LyricLine {
                        time: mins * 60.0 + secs,
                        text: text.to_string(),
                    });
                }
            }
        }
    }
    result
}

/// Fetch real synced or plain lyrics from LRCLIB
#[tauri::command]
pub async fn get_lyrics(title: String, artist: String) -> Result<LyricsResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent("Meikai/0.1.0 (https://github.com/louisdevzz/meikai)")
        .build()
        .map_err(|e| e.to_string())?;

    // Clean common suffixes like (Official Music Video), [MV], feat., etc.
    let clean_title = title
        .split('(')
        .next()
        .unwrap_or(&title)
        .split('[')
        .next()
        .unwrap_or(&title)
        .trim();

    let clean_artist = artist
        .split(',')
        .next()
        .unwrap_or(&artist)
        .split('&')
        .next()
        .unwrap_or(&artist)
        .trim();

    let query = format!("{clean_title} {clean_artist}");
    let url = format!(
        "https://lrclib.net/api/search?q={}",
        url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>()
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let items: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;

    // Prefer first item with syncedLyrics
    for item in &items {
        if let Some(synced_str) = item.get("syncedLyrics").and_then(|v| v.as_str()) {
            let parsed = parse_lrc(synced_str);
            if !parsed.is_empty() {
                return Ok(LyricsResponse {
                    synced: true,
                    lines: parsed,
                    source: "LRCLIB Synced".to_string(),
                });
            }
        }
    }

    // Fallback to plainLyrics
    for item in &items {
        if let Some(plain_str) = item.get("plainLyrics").and_then(|v| v.as_str()) {
            let lines: Vec<LyricLine> = plain_str
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .enumerate()
                .map(|(i, l)| LyricLine {
                    time: (i as f64) * 4.0,
                    text: l.to_string(),
                })
                .collect();
            if !lines.is_empty() {
                return Ok(LyricsResponse {
                    synced: false,
                    lines,
                    source: "LRCLIB Plain".to_string(),
                });
            }
        }
    }

    Err("No lyrics found".to_string())
}

/// Fetch ReturnYouTubeDislike votes & view count
#[tauri::command]
pub async fn get_video_stats(video_id: String) -> Result<VideoStats, String> {
    let client = reqwest::Client::builder()
        .user_agent("Meikai/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://returnyoutubedislikeapi.com/votes?videoId={video_id}");
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(VideoStats {
        likes: data.get("likes").and_then(|v| v.as_u64()).unwrap_or(0),
        dislikes: data.get("dislikes").and_then(|v| v.as_u64()).unwrap_or(0),
        view_count: data.get("viewCount").and_then(|v| v.as_u64()).unwrap_or(0),
        rating: data.get("rating").and_then(|v| v.as_f64()).unwrap_or(5.0),
    })
}
