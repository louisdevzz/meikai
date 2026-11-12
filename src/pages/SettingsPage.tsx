import { useState } from "react";
import { usePlayer, type DjTransitionStyle } from "../store/PlayerContext";
import Icon from "../components/ui/Icon";
import BackgroundCustomizerCard from "../components/ui/BackgroundCustomizerCard";
import {
  Settings02Icon,
  ShieldCheckIcon,
  HeadphonesIcon,
  SparklesIcon,
  MusicNote01Icon,
  UserCircleIcon,
  Disc3Icon,
  AudioWaveformIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  FlashIcon,
  DashboardSpeed01Icon,
} from "@hugeicons/core-free-icons";

const DJ_STYLE_OPTIONS: Array<{
  id: DjTransitionStyle;
  label: string;
  desc: string;
  badge: string;
}> = [
  {
    id: "bass_swap",
    label: "Bass Swap Pro",
    desc: "Bộ phân tần 210Hz tự động hoán đổi dải trầm (kick/sub) mượt mà ở điểm giữa để không bao giờ bị dội bass.",
    badge: "CLUB STANDARD",
  },
  {
    id: "filter_sweep",
    label: "Filter Sweep (HPF / LPF)",
    desc: "Bài cũ quét High-Pass thanh thoát, bài mới mở Low-Pass dần lên như bàn pioneer DJM.",
    badge: "PROGRESSIVE",
  },
  {
    id: "echo_out",
    label: "Echo Out Wash",
    desc: "Thả tiếng vang 3/8 beat Stereo Delay trên bài cũ và đẩy bài mới vào nhịp dứt khoát.",
    badge: "ECHO DROP",
  },
  {
    id: "equal_power",
    label: "Equal-Power Smooth",
    desc: "Đường cong Cos/Sin giữ năng lượng âm lượng ổn định 100%, không bị hụt tiếng giữa 2 bài.",
    badge: "STUDIO FADE",
  },
];

