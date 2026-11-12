use crate::commands::youtube::{ChartPlaylistItem, HomeFeedPayload, PlaylistDetails, YoutubeMusicTrack};
use crate::providers::{format_duration, http_client};
use regex::Regex;
use serde_json::Value;

const CURATED_SPOTIFY_PLAYLISTS: &[(&str, &str, &str)] = &[
    ("37i9dQZEVXbLdGSmz6xilI", "Top 50 - Vietnam", "Spotify Charts • Vietnam"),
    ("37i9dQZF1DXcBWIGoYBM5M", "Today's Top Hits", "Spotify Editorial • Global"),
    ("37i9dQZEVXbLiRSasKsNU9", "Viral 50 - Global", "Spotify Charts • Viral"),
    ("37i9dQZF1DWWQRwui0ExPn", "Lofi Beats", "Spotify Editorial • Focus"),
    ("37i9dQZF1DX0F4i7Q9pshJ", "Hot Hits Vietnam", "Spotify Editorial • V-Pop"),
];

fn parse_next_data_entity(html: &str) -> Option<Value> {
    let re = Regex::new(r#"<script id="__NEXT_DATA__"[^>]*>(.*?)</script>"#).ok()?;
    let caps = re.captures(html)?;
    let nd: Value = serde_json::from_str(&caps[1]).ok()?;
    nd.pointer("/props/pageProps/state/data/entity").cloned()
}

fn extract_spotify_id(uri_or_id: &str) -> String {
    uri_or_id
        .rsplit(':')
        .next()
        .unwrap_or(uri_or_id)
        .rsplit('/')
        .next()
        .unwrap_or(uri_or_id)
        .split('?')
        .next()
        .unwrap_or(uri_or_id)
        .to_string()
}

fn best_cover_from_entity(entity: &Value) -> Option<String> {
    entity
        .pointer("/coverArt/sources")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last())
        .and_then(|s| s.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            entity
                .pointer("/visualIdentity/image/0/url")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string())
        })
}

async fn fetch_embed_playlist(playlist_id: &str, fallback_title: &str, fallback_sub: &str) -> Result<PlaylistDetails, String> {
    let url = format!("https://open.spotify.com/embed/playlist/{playlist_id}");
    let html = http_client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Spotify embed fetch failed: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let entity = parse_next_data_entity(&html)
        .ok_or_else(|| "Failed to parse Spotify playlist data".to_string())?;

    let title = entity
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_title)
        .to_string();
    let cover = best_cover_from_entity(&entity);

    let mut tracks = Vec::new();
    if let Some(arr) = entity.get("trackList").and_then(|v| v.as_array()) {
        for item in arr {
            let t_title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if t_title.is_empty() {
                continue;
            }
            let artist = item.get("subtitle").and_then(|v| v.as_str()).unwrap_or("Spotify Artist").to_string();
            let uri = item.get("uri").and_then(|v| v.as_str()).unwrap_or("");
            let sp_id = extract_spotify_id(uri);
            let dur_ms = item.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
            let secs = (dur_ms / 1000) as u32;
            let track_cover = cover.clone();

            tracks.push(YoutubeMusicTrack {
                video_id: format!("sp:{sp_id}"),
                title: t_title,
                artist,
                album: Some(title.clone()),
                duration_seconds: if secs > 0 { Some(secs) } else { None },
                duration_text: if secs > 0 { Some(format_duration(secs)) } else { None },
                thumbnail_url: track_cover,
            });
        }
    }

    Ok(PlaylistDetails {
        browse_id: format!("sppl:{playlist_id}"),
        title,
        subtitle: fallback_sub.to_string(),
        thumbnail_url: cover,
        tracks,
    })
}

