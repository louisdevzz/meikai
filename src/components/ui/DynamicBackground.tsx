import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "../../store/ThemeContext";

export default function DynamicBackground() {
  const { bgMode, bgMediaType, bgObjectUrl, bgBlur, bgDim } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const checkFs = async () => {
      try {
        const fs = await win.isFullscreen();
        setIsFullscreen(fs);
      } catch {}
    };

    checkFs();
    win.onResized(() => {
      checkFs();
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  // On macOS, Native Fullscreen Space removes the desktop wallpaper behind the window.
  // If user is in Transparent mode and enters Fullscreen Space, show our subtle Aurora gradient
  // so the frosted glass panels stay luminous instead of turning flat black.
  if (bgMode === "transparent" && !isFullscreen) {
    return null;
  }

  if (bgMode === "gradient" || (bgMode === "transparent" && isFullscreen)) {
    return (
      <div className="dynamic-bg-layer dynamic-bg-gradient" aria-hidden="true">
        <div className="aurora-blob aurora-blob--1" />
        <div className="aurora-blob aurora-blob--2" />
        <div className="aurora-blob aurora-blob--3" />
      </div>
    );
  }

  if (bgMode === "custom" && bgObjectUrl) {
    return (
      <div className="dynamic-bg-layer" aria-hidden="true">
        {bgMediaType === "video" ? (
          <video
            key={bgObjectUrl}
            src={bgObjectUrl}
            autoPlay
            loop
            muted
            playsInline
            className="custom-bg-media"
            style={{
              filter: bgBlur > 0 ? `blur(${bgBlur}px)` : "none",
              transform: bgBlur > 0 ? "scale(1.06)" : "none",
            }}
          />
        ) : (
          <img
            key={bgObjectUrl}
            src={bgObjectUrl}
            alt=""
            className="custom-bg-media"
            style={{
              filter: bgBlur > 0 ? `blur(${bgBlur}px)` : "none",
              transform: bgBlur > 0 ? "scale(1.06)" : "none",
            }}
          />
        )}
        <div
          className="custom-bg-dim"
          style={{ backgroundColor: `rgba(6, 7, 12, ${bgDim})` }}
        />
      </div>
    );
  }

  return null;
}