export default function SettingsPage() {
  const { ytAccount, setIsLoginModalOpen, logoutYouTube, djConfig, setDjConfig } = usePlayer();
  const [skipSponsors, setSkipSponsors] = useState(true);
  const [skipIntros, setSkipIntros] = useState(true);
  const [skipOutros, setSkipOutros] = useState(true);
  const [audioQuality, setAudioQuality] = useState("high");
  const [lastfmKey, setLastfmKey] = useState("");

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Cài đặt & Tùy chỉnh</span>
          <Icon icon={Settings02Icon} size={28} color="#7eb8ff" />
        </h1>
        <p className="settings-subtitle">
          Tài khoản YouTube Music, giao diện kính mờ trong suốt, hình nền động và âm thanh
        </p>
      </div>

      {/* Section 0: YouTube Account */}
      <div className="settings-card">
        <div className="settings-card__header" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {ytAccount?.avatar_url ? (
              <img
                src={ytAccount.avatar_url}
                alt={ytAccount.name}
                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <Icon icon={UserCircleIcon} size={34} color="#7eb8ff" />
            )}
            <div>
              <h3 className="settings-card__title">
                {ytAccount ? `Đã đăng nhập: ${ytAccount.name}` : "Tài khoản YouTube Music"}
              </h3>
              <p className="settings-card__desc">
                {ytAccount
                  ? `${ytAccount.handle || "Đã kết nối"} • Đồng bộ Playlist cá nhân & 256kbps`
                  : "Đăng nhập Google để đồng bộ Playlist YouTube Music của bạn"}
              </p>
            </div>
          </div>

          {ytAccount ? (
            <button className="btn-secondary" onClick={logoutYouTube}>
              Đăng xuất
            </button>
          ) : (
            <button className="btn-glass-accent" onClick={() => setIsLoginModalOpen(true)}>
              Đăng nhập YouTube
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Transparent Glass & Custom Dynamic Background */}
      <div className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon">
            <Icon icon={SparklesIcon} size={26} color="#7eb8ff" />
          </span>
          <div>
            <h3 className="settings-card__title">
              Giao diện Rounded Glass, Trong Suốt & Hình Nền Động
            </h3>
            <p className="settings-card__desc">
              Hỗ trợ chế độ Transparent Desktop, Aurora Gradient hoặc tải lên Video / GIF / Ảnh giữ nguyên 100% chất lượng gốc
            </p>
          </div>
        </div>

        <BackgroundCustomizerCard />
      </div>

      {/* Section 1.5: DJ Studio & AutoMix */}
      <div className="settings-card settings-card--dj">
        <div className="settings-card__header">
          <span className="settings-card__icon">
            <Icon icon={Disc3Icon} size={26} color="#a78bfa" />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 className="settings-card__title">DJ Studio, AutoMix & Crossfade DSP</h3>
              <span className={`dj-status-chip ${djConfig.enabled ? "is-on" : ""}`}>
                {djConfig.enabled ? "ACTIVE" : "OFF"}
              </span>
            </div>
            <p className="settings-card__desc">
              Dual-Deck CoreAudio DSP: phân tích BPM tự động, đồng bộ tempo, Bass Swap 210Hz, Filter Sweep & Smart Cue-In
            </p>
          </div>
          <input
            type="checkbox"
            checked={djConfig.enabled}
            onChange={(e) => setDjConfig({ enabled: e.target.checked })}
            className="toggle-switch"
            aria-label="Bật hoặc tắt DJ Studio"
          />
        </div>

        <div
          className="settings-card__body"
          style={{
            opacity: djConfig.enabled ? 1 : 0.45,
            pointerEvents: djConfig.enabled ? "auto" : "none",
            transition: "opacity 0.2s ease",
          }}
        >
          <label className="toggle-row">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon icon={RadioIcon} size={18} color="#7eb8ff" />
              <span>Tự động nối bài cuối track (AutoMix & Preload Deck B)</span>
            </span>
            <input
              type="checkbox"
              checked={djConfig.auto_mix}
              onChange={(e) => setDjConfig({ auto_mix: e.target.checked })}
              className="toggle-switch"
            />
          </label>

          <label className="toggle-row">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon icon={DashboardSpeed01Icon} size={18} color="#5cdb7a" />
              <span>BPM Tempo Sync (±14% mượt nhịp giữa Deck A và Deck B)</span>
            </span>
            <input
              type="checkbox"
              checked={djConfig.bpm_sync}
              onChange={(e) => setDjConfig({ bpm_sync: e.target.checked })}
              className="toggle-switch"
            />
          </label>

          <label className="toggle-row">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon icon={FlashIcon} size={18} color="#fbbf24" />
              <span>Smart Cue-In (tự động cắt khoảng lặng đầu bài để vào beat ngay)</span>
            </span>
            <input
              type="checkbox"
              checked={djConfig.smart_cue}
              onChange={(e) => setDjConfig({ smart_cue: e.target.checked })}
              className="toggle-switch"
            />
          </label>

          <div className="dj-slider-box">
            <div className="dj-slider-box__head">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon={SlidersHorizontalIcon} size={18} color="#a78bfa" />
                <span>Thời lượng Crossfade chuyển bài</span>
              </span>
              <span className="dj-slider-box__val">{djConfig.crossfade_secs} giây</span>
            </div>
            <input
              type="range"
              min={2}
              max={16}
              step={1}
              value={djConfig.crossfade_secs}
              onChange={(e) => setDjConfig({ crossfade_secs: Number(e.target.value) })}
              className="dj-range-input"
            />
            <div className="dj-slider-box__ticks">
              <span>2s Quick</span>
              <span>8s Pro Club</span>
              <span>16s Long Blend</span>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.82)",
                marginBottom: 10,
              }}
            >
              <Icon icon={AudioWaveformIcon} size={18} color="#7eb8ff" />
              <span>Kỹ thuật chuyển bài DJ (Transition Engine)</span>
            </div>
            <div className="dj-style-grid">
              {DJ_STYLE_OPTIONS.map((opt) => {
                const active = djConfig.style === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`dj-style-card ${active ? "is-active" : ""}`}
                    onClick={() => setDjConfig({ style: opt.id })}
                  >
                    <div className="dj-style-card__top">
                      <span className="dj-style-card__label">{opt.label}</span>
                      <span className="dj-style-card__badge">{opt.badge}</span>
                    </div>
                    <p className="dj-style-card__desc">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: SponsorBlock */}
      <div className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon">
            <Icon icon={ShieldCheckIcon} size={26} color="#5cdb7a" />
          </span>
          <div>
            <h3 className="settings-card__title">SponsorBlock — Bỏ qua quảng cáo tích hợp</h3>
            <p className="settings-card__desc">
              Tự động bỏ qua các đoạn quảng cáo tài trợ, intro và nhạc dạo không lời trong video YouTube
            </p>
          </div>
        </div>

        <div className="settings-card__body">
          <label className="toggle-row">
            <span>Bỏ qua đoạn tài trợ chính (Sponsors & Promos)</span>
            <input
              type="checkbox"
              checked={skipSponsors}
              onChange={(e) => setSkipSponsors(e.target.checked)}
              className="toggle-switch"
            />
          </label>
          <label className="toggle-row">
            <span>Bỏ qua đoạn giới thiệu (Intros / Music Off-topic)</span>
            <input
              type="checkbox"
              checked={skipIntros}
              onChange={(e) => setSkipIntros(e.target.checked)}
              className="toggle-switch"
            />
          </label>
          <label className="toggle-row">
            <span>Bỏ qua đoạn kết thúc / Subscribe reminder (Outros)</span>
            <input
              type="checkbox"
              checked={skipOutros}
              onChange={(e) => setSkipOutros(e.target.checked)}
              className="toggle-switch"
            />
          </label>
        </div>
      </div>

      {/* Section 3: Audio Quality */}
      <div className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon">
            <Icon icon={HeadphonesIcon} size={26} color="#7eb8ff" />
          </span>
          <div>
            <h3 className="settings-card__title">Chất lượng âm thanh & Engine</h3>
            <p className="settings-card__desc">Tùy chỉnh bitrate và công nghệ giải mã âm thanh</p>
          </div>
        </div>

        <div className="settings-card__body">
          <div className="radio-group">
            {[
              { id: "high", title: "Cực cao (Lossless / 256kbps Opus)", desc: "Khuyên dùng cho tai nghe & loa chất lượng cao" },
              { id: "medium", title: "Tiêu chuẩn (160kbps AAC)", desc: "Cân bằng giữa băng thông và độ trong trẻo" },
              { id: "low", title: "Tiết kiệm dữ liệu (128kbps)", desc: "Dành cho mạng chậm" },
            ].map((q) => (
              <label key={q.id} className="radio-option">
                <input
                  type="radio"
                  name="audio-quality"
                  checked={audioQuality === q.id}
                  onChange={() => setAudioQuality(q.id)}
                />
                <div>
                  <strong>{q.title}</strong>
                  <p>{q.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Last.fm */}
      <div className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon">
            <Icon icon={MusicNote01Icon} size={26} color="#7eb8ff" />
          </span>
          <div>
            <h3 className="settings-card__title">Last.fm Scrobbling</h3>
            <p className="settings-card__desc">Ghi nhận lịch sử bài hát trực tiếp vào tài khoản Last.fm của bạn</p>
          </div>
        </div>

        <div className="settings-card__body">
          <div className="input-group-row">
            <input
              type="password"
              className="text-input"
              placeholder="Nhập Last.fm Session Key hoặc API Key"
              value={lastfmKey}
              onChange={(e) => setLastfmKey(e.target.value)}
            />
            <button className="btn-secondary" onClick={() => alert("Đã lưu khóa Last.fm!")}>
              Kết nối
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
