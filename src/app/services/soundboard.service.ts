/**
 * @file Sender side of the voice-channel soundboard: a press — preset or
 * custom sound — plays locally and broadcasts one 'sound' signaling
 * envelope to every connected non-stale peer of the channel (≤ 4 writes at
 * the mesh cap); the receivers' existing inbox listeners dispatch and
 * delete them like any other envelope. Presses share one throttle across
 * presets and custom sounds; playback on every side respects the local
 * master sound toggle and volume (peers with sounds off hear nothing —
 * accepted, documented).
 */
import { Injectable, inject } from '@angular/core';

import { CustomSound } from '../models/soundboard.model';
import { CustomSoundService } from './custom-sound.service';
import { SOUNDBOARD_THROTTLE_MS, SoundboardSound } from './soundboard-palette';
import { SoundService } from './sound.service';
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

  private readonly soundService = inject(SoundService);

  private readonly customSoundService = inject(CustomSoundService);

  private lastPressMs = Number.NEGATIVE_INFINITY;


  /**
   * Plays a preset soundboard sound locally and broadcasts it to the
   * channel; throttled per press, no-op while not connected.
   * @param sound Pressed soundboard sound.
   */
  press(sound: SoundboardSound): void {
    const channel = this.claimPress();
    if (!channel) return;
    this.soundService.playSoundboard(sound);
    this.broadcast(channel.id, sound.id);
  }


  /**
   * Plays a custom soundboard sound locally and broadcasts its id to the
   * channel; shares the press throttle with the presets, no-op while not
   * connected. Receivers fetch the sound on first need.
   * @param sound Pressed custom sound.
   */
  pressCustom(sound: CustomSound): void {
    const channel = this.claimPress();
    if (!channel) return;
    void this.customSoundService.play(sound);
    this.broadcast(channel.id, sound.id);
  }


  /**
   * Claims one press inside the shared throttle window; null while not
   * connected or still throttled.
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
