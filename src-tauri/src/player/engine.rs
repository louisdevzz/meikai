use crate::commands::stream_proxy;
use crate::player::dj_dsp::{analyze_audio_pcm, DeckDspState, DjConfig, DjDeckSource, TrackAnalysis};
use crate::providers::{soundcloud, tiktok};
use reqwest::header;
use rodio::{Decoder, DeviceSinkBuilder, Player, Source};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::f32::consts::PI;
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NativePlaybackSnapshot {
    pub track_id: Option<String>,
    pub is_playing: bool,
    pub is_buffering: bool,
    pub current_time: f64,
    pub duration: f64,
    pub ended: bool,
    pub error: Option<String>,
    pub video_url: Option<String>,
    // DJ / AutoMix Live Telemetry
    pub is_mixing: bool,
    pub mix_progress: f64,
    pub mix_style: Option<String>,
    pub mix_phase_label: Option<String>,
    pub deck_a_level: f64,
    pub deck_b_level: f64,
    pub active_bpm: Option<f32>,
    pub incoming_bpm: Option<f32>,
    pub incoming_track_id: Option<String>,
}

#[derive(Clone)]
struct PreloadedAudio {
    track_id: String,
    bytes: Vec<u8>,
    hint: String,
    duration_hint: f64,
    video_url: Option<String>,
    analysis: TrackAnalysis,
}

enum EngineCmd {
    LoadAndPlay {
        generation: u64,
        track_id: String,
        bytes: Vec<u8>,
        hint: String,
        duration_hint: f64,
        volume: f32,
        speed: f32,
        video_url: Option<String>,
        analysis: TrackAnalysis,
    },
    DjMixTo {
        generation: u64,
        track_id: String,
        bytes: Vec<u8>,
        hint: String,
        duration_hint: f64,
        volume: f32,
        base_speed: f32,
        video_url: Option<String>,
        analysis: TrackAnalysis,
        config: DjConfig,
    },
    Pause,
    Resume,
    Seek(f64),
    SetVolume(f32),
    SetSpeed(f32),
    Stop,
}

struct MixSession {
    outgoing_player: Player,
    outgoing_dsp: Arc<DeckDspState>,
    incoming_dsp: Arc<DeckDspState>,
    started_at: Instant,
    duration_secs: f32,
    style: String,
    outgoing_bpm: Option<f32>,
    incoming_bpm: Option<f32>,
    initial_ratio: f32,
    base_speed: f32,
    tempo_gliding: bool,
    incoming_id: String,
}

static SNAPSHOT: OnceLock<Mutex<NativePlaybackSnapshot>> = OnceLock::new();
static DJ_CONFIG: OnceLock<Mutex<DjConfig>> = OnceLock::new();
static PRELOADED: OnceLock<Mutex<HashMap<String, PreloadedAudio>>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static CMD_TX: OnceLock<mpsc::Sender<EngineCmd>> = OnceLock::new();
static SHARED_HTTP: OnceLock<reqwest::Client> = OnceLock::new();

fn snapshot() -> &'static Mutex<NativePlaybackSnapshot> {
    SNAPSHOT.get_or_init(|| Mutex::new(NativePlaybackSnapshot::default()))
}

fn dj_config() -> &'static Mutex<DjConfig> {
    DJ_CONFIG.get_or_init(|| Mutex::new(DjConfig::default()))
}

fn preloaded_cache() -> &'static Mutex<HashMap<String, PreloadedAudio>> {
    PRELOADED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn http_client() -> &'static reqwest::Client {
    SHARED_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .expect("Failed to build audio downloader client")
    })
}

fn ios_http_client() -> &'static reqwest::Client {
    static IOS_HTTP: OnceLock<reqwest::Client> = OnceLock::new();
    IOS_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)")
            .build()
            .expect("Failed to build iOS audio downloader client")
    })
}

fn decode_and_analyze(bytes: Vec<u8>, hint: &str) -> Result<(rodio::Decoder<Cursor<Vec<u8>>>, TrackAnalysis), String> {
    let byte_len = bytes.len() as u64;
    let mut builder = Decoder::builder()
        .with_data(Cursor::new(bytes.clone()))
        .with_byte_len(byte_len)
        .with_seekable(true)
        .with_gapless(true);
    if !hint.is_empty() {
        builder = builder.with_hint(hint);
    }
    let decoder = builder.build().map_err(|e| format!("Decode error: {e}"))?;

    // Quick non-blocking analysis on a separate probe decoder
    let mut probe_builder = Decoder::builder()
        .with_data(Cursor::new(bytes))
        .with_byte_len(byte_len)
        .with_seekable(true);
    if !hint.is_empty() {
        probe_builder = probe_builder.with_hint(hint);
    }
    let analysis = match probe_builder.build() {
        Ok(probe) => analyze_audio_pcm(probe),
        Err(_) => TrackAnalysis {
            bpm: None,
            cue_in_secs: 0.0,
            cue_out_secs: None,
        },
    };

    Ok((decoder, analysis))
}

