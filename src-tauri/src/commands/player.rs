use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackState {
    Idle,
    Loading,
    Playing,
    Paused,
    Error(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerState {
    pub state: PlaybackState,
    pub current_track_id: Option<String>,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub volume: f32,
    pub is_muted: bool,
    pub shuffle: bool,
    pub repeat_mode: RepeatMode,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    None,
    One,
    All,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            state: PlaybackState::Idle,
            current_track_id: None,
            position_seconds: 0.0,
            duration_seconds: None,
            volume: 1.0,
            is_muted: false,
            shuffle: false,
            repeat_mode: RepeatMode::None,
        }
    }
}

#[tauri::command]
pub fn get_player_state() -> PlayerState {
    PlayerState::default()
}
