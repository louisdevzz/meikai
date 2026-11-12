import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Page } from "../App";
import { usePlayer } from "../store/PlayerContext";
import type {
  Track,
  ChartPlaylistItem,
  HomeFeedPayload,
  LiveMoodItem,
  MoodDetailsPayload,
} from "../types/music";
import Icon from "../components/ui/Icon";
import BackgroundCustomizerCard from "../components/ui/BackgroundCustomizerCard";
import {
  PlayIcon,
  PauseIcon,
  Add01Icon,
  Settings02Icon,
  Image01Icon,
  Cancel01Icon,
  ChartIncreaseIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";

interface HomePageProps {
  onNavigate?: (page: Page) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const {
    playTrack,
    seedInitialQueue,
    currentTrack,
    isPlaying,
    togglePlay,
    setActivePlaylistTarget,
    setIsVideoMode,
    ytAccount,
    userYtPlaylists,
    setIsLoginModalOpen,
  } = usePlayer();

  const [activeTopFilter, setActiveTopFilter] = useState<"all" | "mood">("all");
  const [selectedMood, setSelectedMood] = useState("all");
  const [homeFeed, setHomeFeed] = useState<HomeFeedPayload | null>(null);
  const [quickPicks, setQuickPicks] = useState<Track[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<ChartPlaylistItem[]>([]);
  const [musicVideos, setMusicVideos] = useState<Track[]>([]);
  const [spotifyFeed, setSpotifyFeed] = useState<HomeFeedPayload | null>(null);
  const [soundcloudFeed, setSoundcloudFeed] = useState<HomeFeedPayload | null>(null);
  const [tiktokFeed, setTiktokFeed] = useState<HomeFeedPayload | null>(null);
  const [liveMoods, setLiveMoods] = useState<LiveMoodItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingMood, setLoadingMood] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [showBgModal, setShowBgModal] = useState(false);

  const loadHomeData = async () => {
    setLoadingFeed(true);
    setFeedError(null);
    try {
      const [ytRes, moodsRes, spRes, scRes, ttRes] = await Promise.allSettled([
        invoke<HomeFeedPayload>("get_home_feed"),
        invoke<LiveMoodItem[]>("get_moods_and_genres"),
        invoke<HomeFeedPayload>("get_spotify_home"),
        invoke<HomeFeedPayload>("get_soundcloud_home"),
        invoke<HomeFeedPayload>("get_tiktok_home"),
      ]);

      if (ytRes.status === "fulfilled" && ytRes.value) {
        const yt = ytRes.value;
        setHomeFeed(yt);
        const picks = (yt.quick_picks || []).slice(0, 12);
        setQuickPicks(picks);
        setFeaturedPlaylists(yt.featured_playlists || []);
        setMusicVideos((yt.music_videos || []).slice(0, 12));
        if (picks.length > 0) seedInitialQueue(picks);
      } else if (ytRes.status === "rejected") {
        setFeedError(String(ytRes.reason));
      }

      if (moodsRes.status === "fulfilled" && moodsRes.value?.length > 0) {
        setLiveMoods(moodsRes.value);
      }
      if (spRes.status === "fulfilled" && spRes.value) {
        setSpotifyFeed(spRes.value);
      }
      if (scRes.status === "fulfilled" && scRes.value) {
        setSoundcloudFeed(scRes.value);
      }
      if (ttRes.status === "fulfilled" && ttRes.value) {
        setTiktokFeed(ttRes.value);
      }
    } catch (err) {
      setFeedError(String(err));
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, [ytAccount?.name]);

  const handleMoodSelect = async (moodId: string) => {
    setSelectedMood(moodId);
    if (moodId === "all") {
      if (homeFeed) {
        setQuickPicks(homeFeed.quick_picks.slice(0, 12));
        setFeaturedPlaylists(homeFeed.featured_playlists);
      }
      return;
    }

    setLoadingMood(true);
    try {
      const details = await invoke<MoodDetailsPayload>("get_mood_details", {
        genreId: moodId,
      });
      if (details.playlists && details.playlists.length > 0) {
        setFeaturedPlaylists(details.playlists);
      }
      if (details.tracks && details.tracks.length > 0) {
        setQuickPicks(details.tracks.slice(0, 12));
      } else {
        const moodLabel = liveMoods.find((m) => m.id === moodId)?.name || moodId;
        const fallbackTracks = await invoke<Track[]>("search_youtube_music", {
          query: moodLabel,
          filter: "songs",
        });
        if (fallbackTracks && fallbackTracks.length > 0) {
          setQuickPicks(fallbackTracks.slice(0, 12));
        }
      }
    } catch {
      // Keep current tracks on error
    } finally {
      setLoadingMood(false);
    }
  };

  const handleTrackClick = (track: Track, list: Track[]) => {
    if (currentTrack?.video_id === track.video_id) {
      togglePlay();
    } else {
      playTrack(track, list);
    }
  };

  const openPlaylist = (pl: ChartPlaylistItem) => {
    setActivePlaylistTarget({
      kind: "remote",
      id: pl.browse_id,
      title: pl.title,
      subtitle: pl.subtitle,
      coverUrl: pl.thumbnail_url,
    });
    onNavigate?.("playlist");
  };

  const renderTrackGrid = (tracks: Track[]) => (
    <div className="quick-picks-3col">
      {tracks.map((track) => {
        const isCurrent = currentTrack?.video_id === track.video_id;
        return (
          <div
            key={track.video_id}
            className={`qp-row-item ${isCurrent ? "qp-row-item--active" : ""}`}
            onClick={() => handleTrackClick(track, tracks)}
          >
            <div className="qp-row-item__thumb-wrap">
              <img
                src={track.thumbnail_url || `https://i.ytimg.com/vi/${track.video_id}/hqdefault.jpg`}
                alt=""
                className="qp-row-item__thumb"
              />
              <div className="qp-row-item__play-overlay">
                <Icon
                  icon={isCurrent && isPlaying ? PauseIcon : PlayIcon}
                  size={16}
                  color="white"
                />
              </div>
            </div>
            <div className="qp-row-item__info">
              <div className="qp-row-item__title" title={track.title}>
                {track.title}
              </div>
              <div className="qp-row-item__artist">{track.artist}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderPlaylistRow = (playlists: ChartPlaylistItem[]) => (
    <div className="featured-charts-row">
      {playlists.map((pl) => (
        <div
          key={pl.browse_id}
          className="chart-card"
          onClick={() => openPlaylist(pl)}
        >
          <div
            className="chart-card__cover"
            style={{ padding: 0, background: "rgba(255,255,255,0.08)" }}
          >
            {pl.thumbnail_url ? (
              <img
                src={pl.thumbnail_url}
                alt={pl.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #2b5876, #4e4376)",
                  padding: 12,
                  textAlign: "center",
                  fontWeight: 700,
                }}
              >
                {pl.title}
              </div>
            )}
            <div className="chart-card__play-hover">
              <Icon icon={PlayIcon} size={20} color="white" />
            </div>
          </div>
          <div className="chart-card__name" title={pl.title}>
            {pl.title}
          </div>
          <div className="chart-card__sub">{pl.subtitle}</div>
        </div>
      ))}
    </div>
  );

  const spotifyTracks = (spotifyFeed?.quick_picks || []).slice(0, 9);
  const spotifyPlaylists = spotifyFeed?.featured_playlists || [];
  const soundcloudTracks = (soundcloudFeed?.quick_picks || []).slice(0, 9);
  const soundcloudPlaylists = soundcloudFeed?.featured_playlists || [];
  const tiktokTracks = (tiktokFeed?.quick_picks || []).slice(0, 9);

  return (
    <div className="home-page">
      {/* Clean SimpMusic-style Top Bar: Avatar + All / Mood + Action Icons */}
      <div className="home-topbar">
        <div className="home-topbar__left">
          <div
            className="home-avatar"
            title={ytAccount ? `${ytAccount.name} — Tài khoản YouTube` : "Đăng nhập YouTube Music"}
            onClick={() => setIsLoginModalOpen(true)}
            style={{ cursor: "pointer", overflow: "hidden" }}
          >
            {ytAccount?.avatar_url ? (
              <img src={ytAccount.avatar_url} alt={ytAccount.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Icon icon={UserCircleIcon} size={20} color="#7eb8ff" />
            )}
          </div>

          {!ytAccount && (
            <button
              className="top-pill"
              onClick={() => setIsLoginModalOpen(true)}
              style={{ borderColor: "rgba(126, 184, 255, 0.4)", color: "#8cc4ff" }}
            >
              Sign in
            </button>
          )}

          <button
            className={`top-pill ${activeTopFilter === "all" ? "top-pill--active" : ""}`}
            onClick={() => {
              setActiveTopFilter("all");
              handleMoodSelect("all");
            }}
          >
            All
          </button>

          <button
            className={`top-pill ${activeTopFilter === "mood" ? "top-pill--active" : ""}`}
            onClick={() => setActiveTopFilter(activeTopFilter === "mood" ? "all" : "mood")}
          >
            Mood
          </button>
        </div>

        <div className="home-topbar__right">
          <button
            className="circle-icon-btn circle-icon-btn--lg"
            onClick={() => onNavigate?.("analytics")}
            title="Listening Analytics"
          >
            <Icon icon={ChartIncreaseIcon} size={18} color="#a855f7" />
          </button>
          <button
            className="circle-icon-btn circle-icon-btn--lg"
            onClick={() => setShowBgModal(true)}
            title="Đổi Hình Nền Động (Video / GIF / Ảnh) & Độ Trong Suốt"
          >
            <Icon icon={Image01Icon} size={18} color="#7eb8ff" />
          </button>
          <button
            className="circle-icon-btn circle-icon-btn--lg"
            onClick={() => onNavigate?.("library")}
            title="Tạo Playlist"
          >
            <Icon icon={Add01Icon} size={18} />
          </button>
          <button
            className="circle-icon-btn circle-icon-btn--lg"
            onClick={() => onNavigate?.("settings")}
            title="Cài đặt"
          >
            <Icon icon={Settings02Icon} size={18} />
          </button>
        </div>
      </div>

      {/* Quick Background & Glass Customizer Modal */}
      {showBgModal && (
        <div className="bg-modal-backdrop" onClick={() => setShowBgModal(false)}>
          <div className="bg-modal-glass" onClick={(e) => e.stopPropagation()}>
            <div className="bg-modal-header">
              <div>
                <h3>Hình nền động & Giao diện Kính Mờ</h3>
                <p>Hỗ trợ Transparent Desktop, Video (MP4/WebM), GIF và Ảnh gốc không giảm chất lượng</p>
              </div>
              <button
                className="circle-icon-btn"
                onClick={() => setShowBgModal(false)}
                title="Đóng"
              >
                <Icon icon={Cancel01Icon} size={16} />
              </button>
            </div>
            <BackgroundCustomizerCard />
          </div>
        </div>
      )}

      {/* Expandable Live Moods & Genres from YouTube Music */}
      {activeTopFilter === "mood" && (
        <div className="mood-chips-row">
          <button
            className={`mood-chip ${selectedMood === "all" ? "mood-chip--active" : ""}`}
            onClick={() => handleMoodSelect("all")}
          >
            <span>Tất cả</span>
          </button>
          {liveMoods.map((mood) => (
            <button
              key={mood.id}
              className={`mood-chip ${selectedMood === mood.id ? "mood-chip--active" : ""}`}
              style={
                selectedMood === mood.id
                  ? { borderColor: mood.color_hex, background: `${mood.color_hex}33` }
                  : undefined
              }
              onClick={() => handleMoodSelect(mood.id)}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: mood.color_hex,
                  flexShrink: 0,
                }}
              />
              <span>{mood.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Section 1: Quick Picks (YouTube Music) */}
      <section className="home-section">
        <div className="section-eyebrow">LET&apos;S START WITH A RADIO</div>
        <div className="section-header">
          <h2 className="section-title">
            {selectedMood === "all"
              ? "Quick picks"
              : `Quick picks • ${liveMoods.find((m) => m.id === selectedMood)?.name || ""}`}
          </h2>
          <button
            className="link-action-btn"
            onClick={() => quickPicks.length > 0 && playTrack(quickPicks[0], quickPicks)}
          >
            Play all
          </button>
        </div>

        {(loadingFeed && quickPicks.length === 0) || loadingMood ? (
          <div className="quick-picks-3col">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="qp-row-item"
                style={{ opacity: 0.45, pointerEvents: "none" }}
              >
                <div
                  className="qp-row-item__thumb-wrap"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                />
                <div className="qp-row-item__info" style={{ gap: 6 }}>
                  <div style={{ height: 12, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.1)" }} />
                  <div style={{ height: 10, width: "48%", borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : feedError && quickPicks.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 0" }}>
            <p className="empty-state__sub">Không thể kết nối YouTube Music: {feedError}</p>
            <button className="top-pill top-pill--active" style={{ marginTop: 10 }} onClick={() => loadHomeData()}>
              Thử tải lại
            </button>
          </div>
        ) : (
          renderTrackGrid(quickPicks)
        )}
      </section>

      {/* Section 2: Featured Playlists For You */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Featured playlists for you</h2>
          <button className="link-action-btn" onClick={() => onNavigate?.("search")}>
            More
          </button>
        </div>

        {loadingFeed && featuredPlaylists.length === 0 ? (
          <div className="featured-charts-row">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="chart-card" style={{ opacity: 0.45 }}>
                <div className="chart-card__cover" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div style={{ height: 12, width: "80%", borderRadius: 6, background: "rgba(255,255,255,0.1)", marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : (
          renderPlaylistRow(featuredPlaylists)
        )}
      </section>

      {/* Logged-in User's YouTube Music Playlists */}
      {ytAccount && userYtPlaylists.length > 0 && (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Your YouTube Playlists ({ytAccount.name})</h2>
          </div>
          {renderPlaylistRow(userYtPlaylists)}
        </section>
      )}

      {/* Section 3: Spotify Charts & Playlists */}
      {(spotifyTracks.length > 0 || spotifyPlaylists.length > 0) && (
        <>
          {spotifyTracks.length > 0 && (
            <section className="home-section">
              <div className="section-eyebrow">SPOTIFY WEEKLY CHARTS</div>
              <div className="section-header">
                <h2 className="section-title">Spotify Top Songs</h2>
                <button
                  className="link-action-btn"
                  onClick={() => playTrack(spotifyTracks[0], spotifyTracks)}
                >
                  Play all
                </button>
              </div>
              {renderTrackGrid(spotifyTracks)}
            </section>
          )}

          {spotifyPlaylists.length > 0 && (
            <section className="home-section">
              <div className="section-header">
                <h2 className="section-title">Spotify Playlists</h2>
              </div>
              {renderPlaylistRow(spotifyPlaylists)}
            </section>
          )}
        </>
      )}

      {/* Section 4: SoundCloud Trending & Mixes */}
      {(soundcloudTracks.length > 0 || soundcloudPlaylists.length > 0) && (
        <>
          {soundcloudTracks.length > 0 && (
            <section className="home-section">
              <div className="section-eyebrow">SOUNDCLOUD LIVE</div>
              <div className="section-header">
                <h2 className="section-title">SoundCloud Trending</h2>
                <button
                  className="link-action-btn"
                  onClick={() => playTrack(soundcloudTracks[0], soundcloudTracks)}
                >
                  Play all
                </button>
              </div>
              {renderTrackGrid(soundcloudTracks)}
            </section>
          )}

          {soundcloudPlaylists.length > 0 && (
            <section className="home-section">
              <div className="section-header">
                <h2 className="section-title">SoundCloud Mixes &amp; Sets</h2>
              </div>
              {renderPlaylistRow(soundcloudPlaylists)}
            </section>
          )}
        </>
      )}

      {/* Section 5: TikTok Trending Music */}
      {tiktokTracks.length > 0 && (
        <section className="home-section">
          <div className="section-eyebrow">TIKTOK MUSIC</div>
          <div className="section-header">
            <h2 className="section-title">TikTok Trending Sounds</h2>
            <button
              className="link-action-btn"
              onClick={() => playTrack(tiktokTracks[0], tiktokTracks)}
            >
              Play all
            </button>
          </div>
          {renderTrackGrid(tiktokTracks)}
        </section>
      )}

      {/* Section 6: Music Video */}
      <section className="home-section" style={{ paddingBottom: 80 }}>
        <div className="section-header">
          <h2 className="section-title">Music video</h2>
          <button className="link-action-btn" onClick={() => onNavigate?.("search")}>
            More
          </button>
        </div>

        <div className="music-videos-row">
          {loadingFeed && musicVideos.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mv-card" style={{ opacity: 0.45 }}>
                  <div className="mv-card__thumb-wrap" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div style={{ height: 12, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.1)", marginTop: 8 }} />
                </div>
              ))
            : musicVideos.map((mv) => (
                <div
                  key={mv.video_id}
                  className="mv-card"
                  onClick={() => {
                    setIsVideoMode(true);
                    playTrack(mv, musicVideos);
                  }}
                >
                  <div className="mv-card__thumb-wrap">
                    <img
                      src={mv.thumbnail_url || `https://i.ytimg.com/vi/${mv.video_id}/hqdefault.jpg`}
                      alt={mv.title}
                      className="mv-card__thumb"
                    />
                    {mv.duration_text && (
                      <span className="mv-card__duration">{mv.duration_text}</span>
                    )}
                    <div className="mv-card__play-overlay">
                      <Icon icon={PlayIcon} size={24} color="white" />
                    </div>
                  </div>
                  <div className="mv-card__title" title={mv.title}>
                    {mv.title}
                  </div>
                  <div className="mv-card__sub">{mv.artist}</div>
                </div>
              ))}
        </div>
      </section>
    </div>
  );
}
