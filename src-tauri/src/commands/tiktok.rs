use serde::{Deserialize, Serialize};
use regex::Regex;
use std::sync::OnceLock;

static VIDEO_PATH_RE: OnceLock<Regex> = OnceLock::new();
static SHORT_PATH_RE: OnceLock<Regex> = OnceLock::new();

fn video_path_re() -> &'static Regex {
    VIDEO_PATH_RE.get_or_init(|| {
        Regex::new(r"^/@[A-Za-z0-9._-]+/video/([0-9]+)/?$").unwrap()
    })
}

fn short_path_re() -> &'static Regex {
    SHORT_PATH_RE.get_or_init(|| Regex::new(r"^/[A-Za-z0-9]+/?$").unwrap())
}

const ALLOWED_VIDEO_HOSTS: &[&str] = &["www.tiktok.com", "tiktok.com", "m.tiktok.com"];
const ALLOWED_SHORT_HOSTS: &[&str] = &["vm.tiktok.com", "vt.tiktok.com"];
const CANONICAL_HOST: &str = "www.tiktok.com";

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TikTokLink {
    Video { url: String, video_id: String },
    ShortLink { url: String },
}

/// Parse and validate a TikTok URL — mirrors the Kotlin implementation.
/// Returns None if the URL is invalid, unsafe, or not a TikTok video link.
#[tauri::command]
pub fn parse_tiktok_url(raw: String) -> Option<TikTokLink> {
    let parsed = url::Url::parse(raw.trim()).ok()?;

    // HTTPS only
    if parsed.scheme() != "https" {
        return None;
    }
    // No credentials, no non-standard port, no fragment
    if parsed.username() != "" || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }

    let host = parsed.host_str()?.to_lowercase();
    let path = parsed.path();

    if ALLOWED_SHORT_HOSTS.contains(&host.as_str()) {
        if !short_path_re().is_match(path) {
            return None;
        }
        return Some(TikTokLink::ShortLink {
            url: format!("https://{host}{path}"),
        });
    }

    if !ALLOWED_VIDEO_HOSTS.contains(&host.as_str()) {
        return None;
    }

    let caps = video_path_re().captures(path)?;
    let video_id = caps.get(1)?.as_str().to_string();

    // Normalize to canonical host
    Some(TikTokLink::Video {
        url: format!("https://{CANONICAL_HOST}{path}"),
        video_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_canonical_video_url() {
        let link = parse_tiktok_url(
            "https://www.tiktok.com/@artist/video/123456?is_from_webapp=1".into()
        );
        assert_eq!(link, Some(TikTokLink::Video {
            url: "https://www.tiktok.com/@artist/video/123456".into(),
            video_id: "123456".into(),
        }));
    }

    #[test]
    fn normalizes_bare_host_to_www() {
        let link = parse_tiktok_url("https://tiktok.com/@creator/video/999".into());
        assert_eq!(link, Some(TikTokLink::Video {
            url: "https://www.tiktok.com/@creator/video/999".into(),
            video_id: "999".into(),
        }));
    }

    #[test]
    fn rejects_http() {
        assert!(parse_tiktok_url("http://www.tiktok.com/@a/video/123".into()).is_none());
    }

    #[test]
    fn rejects_impersonation() {
        assert!(parse_tiktok_url("https://www.tiktok.com.evil.example/@a/video/1".into()).is_none());
    }

    #[test]
    fn short_link_accepted() {
        assert!(matches!(
            parse_tiktok_url("https://vm.tiktok.com/ZMabcdef/".into()),
            Some(TikTokLink::ShortLink { .. })
        ));
    }
}
