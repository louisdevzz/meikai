import { useState } from "react";
import Sidebar from "./components/sidebar/Sidebar";
import PlayerBar from "./components/player/PlayerBar";
import RightPlayerPanel from "./components/player/RightPlayerPanel";
import TitleBar from "./components/ui/TitleBar";
import DynamicBackground from "./components/ui/DynamicBackground";
import YouTubeLoginModal from "./components/ui/YouTubeLoginModal";
import NowPlayingModal from "./components/player/NowPlayingModal";
import HomePage from "./pages/HomePage";
import MixPage from "./pages/MixPage";
import SearchPage from "./pages/SearchPage";
import LibraryPage from "./pages/LibraryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import PlaylistDetailPage from "./pages/PlaylistDetailPage";
import TikTokPage from "./pages/TikTokPage";
import SettingsPage from "./pages/SettingsPage";
import { PlayerProvider } from "./store/PlayerContext";
import { ThemeProvider } from "./store/ThemeContext";
import "./styles/app.css";

export type Page =
  | "home"
  | "mix"
  | "search"
  | "library"
  | "analytics"
  | "playlist"
  | "tiktok"
  | "settings";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");

  const renderPage = () => {
    switch (currentPage) {
      case "home":      return <HomePage onNavigate={setCurrentPage} />;
      case "mix":       return <MixPage />;
      case "search":    return <SearchPage />;
      case "library":   return <LibraryPage onNavigate={setCurrentPage} />;
      case "analytics": return <AnalyticsPage />;
      case "playlist":  return <PlaylistDetailPage onNavigate={setCurrentPage} />;
      case "tiktok":    return <TikTokPage />;
      case "settings":  return <SettingsPage />;
      default:          return <HomePage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <ThemeProvider>
      <PlayerProvider>
        <div className="app-shell">
          <DynamicBackground />
          <TitleBar />
          <div className="app-bento-grid">
            <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
            <main className="main-glass-panel">
              {renderPage()}
            </main>
            <RightPlayerPanel />
          </div>
          <PlayerBar />
          <NowPlayingModal />
          <YouTubeLoginModal />
        </div>
      </PlayerProvider>
    </ThemeProvider>
  );
}