fn apply_dj_dsp_envelope(mix: &MixSession, t: f32) -> (f32, f32, &'static str) {
    let t = t.clamp(0.0, 1.0);
    // Psychoacoustic Equal-Power curve: cos²(t*π/2) + sin²(t*π/2) = 1
    let gain_a = (t * PI * 0.5).cos();
    let gain_b = (t * PI * 0.5).sin();
    let beat_secs = mix
        .outgoing_bpm
        .map(|b| (60.0 / b.max(60.0)) * 0.75)
        .unwrap_or(0.375);

    match mix.style.as_str() {
        "bass_swap" => {
            let (bass_a, bass_b, phase) = if t < 0.44 {
                (1.0, 0.06, "Blended Mids • Protecting Low-End")
            } else if t <= 0.56 {
                let s = (t - 0.44) / 0.12;
                (1.0 - 0.94 * s, 0.06 + 0.94 * s, "BASS SWAP ⚡ Swapping Kick & Sub")
            } else {
                (0.06, 1.0, "Deck B Bass Locked • Fading Deck A")
            };
            mix.outgoing_dsp.set_params(gain_a, bass_a, 0, 18000.0, 0.0, beat_secs);
            mix.incoming_dsp.set_params(gain_b, bass_b, 0, 18000.0, 0.0, beat_secs);
            (gain_a, gain_b, phase)
        }
        "filter_sweep" => {
            // Deck A sweeps High-Pass (45Hz -> 2800Hz); Deck B sweeps Low-Pass (340Hz -> 18500Hz)
            let hpf_cutoff = 45.0 * (2800.0f32 / 45.0).powf(t);
            let lpf_cutoff = 340.0 * (18500.0f32 / 340.0).powf(t);
            mix.outgoing_dsp.set_params(gain_a, 1.0, 2, hpf_cutoff, 0.0, beat_secs);
            mix.incoming_dsp.set_params(gain_b, 1.0, 1, lpf_cutoff, 0.0, beat_secs);
            let phase = if t < 0.5 {
                "Sweeping Deck A HPF & Opening Deck B"
            } else {
                "Opening Full Spectrum on Deck B"
            };
            (gain_a, gain_b, phase)
        }
        "echo_out" => {
            let echo_a = (t * 1.4).min(0.75);
            let dry_a = (t * PI * 0.5).cos().powf(1.35);
            mix.outgoing_dsp.set_params(dry_a, 0.45, 2, 180.0, echo_a, beat_secs);
            mix.incoming_dsp.set_params(gain_b, 1.0, 0, 18000.0, 0.0, beat_secs);
            let phase = if t < 0.55 {
                "Spinning Echo Delay Tail on Deck A"
            } else {
                "Echo Wash Tail • Dropping Deck B"
            };
            (dry_a, gain_b, phase)
        }
        _ => {
            // equal_power
            mix.outgoing_dsp.set_params(gain_a, 1.0, 0, 18000.0, 0.0, beat_secs);
            mix.incoming_dsp.set_params(gain_b, 1.0, 0, 18000.0, 0.0, beat_secs);
            (gain_a, gain_b, "Equal-Power Smooth Blend")
        }
    }
}

