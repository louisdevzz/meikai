import { useState } from "react";
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
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMute01Icon,
  Playlist01Icon,
  Cancel01Icon,
  Maximize02Icon,
  MusicNote01Icon,
} from "@hugeicons/core-free-icons";

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    likedTrackIds,
    isSidePanelOpen,
    isFloatingBarVisible,
    togglePlay,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    setIsNowPlayingOpen,
    setIsSidePanelOpen,
    setIsFloatingBarVisible,
    sponsorNotice,
  } = usePlayer();

  const [showVolPopup, setShowVolPopup] = useState(false);

  if (!isFloatingBarVisible) {
    return (
      <button
        className="floating-restore-pill"
        onClick={() => setIsFloatingBarVisible(true)}
        title="Hiện thanh trình phát"
      >
        <Icon icon={MusicNote01Icon} size={16} color="#7eb8ff" />
        <span>{currentTrack?.title ?? "Meikai"}</span>
      </button>
    );
  }

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.video_id) : false;

  return (
    <div className="floating-player-wrapper">
      {sponsorNotice && (
        <div className="floating-sponsor-toast">
          {sponsorNotice}
        </div>
      )}

      <div className="floating-glass-capsule">
        {/* Left: Playback Controls */}
        <div className="capsule-controls">
          <button
            className={`capsule-btn ${shuffle ? "capsule-btn--active" : ""}`}
            onClick={toggleShuffle}
            title="Shuffle"
          >
            <Icon icon={ShuffleIcon} size={16} />
          </button>
          <button className="capsule-btn" onClick={prevTrack} title="Previous">
            <Icon icon={PreviousIcon} size={17} />
          </button>
          <button
            className="capsule-btn capsule-btn--play"
            onClick={togglePlay}
            title={isBuffering ? "Đang tải luồng phát..." : isPlaying ? "Pause" : "Play"}
          >
            {isBuffering ? (
              <span
                className="capsule-loading-spinner"
                style={{ borderTopColor: currentTrack?.accent_color || "#ffffff" }}
                aria-label="Loading"
              />
            ) : (
              <Icon icon={isPlaying ? PauseIcon : PlayIcon} size={20} color="white" />
            )}
          </button>
          <button className="capsule-btn" onClick={nextTrack} title="Next">
            <Icon icon={NextIcon} size={17} />
          </button>
          <button
            className={`capsule-btn ${repeatMode !== "none" ? "capsule-btn--active" : ""}`}
            onClick={toggleRepeat}
            title={`Repeat: ${repeatMode}`}
          >
            <Icon icon={repeatMode === "one" ? RepeatOne01Icon : RepeatIcon} size={16} />
          </button>
        </div>

        {/* Center: Track Artwork + Title + Artist + Thin Progress Line */}
        <div
          className="capsule-track"
          onClick={() => setIsNowPlayingOpen(true)}
          title="Mở toàn màn hình đang phát & Lời bài hát"
        >
          <div className={`capsule-track__thumb-wrap ${isBuffering ? "capsule-thumb--buffering" : ""}`}>
            {currentTrack?.thumbnail_url ? (
              <img src={currentTrack.thumbnail_url} alt="" className="capsule-track__thumb" />
            ) : (
              <Icon icon={MusicNote01Icon} size={18} />
            )}
          </div>

          <div className="capsule-track__meta">
            <div className="capsule-track__title">
              {currentTrack?.title ?? "Chưa chọn bài hát"}
            </div>
            <div className="capsule-track__artist">
              {isBuffering ? "Đang tải âm thanh..." : currentTrack?.artist ?? "Meikai Music"}
            </div>
            {/* Thin progress underline (shows SimpMusic-style indeterminate sweep while buffering) */}
            <div className="capsule-track__progress-track">
              {isBuffering ? (
                <div
                  className="capsule-track__progress-indeterminate"
                  style={{ background: currentTrack?.accent_color || "#7eb8ff" }}
                />
              ) : (
                <div
                  className="capsule-track__progress-fill"
                  style={{
                    width: `${progress}%`,
                    background: currentTrack?.accent_color || "#7eb8ff",
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions + Volume + Close */}
        <div className="capsule-actions">
          {currentTrack && (
            <button
              className="capsule-btn"
              onClick={() => toggleLike(currentTrack)}
              title="Favorite"
            >
              <Icon
                icon={isLiked ? FavouriteIcon : HeartIcon}
                size={17}
                color={isLiked ? "#ff5f57" : "rgba(255,255,255,0.85)"}
              />
            </button>
          )}

          <button
            className={`capsule-btn ${isSidePanelOpen ? "capsule-btn--active" : ""}`}
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            title="Mở bảng Radio / Lyrics bên phải"
          >
            <Icon icon={Playlist01Icon} size={17} />
          </button>

          <button
            className="capsule-btn"
            onClick={() => setIsNowPlayingOpen(true)}
            title="Mở toàn màn hình"
          >
            <Icon icon={Maximize02Icon} size={16} />
          </button>

          {/* Volume Button with Popup Slider */}
          <div
            className="capsule-volume-wrap"
            onMouseEnter={() => setShowVolPopup(true)}
            onMouseLeave={() => setShowVolPopup(false)}
          >
            <button className="capsule-btn" onClick={toggleMute} title="Âm lượng">
              <Icon
                icon={
                  isMuted || volume === 0
                    ? VolumeMute01Icon
                    : volume < 0.5
                    ? VolumeLowIcon
                    : VolumeHighIcon
                }
                size={17}
              />
            </button>
            {showVolPopup && (
              <div className="capsule-vol-popup">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="capsule-vol-slider"
                />
              </div>
            )}
          </div>

          <button
            className="capsule-btn"
            onClick={() => setIsFloatingBarVisible(false)}
            title="Thu gọn thanh phát"
          >
            <Icon icon={Cancel01Icon} size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
