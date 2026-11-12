import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Page } from "../App";
import { usePlayer } from "../store/PlayerContext";
import type { PlaylistDetails, Track } from "../types/music";
import Icon from "../components/ui/Icon";
import {
  ArrowLeft01Icon,
  PlayIcon,
  PauseIcon,
  ShuffleIcon,
  FavouriteIcon,
  HeartIcon,
  Playlist01Icon,
  Delete02Icon,
  RadioIcon,
} from "@hugeicons/core-free-icons";

interface PlaylistDetailPageProps {
  onNavigate: (page: Page) => void;
}

export default function PlaylistDetailPage({ onNavigate }: PlaylistDetailPageProps) {
  const {
    activePlaylistTarget,
    localPlaylists,
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
    likedTrackIds,
    toggleLike,
    addToQueue,
    removeTrackFromLocalPlaylist,
    startRadio,
  } = usePlayer();

  const [remoteData, setRemoteData] = useState<PlaylistDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activePlaylistTarget || activePlaylistTarget.kind !== "remote") {
      setRemoteData(null);
      return;
    }

    setLoading(true);
    invoke<PlaylistDetails>("get_playlist_tracks", { browseId: activePlaylistTarget.id })
      .then((res) => {
        setRemoteData({
          browse_id: activePlaylistTarget.id,
          title: res?.title || activePlaylistTarget.title || "Playlist",
          subtitle: res?.subtitle || activePlaylistTarget.subtitle || "YouTube Music",
          thumbnail_url: res?.thumbnail_url || activePlaylistTarget.coverUrl,
          tracks: res?.tracks || [],
        });
      })
      .catch(() => {
        setRemoteData({
          browse_id: activePlaylistTarget.id,
          title: activePlaylistTarget.title || "Playlist",
          subtitle: activePlaylistTarget.subtitle || "YouTube Music",
          thumbnail_url: activePlaylistTarget.coverUrl,
          tracks: [],
        });
      })
      .finally(() => setLoading(false));
  }, [activePlaylistTarget]);

  if (!activePlaylistTarget) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">Chưa chọn danh sách phát</p>
        <button className="top-pill top-pill--active" onClick={() => onNavigate("home")}>
          Quay lại Trang chủ
        </button>
      </div>
    );
  }

  const localPl =
    activePlaylistTarget.kind === "local"
      ? localPlaylists.find((p) => p.id === activePlaylistTarget.id)
      : null;

  const title = localPl?.name || remoteData?.title || activePlaylistTarget.title || "Playlist";
  const subtitle =
    localPl
      ? `Local Playlist • ${localPl.tracks.length} songs`
      : remoteData?.subtitle || activePlaylistTarget.subtitle || "YouTube Charts";
  const coverUrl =
    localPl?.tracks[0]?.thumbnail_url ||
    remoteData?.thumbnail_url ||
    activePlaylistTarget.coverUrl ||
    "https://i.ytimg.com/vi/7u4g483WTzw/hqdefault.jpg";
  const tracks: Track[] = localPl?.tracks || remoteData?.tracks || [];

  const handlePlayAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  };

  const handleShuffleAll = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="playlist-detail-page" style={{ paddingBottom: 80 }}>
      <button
        className="back-pill-btn"
        onClick={() => onNavigate(localPl ? "library" : "home")}
      >
        <Icon icon={ArrowLeft01Icon} size={16} />
        <span>Quay lại</span>
      </button>

      {/* Hero Banner */}
      <div className="playlist-hero-glass">
        <img src={coverUrl} alt={title} className="playlist-hero-glass__art" />
        <div className="playlist-hero-glass__meta">
          <span className="playlist-hero-glass__eyebrow">
            {localPl ? "YOUR PLAYLIST" : "YOUTUBE MUSIC CHART"}
          </span>
          <h1 className="playlist-hero-glass__title">{title}</h1>
          <p className="playlist-hero-glass__sub">
            {subtitle} • {tracks.length} tracks
          </p>

          <div className="playlist-hero-glass__actions">
            <button className="btn-glass-accent" onClick={handlePlayAll} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon icon={PlayIcon} size={16} color="#0b101b" />
              <span>Play all</span>
            </button>
            <button className="top-pill" onClick={handleShuffleAll} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon icon={ShuffleIcon} size={16} />
              <span>Shuffle</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <p className="empty-state__title">Đang tải danh sách bài hát từ YouTube Music...</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">Playlist này chưa có bài hát nào</p>
          <p className="empty-state__sub">Hãy tìm kiếm bài hát và nhấn nút + để thêm vào đây</p>
        </div>
      ) : (
        <div className="songs-table">
          {tracks.map((track, idx) => {
            const isCurrent = currentTrack?.video_id === track.video_id;
            const isLiked = likedTrackIds.has(track.video_id);
            return (
              <div
                key={`${track.video_id}-${idx}`}
                className={`song-row ${isCurrent ? "song-row--active" : ""}`}
                onClick={() => {
                  if (isCurrent) togglePlay();
                  else playTrack(track, tracks);
                }}
              >
                <div className="song-row__idx">
                  {isCurrent && isPlaying ? (
                    <Icon icon={PauseIcon} size={14} color="#7eb8ff" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <img src={track.thumbnail_url} alt="" className="song-row__thumb" />
                <div className="song-row__meta">
                  <div className="song-row__title">{track.title}</div>
                  <div className="song-row__artist">{track.artist}</div>
                </div>
                <div className="song-row__duration">{track.duration_text || "3:30"}</div>
                <div className="song-row__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-action-queue"
                    onClick={() => startRadio(track)}
                    title="Bắt đầu Radio từ bài này"
                  >
                    <Icon icon={RadioIcon} size={16} />
                  </button>
                  <button
                    className="btn-action-heart"
                    onClick={() => toggleLike(track)}
                    title="Favorite"
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
                  {localPl && (
                    <button
                      className="btn-action-queue"
                      onClick={() => removeTrackFromLocalPlaylist(localPl.id, track.video_id)}
                      title="Xóa khỏi playlist"
                    >
                      <Icon icon={Delete02Icon} size={16} color="#fca5a5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
