import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayer } from "../store/PlayerContext";
import type { Track } from "../types/music";
import Icon from "../components/ui/Icon";
import {
  TiktokIcon,
  PlayIcon,
  FlashIcon,
  MusicNote01Icon,
} from "@hugeicons/core-free-icons";

interface TikTokParsed {
  type: "video" | "short_link";
  url: string;
  video_id?: string;
}

export default function TikTokPage() {
  const [inputUrl, setInputUrl] = useState("");
  const [parsed, setParsed] = useState<TikTokParsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [foundTracks, setFoundTracks] = useState<Track[]>([]);
  const { playTrack } = usePlayer();

  const handleConvert = async () => {
    if (!inputUrl.trim()) return;
    setError(null);
    setParsed(null);
    setFoundTracks([]);

    try {
      const res = await invoke<TikTokParsed | null>("parse_tiktok_url", { raw: inputUrl.trim() });
      if (!res) {
        setError("Đường dẫn TikTok không hợp lệ hoặc không được hỗ trợ. Hãy thử định dạng https://vt.tiktok.com/... hoặc https://www.tiktok.com/@user/video/...");
        return;
      }
      setParsed(res);

      // Search matching audio on YouTube Music
      setSearching(true);
      const query = res.video_id ? `tiktok sound ${res.video_id}` : "tiktok trending audio";
      const tracks = await invoke<Track[]>("search_youtube_music", { query });
      setFoundTracks(tracks);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="tiktok-page">
      <div className="tiktok-header">
        <h1 className="tiktok-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>TikTok Audio Converter</span>
          <Icon icon={TiktokIcon} size={28} color="var(--accent)" />
        </h1>
        <p className="tiktok-subtitle">
          Trích xuất âm thanh từ liên kết TikTok và phát trực tiếp chất lượng cao qua Meikai
        </p>
      </div>

      <div className="tiktok-card">
        <label className="tiktok-label">Nhập liên kết TikTok của bạn:</label>
        <div className="tiktok-input-group">
          <input
            type="text"
            className="tiktok-input"
            placeholder="Ví dụ: https://vt.tiktok.com/ZSjR12345/ hoặc https://www.tiktok.com/@artist/video/..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConvert()}
          />
          <button
            className="tiktok-submit-btn"
            onClick={handleConvert}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Icon icon={FlashIcon} size={16} />
            <span>Trích xuất nhạc</span>
          </button>
        </div>

        {error && <div className="tiktok-alert tiktok-alert--error">{error}</div>}

        {parsed && (
          <div className="tiktok-alert tiktok-alert--success">
            <strong>Liên kết hợp lệ:</strong> {parsed.url}
            {parsed.video_id && <span> (Video ID: {parsed.video_id})</span>}
          </div>
        )}
      </div>

      {searching && (
        <div className="empty-state">
          <div className="empty-state__icon spinner">
            <Icon icon={MusicNote01Icon} size={40} color="var(--accent)" />
          </div>
          <div className="empty-state__title">Đang đồng bộ âm thanh từ TikTok qua YouTube Music...</div>
        </div>
      )}

      {foundTracks.length > 0 && (
        <div className="tiktok-results">
          <h3 className="section-title">Âm thanh tìm thấy liên quan</h3>
          <div className="songs-table">
            {foundTracks.map((t, idx) => (
              <div
                key={`${t.video_id}-${idx}`}
                className="song-row"
                onClick={() => playTrack(t, foundTracks)}
              >
                <div className="song-row__idx">{idx + 1}</div>
                <img src={t.thumbnail_url} alt="" className="song-row__thumb" />
                <div className="song-row__meta">
                  <div className="song-row__title">{t.title}</div>
                  <div className="song-row__artist">{t.artist}</div>
                </div>
                <div className="song-row__duration">{t.duration_text || "3:00"}</div>
                <button
                  className="top-result-card__play-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12 }}
                >
                  <Icon icon={PlayIcon} size={14} color="white" />
                  <span>Phát</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
