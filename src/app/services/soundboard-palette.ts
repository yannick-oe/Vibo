/**
 * @file Soundboard palette of the voice channels: short synthesized
 * recipes (rendered by {@link SoundService} like every UI sound — no audio
 * assets), the sender/receiver throttle interval and the pure per-session
 * receive gate. Broadcasts travel as 'sound' signaling envelopes carrying
 * only the sound id; unknown ids are ignored silently.
 */
import { SoundDefinition } from './sound-palette';

/** One selectable soundboard sound with its German display label. */
export interface SoundboardSound {
  /** Stable id carried in the signaling envelope. */
  readonly id: string;
  /** Visible German label of the soundboard button. */
  readonly label: string;
  /** Synthesis recipe rendered on every receiving client. */
  readonly definition: SoundDefinition;
}

/** Minimum interval between two own soundboard presses in milliseconds. */
export const SOUNDBOARD_THROTTLE_MS = 2000;

const SOUNDBOARD_REVERB_SEND = 0.2;

const SOFT_ATTACK_SECONDS = 0.012;

const HORN_ROOT_HZ = 233.08;
const HORN_THIRD_HZ = 293.66;
const HORN_FIFTH_HZ = 349.23;
const HORN_ROOT_END_HZ = 220;
const HORN_THIRD_END_HZ = 277.18;
const HORN_FIFTH_END_HZ = 329.63;
const HORN_DURATION_SECONDS = 0.55;
const HORN_VOICE_PEAK_GAIN = 0.05;
const HORN_ATTACK_SECONDS = 0.03;

const TADA_NOTE_HZS: readonly number[] = [523.25, 659.25, 783.99, 1046.5];
const TADA_NOTE_SPACING_SECONDS = 0.1;
const TADA_NOTE_DURATION_SECONDS = 0.22;
const TADA_FINAL_DURATION_SECONDS = 0.4;
const TADA_NOTE_PEAK_GAIN = 0.09;
const TADA_FINAL_PEAK_GAIN = 0.12;

const DRUM_FIRST_START_HZ = 150;
const DRUM_FIRST_END_HZ = 60;
const DRUM_SECOND_START_HZ = 130;
const DRUM_SECOND_END_HZ = 55;
const DRUM_SECOND_AT_SECONDS = 0.17;
const DRUM_THUD_DURATION_SECONDS = 0.15;
const DRUM_FIRST_PEAK_GAIN = 0.3;
const DRUM_SECOND_PEAK_GAIN = 0.34;

const ZAP_START_HZ = 880;
const ZAP_END_HZ = 110;
const ZAP_DURATION_SECONDS = 0.22;
const ZAP_PEAK_GAIN = 0.06;

const TROMBONE_SLIDES: readonly (readonly [number, number])[] = [
  [311.13, 293.66],
  [293.66, 277.18],
  [277.18, 261.63],
  [261.63, 207.65],
];
const TROMBONE_NOTE_SPACING_SECONDS = 0.24;
const TROMBONE_NOTE_DURATION_SECONDS = 0.22;
const TROMBONE_FINAL_DURATION_SECONDS = 0.45;
const TROMBONE_NOTE_PEAK_GAIN = 0.07;
const TROMBONE_FINAL_PEAK_GAIN = 0.08;
const TROMBONE_ATTACK_SECONDS = 0.04;

const RIMSHOT_FIRST_START_HZ = 180;
const RIMSHOT_FIRST_END_HZ = 80;
const RIMSHOT_SECOND_START_HZ = 160;
const RIMSHOT_SECOND_END_HZ = 70;
const RIMSHOT_SECOND_AT_SECONDS = 0.14;
const RIMSHOT_THUD_DURATION_SECONDS = 0.1;
const RIMSHOT_FIRST_PEAK_GAIN = 0.3;
const RIMSHOT_SECOND_PEAK_GAIN = 0.34;
const RIMSHOT_CYMBAL_AT_SECONDS = 0.3;
const RIMSHOT_CYMBAL_DURATION_SECONDS = 0.5;
const RIMSHOT_CYMBAL_START_HZ = 7000;
const RIMSHOT_CYMBAL_END_HZ = 4000;
const RIMSHOT_CYMBAL_PEAK_GAIN = 0.1;

/**
 * Horn: a playful airhorn — three detached sawtooth voices on a B-flat
 * major triad honking downward together at the tail.
 */
const HORN_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  reverbSend: SOUNDBOARD_REVERB_SEND,
  tones: [
    [HORN_ROOT_HZ, HORN_ROOT_END_HZ],
    [HORN_THIRD_HZ, HORN_THIRD_END_HZ],
    [HORN_FIFTH_HZ, HORN_FIFTH_END_HZ],
  ].map(([startHz, endHz]) => ({
    wave: 'sawtooth' as OscillatorType,
    startHz,
    endHz,
    atSeconds: 0,
    durationSeconds: HORN_DURATION_SECONDS,
    peakGain: HORN_VOICE_PEAK_GAIN,
    attackSeconds: HORN_ATTACK_SECONDS,
  })),
};

/**
 * Tada: a rising C-major arpeggio (C5–E5–G5–C6) whose top note rings out
 * longest — the little fanfare of the board.
 */
const TADA_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  reverbSend: SOUNDBOARD_REVERB_SEND,
  tones: TADA_NOTE_HZS.map((startHz, index) => ({
    wave: 'triangle' as OscillatorType,
    startHz,
    atSeconds: index * TADA_NOTE_SPACING_SECONDS,
    durationSeconds:
      index === TADA_NOTE_HZS.length - 1 ? TADA_FINAL_DURATION_SECONDS : TADA_NOTE_DURATION_SECONDS,
    peakGain: index === TADA_NOTE_HZS.length - 1 ? TADA_FINAL_PEAK_GAIN : TADA_NOTE_PEAK_GAIN,
    attackSeconds: SOFT_ATTACK_SECONDS,
  })),
};

