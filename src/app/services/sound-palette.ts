/**
 * @file Synthesized UI-sound palette: the sound kinds, the tone/noise step
 * models and one definition constant per sound (waveform, notes, envelope
 * peaks, throttle, optional wet send into the engine's synthesized reverb).
 * Every sound is rendered from these constants at play time via the Web
 * Audio API — no audio assets ship with the app. Tune a sound by editing
 * the named constants feeding its definition.
 */

/** Identifier of one UI sound in the palette. */
export type SoundKind = 'send' | 'receive' | 'delete' | 'reaction' | 'error' | 'swipe' | 'swipeClose';

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
  /** Optional softer attack in seconds; the engine default when absent. */
  readonly attackSeconds?: number;
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
  /** Optional wet send level (0–1) into the shared synthesized reverb. */
  readonly reverbSend?: number;
}

const MELODIC_REVERB_SEND = 0.2;

const SOFT_ATTACK_SECONDS = 0.012;

const SEND_THROTTLE_MS = 200;
const SEND_NOTE_LOW_HZ = 392;
const SEND_NOTE_HIGH_HZ = 523.25;
const SEND_OCTAVE_LOW_HZ = 784;
const SEND_OCTAVE_HIGH_HZ = 1046.5;
const SEND_SECOND_NOTE_AT_SECONDS = 0.09;
const SEND_NOTE_DURATION_SECONDS = 0.2;
const SEND_TAIL_DURATION_SECONDS = 0.26;
const SEND_OCTAVE_DURATION_SECONDS = 0.12;
const SEND_NOTE_PEAK_GAIN = 0.14;
const SEND_TAIL_PEAK_GAIN = 0.16;
const SEND_OCTAVE_PEAK_GAIN = 0.045;

const REACTION_THROTTLE_MS = 150;
const REACTION_NOTE_HZ = 659.25;
const REACTION_OCTAVE_HZ = 1318.5;
const REACTION_NOTE_DURATION_SECONDS = 0.18;
const REACTION_OCTAVE_DURATION_SECONDS = 0.06;
const REACTION_NOTE_PEAK_GAIN = 0.11;
const REACTION_OCTAVE_PEAK_GAIN = 0.05;

const SWIPE_THROTTLE_MS = 350;
const SWIPE_FILTER_LOW_HZ = 500;
const SWIPE_FILTER_HIGH_HZ = 1400;
const SWIPE_DURATION_SECONDS = 0.15;
const SWIPE_PEAK_GAIN = 0.07;

/**
 * Send: a gentle "done" chime — two soft ascending sine notes a perfect
 * fourth apart (G4 → C5), each with a quiet octave partial for a bell-like
 * color, softly attacked and released into the shared reverb.
 */
const SEND_SOUND: SoundDefinition = {
  throttleMs: SEND_THROTTLE_MS,
  reverbSend: MELODIC_REVERB_SEND,
  tones: [
    {
      wave: 'sine',
      startHz: SEND_NOTE_LOW_HZ,
      atSeconds: 0,
      durationSeconds: SEND_NOTE_DURATION_SECONDS,
      peakGain: SEND_NOTE_PEAK_GAIN,
      attackSeconds: SOFT_ATTACK_SECONDS,
    },
    {
      wave: 'sine',
      startHz: SEND_OCTAVE_LOW_HZ,
      atSeconds: 0,
      durationSeconds: SEND_OCTAVE_DURATION_SECONDS,
      peakGain: SEND_OCTAVE_PEAK_GAIN,
      attackSeconds: SOFT_ATTACK_SECONDS,
    },
    {
      wave: 'sine',
      startHz: SEND_NOTE_HIGH_HZ,
      atSeconds: SEND_SECOND_NOTE_AT_SECONDS,
      durationSeconds: SEND_TAIL_DURATION_SECONDS,
      peakGain: SEND_TAIL_PEAK_GAIN,
      attackSeconds: SOFT_ATTACK_SECONDS,
    },
    {
      wave: 'sine',
      startHz: SEND_OCTAVE_HIGH_HZ,
      atSeconds: SEND_SECOND_NOTE_AT_SECONDS,
      durationSeconds: SEND_OCTAVE_DURATION_SECONDS,
      peakGain: SEND_OCTAVE_PEAK_GAIN,
      attackSeconds: SOFT_ATTACK_SECONDS,
    },
  ],
};

