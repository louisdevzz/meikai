use rodio::{ChannelCount, Sample, SampleRate};
use rodio::source::{SeekError, Source};
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DjConfig {
    pub enabled: bool,
    pub auto_mix: bool,
    pub crossfade_secs: f32,
    pub style: String, // "bass_swap" | "filter_sweep" | "echo_out" | "equal_power"
    pub bpm_sync: bool,
    pub smart_cue: bool,
}

impl Default for DjConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_mix: true,
            crossfade_secs: 6.0,
            style: "bass_swap".to_string(),
            bpm_sync: true,
            smart_cue: true,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TrackAnalysis {
    pub bpm: Option<f32>,
    pub cue_in_secs: f64,
    pub cue_out_secs: Option<f64>,
}

/// Lock-free atomic DSP control parameters modulated smoothly during DJ transitions
pub struct DeckDspState {
    gain: AtomicU32,
    bass_gain: AtomicU32,
    filter_mode: AtomicU8, // 0 = bypass, 1 = LPF, 2 = HPF
    filter_cutoff: AtomicU32,
    echo_mix: AtomicU32,
    echo_delay_secs: AtomicU32,
}

impl DeckDspState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            gain: AtomicU32::new(1.0f32.to_bits()),
            bass_gain: AtomicU32::new(1.0f32.to_bits()),
            filter_mode: AtomicU8::new(0),
            filter_cutoff: AtomicU32::new(18000.0f32.to_bits()),
            echo_mix: AtomicU32::new(0.0f32.to_bits()),
            echo_delay_secs: AtomicU32::new(0.375f32.to_bits()),
        })
    }

    pub fn set_params(
        &self,
        gain: f32,
        bass_gain: f32,
        filter_mode: u8,
        filter_cutoff: f32,
        echo_mix: f32,
        echo_delay_secs: f32,
    ) {
        self.gain.store(gain.clamp(0.0, 1.5).to_bits(), Ordering::Relaxed);
        self.bass_gain.store(bass_gain.clamp(0.0, 1.5).to_bits(), Ordering::Relaxed);
        self.filter_mode.store(filter_mode, Ordering::Relaxed);
        self.filter_cutoff.store(filter_cutoff.clamp(35.0, 20000.0).to_bits(), Ordering::Relaxed);
        self.echo_mix.store(echo_mix.clamp(0.0, 0.9).to_bits(), Ordering::Relaxed);
        self.echo_delay_secs.store(echo_delay_secs.clamp(0.12, 0.95).to_bits(), Ordering::Relaxed);
    }

    #[inline]
    pub fn gain(&self) -> f32 {
        f32::from_bits(self.gain.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn bass_gain(&self) -> f32 {
        f32::from_bits(self.bass_gain.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn filter_mode(&self) -> u8 {
        self.filter_mode.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn filter_cutoff(&self) -> f32 {
        f32::from_bits(self.filter_cutoff.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn echo_mix(&self) -> f32 {
        f32::from_bits(self.echo_mix.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn echo_delay_secs(&self) -> f32 {
        f32::from_bits(self.echo_delay_secs.load(Ordering::Relaxed))
    }
}

#[derive(Clone, Copy)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    fn configure(&mut self, mode: u8, cutoff: f32, sample_rate: f32, q: f32) {
        if mode == 0 || cutoff >= sample_rate * 0.48 {
            self.b0 = 1.0;
            self.b1 = 0.0;
            self.b2 = 0.0;
            self.a1 = 0.0;
            self.a2 = 0.0;
            return;
        }
        let w0 = 2.0 * PI * (cutoff.clamp(25.0, sample_rate * 0.45) / sample_rate);
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.5));
        let a0 = 1.0 + alpha;

        if mode == 1 {
            // Low-Pass Filter
            self.b0 = ((1.0 - cos_w0) * 0.5) / a0;
            self.b1 = (1.0 - cos_w0) / a0;
            self.b2 = ((1.0 - cos_w0) * 0.5) / a0;
        } else {
            // High-Pass Filter (mode == 2)
            self.b0 = ((1.0 + cos_w0) * 0.5) / a0;
            self.b1 = -(1.0 + cos_w0) / a0;
            self.b2 = ((1.0 + cos_w0) * 0.5) / a0;
        }
        self.a1 = (-2.0 * cos_w0) / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

/// Real-time DJ DSP wrapper for a `rodio::Source`:
/// - 200Hz Bass Crossover (for club-style Bass Swap transitions)
/// - Dynamic Biquad Filter Sweep (LPF / HPF)
/// - Pre-allocated stereo Echo Out delay line
/// - Smooth Equal-Power Gain stage
pub struct DjDeckSource<S> {
    inner: S,
    dsp: Arc<DeckDspState>,
    channels: usize,
    sample_rate: u32,
    sample_idx: usize,
    // Per-channel filter state (supports up to 8 channels cleanly)
    low_crossover: Vec<Biquad>,
    sweep_filter: Vec<Biquad>,
    last_filter_mode: u8,
    last_cutoff: f32,
    // Pre-allocated ring buffer for beat-synced Echo Out
    delay_buf: Vec<f32>,
    delay_write: usize,
}

impl<S: Source<Item = Sample>> DjDeckSource<S> {
    pub fn new(inner: S, dsp: Arc<DeckDspState>) -> Self {
        let ch = inner.channels().get().max(1) as usize;
        let sr = inner.sample_rate().get().max(8000);
        let mut low_crossover = vec![Biquad::identity(); ch];
        for bq in &mut low_crossover {
            bq.configure(1, 210.0, sr as f32, 0.707);
        }
        let sweep_filter = vec![Biquad::identity(); ch];
        // Allocate 1.5s stereo/multichannel ring buffer once up-front
        let delay_buf = vec![0.0f32; (sr as usize) * 3 / 2 * ch];

        Self {
            inner,
            dsp,
            channels: ch,
            sample_rate: sr,
            sample_idx: 0,
            low_crossover,
            sweep_filter,
            last_filter_mode: 0,
            last_cutoff: 18000.0,
            delay_buf,
            delay_write: 0,
        }
    }
}

impl<S: Source<Item = Sample>> Iterator for DjDeckSource<S> {
    type Item = Sample;

    fn next(&mut self) -> Option<Self::Item> {
        let raw = self.inner.next()?;
        let ch = self.sample_idx % self.channels;
        self.sample_idx = self.sample_idx.wrapping_add(1);

        // Refresh filter coefficients once every 64 frames when swept
        if ch == 0 && (self.sample_idx / self.channels) % 64 == 0 {
            let mode = self.dsp.filter_mode();
            let cutoff = self.dsp.filter_cutoff();
            if mode != self.last_filter_mode || (cutoff - self.last_cutoff).abs() > 4.0 {
                for bq in &mut self.sweep_filter {
                    bq.configure(mode, cutoff, self.sample_rate as f32, 0.95);
                }
                self.last_filter_mode = mode;
                self.last_cutoff = cutoff;
            }
        }

        // 1. 210Hz Bass Isolation / Swap
        let bass_gain = self.dsp.bass_gain();
        let mut s = if (bass_gain - 1.0).abs() > 0.01 {
            let low = self.low_crossover[ch].process(raw);
            let high = raw - low;
            low * bass_gain + high
        } else {
            // Keep filter warm to prevent click when bass cut starts
            let _ = self.low_crossover[ch].process(raw);
            raw
        };

        // 2. Dynamic Filter Sweep (LPF or HPF)
        if self.last_filter_mode != 0 {
            s = self.sweep_filter[ch].process(s);
        }

        // 3. Apply Equal-Power Deck Gain before echo mix so echo tail rings out naturally
        let gain = self.dsp.gain();
        let dry = s * gain;

        // 4. Echo Out Delay Tail
        let echo_mix = self.dsp.echo_mix();
        let buf_len = self.delay_buf.len();
        if buf_len > 0 {
            let delay_frames = ((self.dsp.echo_delay_secs() * self.sample_rate as f32) as usize)
                .clamp(self.channels, (buf_len / self.channels).saturating_sub(1));
            let delay_samples = delay_frames * self.channels;
            let read_idx = (self.delay_write + buf_len - delay_samples) % buf_len;
            let delayed = self.delay_buf[read_idx];
            self.delay_buf[self.delay_write] = dry + delayed * 0.46;
            self.delay_write = (self.delay_write + 1) % buf_len;

            if echo_mix > 0.005 {
                return Some((dry * (1.0 - echo_mix * 0.35) + delayed * echo_mix).clamp(-1.0, 1.0));
            }
        }

        Some(dry.clamp(-1.0, 1.0))
    }
}

impl<S: Source<Item = Sample>> Source for DjDeckSource<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.inner.try_seek(pos)
    }
}

/// Fast PCM analysis for BPM estimation + Smart Cue-In / Cue-Out points
pub fn analyze_audio_pcm<S: Source<Item = Sample>>(source: S) -> TrackAnalysis {
    let ch = source.channels().get().max(1) as usize;
    let sr = source.sample_rate().get().max(8000) as usize;
    let total_dur = source.total_duration().map(|d| d.as_secs_f64());

    let win_samples = (sr / 100).max(1) * ch; // 10ms energy frames
    let max_probe_frames = 5500; // up to 55 seconds

    let mut energies: Vec<f32> = Vec::with_capacity(max_probe_frames);
    let mut sum_sq = 0.0f32;
    let mut count = 0usize;

    for sample in source.take(max_probe_frames * win_samples) {
        sum_sq += sample * sample;
        count += 1;
        if count == win_samples {
            energies.push((sum_sq / win_samples as f32).sqrt());
            sum_sq = 0.0;
            count = 0;
        }
    }

    // 1. Smart Cue-In: first window where RMS exceeds -38 dBFS (~0.0125) within first 12s
    let mut cue_in_secs = 0.0f64;
    for (idx, &rms) in energies.iter().take(1200).enumerate() {
        if rms > 0.0125 {
            cue_in_secs = ((idx.saturating_sub(3)) as f64) * 0.01;
            break;
        }
    }

    // 2. Estimate BPM via positive onset flux autocorrelation over frames 1000..4500 (10s..45s)
    let slice_start = if energies.len() > 2200 { 1000 } else { 0 };
    let slice = &energies[slice_start..];
    let bpm = estimate_bpm_from_envelope(slice, 100.0);

    // Hint outro cue slightly earlier if long track
    let cue_out_secs = total_dur.map(|d| (d - 0.5).max(0.0));

    TrackAnalysis {
        bpm,
        cue_in_secs,
        cue_out_secs,
    }
}

fn estimate_bpm_from_envelope(env: &[f32], fps: f32) -> Option<f32> {
    if env.len() < 400 {
        return None;
    }

    // Compute positive energy flux (onset strength)
    let mut flux = Vec::with_capacity(env.len());
    flux.push(0.0f32);
    for i in 1..env.len() {
        flux.push((env[i] - env[i - 1]).max(0.0));
    }

    let min_lag = ((60.0 * fps) / 168.0).round() as usize; // 168 BPM
    let max_lag = ((60.0 * fps) / 72.0).round() as usize;  // 72 BPM
    if max_lag >= flux.len() / 2 {
        return None;
    }

    let mut best_lag = min_lag;
    let mut best_score = -1.0f32;

    for lag in min_lag..=max_lag {
        let mut corr = 0.0f32;
        for i in 0..(flux.len() - lag) {
            corr += flux[i] * flux[i + lag];
        }
        // Slight perceptual bias toward common 95-135 BPM dance/pop range
        let candidate_bpm = 60.0 * fps / lag as f32;
        let tempo_weight = if (95.0..=135.0).contains(&candidate_bpm) {
            1.08
        } else {
            1.0
        };
        let score = corr * tempo_weight;
        if score > best_score {
            best_score = score;
            best_lag = lag;
        }
    }

    if best_score <= 0.0 {
        return None;
    }
    let raw_bpm = (60.0 * fps / best_lag as f32).round();
    Some(raw_bpm)
}
