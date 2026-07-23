/**
 * @file Playback of the curated soundboard presets: each preset's MP3 is
 * fetched and decoded lazily on its first play of the session (no eager
 * preloading — opening the popover fetches nothing), the decoded
 * AudioBuffer is cached per preset id and failed fetches or decodes are
 * negative-cached so they are never retried within the session. The cache
 * is session-wide and context-independent — an AudioBuffer is plain PCM
 * usable by any AudioContext (only nodes are context-bound), so nothing is
 * ever cached against the per-connection context and its close on leave
 * frees the per-play nodes with it. SENDER presses play through the shared
 * sound engine (the press is the gesture); RECEIVED broadcasts render on
 * the voice connection's AudioContext at the master volume, because the
 * envelope arrives outside any gesture and mobile browsers keep the UI
 * context suspended then. Unknown broadcast ids resolve to no preset and
 * return silently.
 */
import { Injectable, inject } from '@angular/core';

import { SoundboardPreset, soundboardPresetById } from '../shared/soundboard.constants';
import { SoundService } from './sound.service';

/**
 * Fetches, decodes, caches and plays the curated soundboard presets
 * through the shared sound engine.
 */
@Injectable({ providedIn: 'root' })
export class SoundboardPlayerService {
  private readonly soundService = inject(SoundService);

  private readonly bufferCache = new Map<string, Promise<AudioBuffer | null>>();


  /**
   * Plays a preset locally (sender side), fetching and decoding its file
   * on first need; presets whose asset cannot be loaded stay silent. The
   * press is a user gesture, so the shared engine's UI context path stays
   * the right one here.
   * @param preset Soundboard preset to play.
   */
  async play(preset: SoundboardPreset): Promise<void> {
    const buffer = await this.bufferFor(preset);
    if (buffer) this.soundService.playBuffer(buffer);
  }


  /**
   * Plays a broadcast preset by id (receiver side) on the given
   * voice-connection AudioContext; ids that resolve to no preset are
   * ignored silently — this also covers stale ids of removed sounds
   * arriving from not-yet-updated clients.
   * @param soundId Sound id from a 'sound' signaling envelope.
   * @param context Voice-connection AudioContext to render on.
   */
  async playBroadcast(soundId: string, context: AudioContext): Promise<void> {
    const preset = soundboardPresetById(soundId);
    if (!preset) return;
    const buffer = await this.bufferFor(preset);
    if (buffer) await this.renderOnContext(buffer, context);
  }


  /**
   * Renders a decoded buffer on a target context at the current master
   * volume. A suspended context gets one resume attempt first; playback is
   * skipped when the context still is not running (also covers a context
   * closed by a teardown while the buffer was loading). Never throws.
   * @param buffer Decoded preset buffer (context-independent PCM).
   * @param context Target AudioContext.
   */
  private async renderOnContext(buffer: AudioBuffer, context: AudioContext): Promise<void> {
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    if (context.state !== 'running') return;
    const gain = new GainNode(context, { gain: this.soundService.soundVolume() });
    gain.connect(context.destination);
    const source = new AudioBufferSourceNode(context, { buffer });
    source.connect(gain);
    source.start();
  }


  /**
   * Resolves a preset's decoded buffer through the per-id cache; the
   * pending promise is cached immediately so concurrent first plays share
   * one fetch, and failures are negative-cached as null.
   * @param preset Preset whose buffer is needed.
   */
  private bufferFor(preset: SoundboardPreset): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(preset.id);
    if (cached) return cached;
    const pending = this.fetchAndDecode(preset.assetPath).catch(() => null);
    this.bufferCache.set(preset.id, pending);
    return pending;
  }


  /**
   * Fetches a preset file and decodes it with the shared AudioContext.
   * @param assetPath App-relative path of the preset's MP3 file.
   * @returns The decoded buffer; rejects on network or decode failure.
   */
  private async fetchAndDecode(assetPath: string): Promise<AudioBuffer> {
    const response = await fetch(assetPath);
    if (!response.ok) throw new Error(`Preset fetch failed: ${response.status}`);
    return this.soundService.decodeSoundBytes(await response.arrayBuffer());
  }
}