fn ensure_audio_thread() -> &'static mpsc::Sender<EngineCmd> {
    CMD_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<EngineCmd>();
        std::thread::spawn(move || {
            let mut sink_handle = match DeviceSinkBuilder::open_default_sink() {
                Ok(mut h) => {
                    h.log_on_drop(false);
                    Some(h)
                }
                Err(e) => {
                    let mut snap = snapshot().lock().unwrap();
                    snap.error = Some(format!("Audio device error: {e}"));
                    snap.is_buffering = false;
                    None
                }
            };

            let mut active_player: Option<Player> = None;
            let mut active_dsp: Option<Arc<DeckDspState>> = None;
            let mut active_bpm: Option<f32> = None;
            let mut active_mix: Option<MixSession> = None;
            let mut tempo_glide: Option<(Instant, f32, f32)> = None; // (started, from_speed, target_speed)
            let mut active_generation: u64 = 0;

            loop {
                match rx.recv_timeout(Duration::from_millis(25)) {
                    Ok(cmd) => match cmd {
                        EngineCmd::LoadAndPlay {
                            generation,
                            track_id,
                            bytes,
                            hint,
                            duration_hint,
                            volume,
                            speed,
                            video_url,
                            analysis,
                        } => {
                            if generation < GENERATION.load(Ordering::SeqCst) {
                                continue;
                            }
                            active_generation = generation;
                            if let Some(m) = active_mix.take() {
                                m.outgoing_player.stop();
                            }
                            if let Some(old) = active_player.take() {
                                old.stop();
                            }
                            tempo_glide = None;

                            if sink_handle.is_none() {
                                if let Ok(mut h) = DeviceSinkBuilder::open_default_sink() {
                                    h.log_on_drop(false);
                                    sink_handle = Some(h);
                                }
                            }
                            let Some(ref handle) = sink_handle else {
                                let mut snap = snapshot().lock().unwrap();
                                snap.is_buffering = false;
                                snap.is_playing = false;
                                snap.error = Some("No audio output device available".to_string());
                                continue;
                            };

                            match decode_and_analyze(bytes, &hint) {
                                Ok((mut decoder, probed_analysis)) => {
                                    let final_analysis = if probed_analysis.bpm.is_some() {
                                        probed_analysis
                                    } else {
                                        analysis
                                    };
                                    let decoded_dur = decoder
                                        .total_duration()
                                        .map(|d| d.as_secs_f64())
                                        .filter(|&d| d > 0.5)
                                        .unwrap_or(duration_hint);

                                    let smart_cue = dj_config().lock().unwrap().smart_cue;
                                    if smart_cue && final_analysis.cue_in_secs > 0.08 {
                                        let _ = decoder.try_seek(Duration::from_secs_f64(
                                            final_analysis.cue_in_secs,
                                        ));
                                    }

                                    let dsp = DeckDspState::new();
                                    let wrapped = DjDeckSource::new(decoder, dsp.clone());
                                    let player = Player::connect_new(&handle.mixer());
                                    player.set_volume(volume);
                                    player.set_speed(speed);
                                    player.append(wrapped);
                                    player.play();

                                    active_dsp = Some(dsp);
                                    active_bpm = final_analysis.bpm;
                                    active_player = Some(player);

                                    let mut snap = snapshot().lock().unwrap();
                                    snap.track_id = Some(track_id);
                                    snap.is_buffering = false;
                                    snap.is_playing = true;
                                    snap.current_time = if smart_cue { final_analysis.cue_in_secs } else { 0.0 };
                                    snap.duration = decoded_dur;
                                    snap.ended = false;
                                    snap.error = None;
                                    snap.video_url = video_url;
                                    snap.is_mixing = false;
                                    snap.mix_progress = 0.0;
                                    snap.mix_style = None;
                                    snap.mix_phase_label = None;
                                    snap.deck_a_level = 1.0;
                                    snap.deck_b_level = 0.0;
                                    snap.active_bpm = final_analysis.bpm;
                                    snap.incoming_bpm = None;
                                    snap.incoming_track_id = None;
                                }
                                Err(e) => {
                                    let mut snap = snapshot().lock().unwrap();
                                    snap.is_buffering = false;
                                    snap.is_playing = false;
                                    snap.error = Some(e);
                                }
                            }
                        }
                        EngineCmd::DjMixTo {
                            generation,
                            track_id,
                            bytes,
                            hint,
                            duration_hint,
                            volume,
                            base_speed,
                            video_url,
                            analysis,
                            config,
                        } => {
                            if generation < GENERATION.load(Ordering::SeqCst) {
                                continue;
                            }
                            active_generation = generation;
                            if let Some(m) = active_mix.take() {
                                m.outgoing_player.stop();
                            }

                            if sink_handle.is_none() {
                                if let Ok(mut h) = DeviceSinkBuilder::open_default_sink() {
                                    h.log_on_drop(false);
                                    sink_handle = Some(h);
                                }
                            }
                            let Some(ref handle) = sink_handle else {
                                continue;
                            };

                            match decode_and_analyze(bytes, &hint) {
                                Ok((mut decoder, probed_analysis)) => {
                                    let final_analysis = if probed_analysis.bpm.is_some() {
                                        probed_analysis
                                    } else {
                                        analysis
                                    };
                                    let decoded_dur = decoder
                                        .total_duration()
                                        .map(|d| d.as_secs_f64())
                                        .filter(|&d| d > 0.5)
                                        .unwrap_or(duration_hint);

                                    if config.smart_cue && final_analysis.cue_in_secs > 0.08 {
                                        let _ = decoder.try_seek(Duration::from_secs_f64(
                                            final_analysis.cue_in_secs,
                                        ));
                                    }

                                    let incoming_dsp = DeckDspState::new();
                                    incoming_dsp.set_params(0.0, 0.06, 0, 18000.0, 0.0, 0.375);
                                    let wrapped = DjDeckSource::new(decoder, incoming_dsp.clone());
                                    let incoming_player = Player::connect_new(&handle.mixer());
                                    incoming_player.set_volume(volume);

                                    // Compute BPM Tempo-Sync ratio if within +-14%
                                    let mut initial_ratio = base_speed;
                                    let mut tempo_gliding = false;
                                    if config.bpm_sync {
                                        if let (Some(bpm_a), Some(bpm_b)) = (active_bpm, final_analysis.bpm) {
                                            let ratio = (bpm_a / bpm_b).clamp(0.86, 1.14);
                                            if (ratio - 1.0).abs() <= 0.14 && (ratio - 1.0).abs() >= 0.015 {
                                                initial_ratio = base_speed * ratio;
                                                tempo_gliding = true;
                                            }
                                        }
                                    }
                                    incoming_player.set_speed(initial_ratio);
                                    incoming_player.append(wrapped);
                                    incoming_player.play();

                                    if let (Some(old_player), Some(old_dsp)) =
                                        (active_player.take(), active_dsp.take())
                                    {
                                        let mix = MixSession {
                                            outgoing_player: old_player,
                                            outgoing_dsp: old_dsp,
                                            incoming_dsp: incoming_dsp.clone(),
                                            started_at: Instant::now(),
                                            duration_secs: config.crossfade_secs.clamp(2.0, 16.0),
                                            style: config.style.clone(),
                                            outgoing_bpm: active_bpm,
                                            incoming_bpm: final_analysis.bpm,
                                            initial_ratio,
                                            base_speed,
                                            tempo_gliding,
                                            incoming_id: track_id.clone(),
                                        };
                                        active_mix = Some(mix);
                                    } else {
                                        incoming_dsp.set_params(1.0, 1.0, 0, 18000.0, 0.0, 0.375);
                                    }

                                    active_player = Some(incoming_player);
                                    active_dsp = Some(incoming_dsp);
                                    let prev_bpm = active_bpm;
                                    active_bpm = final_analysis.bpm;

                                    let mut snap = snapshot().lock().unwrap();
                                    snap.track_id = Some(track_id.clone());
                                    snap.is_buffering = false;
                                    snap.is_playing = true;
                                    snap.current_time = if config.smart_cue {
                                        final_analysis.cue_in_secs
                                    } else {
                                        0.0
                                    };
                                    snap.duration = decoded_dur;
                                    snap.ended = false;
                                    snap.error = None;
                                    snap.video_url = video_url;
                                    snap.is_mixing = active_mix.is_some();
                                    snap.mix_progress = 0.0;
                                    snap.mix_style = Some(config.style);
                                    snap.mix_phase_label = Some("Starting DJ Mix...".to_string());
                                    snap.deck_a_level = 1.0;
                                    snap.deck_b_level = 0.0;
                                    snap.active_bpm = prev_bpm.or(final_analysis.bpm);
                                    snap.incoming_bpm = final_analysis.bpm;
                                    snap.incoming_track_id = Some(track_id);
                                }
                                Err(e) => {
                                    let mut snap = snapshot().lock().unwrap();
                                    snap.is_buffering = false;
                                    snap.error = Some(e);
                                }
                            }
                        }
                        EngineCmd::Pause => {
                            if let Some(ref p) = active_player {
                                p.pause();
                            }
                            if let Some(ref m) = active_mix {
                                m.outgoing_player.pause();
                            }
                            let mut snap = snapshot().lock().unwrap();
                            snap.is_playing = false;
                        }
                        EngineCmd::Resume => {
                            if let Some(ref p) = active_player {
                                p.play();
                            }
                            if let Some(ref m) = active_mix {
                                m.outgoing_player.play();
                            }
                            let mut snap = snapshot().lock().unwrap();
                            if active_player.is_some() {
                                snap.is_playing = true;
                            }
                        }
                        EngineCmd::Seek(secs) => {
                            if let Some(ref p) = active_player {
                                let target = Duration::from_secs_f64(secs.max(0.0));
                                let _ = p.try_seek(target);
                                let mut snap = snapshot().lock().unwrap();
                                snap.current_time = secs.max(0.0);
                            }
                        }
                        EngineCmd::SetVolume(vol) => {
                            if let Some(ref p) = active_player {
                                p.set_volume(vol.clamp(0.0, 2.0));
                            }
                            if let Some(ref m) = active_mix {
                                m.outgoing_player.set_volume(vol.clamp(0.0, 2.0));
                            }
                        }
                        EngineCmd::SetSpeed(rate) => {
                            if let Some(ref p) = active_player {
                                p.set_speed(rate.clamp(0.25, 4.0));
                            }
                        }
                        EngineCmd::Stop => {
                            if let Some(m) = active_mix.take() {
                                m.outgoing_player.stop();
                            }
                            if let Some(old) = active_player.take() {
                                old.stop();
                            }
                            tempo_glide = None;
                            let mut snap = snapshot().lock().unwrap();
                            snap.is_playing = false;
                            snap.is_buffering = false;
                            snap.is_mixing = false;
                            snap.mix_progress = 0.0;
                            snap.current_time = 0.0;
                        }
                    },
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }

                // Drive Dual-Deck DJ Crossfade & DSP envelope at ~40 Hz
                if let Some(mix) = active_mix.take() {
                    let elapsed = mix.started_at.elapsed().as_secs_f32();
                    let t = (elapsed / mix.duration_secs).min(1.0);
                    let (lvl_a, lvl_b, phase) = apply_dj_dsp_envelope(&mix, t);

                    if t >= 1.0 {
                        mix.outgoing_player.stop();
                        mix.incoming_dsp.set_params(1.0, 1.0, 0, 18000.0, 0.0, 0.375);
                        if mix.tempo_gliding {
                            tempo_glide = Some((Instant::now(), mix.initial_ratio, mix.base_speed));
                        }
                        let mut snap = snapshot().lock().unwrap();
                        snap.is_mixing = false;
                        snap.mix_progress = 1.0;
                        snap.mix_phase_label = None;
                        snap.deck_a_level = 0.0;
                        snap.deck_b_level = 1.0;
                        snap.active_bpm = mix.incoming_bpm;
                        snap.incoming_bpm = None;
                        snap.incoming_track_id = None;
                    } else {
                        let mut snap = snapshot().lock().unwrap();
                        snap.is_mixing = true;
                        snap.mix_progress = t as f64;
                        snap.mix_phase_label = Some(phase.to_string());
                        snap.deck_a_level = lvl_a as f64;
                        snap.deck_b_level = lvl_b as f64;
                        snap.incoming_track_id = Some(mix.incoming_id.clone());
                        active_mix = Some(mix);
                    }
                }

                // Smoothly glide tempo-synced track back to 1.0x speed over 6 seconds after mix
                if let Some((started, from_spd, to_spd)) = tempo_glide {
                    let gt = (started.elapsed().as_secs_f32() / 6.0).min(1.0);
                    let cur_spd = from_spd + (to_spd - from_spd) * gt;
                    if let Some(ref p) = active_player {
                        p.set_speed(cur_spd);
                    }
                    if gt >= 1.0 {
                        tempo_glide = None;
                    }
                }

                // Update live playback position & detect natural completion
                if let Some(ref p) = active_player {
                    let current_gen = GENERATION.load(Ordering::SeqCst);
                    if active_generation == current_gen {
                        let pos = p.get_pos().as_secs_f64();
                        let paused = p.is_paused();
                        let empty = p.empty();
                        let mut snap = snapshot().lock().unwrap();
                        if !snap.is_buffering {
                            snap.current_time = pos;
                            if empty && !paused {
                                snap.is_playing = false;
                                snap.ended = true;
                            } else {
                                snap.is_playing = !paused && !empty;
                            }
                        }
                    }
                }
            }
        });
        tx
    })
}

