import { useState } from "react";
import { usePlayer } from "../../store/PlayerContext";
import Icon from "./Icon";
import {
  Cancel01Icon,
  UserCircleIcon,
  Logout01Icon,
  ShieldCheckIcon,
} from "@hugeicons/core-free-icons";

export default function YouTubeLoginModal() {
  const {
    isLoginModalOpen,
    setIsLoginModalOpen,
    ytAccount,
    openYouTubeLogin,
    loginWithCookie,
    logoutYouTube,
  } = usePlayer();

  const [cookieInput, setCookieInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleCookieLogin = async () => {
    if (!cookieInput.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await loginWithCookie(cookieInput.trim());
      setCookieInput("");
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-modal-backdrop" onClick={() => setIsLoginModalOpen(false)}>
      <div className="bg-modal-glass" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="bg-modal-header">
          <div>
            <h3>Tài khoản YouTube Music</h3>
            <p>Đăng nhập để đồng bộ Playlist YouTube và mở khóa 256kbps Premium</p>
          </div>
          <button
            className="circle-icon-btn"
            onClick={() => setIsLoginModalOpen(false)}
            title="Đóng"
          >
            <Icon icon={Cancel01Icon} size={16} />
          </button>
        </div>

        {ytAccount ? (
          <div className="yt-account-box">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              {ytAccount.avatar_url ? (
                <img
                  src={ytAccount.avatar_url}
                  alt={ytAccount.name}
                  style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <Icon icon={UserCircleIcon} size={52} color="#7eb8ff" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 16, color: "white", display: "block" }}>
                  {ytAccount.name}
                </strong>
                <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
                  {ytAccount.handle || "Đã kết nối YouTube Music"}
                </span>
              </div>
              <span className="badge" style={{ background: "rgba(40,200,64,0.18)", color: "#5cdb7a" }}>
                <Icon icon={ShieldCheckIcon} size={14} color="#5cdb7a" />
                <span>Connected</span>
              </span>
            </div>

            <button
              className="btn-glass-danger"
              style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px" }}
              onClick={logoutYouTube}
            >
              <Icon icon={Logout01Icon} size={16} />
              <span>Đăng xuất tài khoản YouTube</span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="bg-upload-zone" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <strong style={{ fontSize: 13.5, color: "white" }}>
                Cách 1: Đăng nhập trực tiếp qua Google (Khuyên dùng)
              </strong>
              <small style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
                Mở cửa sổ trình duyệt đăng nhập Google chính thức của YouTube Music (giống SimpMusic).
                Sau khi đăng nhập xong cửa sổ sẽ tự động đóng và đồng bộ tài khoản.
              </small>
              <button
                className="btn-glass-accent"
                style={{ width: "100%", padding: "11px 16px", fontSize: 13.5 }}
                onClick={openYouTubeLogin}
              >
                Mở cửa sổ Đăng nhập YouTube Music
              </button>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14 }}>
              <label className="tiktok-label" style={{ fontSize: 12.5 }}>
                Cách 2: Dán Cookie thủ công (Dev Login — tùy chọn)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  className="text-input"
                  placeholder="Dán Cookie từ music.youtube.com..."
                  value={cookieInput}
                  onChange={(e) => setCookieInput(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  onClick={handleCookieLogin}
                  disabled={loading}
                >
                  {loading ? "Đang kiểm tra..." : "Đăng nhập"}
                </button>
              </div>
              {error && (
                <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 8 }}>{error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