/** Receive: bell-like downward two-tone with a quiet octave shimmer. */
const RECEIVE_SOUND: SoundDefinition = {
  throttleMs: 1000,
  reverbSend: MELODIC_REVERB_SEND,
  tones: [
    { wave: 'sine', startHz: 880, atSeconds: 0, durationSeconds: 0.14, peakGain: 0.24 },
    { wave: 'sine', startHz: 1760, atSeconds: 0, durationSeconds: 0.08, peakGain: 0.05 },
    { wave: 'sine', startHz: 660, atSeconds: 0.08, durationSeconds: 0.1, peakGain: 0.2 },
  ],
};

/** Delete: short low muted thud (fast downward pitch glide), kept dry. */
const DELETE_SOUND: SoundDefinition = {
  throttleMs: 250,
  tones: [{ wave: 'sine', startHz: 150, endHz: 70, atSeconds: 0, durationSeconds: 0.12, peakGain: 0.3 }],
};

/**
 * Reaction: one warm kalimba-like pluck (E5) whose octave partial decays
 * fast for the "tine" color; quieter and shorter than send.
 */
const REACTION_SOUND: SoundDefinition = {
  throttleMs: REACTION_THROTTLE_MS,
  reverbSend: MELODIC_REVERB_SEND,
  tones: [
    {
      wave: 'sine',
      startHz: REACTION_NOTE_HZ,
      atSeconds: 0,
      durationSeconds: REACTION_NOTE_DURATION_SECONDS,
      peakGain: REACTION_NOTE_PEAK_GAIN,
    },
    {
      wave: 'sine',
      startHz: REACTION_OCTAVE_HZ,
      atSeconds: 0,
      durationSeconds: REACTION_OCTAVE_DURATION_SECONDS,
      peakGain: REACTION_OCTAVE_PEAK_GAIN,
    },
  ],
};

/** Error: soft non-alarming low double-tone falling a fourth, kept dry. */
const ERROR_SOUND: SoundDefinition = {
  throttleMs: 500,
  tones: [
    { wave: 'triangle', startHz: 311, atSeconds: 0, durationSeconds: 0.08, peakGain: 0.18 },
    { wave: 'triangle', startHz: 233, atSeconds: 0.09, durationSeconds: 0.09, peakGain: 0.18 },
  ],
};

/** Sidebar open: very quiet band-passed noise whoosh sweeping upward (opt-in). */
const SWIPE_SOUND: SoundDefinition = {
  throttleMs: SWIPE_THROTTLE_MS,
  tones: [],
  noise: {
    filterStartHz: SWIPE_FILTER_LOW_HZ,
    filterEndHz: SWIPE_FILTER_HIGH_HZ,
    atSeconds: 0,
    durationSeconds: SWIPE_DURATION_SECONDS,
    peakGain: SWIPE_PEAK_GAIN,
  },
};

/** Sidebar close: the same whoosh with the sweep direction reversed (opt-in). */
const SWIPE_CLOSE_SOUND: SoundDefinition = {
  throttleMs: SWIPE_THROTTLE_MS,
  tones: [],
  noise: {
    filterStartHz: SWIPE_FILTER_HIGH_HZ,
    filterEndHz: SWIPE_FILTER_LOW_HZ,
    atSeconds: 0,
    durationSeconds: SWIPE_DURATION_SECONDS,
    peakGain: SWIPE_PEAK_GAIN,
  },
};

/** The complete palette keyed by sound kind. */
export const SOUND_PALETTE: Record<SoundKind, SoundDefinition> = {
  send: SEND_SOUND,
  receive: RECEIVE_SOUND,
  delete: DELETE_SOUND,
  reaction: REACTION_SOUND,
  error: ERROR_SOUND,
  swipe: SWIPE_SOUND,
  swipeClose: SWIPE_CLOSE_SOUND,
};