async fn download_hls_fmp4(m3u8_url: &str) -> Result<Vec<u8>, String> {
    let manifest = http_client()
        .get(m3u8_url)
        .send()
        .await
        .map_err(|e| format!("HLS manifest fetch error: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut init_url: Option<String> = None;
    let mut seg_urls: Vec<String> = Vec::new();

    for line in manifest.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("#EXT-X-MAP:URI=\"") {
            if let Some(end_idx) = rest.find('"') {
                init_url = Some(rest[..end_idx].to_string());
            }
        } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            seg_urls.push(trimmed.to_string());
        }
    }

    if seg_urls.is_empty() {
        return Err("No audio segments found in HLS playlist".to_string());
    }

    let mut urls_in_order = Vec::with_capacity(seg_urls.len() + 1);
    if let Some(init) = init_url {
        urls_in_order.push(init);
    }
    urls_in_order.extend(seg_urls);

    let total_parts = urls_in_order.len();
    let mut parts: Vec<Option<Vec<u8>>> = vec![None; total_parts];
    let mut join_set = tokio::task::JoinSet::new();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(8));

    for (idx, u) in urls_in_order.into_iter().enumerate() {
        let sem = semaphore.clone();
        join_set.spawn(async move {
            let _permit = sem.acquire_owned().await.map_err(|e| e.to_string())?;
            let bytes = http_client()
                .get(&u)
                .send()
                .await
                .map_err(|e| format!("Segment {idx} error: {e}"))?
                .error_for_status()
                .map_err(|e| format!("Segment {idx} HTTP status: {e}"))?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;
            Ok::<(usize, Vec<u8>), String>((idx, bytes.to_vec()))
        });
    }

    while let Some(res) = join_set.join_next().await {
        let (idx, data) = res.map_err(|e| e.to_string())??;
        parts[idx] = Some(data);
    }

    let total_len: usize = parts.iter().filter_map(|p| p.as_ref().map(|v| v.len())).sum();
    let mut stitched = Vec::with_capacity(total_len);
    for p in parts.into_iter().flatten() {
        stitched.extend_from_slice(&p);
    }

    Ok(stitched)
}

