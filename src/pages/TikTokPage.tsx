import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayer } from "../store/PlayerContext";
import type { HomeFeedPayload, Track } from "../types/music";
import Icon from "../components/ui/Icon";
import {
  TiktokIcon,
  PlayIcon,
  PauseIcon,
  Search01Icon,
  MusicNote01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

export default function TikTokPage() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const { playTrack, currentTrack, isPlaying, togglePlay, setIsVideoMode } = usePlayer();

  const loadTrending = () => {
    setLoading(true);
    setError(null);
    setIsSearchMode(false);
    invoke<HomeFeedPayload>("get_tiktok_home")
      .then((res) => {
        setTracks(res?.quick_picks || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrending();
  }, []);

  const handleSearchOrLink = async () => {
    const q = query.trim();
    if (!q) {
      loadTrending();
      return;
    }
    setError(null);
    setLoading(true);
    setIsSearchMode(true);
    try {
      const res = await invoke<Track[]>("search_tiktok_music", { query: q });
      setTracks(res || []);
      if (!res || res.length === 0) {
        setError("Không tìm thấy bài hát hoặc âm thanh TikTok phù hợp.");
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (track: Track, withVideo = false) => {
    if (currentTrack?.video_id === track.video_id) {
      togglePlay();
      return;
    }
    if (withVideo) setIsVideoMode(true);
    playTrack(track, tracks);
  };

  return (
    <div className="tiktok-page">
      <div className="tiktok-header">
        <h1 className="tiktok-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>TikTok Music</span>
          <Icon icon={TiktokIcon} size={28} color="var(--accent)" />
        </h1>
        <p className="tiktok-subtitle">
          Nghe trực tiếp nhạc thịnh hành, tìm kiếm sound hoặc phát từ liên kết TikTok với đầy đủ Queue, Lyrics &amp; EQ
        </p>
      </div>

      {/* Unified Search & Direct Link Bar (same browse/search mechanism as YouTube Music) */}
      <div className="search-page__header" style={{ marginBottom: 20 }}>
        <div className="search-page__input-wrap">
          <span className="search-page__icon">
            <Icon icon={Search01Icon} size={18} />
          </span>
          <input
            type="text"
            className="search-page__input"
            placeholder="Tìm kiếm nhạc TikTok hoặc dán liên kết (https://vt.tiktok.com/... / @user/video/...)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchOrLink()}
          />
          {query && (
            <button
              className="search-page__clear-btn"
              onClick={() => {
                setQuery("");
                loadTrending();
              }}
              title="Quay lại thịnh hành"
            >
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          )}
        </div>
      </div>

      {error && <div className="tiktok-alert tiktok-alert--error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="empty-state__icon spinner">
            <Icon icon={MusicNote01Icon} size={40} color="var(--accent)" />
          </div>
          <div className="empty-state__title">
            {isSearchMode ? "Đang tải nhạc từ TikTok…" : "Đang tải bảng xếp hạng TikTok Music…"}
          </div>
        </div>
      ) : (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">
              {isSearchMode ? `Kết quả TikTok (${tracks.length})` : "TikTok Trending Music"}
            </h2>
            {tracks.length > 0 && (
              <button className="link-action-btn" onClick={() => playTrack(tracks[0], tracks)}>
                Play all
              </button>
            )}
          </div>

          <div className="songs-table">
            {tracks.map((t, idx) => {
              const isCurrent = currentTrack?.video_id === t.video_id;
              return (
                <div
                  key={`${t.video_id}-${idx}`}
                  className={`song-row ${isCurrent ? "qp-row-item--active" : ""}`}
                  onClick={() => handlePlay(t, false)}
                >
                  <div className="song-row__idx">{idx + 1}</div>
                  <img
                    src={t.thumbnail_url || ""}
                    alt=""
                    className="song-row__thumb"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  />
                  <div className="song-row__meta">
                    <div className="song-row__title">{t.title}</div>
                    <div className="song-row__artist">{t.artist}</div>
                  </div>
                  <div className="song-row__duration">{t.duration_text || "0:30"}</div>
                  <button
                    className="top-result-card__play-btn"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(t, false);
                    }}
                  >
                    <Icon icon={isCurrent && isPlaying ? PauseIcon : PlayIcon} size={14} color="white" />
                    <span>{isCurrent && isPlaying ? "Tạm dừng" : "Phát"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
