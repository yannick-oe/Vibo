/**
 * @file Receiver side of the voice-channel soundboard: dispatches 'sound'
 * envelopes arriving on the connection-scoped signals inbox. Broadcasts
 * are spam-gated per sending session (mirroring the sender-side press
 * throttle); preset ids resolve from the synthesized palette, every other
 * id is treated as a custom sound and lazily fetched — unknown ids are
 * ignored silently.
 */
import { Injectable, inject } from '@angular/core';

import { CustomSoundService } from './custom-sound.service';
import { SoundService } from './sound.service';
import { SoundboardReceiveGate, soundboardSoundById } from './soundboard-palette';

/**
 * Plays received soundboard broadcasts through the shared sound engine.
 * Clients with UI sounds disabled skip the dispatch entirely, so no
 * Firestore fetch is ever spent on a sound that would stay silent.
 */
@Injectable({ providedIn: 'root' })
export class SoundboardDispatchService {
  private readonly soundService = inject(SoundService);

  private readonly customSoundService = inject(CustomSoundService);

  private readonly gate = new SoundboardReceiveGate();


  /**
   * Plays one received broadcast: spam-gated per sending session, presets
   * synthesized directly, other ids resolved as custom sounds.
   * @param fromSession Session that pressed the soundboard.
   * @param soundId Broadcast sound id.
   */
  dispatch(fromSession: string, soundId: string): void {
    if (!this.soundService.soundEnabled()) return;
    if (!this.gate.accepts(fromSession, performance.now())) return;
    const preset = soundboardSoundById(soundId);
    if (preset) return this.soundService.playSoundboard(preset);
    void this.customSoundService.playById(soundId);
  }
}