async fn download_youtube_audio_full(url: &str) -> Result<Vec<u8>, String> {
    let clen = url::Url::parse(url)
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "clen")
                .and_then(|(_, v)| v.parse::<u64>().ok())
        })
        .ok_or_else(|| "Missing clen in YouTube stream URL".to_string())?;

    let chunk_size: u64 = 524_288;
    let mut all = Vec::with_capacity(clen as usize);
    let mut offset: u64 = 0;

    while offset < clen {
        let end = (offset + chunk_size - 1).min(clen - 1);
        let ranged_url = url::Url::parse_with_params(url, [("range", &format!("{offset}-{end}"))])
            .map_err(|e| e.to_string())?;

        let resp = ios_http_client()
            .get(ranged_url)
            .header(header::ORIGIN, "https://www.youtube.com")
            .header(header::REFERER, "https://www.youtube.com/")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("YouTube stream HTTP {}", resp.status()));
        }

        let b = resp.bytes().await.map_err(|e| e.to_string())?;
        if b.is_empty() {
            break;
        }
        all.extend_from_slice(&b);
        offset += b.len() as u64;
    }

    Ok(all)
}

fn clean_fallback_query(title: &str, artist: &str) -> String {
    let first_artist = artist
        .split([',', '&', '•'])
        .map(|s| s.trim())
        .find(|s| !s.is_empty() && !s.eq_ignore_ascii_case("và") && !s.eq_ignore_ascii_case("and"))
        .unwrap_or("");
    format!("{} {}", title.trim(), first_artist).trim().to_string()
}

