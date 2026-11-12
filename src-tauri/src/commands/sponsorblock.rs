use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SponsorSegment {
    pub category: String,
    pub action: String,
    pub start: f64,
    pub end: f64,
}

/// Fetch SponsorBlock segments for a YouTube video ID
#[tauri::command]
pub async fn get_segments(video_id: String) -> Result<Vec<SponsorSegment>, String> {
    let url = format!(
        "https://sponsor.ajay.app/api/skipSegments?videoID={}&categories=[\"sponsor\",\"selfpromo\",\"interaction\",\"intro\",\"outro\",\"preview\",\"music_offtopic\"]",
        video_id
    );

    let client = reqwest::Client::builder()
        .user_agent("Meikai/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if resp.status() == 404 {
        return Ok(vec![]); // No segments found
    }

    #[derive(Deserialize)]
    struct ApiSegment {
        category: String,
        #[serde(rename = "actionType")]
        action_type: String,
        segment: [f64; 2],
    }

    let raw: Vec<ApiSegment> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(raw
        .into_iter()
        .map(|s| SponsorSegment {
            category: s.category,
            action: s.action_type,
            start: s.segment[0],
            end: s.segment[1],
        })
        .collect())
}
