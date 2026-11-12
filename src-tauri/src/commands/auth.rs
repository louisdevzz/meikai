use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{webview::PageLoadEvent, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YoutubeAccount {
    pub name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub cookie: String,
}

fn auth_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("yt_auth.json"))
}

pub fn load_saved_cookie(app: &AppHandle) -> Option<String> {
    let path = auth_file_path(app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let acc: YoutubeAccount = serde_json::from_str(&raw).ok()?;
    if acc.cookie.trim().is_empty() {
        None
    } else {
        Some(acc.cookie)
    }
}

pub fn build_sapisidhash(cookie: &str, origin: &str) -> Option<String> {
    let mut sapisid = None;
    for part in cookie.split(';') {
        let trimmed = part.trim();
        if let Some(val) = trimmed.strip_prefix("SAPISID=") {
            sapisid = Some(val.to_string());
            break;
        }
        if let Some(val) = trimmed.strip_prefix("__Secure-3PAPISID=") {
            sapisid = Some(val.to_string());
        }
    }

    let sid = sapisid?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();

    let input = format!("{ts} {sid} {origin}");
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    let hash_hex = format!("{:x}", hasher.finalize());
    Some(format!("SAPISIDHASH {ts}_{hash_hex}"))
}

async fn fetch_account_info(cookie: &str) -> Result<YoutubeAccount, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let origin = "https://music.youtube.com";
    let mut req = client
        .post("https://music.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", origin)
        .header("Referer", "https://music.youtube.com/")
        .header("Cookie", cookie)
        .json(&serde_json::json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20241101.01.00",
                    "hl": "vi",
                    "gl": "VN"
                }
            }
        }));

    if let Some(auth) = build_sapisidhash(cookie, origin) {
        req = req.header("Authorization", auth).header("X-Origin", origin);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let header_renderer = data.pointer("/actions/0/openPopupAction/popup/multiPageMenuRenderer/header/activeAccountHeaderRenderer");

    let name = header_renderer
        .and_then(|h| h.pointer("/accountName/runs/0/text"))
        .and_then(|v| v.as_str())
        .unwrap_or("YouTube User")
        .to_string();

    let handle = header_renderer
        .and_then(|h| h.pointer("/channelHandle/runs/0/text"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let avatar_url = header_renderer
        .and_then(|h| h.pointer("/accountPhoto/thumbnails"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last())
        .and_then(|t| t.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(YoutubeAccount {
        name,
        handle,
        avatar_url,
        cookie: cookie.to_string(),
    })
}

fn save_account(app: &AppHandle, account: &YoutubeAccount) -> Result<(), String> {
    let path = auth_file_path(app)?;
    let json = serde_json::to_string_pretty(account).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_youtube_account(app: AppHandle) -> Option<YoutubeAccount> {
    let path = auth_file_path(&app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
pub fn logout_youtube(app: AppHandle) -> Result<(), String> {
    let path = auth_file_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn login_with_cookie(app: AppHandle, cookie: String) -> Result<YoutubeAccount, String> {
    let trimmed = cookie.trim();
    if trimmed.is_empty() {
        return Err("Cookie không được để trống".to_string());
    }
    let account = fetch_account_info(trimmed).await?;
    save_account(&app, &account)?;
    let _ = app.emit("yt-login-success", &account);
    Ok(account)
}

#[tauri::command]
pub async fn open_youtube_login_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("yt_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let login_url: url::Url = "https://accounts.google.com/ServiceLogin?continue=https://music.youtube.com"
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    let app_handle = app.clone();

    WebviewWindowBuilder::new(&app, "yt_login", WebviewUrl::External(login_url))
        .title("Đăng nhập YouTube Music — Meikai")
        .inner_size(860.0, 680.0)
        .center()
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let current_url = payload.url();
            if current_url.host_str() != Some("music.youtube.com") {
                return;
            }

            if let Ok(cookies) = window.cookies_for_url(current_url.clone()) {
                let cookie_str: String = cookies
                    .iter()
                    .map(|c| format!("{}={}", c.name(), c.value()))
                    .collect::<Vec<_>>()
                    .join("; ");

                let has_auth = cookie_str.contains("SAPISID=")
                    || cookie_str.contains("__Secure-3PAPISID=")
                    || cookie_str.contains("SID=");

                if has_auth {
                    let app_clone = app_handle.clone();
                    let win_clone = window.clone();
                    tauri::async_runtime::spawn(async move {
                        let account = fetch_account_info(&cookie_str)
                            .await
                            .unwrap_or(YoutubeAccount {
                                name: "YouTube Member".to_string(),
                                handle: None,
                                avatar_url: None,
                                cookie: cookie_str.clone(),
                            });
                        let _ = save_account(&app_clone, &account);
                        let _ = app_clone.emit("yt-login-success", &account);
                        let _ = win_clone.close();
                    });
                }
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
