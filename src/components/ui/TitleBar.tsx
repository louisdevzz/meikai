import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toLowerCase().includes("mac");

export default function TitleBar() {
  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("window_close");
    } catch {
      await getCurrentWindow().close();
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("window_minimize");
    } catch {
      await getCurrentWindow().minimize();
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("window_toggle_maximize");
    } catch {
      await getCurrentWindow().toggleMaximize();
    }
  };

  const handleDragMouseDown = async (e: React.MouseEvent) => {
    if (e.buttons === 1 && e.detail === 1) {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // Fallback to -webkit-app-region: drag
      }
    }
  };

  return (
    <div
      className="titlebar titlebar-drag"
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
      onDoubleClick={handleMaximize}
    >
      {/* On macOS, native Traffic Lights are rendered by titleBarStyle: Overlay */}
      {!isMac ? (
        <div
          className="titlebar__controls titlebar-no-drag"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={handleClose}
            title="Close"
          />
          <button
            className="titlebar__btn titlebar__btn--minimize"
            onClick={handleMinimize}
            title="Minimize"
          />
          <button
            className="titlebar__btn titlebar__btn--maximize"
            onClick={handleMaximize}
            title="Maximize"
          />
        </div>
      ) : (
        <div style={{ width: 76 }} data-tauri-drag-region />
      )}

      <div className="titlebar__center-title" data-tauri-drag-region>
        Meikai
      </div>

      <div style={{ width: 76 }} data-tauri-drag-region />
    </div>
  );
}
