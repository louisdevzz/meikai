use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YoutubeMusicTrack {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_seconds: Option<u32>,
    pub duration_text: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartPlaylistItem {
    pub browse_id: String,
    pub title: String,
    pub subtitle: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartArtistItem {
    pub browse_id: String,
    pub name: String,
    pub subscribers: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartsPayload {
    pub playlists: Vec<ChartPlaylistItem>,
    pub artists: Vec<ChartArtistItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistDetails {
    pub browse_id: String,
    pub title: String,
    pub subtitle: String,
    pub thumbnail_url: Option<String>,
    pub tracks: Vec<YoutubeMusicTrack>,
}

fn build_innertube_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())
}

fn innertube_context() -> Value {
    serde_json::json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": "1.20241101.01.00",
            "hl": "vi",
            "gl": "VN"
        }
    })
}

/// Search YouTube Music via InnerTube WEB_REMIX API with optional filter
#[tauri::command]
pub async fn search_youtube_music(
    query: String,
    filter: Option<String>,
) -> Result<Vec<YoutubeMusicTrack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = build_innertube_client()?;

    let params = match filter.as_deref() {
        Some("songs") => Some("EgWKAQIIAWoSEAUQAxAEEAkQEBAKEBUQERAO"),
        Some("videos") => Some("EgWKAQIQAWoSEAUQAxAEEAkQEBAKEBUQERAO"),
        Some("albums") => Some("EgWKAQIYAWoSEAUQAxAEEAkQEBAKEBUQERAO"),
        Some("artists") => Some("EgWKAQIgAWoSEAUQAxAEEAkQEBAKEBUQERAO"),
        Some("playlists") => Some("EgeKAQQoAEABahIQBRADEAQQCRAQEAoQFRAREA4%3D"),
        _ => None,
    };

    let mut body = serde_json::json!({
        "context": innertube_context(),
        "query": q
    });

    if let Some(p) = params {
        body["params"] = Value::String(p.to_string());
    }

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/search?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach YouTube Music: {e}"))?;

    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let mut tracks = Vec::new();

    let sections = data
        .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|v| v.as_array());

    if let Some(sections) = sections {
        for s in sections {
            if let Some(card) = s.get("musicCardShelfRenderer") {
                if let Some(contents) = card.get("contents").and_then(|v| v.as_array()) {
                    for item in contents {
                        if let Some(track) =
                            extract_track_from_renderer(item.get("musicResponsiveListItemRenderer"))
                        {
                            tracks.push(track);
                        }
                    }
                }
            }

            if let Some(isr) = s.get("itemSectionRenderer") {
                if let Some(contents) = isr.get("contents").and_then(|v| v.as_array()) {
                    for item in contents {
                        if let Some(track) =
                            extract_track_from_renderer(item.get("musicResponsiveListItemRenderer"))
                        {
                            tracks.push(track);
                        }
                    }
                }
            }

            if let Some(msr) = s.get("musicShelfRenderer") {
                if let Some(contents) = msr.get("contents").and_then(|v| v.as_array()) {
                    for item in contents {
                        if let Some(track) =
                            extract_track_from_renderer(item.get("musicResponsiveListItemRenderer"))
                        {
                            tracks.push(track);
                        }
                    }
                }
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    tracks.retain(|t| seen.insert(t.video_id.clone()));

    Ok(tracks)
}

/// Live search suggestions from YouTube Music
#[tauri::command]
pub async fn get_search_suggestions(query: String) -> Result<Vec<String>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = build_innertube_client()?;
    let body = serde_json::json!({
        "context": innertube_context(),
        "input": q
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/music/get_search_suggestions?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut suggestions = Vec::new();

    if let Some(contents) = data
        .pointer("/contents/0/searchSuggestionsSectionRenderer/contents")
        .and_then(|v| v.as_array())
    {
        for item in contents {
            if let Some(runs) = item
                .pointer("/searchSuggestionRenderer/suggestion/runs")
                .and_then(|v| v.as_array())
            {
                let text: String = runs
                    .iter()
                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                    .collect();
                if !text.is_empty() {
                    suggestions.push(text);
                }
            }
        }
    }

    Ok(suggestions)
}

/// Fetch Up Next Radio queue across YouTube Music, SoundCloud, Spotify, or TikTok tracks
#[tauri::command]
pub async fn get_radio_next(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
) -> Result<Vec<YoutubeMusicTrack>, String> {
    if video_id.starts_with("sc:") {
        return crate::providers::soundcloud::get_soundcloud_radio_next(video_id).await;
    }
    if video_id.starts_with("sp:") || video_id.starts_with("tt:") {
        let q = format!(
            "{} {}",
            title.unwrap_or_default(),
            artist.unwrap_or_default()
        )
        .trim()
        .to_string();
        if !q.is_empty() {
            if let Ok(sc) = crate::providers::soundcloud::search_soundcloud(q.clone()).await {
                if !sc.is_empty() {
                    return Ok(sc);
                }
            }
            return search_youtube_music(q, Some("songs".to_string())).await;
        }
        return Ok(vec![]);
    }

    let client = build_innertube_client()?;
    let playlist_id = format!("RDAMVM{video_id}");

    let body = serde_json::json!({
        "context": innertube_context(),
        "videoId": video_id,
        "playlistId": playlist_id
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/next?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut tracks = Vec::new();

    if let Some(contents) = data
        .pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/0/tabRenderer/content/musicQueueRenderer/content/playlistPanelRenderer/contents")
        .and_then(|v| v.as_array())
    {
        for item in contents {
            if let Some(r) = item.get("playlistPanelVideoRenderer") {
                let vid = match r.get("videoId").and_then(|v| v.as_str()) {
                    Some(v) => v.to_string(),
                    None => continue,
                };
                let title = r
                    .pointer("/title/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let artist = r
                    .pointer("/longBylineText/runs/0/text")
                    .or_else(|| r.pointer("/shortBylineText/runs/0/text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Artist")
                    .to_string();

                let duration_text = r
                    .pointer("/lengthText/runs/0/text")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let thumb = r
                    .pointer("/thumbnail/thumbnails")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|t| t.get("url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg")));

                let duration_seconds = duration_text.as_deref().and_then(parse_duration_secs);

                tracks.push(YoutubeMusicTrack {
                    video_id: vid,
                    title,
                    artist,
                    album: None,
                    duration_seconds,
                    duration_text,
                    thumbnail_url: thumb,
                });
            }
        }
    }

    Ok(tracks)
}

/// Fetch YouTube Music Charts (Vietnam & Global)
#[tauri::command]
pub async fn get_youtube_charts() -> Result<ChartsPayload, String> {
    let client = build_innertube_client()?;
    let body = serde_json::json!({
        "context": innertube_context(),
        "browseId": "FEmusic_charts"
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut playlists = Vec::new();
    let mut artists = Vec::new();

    if let Some(sections) = data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|v| v.as_array())
    {
        for sec in sections {
            if let Some(items) = sec
                .pointer("/musicCarouselShelfRenderer/contents")
                .and_then(|v| v.as_array())
            {
                for it in items {
                    if let Some(two) = it.get("musicTwoRowItemRenderer") {
                        let title = two
                            .pointer("/title/runs/0/text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let browse_id = two
                            .pointer("/navigationEndpoint/browseEndpoint/browseId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let subtitle = two
                            .pointer("/subtitle/runs")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                                    .collect::<String>()
                            })
                            .unwrap_or_else(|| "Chart • YouTube Charts".to_string());
                        let thumb = two
                            .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                            .and_then(|v| v.as_array())
                            .and_then(|arr| arr.last())
                            .and_then(|t| t.get("url"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        if !browse_id.is_empty() && !title.is_empty() {
                            playlists.push(ChartPlaylistItem {
                                browse_id,
                                title,
                                subtitle,
                                thumbnail_url: thumb,
                            });
                        }
                    }

                    if let Some(li) = it.get("musicResponsiveListItemRenderer") {
                        if let Some(cols) = li.get("flexColumns").and_then(|v| v.as_array()) {
                            let name = cols
                                .first()
                                .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let browse_id = cols
                                .first()
                                .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/browseEndpoint/browseId"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let subs = cols
                                .get(1)
                                .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let thumb = li
                                .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.last())
                                .and_then(|t| t.get("url"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            if !name.is_empty() {
                                artists.push(ChartArtistItem {
                                    browse_id,
                                    name,
                                    subscribers: subs,
                                    thumbnail_url: thumb,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ChartsPayload { playlists, artists })
}

/// Fetch tracks inside a YouTube Music playlist / chart / album by browse_id
#[tauri::command]
pub async fn get_playlist_tracks(browse_id: String) -> Result<PlaylistDetails, String> {
    let normalized_id = if !browse_id.starts_with("VL")
        && !browse_id.starts_with("MPRE")
        && !browse_id.starts_with("FE")
        && !browse_id.starts_with("UC")
        && !browse_id.starts_with("OL")
    {
        format!("VL{browse_id}")
    } else {
        browse_id.clone()
    };

    let client = build_innertube_client()?;
    let body = serde_json::json!({
        "context": innertube_context(),
        "browseId": normalized_id
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let title = data
        .pointer("/header/musicDetailHeaderRenderer/title/runs/0/text")
        .or_else(|| data.pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/title/runs/0/text"))
        .and_then(|v| v.as_str())
        .unwrap_or("Playlist")
        .to_string();

    let subtitle = data
        .pointer("/header/musicDetailHeaderRenderer/subtitle/runs/0/text")
        .or_else(|| data.pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/subtitle/runs/0/text"))
        .and_then(|v| v.as_str())
        .unwrap_or("YouTube Music Playlist")
        .to_string();

    let thumb = data
        .pointer("/header/musicDetailHeaderRenderer/thumbnail/croppedSquareThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| data.pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last())
        .and_then(|t| t.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut tracks = Vec::new();

    // Try twoColumnBrowseResultsRenderer -> secondaryContents
    let shelf_items = data
        .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents")
        .or_else(|| data.pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicShelfRenderer/contents"))
        .or_else(|| data.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents"))
        .and_then(|v| v.as_array());

    if let Some(items) = shelf_items {
        for item in items {
            if let Some(track) =
                extract_track_from_renderer(item.get("musicResponsiveListItemRenderer"))
            {
                tracks.push(track);
            }
        }
    }

    Ok(PlaylistDetails {
        browse_id,
        title,
        subtitle,
        thumbnail_url: thumb,
        tracks,
    })
}

fn parse_duration_secs(s: &str) -> Option<u32> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() == 2 {
        let m: u32 = parts[0].parse().ok()?;
        let sec: u32 = parts[1].parse().ok()?;
        Some(m * 60 + sec)
    } else if parts.len() == 3 {
        let h: u32 = parts[0].parse().ok()?;
        let m: u32 = parts[1].parse().ok()?;
        let sec: u32 = parts[2].parse().ok()?;
        Some(h * 3600 + m * 60 + sec)
    } else {
        None
    }
}

fn extract_track_from_renderer(renderer: Option<&Value>) -> Option<YoutubeMusicTrack> {
    let r = renderer?;
    let flex_cols = r.get("flexColumns")?.as_array()?;
    if flex_cols.is_empty() {
        return None;
    }

    let col0_runs = flex_cols[0]
        .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")?
        .as_array()?;
    if col0_runs.is_empty() {
        return None;
    }

    let title = col0_runs[0].get("text")?.as_str()?.to_string();

    let mut video_id = col0_runs[0]
        .pointer("/navigationEndpoint/watchEndpoint/videoId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if video_id.is_none() {
        video_id = r
            .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if video_id.is_none() {
        video_id = r
            .pointer("/playlistItemData/videoId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    let vid = video_id?;
    if vid.is_empty() {
        return None;
    }

    let mut artist_parts = Vec::new();
    let mut duration_str = None;

    for col in flex_cols.iter().skip(1) {
        if let Some(runs) = col
            .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")
            .and_then(|v| v.as_array())
        {
            for run in runs {
                if let Some(text) = run.get("text").and_then(|v| v.as_str()) {
                    let t = text.trim();
                    if t != "•" && !t.is_empty() {
                        if t.contains(':') && t.chars().all(|c| c.is_ascii_digit() || c == ':') {
                            duration_str = Some(t.to_string());
                        } else if t != "Bài hát" && t != "Song" && t != "Video" && !t.contains("lượt") && !t.contains("views") {
                            artist_parts.push(t.to_string());
                        }
                    }
                }
            }
        }
    }

    // Check fixedColumns for duration as well (used in playlist items)
    if duration_str.is_none() {
        if let Some(fixed) = r.get("fixedColumns").and_then(|v| v.as_array()) {
            for fc in fixed {
                if let Some(text) = fc
                    .pointer("/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
                    .and_then(|v| v.as_str())
                {
                    let t = text.trim();
                    if t.contains(':') {
                        duration_str = Some(t.to_string());
                    }
                }
            }
        }
    }

    let artist = if artist_parts.is_empty() {
        "Unknown Artist".to_string()
    } else {
        artist_parts.join(", ")
    };

    let thumb = r
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last())
        .and_then(|t| t.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| Some(format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg")));

    let duration_seconds = duration_str.as_deref().and_then(parse_duration_secs);

    Some(YoutubeMusicTrack {
        video_id: vid,
        title,
        artist,
        album: None,
        duration_seconds,
        duration_text: duration_str,
        thumbnail_url: thumb,
    })
}

/// Get track metadata by video ID
#[tauri::command]
pub async fn get_song_info(video_id: String) -> Result<YoutubeMusicTrack, String> {
    Ok(YoutubeMusicTrack {
        video_id: video_id.clone(),
        title: "Track".to_string(),
        artist: "Artist".to_string(),
        album: None,
        duration_seconds: None,
        duration_text: None,
        thumbnail_url: Some(format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")),
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamMedia {
    pub audio_url: String,
    pub video_url: Option<String>,
    pub duration_seconds: u32,
}

/// Resolve playable audio + video stream URLs across YouTube Music, SoundCloud, Spotify, and TikTok
#[tauri::command]
pub async fn get_stream_media(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    prefer_fallback: Option<bool>,
) -> Result<StreamMedia, String> {
    let port = crate::commands::stream_proxy::ensure_proxy_started().await?;

    // 1. TikTok direct audio/video stream via local proxy
    if video_id.starts_with("tt:") {
        if crate::commands::stream_proxy::get_cached_stream(&video_id).await.is_none() {
            if let Some(ref t) = title {
                let _ = crate::providers::tiktok::search_tiktok_music(t.clone()).await;
            }
        }
        let cached = crate::commands::stream_proxy::get_cached_stream(&video_id)
            .await
            .ok_or_else(|| "TikTok stream expired — please reload from TikTok tab".to_string())?;
        return Ok(StreamMedia {
            audio_url: format!("http://127.0.0.1:{port}/stream/{video_id}?kind=audio"),
            video_url: cached
                .video_url
                .as_ref()
                .map(|_| format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video")),
            duration_seconds: cached.duration_seconds,
        });
    }

    // 2. SoundCloud direct progressive MP3 or native HLS stream
    if video_id.starts_with("sc:") {
        let (url, mime, duration_seconds, is_hls) =
            crate::providers::soundcloud::resolve_soundcloud_stream(&video_id).await?;
        if is_hls {
            return Ok(StreamMedia {
                audio_url: url,
                video_url: None,
                duration_seconds,
            });
        }
        crate::commands::stream_proxy::register_external_stream(
            &video_id,
            crate::commands::stream_proxy::CachedStream {
                audio_url: url,
                audio_mime: mime,
                video_url: None,
                video_mime: None,
                referer: Some("https://soundcloud.com/".to_string()),
                use_ios_ua: false,
                duration_seconds,
                created_at: std::time::Instant::now(),
            },
        )
        .await;
        return Ok(StreamMedia {
            audio_url: format!("http://127.0.0.1:{port}/stream/{video_id}?kind=audio"),
            video_url: None,
            duration_seconds,
        });
    }

    // 3. Spotify or explicit fallback -> match & stream via SoundCloud (with YouTube fallback)
    if video_id.starts_with("sp:") || prefer_fallback == Some(true) {
        let q = format!(
            "{} {}",
            title.as_deref().unwrap_or(""),
            artist.as_deref().unwrap_or("")
        )
        .trim()
        .to_string();

        if !q.is_empty() {
            if let Ok(sc_tracks) = crate::providers::soundcloud::search_soundcloud(q.clone()).await {
                if let Some(best) = sc_tracks.first() {
                    if let Ok((url, mime, dur, is_hls)) =
                        crate::providers::soundcloud::resolve_soundcloud_stream(&best.video_id).await
                    {
                        if is_hls {
                            return Ok(StreamMedia {
                                audio_url: url,
                                video_url: None,
                                duration_seconds: dur,
                            });
                        }
                        crate::commands::stream_proxy::register_external_stream(
                            &best.video_id,
                            crate::commands::stream_proxy::CachedStream {
                                audio_url: url,
                                audio_mime: mime,
                                video_url: None,
                                video_mime: None,
                                referer: Some("https://soundcloud.com/".to_string()),
                                use_ios_ua: false,
                                duration_seconds: dur,
                                created_at: std::time::Instant::now(),
                            },
                        )
                        .await;
                        return Ok(StreamMedia {
                            audio_url: format!("http://127.0.0.1:{port}/stream/{}?kind=audio", best.video_id),
                            video_url: None,
                            duration_seconds: dur,
                        });
                    }
                }
            }

            if prefer_fallback != Some(true) {
                if let Ok(yt_tracks) = search_youtube_music(q, Some("songs".to_string())).await {
                    if let Some(best) = yt_tracks.first() {
                        if let Ok(cached) =
                            crate::commands::stream_proxy::resolve_and_cache(&best.video_id).await
                        {
                            return Ok(StreamMedia {
                                audio_url: format!(
                                    "http://127.0.0.1:{port}/stream/{}?kind=audio",
                                    best.video_id
                                ),
                                video_url: cached.video_url.as_ref().map(|_| {
                                    format!(
                                        "http://127.0.0.1:{port}/stream/{}?kind=video",
                                        best.video_id
                                    )
                                }),
                                duration_seconds: cached.duration_seconds,
                            });
                        }
                    }
                }
            }
        }

        if prefer_fallback == Some(true) {
            return Err("No fallback audio stream matched".to_string());
        }
    }

    // 4. YouTube Music primary stream via RustyPipe + Local HTTP Range Proxy
    match crate::commands::stream_proxy::resolve_and_cache(&video_id).await {
        Ok(cached) => {
            let audio_url = format!("http://127.0.0.1:{port}/stream/{video_id}?kind=audio");
            let video_url = cached
                .video_url
                .as_ref()
                .map(|_| format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video"));

            Ok(StreamMedia {
                audio_url,
                video_url,
                duration_seconds: cached.duration_seconds,
            })
        }
        Err(yt_err) => {
            // Auto-fallback to SoundCloud when RustyPipe fails if metadata is available
            let q = format!(
                "{} {}",
                title.as_deref().unwrap_or(""),
                artist.as_deref().unwrap_or("")
            )
            .trim()
            .to_string();
            if !q.is_empty() {
                if let Ok(sc_tracks) = crate::providers::soundcloud::search_soundcloud(q).await {
                    if let Some(best) = sc_tracks.first() {
                        if let Ok((url, mime, dur, is_hls)) =
                            crate::providers::soundcloud::resolve_soundcloud_stream(&best.video_id)
                                .await
                        {
                            let audio_url = if is_hls {
                                url
                            } else {
                                crate::commands::stream_proxy::register_external_stream(
                                    &best.video_id,
                                    crate::commands::stream_proxy::CachedStream {
                                        audio_url: url,
                                        audio_mime: mime,
                                        video_url: None,
                                        video_mime: None,
                                        referer: Some("https://soundcloud.com/".to_string()),
                                        use_ios_ua: false,
                                        duration_seconds: dur,
                                        created_at: std::time::Instant::now(),
                                    },
                                )
                                .await;
                                format!(
                                    "http://127.0.0.1:{port}/stream/{}?kind=audio",
                                    best.video_id
                                )
                            };
                            return Ok(StreamMedia {
                                audio_url,
                                video_url: None,
                                duration_seconds: dur,
                            });
                        }
                    }
                }
            }
            Err(yt_err)
        }
    }
}

/// Fetch logged-in user's YouTube Music Playlists
#[tauri::command]
pub async fn get_user_yt_playlists(app: tauri::AppHandle) -> Result<Vec<ChartPlaylistItem>, String> {
    let cookie = crate::commands::auth::load_saved_cookie(&app)
        .ok_or_else(|| "Not logged in".to_string())?;

    let client = build_innertube_client()?;
    let origin = "https://music.youtube.com";
    let body = serde_json::json!({
        "context": innertube_context(),
        "browseId": "FEmusic_liked_playlists"
    });

    let mut req = client
        .post("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", origin)
        .header("Referer", "https://music.youtube.com/")
        .header("Cookie", &cookie)
        .json(&body);

    if let Some(auth) = crate::commands::auth::build_sapisidhash(&cookie, origin) {
        req = req.header("Authorization", auth).header("X-Origin", origin);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut playlists = Vec::new();

    if let Some(items) = data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/gridRenderer/items")
        .and_then(|v| v.as_array())
    {
        for it in items {
            if let Some(two) = it.get("musicTwoRowItemRenderer") {
                let title = two
                    .pointer("/title/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let browse_id = two
                    .pointer("/navigationEndpoint/browseEndpoint/browseId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let subtitle = two
                    .pointer("/subtitle/runs")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                            .collect::<String>()
                    })
                    .unwrap_or_else(|| "YouTube Playlist".to_string());
                let thumb = two
                    .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|t| t.get("url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                if !browse_id.is_empty() && !title.is_empty() {
                    playlists.push(ChartPlaylistItem {
                        browse_id,
                        title,
                        subtitle,
                        thumbnail_url: thumb,
                    });
                }
            }
        }
    }

    Ok(playlists)
}

/// Resolve a playable stream URL for a given video ID via RustyPipe
#[tauri::command]
pub async fn get_stream_url(video_id: String) -> Result<String, String> {
    let media = get_stream_media(video_id, None, None, None).await?;
    Ok(media.audio_url)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HomeFeedPayload {
    pub quick_picks: Vec<YoutubeMusicTrack>,
    pub featured_playlists: Vec<ChartPlaylistItem>,
    pub music_videos: Vec<YoutubeMusicTrack>,
    pub top_artists: Vec<ChartArtistItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveMoodItem {
    pub id: String,
    pub name: String,
    pub is_mood: bool,
    pub color_hex: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MoodDetailsPayload {
    pub id: String,
    pub name: String,
    pub playlists: Vec<ChartPlaylistItem>,
    pub tracks: Vec<YoutubeMusicTrack>,
}

fn format_duration_secs(secs: Option<u32>) -> Option<String> {
    secs.map(|s| {
        let h = s / 3600;
        let m = (s % 3600) / 60;
        let rem = s % 60;
        if h > 0 {
            format!("{h}:{m:02}:{rem:02}")
        } else {
            format!("{m}:{rem:02}")
        }
    })
}

fn map_rp_track(t: rustypipe::model::TrackItem) -> YoutubeMusicTrack {
    let artist = if t.artists.is_empty() {
        "YouTube Music".to_string()
    } else {
        t.artists
            .iter()
            .map(|a| a.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    };
    let thumb = t
        .cover
        .last()
        .map(|c| c.url.clone())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", t.id));

    YoutubeMusicTrack {
        video_id: t.id,
        title: t.name,
        artist,
        album: t.album.map(|a| a.name),
        duration_seconds: t.duration,
        duration_text: format_duration_secs(t.duration),
        thumbnail_url: Some(thumb),
    }
}

async fn fetch_home_browse(cookie_opt: Option<&str>) -> Result<(Vec<YoutubeMusicTrack>, Vec<ChartPlaylistItem>), String> {
    let client = build_innertube_client()?;
    let origin = "https://music.youtube.com";
    let body = serde_json::json!({
        "context": innertube_context(),
        "browseId": "FEmusic_home"
    });

    let mut req = client
        .post("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("Origin", origin)
        .header("Referer", "https://music.youtube.com/")
        .json(&body);

    if let Some(cookie) = cookie_opt {
        req = req.header("Cookie", cookie);
        if let Some(auth) = crate::commands::auth::build_sapisidhash(cookie, origin) {
            req = req.header("Authorization", auth).header("X-Origin", origin);
        }
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut quick_picks = Vec::new();
    let mut featured_playlists = Vec::new();
    let mut seen_vids = std::collections::HashSet::new();
    let mut seen_pids = std::collections::HashSet::new();

    if let Some(sections) = data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|v| v.as_array())
    {
        for sec in sections {
            if let Some(items) = sec
                .pointer("/musicCarouselShelfRenderer/contents")
                .and_then(|v| v.as_array())
            {
                for it in items {
                    if let Some(li) = it.get("musicResponsiveListItemRenderer") {
                        if let Some(track) = extract_track_from_renderer(Some(li)) {
                            if seen_vids.insert(track.video_id.clone()) {
                                quick_picks.push(track);
                            }
                        }
                    }

                    if let Some(two) = it.get("musicTwoRowItemRenderer") {
                        let title = two
                            .pointer("/title/runs/0/text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let subtitle = two
                            .pointer("/subtitle/runs")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                                    .collect::<String>()
                            })
                            .unwrap_or_default();
                        let thumb = two
                            .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                            .and_then(|v| v.as_array())
                            .and_then(|arr| arr.last())
                            .and_then(|t| t.get("url"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        if let Some(browse_id) = two
                            .pointer("/navigationEndpoint/browseEndpoint/browseId")
                            .and_then(|v| v.as_str())
                        {
                            if !title.is_empty() && !browse_id.is_empty() && seen_pids.insert(browse_id.to_string()) {
                                featured_playlists.push(ChartPlaylistItem {
                                    browse_id: browse_id.to_string(),
                                    title,
                                    subtitle: if subtitle.is_empty() {
                                        "YouTube Music".to_string()
                                    } else {
                                        subtitle
                                    },
                                    thumbnail_url: thumb,
                                });
                            }
                        } else if let Some(vid) = two
                            .pointer("/navigationEndpoint/watchEndpoint/videoId")
                            .and_then(|v| v.as_str())
                        {
                            if !title.is_empty() && !vid.is_empty() && seen_vids.insert(vid.to_string()) {
                                quick_picks.push(YoutubeMusicTrack {
                                    video_id: vid.to_string(),
                                    title,
                                    artist: if subtitle.is_empty() {
                                        "YouTube Music".to_string()
                                    } else {
                                        subtitle
                                    },
                                    album: None,
                                    duration_seconds: None,
                                    duration_text: None,
                                    thumbnail_url: thumb.or_else(|| Some(format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"))),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok((quick_picks, featured_playlists))
}

/// Fetch 100% live unauthenticated/authenticated YouTube Music Home Feed
#[tauri::command]
pub async fn get_home_feed(app: tauri::AppHandle) -> Result<HomeFeedPayload, String> {
    let cookie = crate::commands::auth::load_saved_cookie(&app);
    let rp = rustypipe::client::RustyPipe::new();
    let rp_query = rp.query();

    let (home_res, charts_res, videos_res) = tokio::join!(
        fetch_home_browse(cookie.as_deref()),
        get_youtube_charts(),
        rp_query.music_new_videos()
    );

    let (mut quick_picks, mut featured_playlists) = home_res.unwrap_or_default();
    let charts = charts_res.unwrap_or(ChartsPayload {
        playlists: vec![],
        artists: vec![],
    });

    // Merge unique chart playlists after home playlists so both are available
    let mut seen_pids: std::collections::HashSet<String> =
        featured_playlists.iter().map(|p| p.browse_id.clone()).collect();
    for p in charts.playlists {
        if seen_pids.insert(p.browse_id.clone()) {
            featured_playlists.push(p);
        }
    }

    // Fallback: if Home didn't return tracks (e.g. cold region), pull live tracks from the first playlist
    if quick_picks.is_empty() {
        if let Some(first_pl) = featured_playlists.first() {
            if let Ok(details) = get_playlist_tracks(first_pl.browse_id.clone()).await {
                quick_picks = details.tracks;
            }
        }
    }

    let mut music_videos: Vec<YoutubeMusicTrack> = match videos_res {
        Ok(items) => items.into_iter().map(map_rp_track).collect(),
        Err(_) => vec![],
    };

    if music_videos.len() < 4 {
        if let Ok(searched) = search_youtube_music("official music video vietnam".to_string(), Some("videos".to_string())).await {
            let mut seen_v: std::collections::HashSet<String> =
                music_videos.iter().map(|v| v.video_id.clone()).collect();
            for item in searched {
                if seen_v.insert(item.video_id.clone()) {
                    music_videos.push(item);
                }
            }
        }
    }

    Ok(HomeFeedPayload {
        quick_picks,
        featured_playlists,
        music_videos,
        top_artists: charts.artists,
    })
}

/// Fetch live Moods & Genres from YouTube Music via RustyPipe
#[tauri::command]
pub async fn get_moods_and_genres() -> Result<Vec<LiveMoodItem>, String> {
    let rp = rustypipe::client::RustyPipe::new();
    let genres = rp
        .query()
        .music_genres()
        .await
        .map_err(|e| format!("Failed to fetch moods & genres: {e}"))?;

    Ok(genres
        .into_iter()
        .map(|g| {
            let r = (g.color >> 16) & 0xFF;
            let gr = (g.color >> 8) & 0xFF;
            let b = g.color & 0xFF;
            LiveMoodItem {
                id: g.id,
                name: g.name,
                is_mood: g.is_mood,
                color_hex: format!("#{r:02x}{gr:02x}{b:02x}"),
            }
        })
        .collect())
}

/// Fetch live playlists & tracks inside a specific YouTube Music Mood or Genre
#[tauri::command]
pub async fn get_mood_details(genre_id: String) -> Result<MoodDetailsPayload, String> {
    let rp = rustypipe::client::RustyPipe::new();
    let genre = rp
        .query()
        .music_genre(&genre_id)
        .await
        .map_err(|e| format!("Failed to fetch mood details: {e}"))?;

    let mut playlists = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for sec in genre.sections {
        for p in sec.playlists {
            if seen.insert(p.id.clone()) {
                let thumb = p.thumbnail.last().map(|t| t.url.clone());
                let subtitle = if !sec.name.is_empty() {
                    sec.name.clone()
                } else {
                    p.channel.map(|c| c.name).unwrap_or_else(|| "YouTube Music".to_string())
                };
                playlists.push(ChartPlaylistItem {
                    browse_id: p.id,
                    title: p.name,
                    subtitle,
                    thumbnail_url: thumb,
                });
            }
        }
    }

    let mut tracks = Vec::new();
    if let Some(first_pl) = playlists.first() {
        if let Ok(details) = get_playlist_tracks(first_pl.browse_id.clone()).await {
            tracks = details.tracks;
        }
    }

    Ok(MoodDetailsPayload {
        id: genre.id,
        name: genre.name,
        playlists,
        tracks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rustypipe_stream() {
        let media = get_stream_media("fTXd-DpN3AI".to_string(), None, None, None)
            .await
            .expect("get_stream_media should succeed");
        println!("Proxy audio_url: {}", media.audio_url);
        assert!(media.audio_url.starts_with("http://127.0.0.1:"));

        let client = reqwest::Client::new();
        let head_resp = client
            .head(&media.audio_url)
            .send()
            .await
            .expect("HEAD proxy should succeed");
        println!("HEAD status={} cl={:?}", head_resp.status(), head_resp.headers().get("content-length"));
        assert_eq!(head_resp.status(), reqwest::StatusCode::OK);

        let range_resp = client
            .get(&media.audio_url)
            .header("Range", "bytes=0-1023")
            .send()
            .await
            .expect("Range GET proxy should succeed");
        println!("RANGE status={} cr={:?}", range_resp.status(), range_resp.headers().get("content-range"));
        assert_eq!(range_resp.status(), reqwest::StatusCode::PARTIAL_CONTENT);
        let bytes = range_resp.bytes().await.unwrap();
        assert_eq!(bytes.len(), 1024);
    }

    #[tokio::test]
    async fn test_live_unauth_home_and_moods() {
        let (picks, playlists) = fetch_home_browse(None).await.expect("FEmusic_home should succeed");
        println!("Home picks: {}, playlists: {}", picks.len(), playlists.len());
        assert!(!picks.is_empty() || !playlists.is_empty());

        let moods = get_moods_and_genres().await.expect("music_genres should succeed");
        println!("Moods count: {}", moods.len());
        assert!(!moods.is_empty());
    }
}
