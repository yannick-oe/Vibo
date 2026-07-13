/**
 * @file Central UI-sound engine: one lazily created AudioContext (unlocked
 * on the first user gesture per browser autoplay policy — requests arriving
 * before the unlock are dropped silently, never queued), a master volume
 * gain, per-kind replay throttles and the settings signals (master toggle,
 * volume, swipe opt-in) persisted to localStorage.
 */
import { Injectable, Signal, signal } from '@angular/core';

import { NoiseStep, SOUND_PALETTE, SoundDefinition, SoundKind, ToneStep } from './sound-palette';

const STORAGE_KEY_SOUND_ENABLED = 'vibo:soundEnabled';
const STORAGE_KEY_SOUND_VOLUME = 'vibo:soundVolume';
const STORAGE_KEY_SWIPE_SOUND = 'vibo:swipeSoundEnabled';

const DEFAULT_SOUND_ENABLED = true;
const DEFAULT_SOUND_VOLUME = 0.6;
const DEFAULT_SWIPE_SOUND_ENABLED = false;

const ENVELOPE_ATTACK_SECONDS = 0.008;
const ENVELOPE_FLOOR_GAIN = 0.0001;
const NOISE_BUFFER_SECONDS = 0.2;
const NOISE_FILTER_Q = 1.5;

const UNLOCK_EVENT_TYPES: readonly string[] = ['pointerdown', 'keydown'];

