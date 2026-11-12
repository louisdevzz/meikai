import { usePlayer } from "../store/PlayerContext";
import Icon from "../components/ui/Icon";
import {
  ChartIncreaseIcon,
  HeadphonesIcon,
  FavouriteIcon,
  MusicNote01Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";

export default function AnalyticsPage() {
  const { playStats, totalListenSeconds, likedTracks, history, playTrack } = usePlayer();

  const statsArray = Object.values(playStats).sort((a, b) => b.playCount - a.playCount);
  const totalPlays = statsArray.reduce((sum, s) => sum + s.playCount, 0);

  // Aggregate top artists
  const artistMap: Record<string, { name: string; count: number; thumb?: string }> = {};
  for (const s of statsArray) {
    const key = s.track.artist || "Unknown";
    if (!artistMap[key]) {
      artistMap[key] = { name: key, count: 0, thumb: s.track.thumbnail_url };
    }
    artistMap[key].count += s.playCount;
  }
  const topArtists = Object.values(artistMap).sort((a, b) => b.count - a.count).slice(0, 6);

  const mins = Math.floor(totalListenSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const formattedTime = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m ${totalListenSeconds % 60}s`;

  return (
    <div className="analytics-page" style={{ paddingBottom: 80 }}>
      <div className="settings-header">
        <h1 className="settings-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Listening Analytics</span>
          <Icon icon={ChartIncreaseIcon} size={26} color="#a855f7" />
        </h1>
        <p className="settings-subtitle">
          Thống kê thói quen nghe nhạc & Meikai Wrapped cá nhân hóa trên thiết bị của bạn
        </p>
      </div>

      {/* Summary Stat Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon" style={{ background: "rgba(126,184,255,0.18)" }}>
            <Icon icon={HeadphonesIcon} size={22} color="#7eb8ff" />
          </div>
          <div>
            <span className="analytics-kpi-label">Thời gian đã nghe</span>
            <strong className="analytics-kpi-val">{formattedTime}</strong>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon" style={{ background: "rgba(168,85,247,0.18)" }}>
            <Icon icon={MusicNote01Icon} size={22} color="#a855f7" />
          </div>
          <div>
            <span className="analytics-kpi-label">Tổng lượt phát</span>
            <strong className="analytics-kpi-val">{totalPlays} lượt</strong>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-icon" style={{ background: "rgba(239,68,68,0.18)" }}>
            <Icon icon={FavouriteIcon} size={22} color="#ef4444" />
          </div>
          <div>
            <span className="analytics-kpi-label">Bài hát yêu thích</span>
            <strong className="analytics-kpi-val">{likedTracks.length} bài</strong>
          </div>
        </div>
      </div>

      {/* Top Tracks */}
      <section className="home-section" style={{ marginTop: 28 }}>
        <div className="section-header">
          <h2 className="section-title">Top bài hát nghe nhiều nhất</h2>
        </div>

        {statsArray.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">Chưa có dữ liệu thống kê</p>
            <p className="empty-state__sub">Hãy phát một vài bài hát để Meikai tổng hợp bảng xếp hạng của riêng bạn</p>
          </div>
        ) : (
          <div className="songs-table">
            {statsArray.slice(0, 10).map((item, idx) => (
              <div
                key={item.track.video_id}
                className="song-row"
                onClick={() => playTrack(item.track)}
              >
                <div className="song-row__idx" style={{ fontWeight: 700, color: "#7eb8ff" }}>
                  #{idx + 1}
                </div>
                <img src={item.track.thumbnail_url} alt="" className="song-row__thumb" />
                <div className="song-row__meta">
                  <div className="song-row__title">{item.track.title}</div>
                  <div className="song-row__artist">{item.track.artist}</div>
                </div>
                <span className="badge">{item.playCount} plays</span>
                <Icon icon={PlayIcon} size={16} color="rgba(255,255,255,0.65)" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top Artists */}
      {topArtists.length > 0 && (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Nghệ sĩ bạn nghe nhiều nhất</h2>
          </div>
          <div className="analytics-artists-grid">
            {topArtists.map((ar) => (
              <div key={ar.name} className="analytics-artist-pill">
                {ar.thumb && <img src={ar.thumb} alt={ar.name} className="analytics-artist-avatar" />}
                <div style={{ minWidth: 0 }}>
                  <div className="analytics-artist-name">{ar.name}</div>
                  <div className="analytics-artist-count">{ar.count} lượt nghe</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
        Gần đây đã nghe {history.length} bài hát khác nhau. Toàn bộ dữ liệu được lưu cục bộ trên máy bạn.
      </p>
    </div>
  );
}
