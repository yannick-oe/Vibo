/**
 * @file Sender side of the voice-channel soundboard: a preset press plays
 * locally and broadcasts one 'sound' signaling envelope to every connected
 * non-stale peer of the channel (≤ 4 writes at the mesh cap); the
 * receivers' existing inbox listeners dispatch and delete them like any
 * other envelope. Presses are throttled; playback on every side respects
 * the local master sound toggle and volume (peers with sounds off hear
 * nothing — accepted, documented).
 */
import { Injectable, inject } from '@angular/core';

import { SOUNDBOARD_THROTTLE_MS, SoundboardPreset } from '../shared/soundboard.constants';
import { SoundboardPlayerService } from './soundboard-player.service';
import { ConnectedVoiceChannel, VoiceConnectionService } from './voice-connection.service';
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

  private readonly playerService = inject(SoundboardPlayerService);

  private lastPressMs = Number.NEGATIVE_INFINITY;


  /**
   * Plays a pressed preset locally and broadcasts its id to the channel;
   * throttled per press, no-op while not connected.
   * @param preset Pressed soundboard preset.
   */
  press(preset: SoundboardPreset): void {
    const channel = this.claimPress();
    if (!channel) return;
    void this.playerService.play(preset);
    this.broadcast(channel.id, preset.id);
  }


  /**
   * Claims one press inside the throttle window; null while not connected
   * or still throttled.
   */
  private claimPress(): ConnectedVoiceChannel | null {
    const channel = this.connectionService.connectedChannel();
    if (!channel || performance.now() - this.lastPressMs < SOUNDBOARD_THROTTLE_MS) return null;
    this.lastPressMs = performance.now();
    return channel;
  }


  /**
   * Sends one envelope per connected non-stale peer of the channel.
   * @param channelId Connected voice channel.
   * @param soundId Id of the pressed preset.
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
