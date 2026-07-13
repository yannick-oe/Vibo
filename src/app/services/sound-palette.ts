/**
 * @file Synthesized UI-sound palette: the sound kinds, the tone/noise step
 * models and one definition constant per sound (waveform, notes, envelope
 * peaks, throttle). Every sound is rendered from these constants at play
 * time via the Web Audio API — no audio assets ship with the app. Tune a
 * sound by editing the values of its definition constant.
 */

/** Identifier of one UI sound in the palette. */
export type SoundKind = 'send' | 'receive' | 'delete' | 'reaction' | 'error' | 'swipe';

/** One oscillator note of a sound with its schedule and envelope peak. */
export interface ToneStep {
  /** Oscillator waveform. */
  readonly wave: OscillatorType;
  /** Starting frequency in hertz. */
  readonly startHz: number;
  /** Optional glide target in hertz, reached exponentially over the step. */
  readonly endHz?: number;
  /** Start offset from the sound's begin in seconds. */
  readonly atSeconds: number;
  /** Audible length of the step in seconds (attack plus decay). */
  readonly durationSeconds: number;
  /** Peak envelope gain of the step (pre master volume). */
  readonly peakGain: number;
}

/** One filtered-noise sweep of a sound (the whoosh building block). */
export interface NoiseStep {
  /** Bandpass center frequency at the start in hertz. */
  readonly filterStartHz: number;
  /** Bandpass center frequency at the end in hertz. */
  readonly filterEndHz: number;
  /** Start offset from the sound's begin in seconds. */
  readonly atSeconds: number;
  /** Audible length of the sweep in seconds. */
  readonly durationSeconds: number;
  /** Peak envelope gain of the sweep (pre master volume). */
  readonly peakGain: number;
}

/** Full synthesis recipe and replay throttle of one sound kind. */
export interface SoundDefinition {
  /** Minimum interval between two plays of this kind in milliseconds. */
  readonly throttleMs: number;
  /** Oscillator steps of the sound. */
  readonly tones: readonly ToneStep[];
  /** Optional filtered-noise sweep layered on top. */
  readonly noise?: NoiseStep;
}

/** Send: soft two-note upward triangle blip, light and quick. */
const SEND_SOUND: SoundDefinition = {
  throttleMs: 200,
  tones: [
    { wave: 'triangle', startHz: 520, atSeconds: 0, durationSeconds: 0.07, peakGain: 0.2 },
    { wave: 'triangle', startHz: 780, atSeconds: 0.055, durationSeconds: 0.1, peakGain: 0.18 },
  ],
};

/** Receive: bell-like downward two-tone with a quiet octave shimmer. */
const RECEIVE_SOUND: SoundDefinition = {
  throttleMs: 1000,
  tones: [
    { wave: 'sine', startHz: 880, atSeconds: 0, durationSeconds: 0.14, peakGain: 0.24 },
    { wave: 'sine', startHz: 1760, atSeconds: 0, durationSeconds: 0.08, peakGain: 0.05 },
    { wave: 'sine', startHz: 660, atSeconds: 0.08, durationSeconds: 0.1, peakGain: 0.2 },
  ],
};

/** Delete: short low muted thud (fast downward pitch glide). */
const DELETE_SOUND: SoundDefinition = {
  throttleMs: 250,
  tones: [{ wave: 'sine', startHz: 150, endHz: 70, atSeconds: 0, durationSeconds: 0.12, peakGain: 0.3 }],
};

/** Reaction: tiny quiet pop (very short upward sine flick). */
const REACTION_SOUND: SoundDefinition = {
  throttleMs: 150,
  tones: [{ wave: 'sine', startHz: 340, endHz: 560, atSeconds: 0, durationSeconds: 0.06, peakGain: 0.15 }],
};

/** Error: soft non-alarming low double-tone falling a fourth. */
const ERROR_SOUND: SoundDefinition = {
  throttleMs: 500,
  tones: [
    { wave: 'triangle', startHz: 311, atSeconds: 0, durationSeconds: 0.08, peakGain: 0.18 },
    { wave: 'triangle', startHz: 233, atSeconds: 0.09, durationSeconds: 0.09, peakGain: 0.18 },
  ],
};

/** Swipe: very quiet band-passed noise whoosh sweeping upward. */
const SWIPE_SOUND: SoundDefinition = {
  throttleMs: 350,
  tones: [],
  noise: { filterStartHz: 500, filterEndHz: 1400, atSeconds: 0, durationSeconds: 0.15, peakGain: 0.07 },
};

/** The complete palette keyed by sound kind. */
export const SOUND_PALETTE: Record<SoundKind, SoundDefinition> = {
  send: SEND_SOUND,
  receive: RECEIVE_SOUND,
  delete: DELETE_SOUND,
  reaction: REACTION_SOUND,
  error: ERROR_SOUND,
  swipe: SWIPE_SOUND,
};
