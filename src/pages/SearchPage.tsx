import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayer } from "../store/PlayerContext";
import type {
  Track,
  ChartsPayload,
  LiveMoodItem,
  MoodDetailsPayload,
} from "../types/music";
import Icon from "../components/ui/Icon";
import {
  Search01Icon,
  Cancel01Icon,
  PlayIcon,
  PauseIcon,
  FavouriteIcon,
  HeartIcon,
  Playlist01Icon,
  FireIcon,
  HeadphonesIcon,
  RadioIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";

const FILTER_OPTIONS = [
  { id: "all", label: "Tất cả" },
  { id: "songs", label: "Bài hát" },
  { id: "videos", label: "Video" },
  { id: "albums", label: "Album" },
  { id: "playlists", label: "Playlist" },
];

export default function SearchPage() {
  const {
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
    likedTrackIds,
    toggleLike,
    addToQueue,
    startRadio,
    localPlaylists,
    addTrackToLocalPlaylist,
    createLocalPlaylist,
  } = usePlayer();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("meikai_search_history") || "[]");
    } catch {
      return [];
    }
  });
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);
  const [trendingArtists, setTrendingArtists] = useState<string[]>([]);
  const [liveGenres, setLiveGenres] = useState<LiveMoodItem[]>([]);

  // Fetch real Trending Artists & Live Genres from YouTube Music
  useEffect(() => {
    Promise.all([
      invoke<ChartsPayload>("get_youtube_charts").catch(() => null),
      invoke<LiveMoodItem[]>("get_moods_and_genres").catch(() => [] as LiveMoodItem[]),
    ]).then(([charts, genres]) => {
      if (charts?.artists) {
        setTrendingArtists(charts.artists.map((a) => a.name).slice(0, 12));
      }
      if (genres && genres.length > 0) {
        setLiveGenres(genres.slice(0, 18));
      }
    });
  }, []);

  const handleGenreSelect = async (genre: LiveMoodItem) => {
    setQuery(genre.name);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const details = await invoke<MoodDetailsPayload>("get_mood_details", {
        genreId: genre.id,
      });
      if (details.tracks && details.tracks.length > 0) {
        setResults(details.tracks);
        return;
      }
      const fallback = await invoke<Track[]>("search_youtube_music", {
        query: genre.name,
        filter: "songs",
      });
      setResults(fallback || []);
    } catch {
      handleSearch(genre.name, "songs");
    } finally {
      setLoading(false);
    }
  };

  // Live autocomplete suggestions
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      invoke<string[]>("get_search_suggestions", { query: q })
        .then((list) => setSuggestions(list || []))
        .catch(() => setSuggestions([]));
    }, 240);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = async (q: string, filterOverride?: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const filterToUse = filterOverride ?? activeFilter;
    setShowSuggestions(false);
    setLoading(true);

    // Save to search history
    setSearchHistory((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, 8);
      try {
        localStorage.setItem("meikai_search_history", JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      const tracks = await invoke<Track[]>("search_youtube_music", {
        query: trimmed,
        filter: filterToUse === "all" ? null : filterToUse,
      });
      setResults(tracks);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filterId: string) => {
    setActiveFilter(filterId);
    if (query.trim()) {
      handleSearch(query, filterId);
    }
  };

  const handleKeywordClick = (keyword: string) => {
    setQuery(keyword);
    handleSearch(keyword);
  };

  const handleTrackSelect = (track: Track) => {
    if (currentTrack?.video_id === track.video_id) {
      togglePlay();
    } else {
      playTrack(track, results);
    }
  };

  const topResult = results.length > 0 ? results[0] : null;
  const otherResults = results.length > 1 ? results.slice(1) : results;

  return (
    <div className="search-page">
      {/* Search Input Box + Live Suggestions */}
      <div className="search-page__header">
        <div className="search-page__input-wrap">
          <span className="search-page__icon">
            <Icon icon={Search01Icon} size={18} />
          </span>
          <input
            className="search-page__input"
            type="text"
            placeholder="Tìm kiếm bài hát, nghệ sĩ, album từ YouTube Music…"
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
            autoFocus
          />
          {query && (
            <button
              className="search-page__clear-btn"
              onClick={() => {
                setQuery("");
                setResults([]);
                setSuggestions([]);
              }}
              title="Xóa tìm kiếm"
            >
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          )}

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions-dropdown">
              {suggestions.map((sug, i) => (
                <button
                  key={`${sug}-${i}`}
                  className="search-suggestion-item"
                  onClick={() => handleKeywordClick(sug)}
                >
                  <Icon icon={Search01Icon} size={14} color="rgba(255,255,255,0.5)" />
                  <span>{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter Chips */}
        <div className="search-page__filter-chips">
          {FILTER_OPTIONS.map((cat) => (
            <button
              key={cat.id}
              className={`filter-chip ${activeFilter === cat.id ? "filter-chip--active" : ""}`}
              onClick={() => handleFilterChange(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add to Playlist Picker Modal */}
      {pickerTrack && (
        <div className="bg-modal-backdrop" onClick={() => setPickerTrack(null)}>
          <div className="bg-modal-glass" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-modal-header">
              <div>
                <h3>Thêm vào Playlist</h3>
                <p>{pickerTrack.title}</p>
              </div>
              <button className="circle-icon-btn" onClick={() => setPickerTrack(null)}>
                <Icon icon={Cancel01Icon} size={16} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {localPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  className="library-mini-card"
                  onClick={() => {
                    addTrackToLocalPlaylist(pl.id, pickerTrack);
                    setPickerTrack(null);
                  }}
                >
                  <Icon icon={Playlist01Icon} size={18} color="#7eb8ff" />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div className="library-mini-card__title">{pl.name}</div>
                    <div className="library-mini-card__sub">{pl.tracks.length} songs</div>
                  </div>
                </button>
              ))}
              <button
                className="btn-glass-accent"
                style={{ marginTop: 6 }}
                onClick={() => {
                  const pl = createLocalPlaylist(`My Mix #${localPlaylists.length + 1}`);
                  addTrackToLocalPlaylist(pl.id, pickerTrack);
                  setPickerTrack(null);
                }}
              >
                + Tạo Playlist mới & Thêm bài này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="empty-state">
          <div className="empty-state__icon spinner">
            <Icon icon={HeadphonesIcon} size={40} color="var(--accent)" />
          </div>
          <div className="empty-state__title">Đang dò tìm từ YouTube Music…</div>
          <div className="empty-state__sub">Đang lọc theo mục: {activeFilter.toUpperCase()}</div>
        </div>
      )}

      {/* Empty state: Search History + Trending + Genres */}
      {!loading && results.length === 0 && (
        <div className="search-discovery" style={{ paddingBottom: 80 }}>
          {searchHistory.length > 0 && (
            <div className="search-discovery__section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 className="section-title">Tìm kiếm gần đây</h3>
                <button
                  className="link-action-btn"
                  onClick={() => {
                    setSearchHistory([]);
                    localStorage.removeItem("meikai_search_history");
                  }}
                >
                  Xóa lịch sử
                </button>
              </div>
              <div className="keywords-cloud">
                {searchHistory.map((kw) => (
                  <button
                    key={kw}
                    className="keyword-tag"
                    onClick={() => handleKeywordClick(kw)}
                  >
                    <Icon icon={Search01Icon} size={13} color="rgba(255,255,255,0.5)" />
                    <span>{kw}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {trendingArtists.length > 0 && (
            <div className="search-discovery__section">
              <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Nghệ sĩ hàng đầu trên YouTube Charts</span>
                <Icon icon={FireIcon} size={18} color="#ff5f57" />
              </h3>
              <div className="keywords-cloud">
                {trendingArtists.map((kw) => (
                  <button
                    key={kw}
                    className="keyword-tag"
                    onClick={() => handleKeywordClick(kw)}
                  >
                    <Icon icon={FireIcon} size={13} color="var(--accent)" />
                    <span>{kw}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="search-discovery__section">
            <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Khám phá theo thể loại & tâm trạng</span>
              <Icon icon={HeadphonesIcon} size={18} color="var(--accent)" />
            </h3>
            <div className="genres-grid">
              {liveGenres.map((genre) => (
                <div
                  key={genre.id}
                  className="genre-card"
                  style={{
                    background: `linear-gradient(135deg, ${genre.color_hex}, rgba(15, 20, 35, 0.88))`,
                  }}
                  onClick={() => handleGenreSelect(genre)}
                >
                  <span className="genre-card__title">{genre.name}</span>
                  <div className="genre-card__icon">
                    <Icon icon={PlayIcon} size={22} color="rgba(255, 255, 255, 0.6)" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Found */}
      {!loading && results.length > 0 && (
        <div className="search-results-layout">
          {topResult && (
            <div className="top-result-card">
              <span className="top-result-card__badge">Kết quả hàng đầu</span>
              <div className="top-result-card__body" onClick={() => handleTrackSelect(topResult)}>
                <img
                  src={topResult.thumbnail_url}
                  alt=""
                  className="top-result-card__art"
                />
                <h3 className="top-result-card__title">{topResult.title}</h3>
                <p className="top-result-card__artist">{topResult.artist}</p>
                <div className="top-result-card__action" style={{ display: "flex", gap: 8 }}>
                  <button
                    className="top-result-card__play-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <Icon
                      icon={currentTrack?.video_id === topResult.video_id && isPlaying ? PauseIcon : PlayIcon}
                      size={16}
                      color="#0b101b"
                    />
                    <span>
                      {currentTrack?.video_id === topResult.video_id && isPlaying ? "Tạm dừng" : "Phát ngay"}
                    </span>
                  </button>
                  <button
                    className="circle-icon-btn circle-icon-btn--lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRadio(topResult);
                    }}
                    title="Bắt đầu Radio từ bài này"
                  >
                    <Icon icon={RadioIcon} size={17} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="search-songs-list">
            <div className="search-songs-header">
              <span className="search-songs-header__title">Danh sách bài hát liên quan</span>
              <span className="search-songs-header__count">{results.length} kết quả</span>
            </div>

            <div className="songs-table">
              {otherResults.map((track, idx) => {
                const isCurrent = currentTrack?.video_id === track.video_id;
                const isLiked = likedTrackIds.has(track.video_id);

                return (
                  <div
                    key={`${track.video_id}-${idx}`}
                    className={`song-row ${isCurrent ? "song-row--active" : ""}`}
                    onClick={() => handleTrackSelect(track)}
                  >
                    <div className="song-row__idx">
                      {isCurrent && isPlaying ? (
                        <Icon icon={PlayIcon} size={14} color="var(--accent)" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <img src={track.thumbnail_url} alt="" className="song-row__thumb" />

                    <div className="song-row__meta">
                      <div className="song-row__title" title={track.title}>
                        {track.title}
                      </div>
                      <div className="song-row__artist">{track.artist}</div>
                    </div>

                    <div className="song-row__duration">{track.duration_text || "3:30"}</div>

                    <div className="song-row__actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-action-queue"
                        onClick={() => startRadio(track)}
                        title="Bắt đầu Radio"
                      >
                        <Icon icon={RadioIcon} size={16} />
                      </button>
                      <button
                        className={`btn-action-heart ${isLiked ? "btn-action-heart--active" : ""}`}
                        onClick={() => toggleLike(track)}
                        title={isLiked ? "Bỏ thích" : "Yêu thích"}
                      >
                        <Icon
                          icon={isLiked ? FavouriteIcon : HeartIcon}
                          size={16}
                          color={isLiked ? "#ff5f57" : "var(--text-muted)"}
                        />
                      </button>
                      <button
                        className="btn-action-queue"
                        onClick={() => setPickerTrack(track)}
                        title="Thêm vào Playlist"
                      >
                        <Icon icon={Add01Icon} size={16} />
                      </button>
                      <button
                        className="btn-action-queue"
                        onClick={() => addToQueue(track)}
                        title="Thêm vào hàng đợi"
                      >
                        <Icon icon={Playlist01Icon} size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
