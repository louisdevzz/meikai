import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayer } from "../store/PlayerContext";
import type { HomeFeedPayload, LiveMoodItem, MoodDetailsPayload } from "../types/music";
import Icon from "../components/ui/Icon";
import { RadioIcon, PlayIcon, SparklesIcon, FireIcon } from "@hugeicons/core-free-icons";

export default function MixPage() {
  const { likedTracks, playStats, queue, startRadio, playTrack } = usePlayer();
  const [feed, setFeed] = useState<HomeFeedPayload | null>(null);
  const [moods, setMoods] = useState<LiveMoodItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      invoke<HomeFeedPayload>("get_home_feed").catch(() => null),
      invoke<LiveMoodItem[]>("get_moods_and_genres").catch(() => [] as LiveMoodItem[]),
    ])
      .then(([homeRes, moodsRes]) => {
        if (homeRes) setFeed(homeRes);
        if (moodsRes) setMoods(moodsRes.slice(0, 8));
      })
      .finally(() => setLoading(false));
  }, []);

  const mostPlayed = Object.values(playStats)
    .sort((a, b) => b.playCount - a.playCount)
    .map((s) => s.track);

  const liveSeeds = feed?.quick_picks || queue;

  const handleMoodRadio = async (mood: LiveMoodItem) => {
    try {
      const details = await invoke<MoodDetailsPayload>("get_mood_details", {
        genreId: mood.id,
      });
      if (details.tracks && details.tracks.length > 0) {
        playTrack(details.tracks[0], details.tracks);
        return;
      }
    } catch {}
    const fallback = liveSeeds[0];
    if (fallback) startRadio(fallback);
  };

  return (
    <div className="mix-page" style={{ paddingBottom: 80 }}>
      <div className="settings-header">
        <h1 className="settings-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Mix & Radio For You</span>
          <Icon icon={RadioIcon} size={26} color="#7eb8ff" />
        </h1>
        <p className="settings-subtitle">
          Đài phát nhạc thông minh tạo danh sách vô tận trực tiếp từ YouTube Music
        </p>
      </div>

      {/* Personalized Mixes */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon={SparklesIcon} size={18} color="#7eb8ff" />
            <span>Dành riêng cho bạn</span>
          </h2>
        </div>

        <div className="mix-grid">
          <div
            className="mix-card"
            style={{ background: "linear-gradient(135deg, rgba(126,184,255,0.28), rgba(79,70,229,0.28))" }}
            onClick={() => {
              const seed = likedTracks[0] || liveSeeds[0];
              if (seed) startRadio(seed);
            }}
          >
            <div className="mix-card__badge">PERSONAL MIX</div>
            <h3 className="mix-card__title">Your Favorite Radio</h3>
            <p className="mix-card__sub">
              Phối hợp từ {likedTracks.length} bài hát yêu thích của bạn và gợi ý YouTube Music
            </p>
            <div className="mix-card__play">
              <Icon icon={PlayIcon} size={18} color="#0b101b" />
            </div>
          </div>

          <div
            className="mix-card"
            style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.24), rgba(168,85,247,0.24))" }}
            onClick={() => {
              if (mostPlayed.length > 0) {
                playTrack(mostPlayed[0], mostPlayed);
              } else if (liveSeeds[1] || liveSeeds[0]) {
                startRadio(liveSeeds[1] || liveSeeds[0]);
              }
            }}
          >
            <div className="mix-card__badge">REPLAY MIX</div>
            <h3 className="mix-card__title">Most Played Mix</h3>
            <p className="mix-card__sub">
              Những giai điệu bạn nghe nhiều nhất gần đây hoặc đài phát YouTube Music nổi bật
            </p>
            <div className="mix-card__play">
              <Icon icon={PlayIcon} size={18} color="#0b101b" />
            </div>
          </div>
        </div>
      </section>

      {/* Live Quick-Pick Seed Radios from YouTube Music */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon={FireIcon} size={18} color="#ff5f57" />
            <span>Radio Theo Bài Hát Nổi Bật</span>
          </h2>
        </div>

        <div className="mix-grid">
          {loading && liveSeeds.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="mix-card"
                  style={{ opacity: 0.45, background: "rgba(255,255,255,0.06)", minHeight: 130 }}
                />
              ))
            : liveSeeds.slice(0, 4).map((seed, idx) => (
                <div
                  key={seed.video_id}
                  className="mix-card"
                  style={{
                    background:
                      idx % 2 === 0
                        ? "linear-gradient(135deg, rgba(43,88,118,0.75), rgba(78,67,118,0.75))"
                        : "linear-gradient(135deg, rgba(22,34,42,0.8), rgba(58,96,115,0.8))",
                  }}
                  onClick={() => startRadio(seed)}
                >
                  <div className="mix-card__badge">LIVE RADIO</div>
                  <h3 className="mix-card__title">{seed.title} Radio</h3>
                  <p className="mix-card__sub">Khởi tạo đài phát từ {seed.artist}</p>
                  <div className="mix-card__play">
                    <Icon icon={PlayIcon} size={18} color="#0b101b" />
                  </div>
                </div>
              ))}
        </div>
      </section>

      {/* Live Mood & Genre Radios from YouTube Music */}
      {moods.length > 0 && (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Đài Phát Theo Tâm Trạng & Thể Loại</h2>
          </div>
          <div className="mix-grid">
            {moods.map((mood) => (
              <div
                key={mood.id}
                className="mix-card"
                style={{
                  background: `linear-gradient(135deg, ${mood.color_hex}aa 0%, rgba(12,16,28,0.85) 100%)`,
                }}
                onClick={() => handleMoodRadio(mood)}
              >
                <div className="mix-card__badge">{mood.is_mood ? "MOOD" : "GENRE"}</div>
                <h3 className="mix-card__title">{mood.name}</h3>
                <p className="mix-card__sub">Phát ngay tuyển tập {mood.name} từ YouTube Music</p>
                <div className="mix-card__play">
                  <Icon icon={PlayIcon} size={18} color="#0b101b" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
