import { useState } from "react";
import type { Page } from "../App";
import { usePlayer } from "../store/PlayerContext";
import Icon from "../components/ui/Icon";
import {
  Playlist01Icon,
  FavouriteIcon,
  HeartIcon,
  PlayIcon,
  NoteIcon,
  Add01Icon,
  Delete02Icon,
  RadioIcon,
} from "@hugeicons/core-free-icons";

interface LibraryPageProps {
  onNavigate: (page: Page) => void;
}

export default function LibraryPage({ onNavigate }: LibraryPageProps) {
  const {
    likedTracks,
    likedTrackIds,
    history,
    playStats,
    localPlaylists,
    playTrack,
    currentTrack,
    toggleLike,
    addToQueue,
    createLocalPlaylist,
    deleteLocalPlaylist,
    setActivePlaylistTarget,
    startRadio,
  } = usePlayer();

  const [filter, setFilter] = useState<"all" | "liked" | "most" | "history" | "playlists">("all");
  const [newPlName, setNewPlName] = useState("");
  const [showCreateBox, setShowCreateBox] = useState(false);

  const mostPlayedTracks = Object.values(playStats)
    .sort((a, b) => b.playCount - a.playCount)
    .map((s) => ({ ...s.track, playCount: s.playCount }));

  const handleCreatePlaylist = () => {
    if (!newPlName.trim()) return;
    createLocalPlaylist(newPlName.trim());
    setNewPlName("");
    setShowCreateBox(false);
  };

  const displayedTracks =
    filter === "history"
      ? history
      : filter === "most"
      ? mostPlayedTracks
      : likedTracks;

  return (
    <div className="library-page" style={{ paddingBottom: 80 }}>
      <div className="library-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h1 className="library-title" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <span>Your Library</span>
            <Icon icon={Playlist01Icon} size={24} color="#7eb8ff" />
          </h1>

          <button
            className="btn-glass-accent"
            onClick={() => setShowCreateBox(!showCreateBox)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Icon icon={Add01Icon} size={16} color="#0b101b" />
            <span>Tạo Playlist</span>
          </button>
        </div>

        {showCreateBox && (
          <div className="create-playlist-bar">
            <input
              type="text"
              className="text-input"
              placeholder="Nhập tên danh sách phát mới..."
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
              autoFocus
            />
            <button className="btn-glass-accent" onClick={handleCreatePlaylist}>
              Lưu
            </button>
          </div>
        )}

        <div className="library-tabs">
          <button
            className={`tab-btn ${filter === "all" ? "tab-btn--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Tất cả
          </button>
          <button
            className={`tab-btn ${filter === "liked" ? "tab-btn--active" : ""}`}
            onClick={() => setFilter("liked")}
          >
            Favorite ({likedTracks.length})
          </button>
          <button
            className={`tab-btn ${filter === "most" ? "tab-btn--active" : ""}`}
            onClick={() => setFilter("most")}
          >
            Most Played ({mostPlayedTracks.length})
          </button>
          <button
            className={`tab-btn ${filter === "history" ? "tab-btn--active" : ""}`}
            onClick={() => setFilter("history")}
          >
            History ({history.length})
          </button>
          <button
            className={`tab-btn ${filter === "playlists" ? "tab-btn--active" : ""}`}
            onClick={() => setFilter("playlists")}
          >
            My Playlists ({localPlaylists.length})
          </button>
        </div>
      </div>

      {/* Hero Liked Card */}
      {(filter === "all" || filter === "liked") && (
        <div className="liked-hero-card">
          <div className="liked-hero-card__content">
            <div className="liked-hero-card__icon">
              <Icon icon={FavouriteIcon} size={32} color="white" />
            </div>
            <div className="liked-hero-card__meta">
              <span className="liked-hero-card__badge">COLLECTION</span>
              <h2 className="liked-hero-card__title">Favorite Songs</h2>
              <p className="liked-hero-card__subtitle">
                {likedTracks.length} bài hát đã lưu trên Meikai
              </p>
            </div>
            {likedTracks.length > 0 && (
              <button
                className="liked-hero-card__play-btn"
                onClick={() => playTrack(likedTracks[0], likedTracks)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Icon icon={PlayIcon} size={18} color="black" />
                <span>Play all</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Local Playlists Grid */}
      {(filter === "all" || filter === "playlists") && localPlaylists.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Playlist của bạn</h3>
          <div className="local-playlists-grid">
            {localPlaylists.map((pl) => (
              <div
                key={pl.id}
                className="local-pl-card"
                onClick={() => {
                  setActivePlaylistTarget({ kind: "local", id: pl.id, title: pl.name });
                  onNavigate("playlist");
                }}
              >
                <div className="local-pl-card__thumb">
                  {pl.tracks[0]?.thumbnail_url ? (
                    <img src={pl.tracks[0].thumbnail_url} alt="" />
                  ) : (
                    <Icon icon={Playlist01Icon} size={28} color="#7eb8ff" />
                  )}
                </div>
                <div className="local-pl-card__meta">
                  <div className="local-pl-card__name">{pl.name}</div>
                  <div className="local-pl-card__count">{pl.tracks.length} songs</div>
                </div>
                <button
                  className="btn-glass-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteLocalPlaylist(pl.id);
                  }}
                  title="Xóa playlist"
                >
                  <Icon icon={Delete02Icon} size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Track List */}
      {filter !== "playlists" && (
        <div className="library-tracks-section">
          <h3 className="section-title" style={{ marginBottom: 12 }}>
            {filter === "history"
              ? "Lịch sử đã nghe gần đây"
              : filter === "most"
              ? "Bài hát nghe nhiều nhất"
              : "Danh sách bài hát yêu thích"}
          </h3>

          {displayedTracks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">
                <Icon icon={NoteIcon} size={42} color="rgba(255,255,255,0.4)" />
              </div>
              <div className="empty-state__title">Chưa có bài hát nào</div>
              <div className="empty-state__sub">Hãy phát hoặc thả tim bài hát bạn thích để lưu vào đây</div>
            </div>
          ) : (
            <div className="songs-table">
              {displayedTracks.map((track: any, idx) => {
                const isCurrent = currentTrack?.video_id === track.video_id;
                const isLiked = likedTrackIds.has(track.video_id);

                return (
                  <div
                    key={`${track.video_id}-${idx}`}
                    className={`song-row ${isCurrent ? "song-row--active" : ""}`}
                    onClick={() => playTrack(track, displayedTracks)}
                  >
                    <div className="song-row__idx">{idx + 1}</div>
                    <img src={track.thumbnail_url} alt="" className="song-row__thumb" />
                    <div className="song-row__meta">
                      <div className="song-row__title">{track.title}</div>
                      <div className="song-row__artist">{track.artist}</div>
                    </div>
                    {track.playCount && (
                      <span className="badge">{track.playCount} plays</span>
                    )}
                    <div className="song-row__duration">{track.duration_text || "3:30"}</div>
                    <div className="song-row__actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-action-queue"
                        onClick={() => startRadio(track)}
                        title="Bắt đầu Radio"
                      >
                        <Icon icon={RadioIcon} size={16} />
                      </button>
                      <button
                        className={`btn-action-heart ${isLiked ? "btn-action-heart--active" : ""}`}
                        onClick={() => toggleLike(track)}
                      >
                        <Icon
                          icon={isLiked ? FavouriteIcon : HeartIcon}
                          size={16}
                          color={isLiked ? "#ff5f57" : "rgba(255,255,255,0.6)"}
                        />
                      </button>
                      <button
                        className="btn-action-queue"
                        onClick={() => addToQueue(track)}
                        title="Thêm vào hàng đợi"
                      >
                        <Icon icon={Playlist01Icon} size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
