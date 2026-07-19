/**
 * @file Playback of the curated soundboard presets: each preset's MP3 is
 * fetched and decoded lazily on its first play of the session (no eager
 * preloading — opening the popover fetches nothing), the decoded
 * AudioBuffer is cached per preset id and failed fetches or decodes are
 * negative-cached so they are never retried within the session. Playback
 * routes through the shared sound engine's buffer path (master toggle and
 * volume respected). Unknown broadcast ids resolve to no preset and return
 * silently.
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
   * Plays a preset, fetching and decoding its file on first need; presets
   * whose asset cannot be loaded stay silent.
   * @param preset Soundboard preset to play.
   */
  async play(preset: SoundboardPreset): Promise<void> {
    const buffer = await this.bufferFor(preset);
    if (buffer) this.soundService.playBuffer(buffer);
  }


  /**
   * Plays a broadcast preset by id (receiver side); ids that resolve to no
   * preset are ignored silently — this also covers stale ids of removed
   * sounds arriving from not-yet-updated clients.
   * @param soundId Sound id from a 'sound' signaling envelope.
   */
  async playById(soundId: string): Promise<void> {
    const preset = soundboardPresetById(soundId);
    if (!preset) return;
    await this.play(preset);
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
