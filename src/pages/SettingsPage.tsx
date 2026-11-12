import { useState } from "react";
import { usePlayer } from "../store/PlayerContext";
import Icon from "../components/ui/Icon";
import BackgroundCustomizerCard from "../components/ui/BackgroundCustomizerCard";
import {
  Settings02Icon,
  ShieldCheckIcon,
  HeadphonesIcon,
  SparklesIcon,
  MusicNote01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";

export default function SettingsPage() {
  const { ytAccount, setIsLoginModalOpen, logoutYouTube } = usePlayer();
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