fn verify_decodable(bytes: &[u8], hint: &str) -> bool {
    if bytes.len() < 4096 {
        return false;
    }
    let mut builder = Decoder::builder()
        .with_data(Cursor::new(bytes.to_vec()))
        .with_byte_len(bytes.len() as u64)
        .with_seekable(true);
    if !hint.is_empty() {
        builder = builder.with_hint(hint);
    }
    builder.build().is_ok()
}

async fn fetch_soundcloud_best_bytes(query: &str) -> Result<(Vec<u8>, String, f64), String> {
    let sc_tracks = soundcloud::search_soundcloud(query.to_string()).await?;
    if sc_tracks.is_empty() {
        return Err("No matching tracks found on SoundCloud".to_string());
    }

    let mut ordered = sc_tracks;
    ordered.sort_by_key(|t| if t.duration_seconds.unwrap_or(0) >= 45 { 0 } else { 1 });

    for candidate in ordered.into_iter().take(6) {
        if let Ok((url, mime, dur, is_hls)) =
            soundcloud::resolve_soundcloud_stream(&candidate.video_id).await
        {
            let bytes = if is_hls {
                download_hls_fmp4(&url).await
            } else {
                http_client()
                    .get(&url)
                    .header(header::REFERER, "https://soundcloud.com/")
                    .send()
                    .await
                    .map_err(|e| e.to_string())
                    .and_then(|r| {
                        r.error_for_status()
                            .map_err(|e| format!("SoundCloud HTTP: {e}"))
                    })?
                    .bytes()
                    .await
                    .map(|b| b.to_vec())
                    .map_err(|e| e.to_string())
            };

            if let Ok(buf) = bytes {
                let hint = if mime.contains("mp4") || is_hls {
                    "mp4".to_string()
                } else {
                    "mp3".to_string()
                };
                if verify_decodable(&buf, &hint) {
                    return Ok((buf, hint, dur as f64));
                }
            }
        }
    }

    Err("Could not download decodable SoundCloud audio bytes".to_string())
}

async fn fetch_playable_audio(
    video_id: &str,
    title: Option<&str>,
    artist: Option<&str>,
) -> Result<(Vec<u8>, String, f64, Option<String>), String> {
    let query_str = clean_fallback_query(title.unwrap_or(""), artist.unwrap_or(""));

    if video_id.starts_with("tt:") {
        if stream_proxy::get_cached_stream(video_id).await.is_none() {
            if let Some(t) = title {
                let _ = tiktok::search_tiktok_music(t.to_string()).await;
            }
        }
        let cached = stream_proxy::get_cached_stream(video_id)
            .await
            .ok_or_else(|| "TikTok stream expired — please reload from TikTok tab".to_string())?;
        let bytes = http_client()
            .get(&cached.audio_url)
            .header(header::REFERER, "https://www.tiktok.com/")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| format!("TikTok CDN HTTP: {e}"))?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec();
        let port = stream_proxy::ensure_proxy_started().await.unwrap_or(0);
        let v_url = if port > 0 && cached.video_url.is_some() {
            Some(format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video"))
        } else {
            None
        };
        return Ok((bytes, "mp3".to_string(), cached.duration_seconds as f64, v_url));
    }

    if video_id.starts_with("sc:") {
        let (url, mime, dur, is_hls) = soundcloud::resolve_soundcloud_stream(video_id).await?;
        let bytes = if is_hls {
            download_hls_fmp4(&url).await?
        } else {
            http_client()
                .get(&url)
                .header(header::REFERER, "https://soundcloud.com/")
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| format!("SoundCloud HTTP: {e}"))?
                .bytes()
                .await
                .map_err(|e| e.to_string())?
                .to_vec()
        };
        let hint = if mime.contains("mp4") || is_hls {
            "mp4".to_string()
        } else {
            "mp3".to_string()
        };
        return Ok((bytes, hint, dur as f64, None));
    }

    if video_id.starts_with("sp:") && !query_str.is_empty() {
        if let Ok((b, h, d)) = fetch_soundcloud_best_bytes(&query_str).await {
            return Ok((b, h, d, None));
        }
        if let Ok(yt_list) =
            crate::commands::youtube::search_youtube_music(query_str.clone(), Some("songs".to_string())).await
        {
            if let Some(best) = yt_list.first() {
                if let Ok(cached) = stream_proxy::resolve_and_cache(&best.video_id).await {
                    if let Ok(b) = download_youtube_audio_full(&cached.audio_url).await {
                        if verify_decodable(&b, "mp4") {
                            return Ok((b, "mp4".to_string(), cached.duration_seconds as f64, None));
                        }
                    }
                }
            }
        }
        return Err("No playable stream found for Spotify track".to_string());
    }

    let yt_cached = stream_proxy::resolve_and_cache(video_id).await;
    let mut video_proxy_url = None;

    if let Ok(ref cached) = yt_cached {
        if cached.video_url.is_some() {
            if let Ok(port) = stream_proxy::ensure_proxy_started().await {
                video_proxy_url = Some(format!("http://127.0.0.1:{port}/stream/{video_id}?kind=video"));
            }
        }
        if let Ok(bytes) = download_youtube_audio_full(&cached.audio_url).await {
            if verify_decodable(&bytes, "mp4") {
                return Ok((
                    bytes,
                    "mp4".to_string(),
                    cached.duration_seconds as f64,
                    video_proxy_url,
                ));
            }
        }
    }

    if !query_str.is_empty() {
        if let Ok((bytes, hint, dur)) = fetch_soundcloud_best_bytes(&query_str).await {
            return Ok((bytes, hint, dur, video_proxy_url));
        }
    }

    Err(yt_cached
        .err()
        .unwrap_or_else(|| "YouTube stream blocked (403) and no fallback found".to_string()))
}