/// Fetch live Spotify Home Feed (Public Weekly Charts + Live Curated Playlists)
#[tauri::command]
pub async fn get_spotify_home() -> Result<HomeFeedPayload, String> {
    let charts_fut = async {
        http_client()
            .get("https://charts-spotify-com-service.spotify.com/public/v0/charts")
            .send()
            .await
            .ok()?
            .json::<Value>()
            .await
            .ok()
    };

    let (charts_opt, vn50, hits, viral, lofi, hotvn) = tokio::join!(
        charts_fut,
        fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[0].0, CURATED_SPOTIFY_PLAYLISTS[0].1, CURATED_SPOTIFY_PLAYLISTS[0].2),
        fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[1].0, CURATED_SPOTIFY_PLAYLISTS[1].1, CURATED_SPOTIFY_PLAYLISTS[1].2),
        fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[2].0, CURATED_SPOTIFY_PLAYLISTS[2].1, CURATED_SPOTIFY_PLAYLISTS[2].2),
        fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[3].0, CURATED_SPOTIFY_PLAYLISTS[3].1, CURATED_SPOTIFY_PLAYLISTS[3].2),
        fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[4].0, CURATED_SPOTIFY_PLAYLISTS[4].1, CURATED_SPOTIFY_PLAYLISTS[4].2),
    );

    let mut quick_picks = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    if let Some(ch) = charts_opt {
        if let Some(resps) = ch.get("chartEntryViewResponses").and_then(|v| v.as_array()) {
            for resp in resps {
                if let Some(entries) = resp.get("entries").and_then(|v| v.as_array()) {
                    for e in entries.iter().take(18) {
                        if let Some(meta) = e.get("trackMetadata") {
                            let title = meta.get("trackName").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                            let uri = meta.get("trackUri").and_then(|v| v.as_str()).unwrap_or("");
                            if title.is_empty() || uri.is_empty() {
                                continue;
                            }
                            let sp_id = extract_spotify_id(uri);
                            let vid = format!("sp:{sp_id}");
                            if !seen_ids.insert(vid.clone()) {
                                continue;
                            }
                            let artists = meta
                                .get("artists")
                                .and_then(|a| a.as_array())
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                                        .collect::<Vec<_>>()
                                        .join(", ")
                                })
                                .unwrap_or_else(|| "Spotify Artist".to_string());
                            let cover = meta.get("displayImageUri").and_then(|v| v.as_str()).map(|s| s.to_string());

                            quick_picks.push(YoutubeMusicTrack {
                                video_id: vid,
                                title,
                                artist: artists,
                                album: Some("Spotify Top Songs".to_string()),
                                duration_seconds: None,
                                duration_text: None,
                                thumbnail_url: cover,
                            });
                        }
                    }
                    if !quick_picks.is_empty() {
                        break;
                    }
                }
            }
        }
    }

    let mut featured_playlists = Vec::new();
    for pl_res in [vn50, hits, viral, lofi, hotvn] {
        if let Ok(pl) = pl_res {
            if quick_picks.is_empty() {
                quick_picks = pl.tracks.iter().take(12).cloned().collect();
            }
            featured_playlists.push(ChartPlaylistItem {
                browse_id: pl.browse_id,
                title: pl.title,
                subtitle: pl.subtitle,
                thumbnail_url: pl.thumbnail_url,
            });
        }
    }

    Ok(HomeFeedPayload {
        quick_picks,
        featured_playlists,
        music_videos: vec![],
        top_artists: vec![],
    })
}

/// Fetch Spotify playlist or album details
#[tauri::command]
pub async fn get_spotify_playlist(browse_id: String) -> Result<PlaylistDetails, String> {
    let raw_id = browse_id
        .strip_prefix("sppl:")
        .or_else(|| browse_id.strip_prefix("spal:"))
        .unwrap_or(&browse_id);
    let fallback = CURATED_SPOTIFY_PLAYLISTS
        .iter()
        .find(|(id, _, _)| *id == raw_id)
        .copied()
        .unwrap_or((raw_id, "Spotify Playlist", "Spotify"));
    fetch_embed_playlist(raw_id, fallback.1, fallback.2).await
}

