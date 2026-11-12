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
  Disc3Icon,
  FlashIcon,
} from "@hugeicons/core-free-icons";

const STYLE_LABELS: Record<string, string> = {
  bass_swap: "BASS SWAP",
  filter_sweep: "FILTER SWEEP",
  echo_out: "ECHO OUT",
  equal_power: "EQUAL POWER",
};

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
    djConfig,
    djTelemetry,
    mixToTrack,
    getUpcomingTrack,
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
  const upcomingTrack = getUpcomingTrack();
  const mixPct = Math.round(Math.min(1, Math.max(0, djTelemetry.mixProgress)) * 100);
  const deckA = djTelemetry.outgoingTrack;
  const deckB = currentTrack;

  return (
    <div className="floating-player-wrapper">
      {djTelemetry.isMixing && deckB && (
        <div className="dj-crossfader-hud">
          <div className="dj-deck-mini dj-deck-mini--a">
            {deckA?.thumbnail_url ? (
              <img src={deckA.thumbnail_url} alt="" className="dj-deck-mini__art dj-turntable-mixing" />
            ) : (
              <div className="dj-deck-mini__art dj-deck-mini__placeholder">
                <Icon icon={Disc3Icon} size={16} color="#94a3b8" />
              </div>
            )}
            <div className="dj-deck-mini__info">
              <div className="dj-deck-mini__tag">
                <span>DECK A</span>
                {djTelemetry.activeBpm && !djTelemetry.incomingBpm ? (
                  <span className="dj-bpm-micro">{Math.round(djTelemetry.activeBpm)} BPM</span>
                ) : null}
              </div>
              <div className="dj-deck-mini__title">{deckA?.title ?? "Outgoing"}</div>
              <div className="dj-level-meter">
                <div
                  className="dj-level-meter__fill dj-level-meter__fill--a"
                  style={{ width: `${Math.round(djTelemetry.deckALevel * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="dj-hud-center">
            <div className="dj-hud-center__top">
              <span className="dj-badge-pill dj-badge-pill--live">
                <Icon icon={Disc3Icon} size={12} color="#c4b5fd" />
                <span>{STYLE_LABELS[djTelemetry.mixStyle || djConfig.style] || "DJ MIX"}</span>
              </span>
              <span className="dj-phase-text">{djTelemetry.mixPhaseLabel || "Crossfading..."}</span>
            </div>
            <div className="dj-fader-track">
              <div className="dj-fader-track__fill" style={{ width: `${mixPct}%` }} />
              <div className="dj-fader-thumb" style={{ left: `${mixPct}%` }} />
            </div>
            <div className="dj-hud-center__eq">
              <div className="dj-eq-wave">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <span className="dj-mix-pct">{mixPct}%</span>
            </div>
          </div>

          <div className="dj-deck-mini dj-deck-mini--b">
            <div className="dj-deck-mini__info" style={{ textAlign: "right" }}>
              <div className="dj-deck-mini__tag" style={{ justifyContent: "flex-end" }}>
                {(djTelemetry.incomingBpm || djTelemetry.activeBpm) && (
                  <span className="dj-bpm-micro is-in">
                    {Math.round(djTelemetry.incomingBpm || djTelemetry.activeBpm || 0)} BPM
                  </span>
                )}
                <span style={{ color: "#7eb8ff" }}>DECK B</span>
              </div>
              <div className="dj-deck-mini__title">{deckB.title}</div>
              <div className="dj-level-meter">
                <div
                  className="dj-level-meter__fill dj-level-meter__fill--b"
                  style={{ width: `${Math.round(djTelemetry.deckBLevel * 100)}%`, marginLeft: "auto" }}
                />
              </div>
            </div>
            {deckB.thumbnail_url ? (
              <img src={deckB.thumbnail_url} alt="" className="dj-deck-mini__art dj-turntable-mixing" />
            ) : (
              <div className="dj-deck-mini__art dj-deck-mini__placeholder">
                <Icon icon={Disc3Icon} size={16} color="#7eb8ff" />
              </div>
            )}
          </div>
        </div>
      )}

      {sponsorNotice && (
        <div className="floating-sponsor-toast">
          {sponsorNotice}
        </div>
      )}

      <div className={`floating-glass-capsule ${djTelemetry.isMixing ? "is-dj-mixing" : ""}`}>
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
            <div className="capsule-track__title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentTrack?.title ?? "Chưa chọn bài hát"}
              </span>
              {djConfig.enabled && (
                <span className={`dj-badge-pill ${djTelemetry.isMixing ? "dj-badge-pill--live" : ""}`}>
                  <Icon icon={Disc3Icon} size={11} color="#c4b5fd" />
                  <span>
                    DJ
                    {djTelemetry.activeBpm ? ` · ${Math.round(djTelemetry.activeBpm)}` : ""}
                  </span>
                </span>
              )}
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
          {djConfig.enabled && upcomingTrack && (
            <button
              className={`capsule-btn dj-mix-trigger-btn ${djTelemetry.isMixing ? "is-active" : ""}`}
              onClick={() => mixToTrack(upcomingTrack)}
              title={`DJ Mix sang "${upcomingTrack.title}"`}
            >
              <Icon icon={FlashIcon} size={16} color="#c4b5fd" />
            </button>
          )}
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
