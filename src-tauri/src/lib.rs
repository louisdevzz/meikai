// Meikai | Main entry point
// Desktop music player: YouTube Music + SponsorBlock + Last.fm + TikTok

pub mod commands;
pub mod player;
pub mod providers;

use tauri::Manager;
use tracing_subscriber::{fmt, EnvFilter};

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .setup(|app| {
            tracing::info!("Meikai starting up");
            tauri::async_runtime::spawn(async {
                let _ = commands::stream_proxy::ensure_proxy_started().await;
            });
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = window_vibrancy::apply_vibrancy(
                        &window,
                        window_vibrancy::NSVisualEffectMaterial::HudWindow,
                        Some(window_vibrancy::NSVisualEffectState::Active),
                        Some(18.0),
                    );
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_toggle_maximize,
            window_close,
            commands::youtube::search_youtube_music,
            commands::youtube::get_search_suggestions,
            commands::youtube::get_radio_next,
            commands::youtube::get_youtube_charts,
            commands::youtube::get_playlist_tracks,
            commands::youtube::get_song_info,
            commands::youtube::get_stream_url,
            commands::youtube::get_stream_media,
            commands::youtube::get_home_feed,
            commands::youtube::get_moods_and_genres,
            commands::youtube::get_mood_details,
            commands::youtube::get_user_yt_playlists,
            commands::lyrics::get_lyrics,
            commands::lyrics::get_video_stats,
            commands::auth::get_youtube_account,
            commands::auth::logout_youtube,
            commands::auth::login_with_cookie,
            commands::auth::open_youtube_login_window,
            commands::sponsorblock::get_segments,
            commands::lastfm::scrobble,
            commands::lastfm::update_now_playing,
            commands::tiktok::parse_tiktok_url,
            commands::player::get_player_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Meikai");
}
