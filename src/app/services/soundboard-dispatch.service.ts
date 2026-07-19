/**
 * @file Receiver side of the voice-channel soundboard: dispatches 'sound'
 * envelopes arriving on the connection-scoped signals inbox. Broadcasts
 * are spam-gated per sending session (mirroring the sender-side press
 * throttle) and resolve against the curated preset list — unknown ids
 * (including stale ids of the removed custom sounds) are ignored silently
 * inside {@link SoundboardPlayerService.playById}.
 */
import { Injectable, inject } from '@angular/core';

import { SoundService } from './sound.service';
import { SoundboardPlayerService } from './soundboard-player.service';
import { SoundboardReceiveGate } from './soundboard-receive-gate';

/**
 * Plays received soundboard broadcasts through the shared sound engine.
 * Clients with UI sounds disabled skip the dispatch entirely, so no fetch
 * is ever spent on a sound that would stay silent.
 */
@Injectable({ providedIn: 'root' })
export class SoundboardDispatchService {
  private readonly soundService = inject(SoundService);

  private readonly playerService = inject(SoundboardPlayerService);

  private readonly gate = new SoundboardReceiveGate();


  /**
   * Plays one received broadcast: spam-gated per sending session, resolved
   * against the curated presets.
   * @param fromSession Session that pressed the soundboard.
   * @param soundId Broadcast sound id.
   */
  dispatch(fromSession: string, soundId: string): void {
    if (!this.soundService.soundEnabled()) return;
    if (!this.gate.accepts(fromSession, performance.now())) return;
    void this.playerService.playById(soundId);
  }
}
