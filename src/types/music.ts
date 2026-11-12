export interface Track {
  video_id: string;
  title: string;
  artist: string;
  album?: string;
  duration_seconds?: number;
  duration_text?: string;
  thumbnail_url?: string;
  accent_color?: string;
  gradient_bg?: string;
}

export interface Playlist {
  id: string;
  browse_id?: string;
  name: string;
  subtitle?: string;
  description: string;
  cover_url: string;
  badge_gradient?: string;
  badge_title?: string;
  badge_sub?: string;
  track_count: number;
  tracks: Track[];
}

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  tracks: Track[];
}

export interface PlayStat {
  track: Track;
  playCount: number;
  lastPlayedAt: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  source: string;
}

export interface VideoStats {
  likes: number;
  dislikes: number;
  view_count: number;
  rating: number;
}

export interface ChartPlaylistItem {
  browse_id: string;
  title: string;
  subtitle: string;
  thumbnail_url?: string;
}

export interface ChartArtistItem {
  browse_id: string;
  name: string;
  subscribers: string;
  thumbnail_url?: string;
}

export interface ChartsPayload {
  playlists: ChartPlaylistItem[];
  artists: ChartArtistItem[];
}

export interface PlaylistDetails {
  browse_id: string;
  title: string;
  subtitle: string;
  thumbnail_url?: string;
  tracks: Track[];
}

export interface MusicVideo {
  video_id: string;
  title: string;
  artist: string;
  views: string;
  duration: string;
  thumbnail_url: string;
}

export interface Artist {
  id: string;
  name: string;
  avatar_url: string;
  subscribers?: string;
}

export interface MoodFilter {
  id: string;
  label: string;
  icon?: any;
  query?: string;
}

export interface HomeFeedPayload {
  quick_picks: Track[];
  featured_playlists: ChartPlaylistItem[];
  music_videos: Track[];
  top_artists: ChartArtistItem[];
}

export interface LiveMoodItem {
  id: string;
  name: string;
  is_mood: boolean;
  color_hex: string;
}

export interface MoodDetailsPayload {
  id: string;
  name: string;
  playlists: ChartPlaylistItem[];
  tracks: Track[];
}