/// Search Spotify catalog (supports Spotify URLs directly, plus live Spotify charts & curated playlists)
#[tauri::command]
pub async fn search_spotify(query: String) -> Result<Vec<YoutubeMusicTrack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    // Direct Spotify track/playlist/album link support
    if q.contains("open.spotify.com/") {
        if let Some(pl_idx) = q.find("/playlist/") {
            let pid = extract_spotify_id(&q[pl_idx + 10..]);
            let pl = fetch_embed_playlist(&pid, "Spotify Playlist", "Spotify").await?;
            return Ok(pl.tracks);
        }
        if let Some(tr_idx) = q.find("/track/") {
            let tid = extract_spotify_id(&q[tr_idx + 7..]);
            let html = http_client()
                .get(format!("https://open.spotify.com/embed/track/{tid}"))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .text()
                .await
                .map_err(|e| e.to_string())?;
            if let Some(entity) = parse_next_data_entity(&html) {
                let title = entity.get("name").and_then(|v| v.as_str()).unwrap_or("Spotify Track").to_string();
                let artist = entity
                    .get("artists")
                    .and_then(|a| a.as_array())
                    .map(|arr| arr.iter().filter_map(|x| x.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
                    .unwrap_or_else(|| "Spotify Artist".to_string());
                let dur_ms = entity.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
                let secs = (dur_ms / 1000) as u32;
                let cover = best_cover_from_entity(&entity);
                return Ok(vec![YoutubeMusicTrack {
                    video_id: format!("sp:{tid}"),
                    title,
                    artist,
                    album: None,
                    duration_seconds: if secs > 0 { Some(secs) } else { None },
                    duration_text: if secs > 0 { Some(format_duration(secs)) } else { None },
                    thumbnail_url: cover,
                }]);
            }
        }
    }

    // Search across live Spotify Global Charts & Curated Playlists
    let q_lower = q.to_lowercase();
    let home = get_spotify_home().await?;
    let mut matches: Vec<YoutubeMusicTrack> = home
        .quick_picks
        .into_iter()
        .filter(|t| {
            t.title.to_lowercase().contains(&q_lower)
                || t.artist.to_lowercase().contains(&q_lower)
        })
        .collect();

    if matches.len() < 10 {
        let extra_pl = tokio::join!(
            fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[0].0, CURATED_SPOTIFY_PLAYLISTS[0].1, CURATED_SPOTIFY_PLAYLISTS[0].2),
            fetch_embed_playlist(CURATED_SPOTIFY_PLAYLISTS[1].0, CURATED_SPOTIFY_PLAYLISTS[1].1, CURATED_SPOTIFY_PLAYLISTS[1].2),
        );
        let mut seen: std::collections::HashSet<String> =
            matches.iter().map(|t| t.video_id.clone()).collect();
        for res in [extra_pl.0, extra_pl.1] {
            if let Ok(pl) = res {
                for t in pl.tracks {
                    if (t.title.to_lowercase().contains(&q_lower)
                        || t.artist.to_lowercase().contains(&q_lower))
                        && seen.insert(t.video_id.clone())
                    {
                        matches.push(t);
                    }
                }
            }
        }
    }

    // If not in Top 50 charts, resolve live matches via SoundCloud + YouTube Music tagged for playback
    if matches.is_empty() {
        let sc = crate::providers::soundcloud::search_soundcloud(q.to_string())
            .await
            .unwrap_or_default();
        if !sc.is_empty() {
            return Ok(sc);
        }
        return crate::commands::youtube::search_youtube_music(q.to_string(), Some("songs".to_string())).await;
    }

    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spotify_live_home() {
        let home = get_spotify_home().await.expect("Spotify home should load");
        println!("Spotify home picks: {}, playlists: {}", home.quick_picks.len(), home.featured_playlists.len());
        assert!(!home.quick_picks.is_empty());
        assert!(!home.featured_playlists.is_empty());
    }
}
