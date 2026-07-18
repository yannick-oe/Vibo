/**
 * @file Sender side of the voice-channel soundboard: a press plays the
 * sound locally and broadcasts one 'sound' signaling envelope to every
 * connected non-stale peer of the channel (≤ 4 writes at the mesh cap) —
 * the receivers' existing inbox listeners dispatch and delete them like
 * any other envelope. Presses are throttled; playback on every side
 * respects the local master sound toggle and volume (peers with sounds
 * off hear nothing — accepted, documented).
 */
import { Injectable, inject } from '@angular/core';

import { SOUNDBOARD_THROTTLE_MS, SoundboardSound } from './soundboard-palette';
import { SoundService } from './sound.service';
import { VoiceConnectionService } from './voice-connection.service';
import { VoiceRosterService } from './voice-roster.service';
import { VoiceSignalingService } from './voice-signaling.service';

/**
 * Broadcasts soundboard presses over the existing signaling transport.
 * Available only while connected to a voice channel; a press outside a
 * connection is silently ignored.
 */
@Injectable({ providedIn: 'root' })
export class SoundboardService {
  private readonly connectionService = inject(VoiceConnectionService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly signalingService = inject(VoiceSignalingService);

  private readonly soundService = inject(SoundService);

  private lastPressMs = Number.NEGATIVE_INFINITY;


  /**
   * Plays a soundboard sound locally and broadcasts it to the channel;
   * throttled per press, no-op while not connected.
   * @param sound Pressed soundboard sound.
   */
  press(sound: SoundboardSound): void {
    const channel = this.connectionService.connectedChannel();
    if (!channel || performance.now() - this.lastPressMs < SOUNDBOARD_THROTTLE_MS) return;
    this.lastPressMs = performance.now();
    this.soundService.playSoundboard(sound);
    this.broadcast(channel.id, sound.id);
  }


  /**
   * Sends one envelope per connected non-stale peer of the channel.
   * @param channelId Connected voice channel.
   * @param soundId Id of the pressed sound.
   */
  private broadcast(channelId: string, soundId: string): void {
    const own = this.connectionService.ownSessionId;
    for (const participant of this.rosterService.participantsOf(channelId)) {
      if (participant.sessionId === own) continue;
      this.signalingService.send(channelId, participant.sessionId, participant.uid, 'sound', {
        soundId,
      });
    }
  }
}
