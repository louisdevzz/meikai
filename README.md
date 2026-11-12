<div align="center">
  <img src="app-icon.png" width="128" alt="Meikai Logo" />
  <h1>Meikai</h1>
  <p>
    A FOSS multi-source desktop music client built with Rust supporting YouTube Music, Spotify,<br />
    SoundCloud &amp; TikTok with Rounded Glass UI, custom dynamic backgrounds, LRCLIB synced lyrics,<br />
    SponsorBlock, ReturnYouTubeDislike, and Last.fm.
  </p>

  <p>
    <a href="https://github.com/louisdevzz/meikai/releases"><img src="https://img.shields.io/github/v/release/louisdevzz/meikai?include_prereleases&style=flat-square" alt="Release" /></a>
    <a href="https://github.com/louisdevzz/meikai/stargazers"><img src="https://img.shields.io/github/stars/louisdevzz/meikai?style=flat-square" alt="Stars" /></a>
    <img src="https://img.shields.io/badge/Built%20with-Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Built with Rust" />
    <img src="https://img.shields.io/badge/Sources-YT%20Music%20%7C%20Spotify%20%7C%20SoundCloud%20%7C%20TikTok-4B8BFF?style=flat-square" alt="Multi-Source" />
  </p>
</div>

> **Warning**
> This app is currently in active beta development, so bugs or playback errors may occur. Because it depends on third-party music APIs and stream extraction, upstream changes can occasionally cause playback or parsing issues.

## Features

- **Unified Multi-Source Streaming (`YouTube Music`, `Spotify`, `SoundCloud`, `TikTok`):** Browse Home feeds, Top Charts, Playlists, Search, Radio, and stream directly across all four providers using one unified playback & queue mechanism — works even without logging in.
- **YouTube Music Integration:** Live Home Quick Picks, Featured Playlists, Top Charts, Music Videos, 35+ Moods & Genres, Radio queues, and optional WebView/cookie sign-in to sync personal playlists.
- **Spotify Integration:** Live Global Weekly Top Songs & curated editorial playlists (e.g., *Top 50 - Vietnam*, *Today's Top Hits*, *Viral 50*, *Lofi Beats*), direct Spotify track/playlist URL resolution, and seamless unified playback.
- **SoundCloud Integration:** Live SoundCloud Home mixes, playlist browsing, track search, related-track Radio, and direct streaming without requiring an account.
- **TikTok Music Integration:** Browse live TikTok Trending Music, search TikTok sounds/tracks, or paste TikTok links directly to stream inside the unified player with Queue, Lyrics, and EQ (no converter workflow).
- **Glassmorphism & macOS Vibrancy UI:** Three-panel layout inspired by SimpMusic with native macOS window controls, `HudWindow` vibrancy blur, Transparent Desktop mode, floating glass player bar, and Fullscreen Now Playing modal.
- **Lossless Custom Dynamic Backgrounds:** Set custom Video (`MP4`/`WebM`), animated `GIF`, or high-resolution static images stored locally via IndexedDB without image compression, complete with live blur and opacity controls.
- **Synced Lyrics (`LRCLIB`):** Real-time line-synced lyrics in the right side panel and fullscreen player with timing offset adjustments (`-0.5s` / `+0.5s`).
- **Audio Controls & Equalizer:** 10-band equalizer with curated presets (`Flat`, `Bass Boost`, `Anime & J-Rock`, `Vocal & Acoustic`, `Electronic / Phonk`, `Late Night`), playback speed control, and Sleep Timer.
- **Your Library & On-Device Analytics:** Manage Favorites, Most Played, Local Playlists, playback history, and track listening statistics locally.
- **SponsorBlock, ReturnYouTubeDislike & Last.fm:** Auto-skip sponsor segments, view video vote stats, and scrobble tracks to Last.fm.

## Data & Credits

- **UI & Inspiration:** Inspired by [SimpMusic](https://github.com/maxrave-dev/SimpMusic) for desktop layout, theming, and feature design.
- **Core Engine & Extraction:** Built with [Rust](https://www.rust-lang.org/), powered by [RustyPipe](https://github.com/Theta-Dev/rustypipe), YouTube Music InnerTube, SoundCloud Web API, Spotify public charts/embeds, and TikTok music streams.
- **Lyrics:** Provided by [LRCLIB](https://lrclib.net/).
- **Skip Segments & Stats:** Powered by [SponsorBlock](https://sponsor.ajay.app/) and ReturnYouTubeDislike.
- **Icons:** [Hugeicons](https://hugeicons.com/) (Free Icons).

## Build from Source

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (1.77.2+)
- Xcode Command Line Tools (on macOS)

### Build

```bash
# Clone repository
git clone https://github.com/louisdevzz/meikai.git
cd meikai

# Build Rust application
cargo build --release --manifest-path src-tauri/Cargo.toml
```

## Privacy

Meikai runs locally on your desktop and does not send telemetry or personal data to third-party analytics servers. All local playlists, listening stats, theme preferences, custom backgrounds, and optional account credentials stay on your device.

## Legal Disclaimer & Terms of Use

### 1. Free, Open-Source & Strictly Non-Commercial
Meikai is an open-source project created for educational purposes and personal use. We do not sell this application, include advertisements, or monetize it in any way.

### 2. Custom Browser & Media Client
Meikai acts as a specialized third-party client that queries publicly accessible web endpoints and presents them inside a desktop interface.

### 3. Support Content Creators
We respect the work of artists and creators and encourage users to support them through official platforms and artist subscriptions.

### 4. No Hosting of Copyrighted Material
Meikai does not host, upload, distribute, or permanently store copyrighted audio or video files on external servers.

### 5. User Responsibility
This software is provided "AS IS", without warranty of any kind. Users are solely responsible for ensuring their usage complies with applicable local laws and platform Terms of Service.