/**
 * Plays the synthesized UI sounds. All playback funnels through
 * {@link play}: disabled state, the swipe opt-in and the per-kind throttle
 * are enforced centrally, and every sound is built from the palette's
 * oscillator/noise recipes into the shared master gain.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly soundEnabledState = signal(
    readStoredBoolean(STORAGE_KEY_SOUND_ENABLED, DEFAULT_SOUND_ENABLED),
  );

  private readonly soundVolumeState = signal(
    readStoredVolume(STORAGE_KEY_SOUND_VOLUME, DEFAULT_SOUND_VOLUME),
  );

  private readonly swipeSoundEnabledState = signal(
    readStoredBoolean(STORAGE_KEY_SWIPE_SOUND, DEFAULT_SWIPE_SOUND_ENABLED),
  );

  /** Whether UI sounds play at all (master toggle). */
  readonly soundEnabled: Signal<boolean> = this.soundEnabledState.asReadonly();

  /** Master volume in the range 0–1. */
  readonly soundVolume: Signal<number> = this.soundVolumeState.asReadonly();

  /** Whether the opt-in sidebar swipe sound plays. */
  readonly swipeSoundEnabled: Signal<boolean> = this.swipeSoundEnabledState.asReadonly();

  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;

  private cachedNoiseBuffer: AudioBuffer | null = null;

  private readonly lastPlayedAt = new Map<SoundKind, number>();


  /**
   * Registers the one-time unlock listeners that create and resume the
   * AudioContext on the first user gesture.
   */
  constructor() {
    for (const type of UNLOCK_EVENT_TYPES) {
      document.addEventListener(type, this.unlock, { capture: true, passive: true });
    }
  }


  /**
   * Plays a palette sound, honoring the master toggle, the swipe opt-in,
   * the per-kind throttle and the autoplay unlock; blocked requests are
   * dropped silently.
   * @param kind Palette sound to play.
   */
  play(kind: SoundKind): void {
    if (!this.soundEnabledState()) return;
    if (kind === 'swipe' && !this.swipeSoundEnabledState()) return;
    const context = this.runningContext();
    if (!context || this.isThrottled(kind)) return;
    this.lastPlayedAt.set(kind, performance.now());
    this.schedule(context, SOUND_PALETTE[kind]);
  }


  /**
   * Enables or disables all UI sounds and persists the choice.
   * @param enabled New master-toggle state.
   */
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabledState.set(enabled);
    storeSetting(STORAGE_KEY_SOUND_ENABLED, String(enabled));
  }


  /**
   * Sets the master volume (clamped to 0–1), applies it to a live master
   * gain immediately and persists the choice.
   * @param volume New volume in the range 0–1.
   */
  setSoundVolume(volume: number): void {
    const clamped = Math.min(1, Math.max(0, volume));
    this.soundVolumeState.set(clamped);
    if (this.masterGain) this.masterGain.gain.value = clamped;
    storeSetting(STORAGE_KEY_SOUND_VOLUME, String(clamped));
  }


  /**
   * Enables or disables the opt-in sidebar swipe sound and persists it.
   * @param enabled New swipe opt-in state.
   */
  setSwipeSoundEnabled(enabled: boolean): void {
    this.swipeSoundEnabledState.set(enabled);
    storeSetting(STORAGE_KEY_SWIPE_SOUND, String(enabled));
  }


  /**
   * Creates or resumes the AudioContext during a user gesture; once it is
   * running the unlock listeners are removed. Rejections are swallowed so
   * autoplay restrictions never surface as console errors.
   */
  private readonly unlock = (): void => {
    const context = this.context ?? this.createContext();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    if (context.state === 'running') {
      for (const type of UNLOCK_EVENT_TYPES) {
        document.removeEventListener(type, this.unlock, { capture: true });
      }
    }
  };


  /**
   * Creates the shared AudioContext with the master gain chained to the
   * destination at the persisted volume.
   */
  private createContext(): AudioContext {
    const context = new AudioContext();
    this.context = context;
    this.masterGain = new GainNode(context, { gain: this.soundVolumeState() });
    this.masterGain.connect(context.destination);
    return context;
  }


  /**
   * The unlocked AudioContext, or null while playback is still blocked.
   */
  private runningContext(): AudioContext | null {
    return this.context?.state === 'running' ? this.context : null;
  }


  /**
   * Whether the kind played more recently than its minimum interval.
   * @param kind Palette sound kind.
   */
  private isThrottled(kind: SoundKind): boolean {
    const last = this.lastPlayedAt.get(kind) ?? Number.NEGATIVE_INFINITY;
    return performance.now() - last < SOUND_PALETTE[kind].throttleMs;
  }


  /**
   * Schedules all steps of a sound definition into the master gain.
   * @param context Running AudioContext.
   * @param definition Palette recipe to render.
   */
  private schedule(context: AudioContext, definition: SoundDefinition): void {
    const master = this.masterGain;
    if (!master) return;
    const start = context.currentTime;
    for (const tone of definition.tones) this.scheduleTone(context, master, tone, start);
    if (definition.noise) this.scheduleNoise(context, master, definition.noise, start);
  }


  /**
   * Renders one oscillator step: waveform and note per the palette, an
   * optional exponential pitch glide and the shared soft envelope.
   * @param context Running AudioContext.
   * @param output Node the step feeds into (the master gain).
   * @param tone Palette tone step.
   * @param start Context time the sound begins at.
   */
  private scheduleTone(context: AudioContext, output: AudioNode, tone: ToneStep, start: number): void {
    const at = start + tone.atSeconds;
    const end = at + tone.durationSeconds;
    const oscillator = new OscillatorNode(context, { type: tone.wave, frequency: tone.startHz });
    oscillator.frequency.setValueAtTime(tone.startHz, at);
    if (tone.endHz !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.endHz, end);
    oscillator.connect(this.envelope(context, output, tone.peakGain, at, end));
    oscillator.start(at);
    oscillator.stop(end);
  }


  /**
   * Renders the filtered-noise sweep: the cached noise buffer through a
   * band-pass whose center glides between the palette frequencies, shaped
   * by the shared envelope.
   * @param context Running AudioContext.
   * @param output Node the sweep feeds into (the master gain).
   * @param noise Palette noise step.
   * @param start Context time the sound begins at.
   */
  private scheduleNoise(context: AudioContext, output: AudioNode, noise: NoiseStep, start: number): void {
    const at = start + noise.atSeconds;
    const end = at + noise.durationSeconds;
    const source = new AudioBufferSourceNode(context, { buffer: this.noiseBuffer(context), loop: true });
    const filter = new BiquadFilterNode(context, {
      type: 'bandpass',
      frequency: noise.filterStartHz,
      Q: NOISE_FILTER_Q,
    });
    filter.frequency.setValueAtTime(noise.filterStartHz, at);
    filter.frequency.exponentialRampToValueAtTime(noise.filterEndHz, end);
    source.connect(filter).connect(this.envelope(context, output, noise.peakGain, at, end));
    source.start(at);
    source.stop(end);
  }


  /**
   * Builds the shared per-step envelope: near-instant soft attack to the
   * step's peak, then an exponential decay to silence at the step end.
   * @param context Running AudioContext.
   * @param output Node the envelope feeds into (the master gain).
   * @param peak Peak gain of the step.
   * @param at Context time the step starts at.
   * @param end Context time the step ends at.
   */
  private envelope(context: AudioContext, output: AudioNode, peak: number, at: number, end: number): GainNode {
    const gain = new GainNode(context, { gain: 0 });
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + ENVELOPE_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR_GAIN, end);
    gain.connect(output);
    return gain;
  }


  /**
   * The lazily created white-noise buffer shared by all noise sweeps.
   * @param context Running AudioContext.
   */
  private noiseBuffer(context: AudioContext): AudioBuffer {
    if (this.cachedNoiseBuffer) return this.cachedNoiseBuffer;
    const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
    this.cachedNoiseBuffer = buffer;
    return buffer;
  }
}


/**
 * Reads a persisted boolean setting; malformed or missing values (or
 * unavailable storage) fall back to the default.
 * @param key localStorage key.
 * @param fallback Default when nothing valid is stored.
 */
function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}


/**
 * Reads the persisted volume; malformed or missing values (or unavailable
 * storage) fall back to the default, valid values are clamped to 0–1.
 * @param key localStorage key.
 * @param fallback Default when nothing valid is stored.
 */
function readStoredVolume(key: string, fallback: number): number {
  try {
    const parsed = Number(localStorage.getItem(key));
    if (localStorage.getItem(key) === null || Number.isNaN(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return fallback;
  }
}


/**
 * Persists a setting value; storage errors are ignored because the
 * settings work without persistence.
 * @param key localStorage key.
 * @param value Serialized setting value.
 */
function storeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}
