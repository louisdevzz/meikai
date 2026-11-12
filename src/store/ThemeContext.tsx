import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  saveBackgroundBlob,
  loadBackgroundBlob,
  clearBackgroundBlob,
} from "../lib/backgroundStorage";

export type BgMode = "transparent" | "gradient" | "custom";
export type BgMediaType = "image" | "gif" | "video" | null;

interface ThemeContextType {
  bgMode: BgMode;
  bgMediaType: BgMediaType;
  bgObjectUrl: string | null;
  bgFileName: string | null;
  bgBlur: number;
  bgDim: number;
  panelBlur: number;
  panelOpacity: number;
  setBgMode: (mode: BgMode) => void;
  setBgBlur: (val: number) => void;
  setBgDim: (val: number) => void;
  setPanelBlur: (val: number) => void;
  setPanelOpacity: (val: number) => void;
  uploadCustomBackground: (file: File) => Promise<void>;
  setCustomBackgroundUrl: (url: string, type: "image" | "gif" | "video") => Promise<void>;
  clearCustomBackground: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_META_KEY = "meikai_theme_prefs_v2";

interface StoredPrefs {
  bgMode: BgMode;
  bgMediaType: BgMediaType;
  bgFileName: string | null;
  bgRemoteUrl: string | null;
  bgBlur: number;
  bgDim: number;
  panelBlur: number;
  panelOpacity: number;
}

const DEFAULT_PREFS: StoredPrefs = {
  bgMode: "transparent",
  bgMediaType: null,
  bgFileName: null,
  bgRemoteUrl: null,
  bgBlur: 0,
  bgDim: 0.25,
  panelBlur: 28,
  panelOpacity: 0.42,
};

function readPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = useRef<StoredPrefs>(readPrefs());
  const [bgMode, setBgModeState] = useState<BgMode>(initial.current.bgMode);
  const [bgMediaType, setBgMediaType] = useState<BgMediaType>(initial.current.bgMediaType);
  const [bgFileName, setBgFileName] = useState<string | null>(initial.current.bgFileName);
  const [bgRemoteUrl, setBgRemoteUrl] = useState<string | null>(initial.current.bgRemoteUrl);
  const [bgObjectUrl, setBgObjectUrl] = useState<string | null>(initial.current.bgRemoteUrl);
  const [bgBlur, setBgBlur] = useState<number>(initial.current.bgBlur);
  const [bgDim, setBgDim] = useState<number>(initial.current.bgDim);
  const [panelBlur, setPanelBlur] = useState<number>(initial.current.panelBlur);
  const [panelOpacity, setPanelOpacity] = useState<number>(initial.current.panelOpacity);

  const activeBlobUrlRef = useRef<string | null>(null);

  // Restore raw lossless Blob from IndexedDB on startup
  useEffect(() => {
    let mounted = true;
    loadBackgroundBlob().then((blob) => {
      if (!mounted || !blob) return;
      const url = URL.createObjectURL(blob);
      activeBlobUrlRef.current = url;
      setBgObjectUrl(url);
    });
    return () => {
      mounted = false;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  // Persist prefs & sync CSS variables live
  useEffect(() => {
    const prefs: StoredPrefs = {
      bgMode,
      bgMediaType,
      bgFileName,
      bgRemoteUrl,
      bgBlur,
      bgDim,
      panelBlur,
      panelOpacity,
    };
    try {
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(prefs));
    } catch {}

    const root = document.documentElement;
    root.style.setProperty("--glass-blur", `${panelBlur}px`);
    root.style.setProperty("--glass-opacity", `${panelOpacity}`);
    root.style.setProperty("--glass-card-opacity", `${Math.min(0.68, panelOpacity + 0.08)}`);
  }, [bgMode, bgMediaType, bgFileName, bgRemoteUrl, bgBlur, bgDim, panelBlur, panelOpacity]);

  const setBgMode = (mode: BgMode) => {
    setBgModeState(mode);
  };

  const uploadCustomBackground = async (file: File) => {
    const lower = file.name.toLowerCase();
    let mediaType: BgMediaType = "image";
    if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(lower)) {
      mediaType = "video";
    } else if (file.type === "image/gif" || lower.endsWith(".gif")) {
      mediaType = "gif";
    }

    // Store raw original File bytes directly in IndexedDB — zero compression!
    await saveBackgroundBlob(file);

    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
    }
    const newUrl = URL.createObjectURL(file);
    activeBlobUrlRef.current = newUrl;

    setBgRemoteUrl(null);
    setBgMediaType(mediaType);
    setBgFileName(file.name);
    setBgObjectUrl(newUrl);
    setBgModeState("custom");
  };

  const setCustomBackgroundUrl = async (url: string, type: "image" | "gif" | "video") => {
    await clearBackgroundBlob();
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setBgRemoteUrl(url);
    setBgMediaType(type);
    setBgFileName(url.split("/").pop() || "Custom URL");
    setBgObjectUrl(url);
    setBgModeState("custom");
  };

  const clearCustomBackground = async () => {
    await clearBackgroundBlob();
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setBgRemoteUrl(null);
    setBgObjectUrl(null);
    setBgMediaType(null);
    setBgFileName(null);
    setBgModeState("transparent");
  };

  return (
    <ThemeContext.Provider
      value={{
        bgMode,
        bgMediaType,
        bgObjectUrl,
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
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
