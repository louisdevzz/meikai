import { useState, useEffect, useRef } from "react";
import { usePlayer, EQ_PRESETS } from "../../store/PlayerContext";
import Icon from "../ui/Icon";
import {
  ArrowRight01Icon,
  MoreVerticalIcon,
  Add01Icon,
  FavouriteIcon,
  HeartIcon,
  InformationCircleIcon,
  HeadphonesIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOne01Icon,
  Playlist01Icon,
  Maximize02Icon,
  PlayIcon,
  Video01Icon,
  Cancel01Icon,
  Disc3Icon,
} from "@hugeicons/core-free-icons";

export default function RightPlayerPanel() {
  const {
    currentTrack,
    currentTime,
    seek,
    shuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    likedTrackIds,
    toggleLike,
    addToQueue,
    removeFromQueue,
    isSidePanelOpen,
    setIsSidePanelOpen,
    setIsNowPlayingOpen,
    isVideoMode,
    setIsVideoMode,
    queue,
    playTrack,
    lyricsData,
    lyricsLoading,
    lyricOffset,
    setLyricOffset,
    videoStats,
    sleepTimerSeconds,
    setSleepTimer,
    djConfig,
    djTelemetry,
    playbackRate,
    setPlaybackRate,
    eqPreset,
    setEqPreset,
    eqBands,
  } = usePlayer();

  const [panelTab, setPanelTab] = useState<"lyrics" | "queue" | "info" | "audio">("lyrics");
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);

  const lines = lyricsData?.lines || [];
  const adjustedTime = currentTime + lyricOffset;

  const activeLyricIndex = lines.reduce((acc, line, idx) => {
    return adjustedTime >= line.time ? idx : acc;
  }, 0);

  // Auto-scroll active lyric smoothly
  useEffect(() => {
    if (panelTab === "lyrics" && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLyricIndex, panelTab]);

  if (!isSidePanelOpen || !currentTrack) return null;

  const isLiked = likedTrackIds.has(currentTrack.video_id);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <aside
      className="right-player-panel"
      style={{
        background:
          currentTrack.gradient_bg ||
          "linear-gradient(160deg, #2d1812 0%, #140b09 50%, #09080b 100%)",
      }}
    >
      {/* Header */}
      <div className="right-panel-header">
        <button
          className="right-panel-circle-btn"
          onClick={() => setIsSidePanelOpen(false)}
          title="Đóng bảng phát nhạc"
        >
          <Icon icon={ArrowRight01Icon} size={18} />
        </button>

        <div className="right-panel-header__center">
          <span className="right-panel-header__sub">RADIO / MIX</span>
          <span className="right-panel-header__title">
            &ldquo;{currentTrack.title}&rdquo; Radio
          </span>
        </div>

        <button
          className="right-panel-circle-btn"
          onClick={() => setIsNowPlayingOpen(true)}
          title="Mở toàn màn hình"
        >
          <Icon icon={MoreVerticalIcon} size={18} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="right-panel-scroll">
        {/* Artwork (Dual-Deck Cross-Dissolve during DJ Mix) */}
        <div
          className={`right-panel-art-wrap ${djTelemetry.isMixing ? "dj-artwork-mixing" : ""}`}
          onClick={() => setIsNowPlayingOpen(true)}
        >
          {djTelemetry.isMixing && djTelemetry.outgoingTrack?.thumbnail_url && (
            <img
              src={djTelemetry.outgoingTrack.thumbnail_url}
              alt={djTelemetry.outgoingTrack.title}
              className="right-panel-art dj-art-outgoing"
              style={{ opacity: Math.max(0, 1 - djTelemetry.mixProgress) }}
            />
          )}
          <img
            src={currentTrack.thumbnail_url}
            alt={currentTrack.title}
            className={`right-panel-art ${djTelemetry.isMixing ? "dj-turntable-vinyl" : ""}`}
            style={
              djTelemetry.isMixing
                ? { opacity: Math.min(1, 0.25 + djTelemetry.mixProgress * 0.75) }
                : undefined
            }
          />
          {djConfig.enabled && (djTelemetry.isMixing || djTelemetry.activeBpm) && (
            <div className={`dj-art-overlay-pill ${djTelemetry.isMixing ? "is-live" : ""}`}>
              <Icon icon={Disc3Icon} size={13} color="#c4b5fd" />
              <span>
                {djTelemetry.isMixing
                  ? `${djTelemetry.mixPhaseLabel || "DJ MIXING"} · ${Math.round(djTelemetry.mixProgress * 100)}%`
                  : `${Math.round(djTelemetry.activeBpm || 0)} BPM`}
              </span>
            </div>
          )}
        </div>

        {/* Live lyric teaser */}
        <p className="right-panel-lyric-teaser">
          {lyricsLoading
            ? "Đang đồng bộ lời bài hát từ LRCLIB..."
            : lines[activeLyricIndex]?.text || "Đang phát trên Meikai Music"}
        </p>

        {/* Track Meta & Plus/Heart */}
        <div className="right-panel-meta-row">
          <div className="right-panel-meta">
            <h2 className="right-panel-title">{currentTrack.title}</h2>
            <p className="right-panel-artist">{currentTrack.artist}</p>
          </div>
          <div className="right-panel-meta-actions">
            <button
              className="right-panel-circle-btn"
              onClick={() => addToQueue(currentTrack)}
              title="Thêm vào hàng đợi"
            >
              <Icon icon={Add01Icon} size={18} />
            </button>
            <button
              className="right-panel-circle-btn"
              onClick={() => toggleLike(currentTrack)}
              title={isLiked ? "Bỏ thích" : "Yêu thích"}
            >
              <Icon
                icon={isLiked ? FavouriteIcon : HeartIcon}
                size={18}
                color={isLiked ? "#ff5f57" : "white"}
              />
            </button>
          </div>
        </div>

        {/* 7 Functional Squircle Action Buttons Row */}
        <div className="right-panel-squircle-row">
          <button
            className={`squircle-btn ${panelTab === "info" ? "squircle-btn--active" : ""}`}
            onClick={() => setPanelTab(panelTab === "info" ? "lyrics" : "info")}
            title="Thông tin & Lượt thích/Dislike"
          >
            <Icon icon={InformationCircleIcon} size={16} />
          </button>
          <button
            className={`squircle-btn ${panelTab === "audio" ? "squircle-btn--active" : ""}`}
            onClick={() => setPanelTab(panelTab === "audio" ? "lyrics" : "audio")}
            title="Equalizer, Tốc độ & Hẹn giờ ngủ"
          >
            <Icon icon={HeadphonesIcon} size={16} />
          </button>
          <button
            className={`squircle-btn ${shuffle ? "squircle-btn--active" : ""}`}
            onClick={toggleShuffle}
            title="Ngẫu nhiên"
          >
            <Icon icon={ShuffleIcon} size={16} />
          </button>
          <button
            className={`squircle-btn ${repeatMode !== "none" ? "squircle-btn--active" : ""}`}
            onClick={toggleRepeat}
            title="Lặp lại"
          >
            <Icon icon={repeatMode === "one" ? RepeatOne01Icon : RepeatIcon} size={16} />
          </button>
          <button
            className={`squircle-btn ${isVideoMode ? "squircle-btn--active" : ""}`}
            onClick={() => setIsVideoMode(!isVideoMode)}
            title="Bật/Tắt Video MV"
          >
            <Icon icon={Video01Icon} size={16} />
          </button>
          <button
            className={`squircle-btn ${panelTab === "queue" ? "squircle-btn--active" : ""}`}
            onClick={() => setPanelTab(panelTab === "queue" ? "lyrics" : "queue")}
            title="Danh sách chờ"
          >
            <Icon icon={Playlist01Icon} size={16} />
          </button>
          <button
            className="squircle-btn"
            onClick={() => setIsNowPlayingOpen(true)}
            title="Phóng to toàn màn hình"
          >
            <Icon icon={Maximize02Icon} size={16} />
          </button>
        </div>

        {/* Tab 1: Real Synced Lyrics */}
        {panelTab === "lyrics" && (
          <div className="right-panel-glass-card">
            <div className="right-panel-glass-card__header">
              <span className="right-panel-glass-card__title">Lyrics</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="right-panel-show-btn"
                  onClick={() => setLyricOffset(lyricOffset - 0.5)}
                  title="Lùi lời 0.5s"
                >
                  -0.5s
                </button>
                <button
                  className="right-panel-show-btn"
                  onClick={() => setLyricOffset(lyricOffset + 0.5)}
                  title="Tiến lời 0.5s"
                >
                  +0.5s
                </button>
                <button
                  className="right-panel-show-btn"
                  onClick={() => setIsNowPlayingOpen(true)}
                >
                  Show
                </button>
              </div>
            </div>

            {lyricsLoading ? (
              <p style={{ textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.55)", padding: "24px 0" }}>
                Đang tải lời bài hát...
              </p>
            ) : lines.length === 0 ? (
              <p style={{ textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.55)", padding: "24px 0" }}>
                Không tìm thấy lời đồng bộ cho bài hát này
              </p>
            ) : (
              <div className="right-panel-lyrics-list" style={{ maxHeight: 260, overflowY: "auto" }}>
                {lines.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  return (
                    <p
                      key={idx}
                      ref={isActive ? activeLyricRef : null}
                      className={`right-panel-lyric-line ${isActive ? "right-panel-lyric-line--active" : ""}`}
                      onClick={() => seek(line.time)}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            )}

            <div className="right-panel-lyrics-footer">
              <span>{lyricsData?.synced ? "Line Synced" : "Plain Text"}</span>
              <span>{lyricsData?.source || "Meikai Lyrics"}</span>
            </div>
          </div>
        )}

        {/* Tab 2: Queue */}
        {panelTab === "queue" && (
          <div className="right-panel-glass-card">
            <div className="right-panel-glass-card__header">
              <span className="right-panel-glass-card__title">Up Next ({queue.length})</span>
            </div>
            <div className="right-panel-queue-list">
              {queue.map((item, idx) => {
                const isCurrent = item.video_id === currentTrack.video_id;
                return (
                  <div
                    key={`${item.video_id}-${idx}`}
                    className={`right-queue-row ${isCurrent ? "right-queue-row--active" : ""}`}
                    onClick={() => playTrack(item, queue)}
                  >
                    <img src={item.thumbnail_url} alt="" className="right-queue-row__thumb" />
                    <div className="right-queue-row__info">
                      <div className="right-queue-row__title">{item.title}</div>
                      <div className="right-queue-row__artist">{item.artist}</div>
                    </div>
                    {isCurrent ? (
                      <Icon icon={PlayIcon} size={14} color="white" />
                    ) : (
                      <button
                        className="capsule-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(idx);
                        }}
                        title="Xóa khỏi hàng đợi"
                      >
                        <Icon icon={Cancel01Icon} size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Track Info & ReturnYouTubeDislike Stats */}
        {panelTab === "info" && (
          <div className="right-panel-glass-card">
            <div className="right-panel-glass-card__header">
              <span className="right-panel-glass-card__title">Thông tin & Thống kê YouTube</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
              <div className="info-stat-row">
                <span>Video ID:</span>
                <strong>{currentTrack.video_id}</strong>
              </div>
              <div className="info-stat-row">
                <span>Lượt xem (Views):</span>
                <strong>{videoStats ? videoStats.view_count.toLocaleString() : "Đang tải..."}</strong>
              </div>
              <div className="info-stat-row">
                <span>Lượt thích (Likes):</span>
                <strong style={{ color: "#5cdb7a" }}>
                  {videoStats ? videoStats.likes.toLocaleString() : "—"}
                </strong>
              </div>
              <div className="info-stat-row">
                <span>Không thích (RYD):</span>
                <strong style={{ color: "#fca5a5" }}>
                  {videoStats ? videoStats.dislikes.toLocaleString() : "—"}
                </strong>
              </div>
              <div className="info-stat-row">
                <span>Đánh giá:</span>
                <strong>{videoStats ? `${videoStats.rating.toFixed(2)} / 5.0` : "—"}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Audio Equalizer, Speed & Sleep Timer */}
        {panelTab === "audio" && (
          <div className="right-panel-glass-card">
            <div className="right-panel-glass-card__header">
              <span className="right-panel-glass-card__title">Âm thanh, Tốc độ & Hẹn giờ</span>
            </div>

            {/* Playback Speed */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", display: "block", marginBottom: 6 }}>
                Tốc độ phát ({playbackRate}x)
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {[0.75, 1.0, 1.25, 1.5].map((r) => (
                  <button
                    key={r}
                    className={`filter-chip ${playbackRate === r ? "filter-chip--active" : ""}`}
                    onClick={() => setPlaybackRate(r)}
                    style={{ padding: "4px 10px", fontSize: 11.5 }}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep Timer */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", display: "block", marginBottom: 6 }}>
                Hẹn giờ tắt nhạc {sleepTimerSeconds !== null ? `(${formatTimer(sleepTimerSeconds)})` : ""}
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    className="filter-chip"
                    onClick={() => setSleepTimer(m)}
                    style={{ padding: "4px 10px", fontSize: 11.5 }}
                  >
                    {m}p
                  </button>
                ))}
                {sleepTimerSeconds !== null && (
                  <button
                    className="filter-chip"
                    onClick={() => setSleepTimer(null)}
                    style={{ padding: "4px 10px", fontSize: 11.5, color: "#fca5a5" }}
                  >
                    Tắt
                  </button>
                )}
              </div>
            </div>

            {/* 10-Band EQ Presets */}
            <div>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", display: "block", marginBottom: 6 }}>
                Equalizer Preset ({eqPreset})
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {Object.keys(EQ_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    className={`filter-chip ${eqPreset === preset ? "filter-chip--active" : ""}`}
                    onClick={() => setEqPreset(preset)}
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="mini-eq-bars">
                {eqBands.map((val, idx) => (
                  <div key={idx} className="mini-eq-col">
                    <div
                      className="mini-eq-fill"
                      style={{ height: `${((val + 6) / 12) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Artist Spotlight Card */}
        <div className="right-panel-artist-card">
          <div className="right-panel-artist-card__label">Artists</div>
          <div className="right-panel-artist-card__banner">
            <img
              src={currentTrack.thumbnail_url}
              alt={currentTrack.artist}
              className="right-panel-artist-card__img"
            />
            <div className="right-panel-artist-card__overlay">
              <span>{currentTrack.artist}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
