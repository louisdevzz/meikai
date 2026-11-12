import { useRef, useState } from "react";
import { useTheme } from "../../store/ThemeContext";
import Icon from "./Icon";
import {
  Image01Icon,
  Video01Icon,
  Upload01Icon,
  Delete02Icon,
  SparklesIcon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";

export default function BackgroundCustomizerCard() {
  const {
    bgMode,
    bgMediaType,
    bgFileName,
    bgBlur,
    bgDim,
    panelBlur,
    panelOpacity,
    setBgMode,
    setBgBlur,
    setBgDim,
    setPanelBlur,
    setPanelOpacity,
    uploadCustomBackground,
    setCustomBackgroundUrl,
    clearCustomBackground,
  } = useTheme();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlType, setUrlType] = useState<"image" | "gif" | "video">("image");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadCustomBackground(file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleApplyUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    let detected: "image" | "gif" | "video" = urlType;
    if (/\.(mp4|webm|mov)(\?|$)/.test(lower)) detected = "video";
    else if (/\.gif(\?|$)/.test(lower)) detected = "gif";
    await setCustomBackgroundUrl(trimmed, detected);
    setUrlInput("");
  };

  return (
    <div className="bg-customizer">
      {/* Mode Selector */}
      <div className="bg-mode-grid">
        <button
          className={`bg-mode-btn ${bgMode === "transparent" ? "bg-mode-btn--active" : ""}`}
          onClick={() => setBgMode("transparent")}
        >
          <Icon icon={Layers01Icon} size={20} />
          <div>
            <strong>Transparent Glass</strong>
            <small>Xuyên thấu màn hình Desktop</small>
          </div>
        </button>

        <button
          className={`bg-mode-btn ${bgMode === "gradient" ? "bg-mode-btn--active" : ""}`}
          onClick={() => setBgMode("gradient")}
        >
          <Icon icon={SparklesIcon} size={20} />
          <div>
            <strong>Aurora Gradient</strong>
            <small>Nền gradient tối chuyển động</small>
          </div>
        </button>

        <button
          className={`bg-mode-btn ${bgMode === "custom" ? "bg-mode-btn--active" : ""}`}
          onClick={() => {
            if (bgFileName) setBgMode("custom");
            else fileInputRef.current?.click();
          }}
        >
          <Icon icon={bgMediaType === "video" ? Video01Icon : Image01Icon} size={20} />
          <div>
            <strong>Custom Media</strong>
            <small>Ảnh / GIF / Video chất lượng gốc</small>
          </div>
        </button>
      </div>

      {/* Upload Lossless Media Box */}
      <div className="bg-upload-zone">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.gif,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.avif"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div className="bg-upload-zone__info">
          <Icon icon={Upload01Icon} size={20} color="#7eb8ff" />
          <div>
            <strong>
              {bgFileName
                ? `Đang dùng: ${bgFileName} (${bgMediaType?.toUpperCase() || "MEDIA"})`
                : "Chọn Ảnh, GIF hoặc Video (MP4/WebM) từ máy"}
            </strong>
            <small>
              Lưu trực tiếp dữ liệu gốc trong IndexedDB — 100% không nén, không giảm chất lượng ảnh/video
            </small>
          </div>
        </div>

        <div className="bg-upload-zone__actions">
          <button
            className="btn-glass-accent"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Đang tải..." : bgFileName ? "Đổi file khác" : "Chọn File"}
          </button>
          {bgFileName && (
            <button
              className="btn-glass-danger"
              onClick={clearCustomBackground}
              title="Xóa hình nền tùy chỉnh"
            >
              <Icon icon={Delete02Icon} size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Or Paste Direct URL */}
      <div className="bg-url-row">
        <input
          type="text"
          className="text-input"
          placeholder="Hoặc dán link trực tiếp Ảnh / GIF / Video (.mp4, .gif, .png)..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleApplyUrl()}
        />
        <select
          className="glass-select"
          value={urlType}
          onChange={(e) => setUrlType(e.target.value as any)}
        >
          <option value="image">Image</option>
          <option value="gif">GIF</option>
          <option value="video">Video</option>
        </select>
        <button className="btn-secondary" onClick={handleApplyUrl}>
          Áp dụng
        </button>
      </div>

      {/* Sliders for Rounded Glass Blur & Transparency */}
      <div className="bg-sliders-grid">
        <div className="slider-control">
          <div className="slider-control__top">
            <span>Độ mờ kính UI (Glass Panel Blur)</span>
            <strong>{panelBlur}px</strong>
          </div>
          <input
            type="range"
            min="4"
            max="50"
            step="1"
            value={panelBlur}
            onChange={(e) => setPanelBlur(Number(e.target.value))}
            className="glass-range"
          />
        </div>

        <div className="slider-control">
          <div className="slider-control__top">
            <span>Độ đục kính UI (Glass Opacity)</span>
            <strong>{Math.round(panelOpacity * 100)}%</strong>
          </div>
          <input
            type="range"
            min="0.12"
            max="0.85"
            step="0.02"
            value={panelOpacity}
            onChange={(e) => setPanelOpacity(Number(e.target.value))}
            className="glass-range"
          />
        </div>

        {bgMode === "custom" && (
          <>
            <div className="slider-control">
              <div className="slider-control__top">
                <span>Làm mờ nền tùy chỉnh (BG Blur)</span>
                <strong>{bgBlur}px</strong>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={bgBlur}
                onChange={(e) => setBgBlur(Number(e.target.value))}
                className="glass-range"
              />
            </div>

            <div className="slider-control">
              <div className="slider-control__top">
                <span>Độ tối lớp phủ nền (BG Dim)</span>
                <strong>{Math.round(bgDim * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="0.85"
                step="0.02"
                value={bgDim}
                onChange={(e) => setBgDim(Number(e.target.value))}
                className="glass-range"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
