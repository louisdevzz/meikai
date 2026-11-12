import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Track,
  LyricsData,
  VideoStats,
  LocalPlaylist,
  PlayStat,
  ChartPlaylistItem,
} from "../types/music";

export interface SponsorSegment {
  category: string;
  action: string;
  start: number;
  end: number;
}

export interface StreamMedia {
  audio_url: string;
  video_url?: string;
  duration_seconds: number;
}

export interface YoutubeAccount {
  name: string;
  handle?: string;
  avatar_url?: string;
  cookie: string;
}

export interface PlaylistTarget {
  kind: "remote" | "local";
  id: string;
  title?: string;
  subtitle?: string;
  coverUrl?: string;
}

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [6, 5, 4, 2, 1, 0, 0, 0, 1, 2],
  "Anime & J-Rock": [3, 2, 0, 1, 2, 4, 5, 4, 3, 2],
  "Vocal & Acoustic": [-2, -1, 0, 2, 4, 5, 4, 2, 1, 0],
  "Electronic / Phonk": [5, 4, 2, 0, -1, 1, 3, 4, 5, 4],
  "Late Night": [3, 2, 1, 0, 1, 2, 1, -1, -2, -3],
};

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: "none" | "one" | "all";
  queue: Track[];
  history: Track[];
  likedTracks: Track[];
  likedTrackIds: Set<string>;
  localPlaylists: LocalPlaylist[];
  userYtPlaylists: ChartPlaylistItem[];
  ytAccount: YoutubeAccount | null;
  playStats: Record<string, PlayStat>;
  totalListenSeconds: number;
  lyricsData: LyricsData | null;
  lyricsLoading: boolean;
  lyricOffset: number;
  videoStats: VideoStats | null;
  isNowPlayingOpen: boolean;
  isSidePanelOpen: boolean;
  isFloatingBarVisible: boolean;
  isVideoMode: boolean;
  isLoginModalOpen: boolean;
  sponsorNotice: string | null;
  sleepTimerSeconds: number | null;
  playbackRate: number;
  eqPreset: string;
  eqBands: number[];
  activePlaylistTarget: PlaylistTarget | null;
  playTrack: (track: Track, newQueue?: Track[]) => void;
  seedInitialQueue: (tracks: Track[]) => void;
  startRadio: (track: Track) => Promise<void>;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  createLocalPlaylist: (name: string) => LocalPlaylist;
  deleteLocalPlaylist: (id: string) => void;
  addTrackToLocalPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromLocalPlaylist: (playlistId: string, videoId: string) => void;
  setIsNowPlayingOpen: (open: boolean) => void;
  setIsSidePanelOpen: (open: boolean) => void;
  setIsFloatingBarVisible: (visible: boolean) => void;
  setIsVideoMode: (video: boolean) => void;
  setIsLoginModalOpen: (open: boolean) => void;
  setLyricOffset: (offset: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setPlaybackRate: (rate: number) => void;
  setEqPreset: (preset: string) => void;
  setEqBand: (index: number, value: number) => void;
  setActivePlaylistTarget: (target: PlaylistTarget | null) => void;
  openYouTubeLogin: () => Promise<void>;
  loginWithCookie: (cookie: string) => Promise<void>;
  logoutYouTube: () => Promise<void>;
  showNotice: (msg: string) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<"none" | "one" | "all">("none");
  const [queue, setQueue] = useState<Track[]>([]);

  const [history, setHistory] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem("meikai_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem("meikai_liked_tracks_v2");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [localPlaylists, setLocalPlaylists] = useState<LocalPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem("meikai_local_playlists");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [ytAccount, setYtAccount] = useState<YoutubeAccount | null>(null);
  const [userYtPlaylists, setUserYtPlaylists] = useState<ChartPlaylistItem[]>([]);

  const [playStats, setPlayStats] = useState<Record<string, PlayStat>>(() => {
    try {
      const saved = localStorage.getItem("meikai_play_stats");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [totalListenSeconds, setTotalListenSeconds] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("meikai_total_listen_secs") || "0");
    } catch {
      return 0;
    }
  });

  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState<boolean>(false);
  const [lyricOffset, setLyricOffset] = useState<number>(0);
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);

  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);
  const [isFloatingBarVisible, setIsFloatingBarVisible] = useState<boolean>(true);
  const [isVideoMode, setIsVideoMode] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [sponsorNotice, setSponsorNotice] = useState<string | null>(null);
  const [sleepTimerSeconds, setSleepTimerSeconds] = useState<number | null>(null);
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [eqPreset, setEqPresetState] = useState<string>("Flat");
  const [eqBands, setEqBands] = useState<number[]>(EQ_PRESETS["Flat"]);
  const [activePlaylistTarget, setActivePlaylistTarget] = useState<PlaylistTarget | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const segmentsRef = useRef<SponsorSegment[]>([]);
  const noticeTimerRef = useRef<any>(null);
  const streamRequestIdRef = useRef<number>(0);

  const likedTrackIds = new Set(likedTracks.map((t) => t.video_id));

  // Load saved YouTube account & listen for WebView login completion
  useEffect(() => {
    invoke<YoutubeAccount | null>("get_youtube_account")
      .then((acc) => {
        if (acc) {
          setYtAccount(acc);
          invoke<ChartPlaylistItem[]>("get_user_yt_playlists")
            .then((pls) => setUserYtPlaylists(pls || []))
            .catch(() => {});
        }
      })
      .catch(() => {});

    let unlisten: (() => void) | undefined;
    listen<YoutubeAccount>("yt-login-success", (event) => {
      setYtAccount(event.payload);
      setIsLoginModalOpen(false);
      showNotice(`Đã đăng nhập YouTube: ${event.payload.name}`);
      invoke<ChartPlaylistItem[]>("get_user_yt_playlists")
        .then((pls) => setUserYtPlaylists(pls || []))
        .catch(() => {});
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Persist user data
  useEffect(() => {
    try {
      localStorage.setItem("meikai_liked_tracks_v2", JSON.stringify(likedTracks));
    } catch {}
  }, [likedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem("meikai_history_v2", JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem("meikai_local_playlists", JSON.stringify(localPlaylists));
    } catch {}
  }, [localPlaylists]);

  useEffect(() => {
    try {
      localStorage.setItem("meikai_play_stats", JSON.stringify(playStats));
    } catch {}
  }, [playStats]);

  // Sync volume & playbackRate to HTML5 <audio>
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Fetch SponsorBlock + Real LRCLIB Synced Lyrics + ReturnYouTubeDislike on track change
  useEffect(() => {
    if (!currentTrack) return;
    segmentsRef.current = [];
    setLyricsData(null);
    setLyricsLoading(true);
    setVideoStats(null);
    setLyricOffset(0);

    invoke<SponsorSegment[]>("get_segments", { videoId: currentTrack.video_id })
      .then((segs) => {
        if (segs && segs.length > 0) segmentsRef.current = segs;
      })
      .catch(() => {});

    invoke<LyricsData>("get_lyrics", {
      title: currentTrack.title,
      artist: currentTrack.artist,
    })
      .then((res) => setLyricsData(res))
      .catch(() => setLyricsData(null))
      .finally(() => setLyricsLoading(false));

    invoke<VideoStats>("get_video_stats", { videoId: currentTrack.video_id })
      .then((stats) => setVideoStats(stats))
      .catch(() => {});
  }, [currentTrack?.video_id]);

  // 1-second timer for Listening Time Analytics & Sleep Timer countdown
  useEffect(() => {
    const secInterval = setInterval(() => {
      if (isPlaying) {
        setTotalListenSeconds((prev) => {
          const next = prev + 1;
          if (next % 5 === 0) {
            try {
              localStorage.setItem("meikai_total_listen_secs", String(next));
            } catch {}
          }
          return next;
        });
      }

      setSleepTimerSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          audioRef.current?.pause();
          videoRef.current?.pause();
          setIsPlaying(false);
          showNotice("Hẹn giờ tắt nhạc đã kích hoạt — Đã tạm dừng phát");
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(secInterval);
  }, [isPlaying]);

  const showNotice = (msg: string) => {
    setSponsorNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSponsorNotice(null);
    }, 4000);
  };

  const recordPlayStat = (track: Track) => {
    setPlayStats((prev) => {
      const existing = prev[track.video_id];
      return {
        ...prev,
        [track.video_id]: {
          track,
          playCount: (existing?.playCount || 0) + 1,
          lastPlayedAt: Date.now(),
        },
      };
    });
  };

  const playTrack = async (track: Track, newQueue?: Track[]) => {
    const reqId = ++streamRequestIdRef.current;

    const enriched: Track = {
      ...track,
      accent_color: track.accent_color || "#8eb4ff",
      gradient_bg:
        track.gradient_bg ||
        "linear-gradient(160deg, #1b223d 0%, #101424 45%, #07080d 100%)",
    };

    setCurrentTrack(enriched);
    setCurrentTime(0);
    setDuration(enriched.duration_seconds || 240);
    setIsBuffering(true);
    setIsPlaying(true);
    setIsFloatingBarVisible(true);
    setIsSidePanelOpen(true);
    setActiveVideoUrl(null);
    setHistory((prev) => [enriched, ...prev.filter((t) => t.video_id !== enriched.video_id).slice(0, 49)]);
    recordPlayStat(enriched);

    if (newQueue) {
      setQueue(newQueue);
    } else if (!queue.some((t) => t.video_id === enriched.video_id)) {
      setQueue([enriched]);
      invoke<Track[]>("get_radio_next", {
        videoId: enriched.video_id,
        title: enriched.title,
        artist: enriched.artist,
      })
        .then((radioTracks) => {
          if (radioTracks && radioTracks.length > 0) setQueue(radioTracks);
        })
        .catch(() => {});
    }

    const attemptAudioPlay = async (preferFallback: boolean) => {
      const media = await invoke<StreamMedia>("get_stream_media", {
        videoId: enriched.video_id,
        title: enriched.title,
        artist: enriched.artist,
        preferFallback,
      });
      if (reqId !== streamRequestIdRef.current) return;

      if (media.duration_seconds > 0) setDuration(media.duration_seconds);
      if (media.video_url) setActiveVideoUrl(media.video_url);

      if (audioRef.current) {
        audioRef.current.src = media.audio_url;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.load();
        await audioRef.current.play();
        setIsPlaying(true);
      }
    };

    try {
      await attemptAudioPlay(false);
    } catch (err: any) {
      if (reqId !== streamRequestIdRef.current) return;
      // If direct YouTube stream failed on macOS WebKit, seamlessly fall back to SoundCloud stream match
      if (!enriched.video_id.includes(":")) {
        try {
          await attemptAudioPlay(true);
          return;
        } catch (fallbackErr) {
          console.error("Fallback stream also failed:", fallbackErr);
        }
      }
      console.error("Failed to play stream:", err);
      setIsPlaying(false);
      showNotice(`Không thể tải luồng phát bài này: ${err}`);
    } finally {
      if (reqId === streamRequestIdRef.current) {
        setIsBuffering(false);
      }
    }
  };

  const startRadio = async (track: Track) => {
    showNotice(`Đang tạo Radio từ "${track.title}"...`);
    try {
      const radioTracks = await invoke<Track[]>("get_radio_next", {
        videoId: track.video_id,
        title: track.title,
        artist: track.artist,
      });
      if (radioTracks && radioTracks.length > 0) {
        playTrack(radioTracks[0], radioTracks);
        return;
      }
    } catch {}
    playTrack(track);
  };

  const seedInitialQueue = (tracks: Track[]) => {
    if (!tracks || tracks.length === 0) return;
    setCurrentTrack((prev) => {
      if (prev) return prev;
      if (tracks[0].duration_seconds) setDuration(tracks[0].duration_seconds);
      return tracks[0];
    });
    setQueue((prev) => (prev.length === 0 ? tracks : prev));
  };

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (!audioRef.current.src && currentTrack) {
      await playTrack(currentTrack, queue);
      return;
    }
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play();
        if (videoRef.current && isVideoMode) {
          videoRef.current.currentTime = audioRef.current.currentTime;
          videoRef.current.play().catch(() => {});
        }
        setIsPlaying(true);
      } catch {}
    } else {
      audioRef.current.pause();
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const seek = (seconds: number) => {
    setCurrentTime(seconds);
    if (audioRef.current && !isNaN(seconds)) {
      audioRef.current.currentTime = seconds;
    }
    if (videoRef.current && isVideoMode && !isNaN(seconds)) {
      videoRef.current.currentTime = seconds;
    }
  };

  const setVolume = (val: number) => {
    const v = Math.max(0, Math.min(1, val));
    setVolumeState(v);
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (volume === 0) setVolumeState(0.5);
    } else {
      setIsMuted(true);
    }
  };

  const nextTrack = () => {
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.video_id === currentTrack?.video_id);
    let nextIndex = currentIndex + 1;

    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (repeatMode === "all") nextIndex = 0;
      else return;
    }

    const next = queue[nextIndex];
    if (next) playTrack(next, queue);
  };

  const prevTrack = () => {
    if (currentTime > 4) {
      seek(0);
      return;
    }
    const currentIndex = queue.findIndex((t) => t.video_id === currentTrack?.video_id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    const prev = queue[prevIndex];
    if (prev) playTrack(prev, queue);
  };

  const toggleShuffle = () => setShuffle(!shuffle);

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev === "none" ? "all" : prev === "all" ? "one" : "none"));
  };

  const toggleLike = (track: Track) => {
    setLikedTracks((prev) => {
      const exists = prev.some((t) => t.video_id === track.video_id);
      if (exists) return prev.filter((t) => t.video_id !== track.video_id);
      showNotice(`Đã thêm "${track.title}" vào Favorite`);
      return [track, ...prev];
    });
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
    showNotice(`Đã thêm "${track.title}" vào hàng đợi`);
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const createLocalPlaylist = (name: string): LocalPlaylist => {
    const newPl: LocalPlaylist = {
      id: `local-${Date.now()}`,
      name: name.trim() || "Untitled Playlist",
      createdAt: Date.now(),
      tracks: [],
    };
    setLocalPlaylists((prev) => [newPl, ...prev]);
    showNotice(`Đã tạo playlist "${newPl.name}"`);
    return newPl;
  };

  const deleteLocalPlaylist = (id: string) => {
    setLocalPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  const addTrackToLocalPlaylist = (playlistId: string, track: Track) => {
    setLocalPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.video_id === track.video_id)) return pl;
        return { ...pl, tracks: [...pl.tracks, track] };
      })
    );
    showNotice(`Đã thêm "${track.title}" vào playlist`);
  };

  const removeTrackFromLocalPlaylist = (playlistId: string, videoId: string) => {
    setLocalPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return { ...pl, tracks: pl.tracks.filter((t) => t.video_id !== videoId) };
      })
    );
  };

  const setSleepTimer = (minutes: number | null) => {
    if (minutes === null) {
      setSleepTimerSeconds(null);
      showNotice("Đã tắt hẹn giờ ngủ");
    } else {
      setSleepTimerSeconds(minutes * 60);
      showNotice(`Sẽ tạm dừng nhạc sau ${minutes} phút`);
    }
  };

  const setPlaybackRate = (rate: number) => {
    setPlaybackRateState(rate);
    showNotice(`Tốc độ phát: ${rate}x`);
  };

  const setEqPreset = (preset: string) => {
    setEqPresetState(preset);
    if (EQ_PRESETS[preset]) setEqBands([...EQ_PRESETS[preset]]);
  };

  const setEqBand = (index: number, value: number) => {
    setEqPresetState("Custom");
    setEqBands((prev) => prev.map((b, i) => (i === index ? value : b)));
  };

  const openYouTubeLogin = async () => {
    try {
      await invoke("open_youtube_login_window");
    } catch (e: any) {
      showNotice(`Không thể mở cửa sổ đăng nhập: ${e}`);
    }
  };

  const loginWithCookie = async (cookie: string) => {
    const acc = await invoke<YoutubeAccount>("login_with_cookie", { cookie });
    setYtAccount(acc);
    setIsLoginModalOpen(false);
    showNotice(`Đã đăng nhập YouTube: ${acc.name}`);
  };

  const logoutYouTube = async () => {
    await invoke("logout_youtube");
    setYtAccount(null);
    setUserYtPlaylists([]);
    showNotice("Đã đăng xuất tài khoản YouTube");
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isBuffering,
        currentTime,
        duration,
        progress,
        volume,
        isMuted,
        shuffle,
        repeatMode,
        queue,
        history,
        likedTracks,
        likedTrackIds,
        localPlaylists,
        userYtPlaylists,
        ytAccount,
        playStats,
        totalListenSeconds,
        lyricsData,
        lyricsLoading,
        lyricOffset,
        videoStats,
        isNowPlayingOpen,
        isSidePanelOpen,
        isFloatingBarVisible,
        isVideoMode,
        isLoginModalOpen,
        sponsorNotice,
        sleepTimerSeconds,
        playbackRate,
        eqPreset,
        eqBands,
        activePlaylistTarget,
        playTrack,
        seedInitialQueue,
        startRadio,
        togglePlay,
        seek,
        setVolume,
        toggleMute,
        nextTrack,
        prevTrack,
        toggleShuffle,
        toggleRepeat,
        toggleLike,
        addToQueue,
        removeFromQueue,
        createLocalPlaylist,
        deleteLocalPlaylist,
        addTrackToLocalPlaylist,
        removeTrackFromLocalPlaylist,
        setIsNowPlayingOpen,
        setIsSidePanelOpen,
        setIsFloatingBarVisible,
        setIsVideoMode,
        setIsLoginModalOpen,
        setLyricOffset,
        setSleepTimer,
        setPlaybackRate,
        setEqPreset,
        setEqBand,
        setActivePlaylistTarget,
        openYouTubeLogin,
        loginWithCookie,
        logoutYouTube,
        showNotice,
      }}
    >
      {children}

      {/* Real Native HTML5 Audio Engine (Direct M4A Stream from RustyPipe) */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const curr = audioRef.current.currentTime;
          setCurrentTime(curr);

          for (const seg of segmentsRef.current) {
            if (curr >= seg.start && curr < seg.end - 0.3) {
              audioRef.current.currentTime = seg.end;
              const skippedSec = Math.round(seg.end - seg.start);
              showNotice(`SponsorBlock: Đã bỏ qua đoạn ${seg.category} (${skippedSec}s)`);
              break;
            }
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (repeatMode === "one" && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          } else {
            nextTrack();
          }
        }}
      />

      {/* Floating Video Player when Video Mode is toggled */}
      {isVideoMode && activeVideoUrl && (
        <div
          style={{
            position: "fixed",
            top: 52,
            right: 22,
            width: 310,
            height: 174,
            zIndex: 48,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 16px 40px rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "#000",
          }}
        >
          <video
            ref={videoRef}
            src={activeVideoUrl}
            muted
            autoPlay={isPlaying}
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onLoadedMetadata={() => {
              if (videoRef.current && audioRef.current) {
                videoRef.current.currentTime = audioRef.current.currentTime;
                if (isPlaying) videoRef.current.play().catch(() => {});
              }
            }}
          />
        </div>
      )}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
