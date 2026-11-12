use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrobblePayload {
    pub api_key: String,
    pub api_secret: String,
    pub session_key: String,
    pub artist: String,
    pub track: String,
    pub album: Option<String>,
    pub timestamp: u64,
}

/// Scrobble a track to Last.fm
#[tauri::command]
pub async fn scrobble(payload: ScrobblePayload) -> Result<(), String> {
    tracing::info!("Last.fm scrobble: {} - {}", payload.artist, payload.track);
    // TODO: implement Last.fm API signature + POST to ws.audioscrobbler.com
    Ok(())
}

/// Update "Now Playing" status on Last.fm
#[tauri::command]
pub async fn update_now_playing(
    api_key: String,
    api_secret: String,
    session_key: String,
    artist: String,
    track: String,
    album: Option<String>,
) -> Result<(), String> {
    tracing::info!("Last.fm now playing: {} - {}", artist, track);
    // TODO: implement Last.fm updateNowPlaying method
    let _ = (api_key, api_secret, session_key, album);
    Ok(())
}