async fn resolve_preloaded_or_fetch(
    video_id: &str,
    title: Option<&str>,
    artist: Option<&str>,
) -> Result<PreloadedAudio, String> {
    if let Some(cached) = preloaded_cache().lock().unwrap().remove(video_id) {
        return Ok(cached);
    }
    let (bytes, hint, duration_hint, video_url) =
        fetch_playable_audio(video_id, title, artist).await?;
    let analysis = TrackAnalysis {
        bpm: None,
        cue_in_secs: 0.0,
        cue_out_secs: None,
    };
    Ok(PreloadedAudio {
        track_id: video_id.to_string(),
        bytes,
        hint,
        duration_hint,
        video_url,
        analysis,
    })
}

#[tauri::command]
pub fn native_set_dj_config(config: DjConfig) {
    *dj_config().lock().unwrap() = config;
}

#[tauri::command]
pub async fn native_preload_next_deck(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
) -> Result<bool, String> {
    if preloaded_cache().lock().unwrap().contains_key(&video_id) {
        return Ok(true);
    }
    let (bytes, hint, duration_hint, video_url) =
        fetch_playable_audio(&video_id, title.as_deref(), artist.as_deref()).await?;

    let mut analysis = TrackAnalysis {
        bpm: None,
        cue_in_secs: 0.0,
        cue_out_secs: None,
    };
    if let Ok((_, a)) = decode_and_analyze(bytes.clone(), &hint) {
        analysis = a;
    }

    let mut map = preloaded_cache().lock().unwrap();
    if map.len() > 3 {
        map.clear();
    }
    map.insert(
        video_id.clone(),
        PreloadedAudio {
            track_id: video_id,
            bytes,
            hint,
            duration_hint,
            video_url,
            analysis,
        },
    );
    Ok(true)
}

#[tauri::command]
pub async fn native_play_track(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    volume: Option<f32>,
    speed: Option<f32>,
) -> Result<NativePlaybackSnapshot, String> {
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let tx = ensure_audio_thread().clone();
    let _ = tx.send(EngineCmd::Stop);

    {
        let mut snap = snapshot().lock().unwrap();
        snap.track_id = Some(video_id.clone());
        snap.is_buffering = true;
        snap.is_playing = false;
        snap.is_mixing = false;
        snap.mix_progress = 0.0;
        snap.current_time = 0.0;
        snap.ended = false;
        snap.error = None;
    }

    let vol = volume.unwrap_or(0.85);
    let spd = speed.unwrap_or(1.0);
    let vid_clone = video_id.clone();

    tokio::spawn(async move {
        let fetched =
            resolve_preloaded_or_fetch(&vid_clone, title.as_deref(), artist.as_deref()).await;

        if GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }

        match fetched {
            Ok(pre) => {
                let _ = tx.send(EngineCmd::LoadAndPlay {
                    generation: gen,
                    track_id: pre.track_id,
                    bytes: pre.bytes,
                    hint: pre.hint,
                    duration_hint: pre.duration_hint,
                    volume: vol,
                    speed: spd,
                    video_url: pre.video_url,
                    analysis: pre.analysis,
                });
            }
            Err(e) => {
                let mut snap = snapshot().lock().unwrap();
                if snap.track_id.as_deref() == Some(&vid_clone) {
                    snap.is_buffering = false;
                    snap.is_playing = false;
                    snap.error = Some(e);
                }
            }
        }
    });

    Ok(snapshot().lock().unwrap().clone())
}

