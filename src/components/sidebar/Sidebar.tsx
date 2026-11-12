import type { Page } from "../../App";
import { usePlayer } from "../../store/PlayerContext";
import Icon from "../ui/Icon";
import {
  Home01Icon,
  RadioIcon,
  Search01Icon,
  LibraryIcon,
  FavouriteIcon,
  Download01Icon,
  ChartIncreaseIcon,
  TiktokIcon,
  GridViewIcon,
  Menu01Icon,
  Playlist01Icon,
} from "@hugeicons/core-free-icons";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const {
    likedTracks,
    playStats,
    localPlaylists,
    setActivePlaylistTarget,
  } = usePlayer();

  const mostPlayedCount = Object.keys(playStats).length;

  return (
    <aside className="sidebar-panel">
      {/* Main Nav Section */}
      <div className="sidebar-panel__nav">
        <button
          className={`sidebar-nav-pill ${currentPage === "home" ? "sidebar-nav-pill--active" : ""}`}
          onClick={() => onNavigate("home")}
        >
          <Icon
            icon={Home01Icon}
            size={18}
            color={currentPage === "home" ? "#7eb8ff" : "var(--text-secondary)"}
          />
          <span>Home</span>
        </button>

        <button
          className={`sidebar-nav-pill ${currentPage === "mix" ? "sidebar-nav-pill--active" : ""}`}
          onClick={() => onNavigate("mix")}
        >
          <Icon
            icon={RadioIcon}
            size={18}
            color={currentPage === "mix" ? "#7eb8ff" : "var(--text-secondary)"}
          />
          <span>Mix</span>
        </button>

        <button
          className={`sidebar-nav-pill ${currentPage === "search" ? "sidebar-nav-pill--active" : ""}`}
          onClick={() => onNavigate("search")}
        >
          <Icon
            icon={Search01Icon}
            size={18}
            color={currentPage === "search" ? "#7eb8ff" : "var(--text-secondary)"}
          />
          <span>Search</span>
        </button>

        <button
          className={`sidebar-nav-pill ${currentPage === "analytics" ? "sidebar-nav-pill--active" : ""}`}
          onClick={() => onNavigate("analytics")}
        >
          <Icon
            icon={ChartIncreaseIcon}
            size={18}
            color={currentPage === "analytics" ? "#7eb8ff" : "var(--text-secondary)"}
          />
          <span>Analytics</span>
        </button>

        <button
          className={`sidebar-nav-pill ${currentPage === "tiktok" ? "sidebar-nav-pill--active" : ""}`}
          onClick={() => onNavigate("tiktok")}
        >
          <Icon
            icon={TiktokIcon}
            size={18}
            color={currentPage === "tiktok" ? "#7eb8ff" : "var(--text-secondary)"}
          />
          <span>TikTok Music</span>
        </button>
      </div>

      {/* Your Library Header */}
      <div className="sidebar-library-header">
        <button
          className="sidebar-library-title-btn"
          onClick={() => onNavigate("library")}
        >
          <Icon icon={LibraryIcon} size={18} color="var(--text-primary)" />
          <span>Your library</span>
        </button>

        <div className="sidebar-library-actions">
          <button
            className="circle-icon-btn"
            onClick={() => onNavigate("search")}
            title="Tìm trong thư viện"
          >
            <Icon icon={Search01Icon} size={15} />
          </button>
          <button
            className="circle-icon-btn"
            onClick={() => onNavigate("library")}
            title="Chế độ lưới"
          >
            <Icon icon={GridViewIcon} size={15} />
          </button>
          <button
            className="circle-icon-btn"
            onClick={() => onNavigate("library")}
            title="Danh sách"
          >
            <Icon icon={Menu01Icon} size={15} />
          </button>
        </div>
      </div>

      {/* Library Playlist Cards */}
      <div className="sidebar-library-cards">
        <div
          className="library-mini-card"
          onClick={() => onNavigate("library")}
        >
          <div className="library-mini-card__icon-box library-mini-card__icon-box--fav">
            <Icon icon={FavouriteIcon} size={20} color="#ef4444" />
          </div>
          <div className="library-mini-card__info">
            <div className="library-mini-card__title">Favorite</div>
            <div className="library-mini-card__sub">Playlist • {likedTracks.length} songs</div>
          </div>
        </div>

        <div
          className="library-mini-card"
          onClick={() => onNavigate("library")}
        >
          <div className="library-mini-card__icon-box library-mini-card__icon-box--dl">
            <Icon icon={Download01Icon} size={20} color="#38bdf8" />
          </div>
          <div className="library-mini-card__info">
            <div className="library-mini-card__title">Downloaded</div>
            <div className="library-mini-card__sub">Playlist • 0 songs</div>
          </div>
        </div>

        <div
          className="library-mini-card"
          onClick={() => onNavigate("analytics")}
        >
          <div className="library-mini-card__icon-box library-mini-card__icon-box--most">
            <Icon icon={ChartIncreaseIcon} size={20} color="#a855f7" />
          </div>
          <div className="library-mini-card__info">
            <div className="library-mini-card__title">Most Played</div>
            <div className="library-mini-card__sub">Playlist • {mostPlayedCount} songs</div>
          </div>
        </div>

        {/* User's Custom Local Playlists */}
        {localPlaylists.map((pl) => (
          <div
            key={pl.id}
            className="library-mini-card"
            onClick={() => {
              setActivePlaylistTarget({ kind: "local", id: pl.id, title: pl.name });
              onNavigate("playlist");
            }}
          >
            <div className="library-mini-card__icon-box" style={{ background: "rgba(126,184,255,0.16)" }}>
              <Icon icon={Playlist01Icon} size={18} color="#7eb8ff" />
            </div>
            <div className="library-mini-card__info">
              <div className="library-mini-card__title">{pl.name}</div>
              <div className="library-mini-card__sub">Playlist • {pl.tracks.length} songs</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
