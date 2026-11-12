import { useState, useEffect, useRef } from "react";
import { usePlayer } from "../../store/PlayerContext";
import Icon from "../ui/Icon";
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PreviousIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOne01Icon,
  FavouriteIcon,
  HeartIcon,
  Cancel01Icon,
  Add01Icon,
  VolumeHighIcon,
  VolumeMute01Icon,
  Playlist01Icon,
  NoteIcon,
} from "@hugeicons/core-free-icons";

export default function NowPlayingModal() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    progress,
    volume,
    isMuted,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    shuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    likedTrackIds,
    toggleLike,
    addToQueue,
    isNowPlayingOpen,
    setIsNowPlayingOpen,
    setIsSidePanelOpen,
    queue,
    playTrack,
    lyricsData,
    lyricsLoading,
    lyricOffset,
    sponsorNotice,
  } = usePlayer();

  const [showQueue, setShowQueue] = useState(false);
  const activeFsLyricRef = useRef<HTMLParagraphElement | null>(null);

  const lines = lyricsData?.lines || [];
  const adjustedTime = currentTime + lyricOffset;

  const activeLyricIdx = lines.reduce((acc, l, idx) => {
    return adjustedTime >= l.time ? idx : acc;
  }, 0);

  useEffect(() => {
    if (isNowPlayingOpen && !showQueue && activeFsLyricRef.current) {
      activeFsLyricRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLyricIdx, isNowPlayingOpen, showQueue]);

  if (!isNowPlayingOpen || !currentTrack) return null;

  const isLiked = likedTrackIds.has(currentTrack.video_id);
  const accent = currentTrack.accent_color || "#f2b8a2";

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      className="fullscreen-player"
      style={{
        background:
          currentTrack.gradient_bg ||
          "linear-gradient(155deg, #3b170e 0%, #1c0b07 45%, #070506 100%)",
      }}
    >
      {/* Dynamic subtle blurred cover overlay */}
      <div
        className="fullscreen-player__blur-layer"
        style={{
          backgroundImage: `url(${currentTrack.thumbnail_url})`,
        }}
      />

      {/* Top Bar */}
      <div className="fullscreen-player__top">
        <div className="fullscreen-player__top-left">
          <button
            className="fs-circle-btn"
            onClick={() => setIsNowPlayingOpen(false)}
            title="Đóng toàn màn hình"
          >
            <Icon icon={Cancel01Icon} size={18} />
          </button>
          <button
            className="fs-circle-btn"
            onClick={() => {
              setIsNowPlayingOpen(false);
              setIsSidePanelOpen(true);
            }}
            title="Chuyển sang bảng bên"
          >
            <Icon icon={Playlist01Icon} size={18} />
          </button>
        </div>

        {/* Volume Pill */}
        <div className="fs-volume-pill">
          <button className="fs-vol-icon-btn" onClick={toggleMute}>
            <Icon icon={isMuted || volume === 0 ? VolumeMute01Icon : VolumeHighIcon} size={17} />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="fs-vol-slider"
            style={{ accentColor: accent }}
          />
        </div>
      </div>

      {sponsorNotice && (
        <div className="sponsor-toast animate-fade-in">
          {sponsorNotice}
        </div>
      )}

      {/* Main Split Content */}
      <div className="fullscreen-player__grid">
        {/* Left: Artwork & Expressive Controls */}
        <div className="fullscreen-player__left">
          <div className="fs-artwork-wrap">
            <img
              src={currentTrack.thumbnail_url}
              alt={currentTrack.title}
              className="fs-artwork"
            />
          </div>

          <div className="fs-meta-row">
            <div className="fs-meta-text">
              <h1 className="fs-title">{currentTrack.title}</h1>
              <p className="fs-artist">{currentTrack.artist}</p>
            </div>
            <div className="fs-meta-actions">
              <button
                className="fs-circle-btn"
                onClick={() => addToQueue(currentTrack)}
                title="Thêm vào danh sách phát"
              >
                <Icon icon={Add01Icon} size={18} />
              </button>
              <button
                className="fs-circle-btn"
                onClick={() => toggleLike(currentTrack)}
                title="Yêu thích"
              >
                <Icon
                  icon={isLiked ? FavouriteIcon : HeartIcon}
                  size={18}
                  color={isLiked ? "#ff5f57" : "white"}
                />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="fs-progress-wrap">
            <div
              className="fs-progress-bar"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seek(pct * duration);
              }}
            >
              <div
                className="fs-progress-fill"
                style={{ width: `${progress}%`, background: accent }}
              >
                <span className="fs-progress-dot" style={{ background: accent }} />
              </div>
            </div>
            <div className="fs-time-row">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Material You / SimpMusic Expressive Controls */}
          <div className="fs-controls-row">
            <button
              className={`fs-ctrl-squircle ${shuffle ? "fs-ctrl--active" : ""}`}
              onClick={toggleShuffle}
              title="Shuffle"
            >
              <Icon icon={ShuffleIcon} size={20} />
            </button>
            <button className="fs-ctrl-circle" onClick={prevTrack} title="Previous">
              <Icon icon={PreviousIcon} size={22} />
            </button>
            <button
              className="fs-ctrl-play-pill"
              onClick={togglePlay}
              style={{ background: accent }}
              title={isPlaying ? "Pause" : "Play"}
            >
              <Icon icon={isPlaying ? PauseIcon : PlayIcon} size={26} color="#1a1210" />
            </button>
            <button className="fs-ctrl-circle" onClick={nextTrack} title="Next">
              <Icon icon={NextIcon} size={22} />
            </button>
            <button
              className={`fs-ctrl-squircle ${repeatMode !== "none" ? "fs-ctrl--active" : ""}`}
              onClick={toggleRepeat}
              title="Repeat"
            >
              <Icon icon={repeatMode === "one" ? RepeatOne01Icon : RepeatIcon} size={20} />
            </button>
          </div>
        </div>

        {/* Right: Real Blurred Synced Lyrics OR Queue */}
        <div className="fullscreen-player__right">
          {!showQueue ? (
            lyricsLoading ? (
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>
                Đang tải lời bài hát đồng bộ từ LRCLIB...
              </p>
            ) : lines.length === 0 ? (
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>
                Không có lời bài hát cho bài này
              </p>
            ) : (
              <div className="fs-lyrics-scroll">
                {lines.map((line, idx) => {
                  const isActive = idx === activeLyricIdx;
                  return (
                    <p
                      key={idx}
                      ref={isActive ? activeFsLyricRef : null}
                      className={`fs-lyric-line ${isActive ? "fs-lyric-line--active" : ""}`}
                      onClick={() => seek(line.time)}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            )
          ) : (
            <div className="fs-queue-scroll">
              <h3 className="fs-queue-title">Up Next ({queue.length})</h3>
              {queue.map((item, idx) => {
                const isCurr = item.video_id === currentTrack.video_id;
                return (
                  <div
                    key={`${item.video_id}-${idx}`}
                    className={`fs-queue-row ${isCurr ? "fs-queue-row--active" : ""}`}
                    onClick={() => playTrack(item, queue)}
                  >
                    <img src={item.thumbnail_url} alt="" className="fs-queue-thumb" />
                    <div className="fs-queue-meta">
                      <div className="fs-queue-song">{item.title}</div>
                      <div className="fs-queue-artist">{item.artist}</div>
                    </div>
                    <span className="fs-queue-dur">{item.duration_text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom-right toggle button */}
          <button
            className="fs-bottom-right-btn"
            onClick={() => setShowQueue(!showQueue)}
            title={showQueue ? "Hiện lời bài hát" : "Hiện danh sách chờ"}
          >
            <Icon icon={showQueue ? NoteIcon : Playlist01Icon} size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