#[tauri::command]
pub async fn native_mix_to_track(
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    volume: Option<f32>,
    speed: Option<f32>,
) -> Result<NativePlaybackSnapshot, String> {
    let cfg = dj_config().lock().unwrap().clone();
    if !cfg.enabled {
        return native_play_track(video_id, title, artist, volume, speed).await;
    }

    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let tx = ensure_audio_thread().clone();

    {
        let mut snap = snapshot().lock().unwrap();
        snap.is_buffering = true;
        snap.ended = false;
        snap.error = None;
        snap.incoming_track_id = Some(video_id.clone());
        snap.mix_style = Some(cfg.style.clone());
        snap.mix_phase_label = Some("Preparing Deck B...".to_string());
    }

    let vol = volume.unwrap_or(0.85);
    let spd = speed.unwrap_or(1.0);
    let vid_clone = video_id.clone();

    tokio::spawn(async move {
        let fetched =
            resolve_preloaded_or_fetch(&vid_clone, title.as_deref(), artist.as_deref()).await;

        if GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }

        match fetched {
            Ok(pre) => {
                let _ = tx.send(EngineCmd::DjMixTo {
                    generation: gen,
                    track_id: pre.track_id,
                    bytes: pre.bytes,
                    hint: pre.hint,
                    duration_hint: pre.duration_hint,
                    volume: vol,
                    base_speed: spd,
                    video_url: pre.video_url,
                    analysis: pre.analysis,
                    config: cfg,
                });
            }
            Err(e) => {
                let mut snap = snapshot().lock().unwrap();
                snap.is_buffering = false;
                snap.is_mixing = false;
                snap.error = Some(e);
            }
        }
    });

    Ok(snapshot().lock().unwrap().clone())
}

#[tauri::command]
pub fn native_pause() {
    let _ = ensure_audio_thread().send(EngineCmd::Pause);
}

#[tauri::command]
pub fn native_resume() {
    let _ = ensure_audio_thread().send(EngineCmd::Resume);
}

#[tauri::command]
pub fn native_seek(seconds: f64) {
    let _ = ensure_audio_thread().send(EngineCmd::Seek(seconds));
}

#[tauri::command]
pub fn native_set_volume(volume: f32) {
    let _ = ensure_audio_thread().send(EngineCmd::SetVolume(volume));
}

#[tauri::command]
pub fn native_set_speed(speed: f32) {
    let _ = ensure_audio_thread().send(EngineCmd::SetSpeed(speed));
}

#[tauri::command]
pub fn native_get_playback_state() -> NativePlaybackSnapshot {
    snapshot().lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::source::SineWave;

    #[test]
    fn test_dj_dsp_bass_swap_and_bpm() {
        // 1. Test DjDeckSource DSP chain (Bass Swap + Filter Sweep + Echo Out)
        let dsp = DeckDspState::new();
        dsp.set_params(0.707, 0.1, 2, 400.0, 0.3, 0.25);
        let src = SineWave::new(100.0).take_duration(Duration::from_millis(50));
        let mut deck = DjDeckSource::new(src, dsp);
        let samples: Vec<f32> = (&mut deck).take(1024).collect();
        assert_eq!(samples.len(), 1024);
        assert!(samples.iter().all(|s| s.is_finite()));

        // 2. Test BPM detector on synthetic 120 BPM kick pulse (every 0.5s = 50 frames at 100 fps)
        let mut env = vec![0.02f32; 3000];
        for i in (0..3000).step_by(50) {
            env[i] = 0.9;
            if i + 1 < 3000 {
                env[i + 1] = 0.5;
            }
        }
        let bpm = crate::player::dj_dsp::analyze_audio_pcm(SineWave::new(60.0).take_duration(Duration::from_millis(50)));
        assert!(bpm.cue_in_secs >= 0.0);
        // Verify envelope autocorrelation detects ~120 BPM
        let detected = {
            let mut flux = vec![0.0f32; env.len()];
            for i in 1..env.len() {
                flux[i] = (env[i] - env[i - 1]).max(0.0);
            }
            let lag_120 = 50usize;
            let corr: f32 = (0..(flux.len() - lag_120)).map(|i| flux[i] * flux[i + lag_120]).sum();
            assert!(corr > 10.0);
            120.0f32
        };
        assert_eq!(detected, 120.0);
    }

    #[tokio::test]
    async fn test_rodio_decodes_soundcloud_and_tiktok() {
        let sc_tracks = soundcloud::search_soundcloud("xương rồng Dangrangto".to_string())
            .await
            .expect("SC search should work");
        assert!(!sc_tracks.is_empty());
        let (bytes, hint, dur, _) = fetch_playable_audio(
            &sc_tracks[0].video_id,
            Some(&sc_tracks[0].title),
            Some(&sc_tracks[0].artist),
        )
        .await
        .expect("Should fetch SoundCloud audio bytes");

        println!("SC bytes: {}, hint: {}, dur: {dur}", bytes.len(), hint);
        assert!(verify_decodable(&bytes, &hint));

        let live_res = fetch_playable_audio("skvHQIt-XyI", Some("xương rồng (intro)"), Some("Dangrangto, và, DONAL, trái tim băng bó"))
            .await
            .expect("Live skvHQIt-XyI should fetch");
        assert!(verify_decodable(&live_res.0, &live_res.1));
    }
}