/** Drum: a dry low double thud (two fast downward pitch glides). */
const DRUM_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  tones: [
    {
      wave: 'sine',
      startHz: DRUM_FIRST_START_HZ,
      endHz: DRUM_FIRST_END_HZ,
      atSeconds: 0,
      durationSeconds: DRUM_THUD_DURATION_SECONDS,
      peakGain: DRUM_FIRST_PEAK_GAIN,
    },
    {
      wave: 'sine',
      startHz: DRUM_SECOND_START_HZ,
      endHz: DRUM_SECOND_END_HZ,
      atSeconds: DRUM_SECOND_AT_SECONDS,
      durationSeconds: DRUM_THUD_DURATION_SECONDS,
      peakGain: DRUM_SECOND_PEAK_GAIN,
    },
  ],
};

/** Zap: one dry descending square blip (the laser pew). */
const ZAP_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  tones: [
    {
      wave: 'square',
      startHz: ZAP_START_HZ,
      endHz: ZAP_END_HZ,
      atSeconds: 0,
      durationSeconds: ZAP_DURATION_SECONDS,
      peakGain: ZAP_PEAK_GAIN,
    },
  ],
};

/**
 * Trombone: the sad "wah wah wah wahhh" — four descending sawtooth notes
 * (E♭4 → D4 → D♭4 → C4), each sliding down into the next pitch, the last
 * one held longest and slumping a further fourth (to G♯3).
 */
const TROMBONE_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  reverbSend: SOUNDBOARD_REVERB_SEND,
  tones: TROMBONE_SLIDES.map(([startHz, endHz], index) => ({
    wave: 'sawtooth' as OscillatorType,
    startHz,
    endHz,
    atSeconds: index * TROMBONE_NOTE_SPACING_SECONDS,
    durationSeconds:
      index === TROMBONE_SLIDES.length - 1
        ? TROMBONE_FINAL_DURATION_SECONDS
        : TROMBONE_NOTE_DURATION_SECONDS,
    peakGain:
      index === TROMBONE_SLIDES.length - 1 ? TROMBONE_FINAL_PEAK_GAIN : TROMBONE_NOTE_PEAK_GAIN,
    attackSeconds: TROMBONE_ATTACK_SECONDS,
  })),
};

/**
 * Rimshot: the dry ba-dum-tss — two fast low thuds (downward sine glides,
 * like the drum) answered by a short falling noise-burst cymbal.
 */
const RIMSHOT_SOUND: SoundDefinition = {
  throttleMs: SOUNDBOARD_THROTTLE_MS,
  tones: [
    {
      wave: 'sine',
      startHz: RIMSHOT_FIRST_START_HZ,
      endHz: RIMSHOT_FIRST_END_HZ,
      atSeconds: 0,
      durationSeconds: RIMSHOT_THUD_DURATION_SECONDS,
      peakGain: RIMSHOT_FIRST_PEAK_GAIN,
    },
    {
      wave: 'sine',
      startHz: RIMSHOT_SECOND_START_HZ,
      endHz: RIMSHOT_SECOND_END_HZ,
      atSeconds: RIMSHOT_SECOND_AT_SECONDS,
      durationSeconds: RIMSHOT_THUD_DURATION_SECONDS,
      peakGain: RIMSHOT_SECOND_PEAK_GAIN,
    },
  ],
  noise: {
    filterStartHz: RIMSHOT_CYMBAL_START_HZ,
    filterEndHz: RIMSHOT_CYMBAL_END_HZ,
    atSeconds: RIMSHOT_CYMBAL_AT_SECONDS,
    durationSeconds: RIMSHOT_CYMBAL_DURATION_SECONDS,
    peakGain: RIMSHOT_CYMBAL_PEAK_GAIN,
  },
};

/** The selectable soundboard sounds in display order. */
export const SOUNDBOARD_SOUNDS: readonly SoundboardSound[] = [
  { id: 'horn', label: 'Tröte', definition: HORN_SOUND },
  { id: 'tada', label: 'Tada', definition: TADA_SOUND },
  { id: 'drum', label: 'Trommel', definition: DRUM_SOUND },
  { id: 'zap', label: 'Laser', definition: ZAP_SOUND },
  { id: 'trombone', label: 'Posaune', definition: TROMBONE_SOUND },
  { id: 'rimshot', label: 'Ba-dum-tss', definition: RIMSHOT_SOUND },
];


/**
 * Resolves a soundboard sound by its broadcast id.
 * @param soundId Id carried in a 'sound' signaling envelope.
 * @returns The sound, or null for unknown ids (ignored silently).
 */
export function soundboardSoundById(soundId: string): SoundboardSound | null {
  return SOUNDBOARD_SOUNDS.find(sound => sound.id === soundId) ?? null;
}


/**
 * Pure per-sender spam guard of the receiving side: each remote session may
 * trigger at most one soundboard playback per throttle interval, mirroring
 * the sender-side press throttle.
 */
export class SoundboardReceiveGate {
  private readonly lastAcceptedMs = new Map<string, number>();


  /**
   * Reports whether a broadcast from a session may play now and, if so,
   * consumes the session's throttle window.
   * @param fromSession Client session that sent the broadcast.
   * @param nowMs Current monotonic time in milliseconds.
   */
  accepts(fromSession: string, nowMs: number): boolean {
    const last = this.lastAcceptedMs.get(fromSession) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - last < SOUNDBOARD_THROTTLE_MS) return false;
    this.lastAcceptedMs.set(fromSession, nowMs);
    return true;
  }
}
