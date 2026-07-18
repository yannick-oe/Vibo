/**
 * @file The voice bar shown while connected to a voice channel: the
 * connection status line with the channel name, a facepile of the current
 * participants (speaking rings, mute/deafen glyphs) and the controls —
 * mute, deafen and leave. One component serves both placements: docked at
 * the bottom of the desktop workspace column and as a compact bar in the
 * mobile app shell.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { VoiceParticipant } from '../../../models/voice.model';
import { UserService } from '../../../services/user.service';
import { VoiceConnectionService } from '../../../services/voice-connection.service';
import { VoiceRosterService } from '../../../services/voice-roster.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { isParticipantSpeaking, memberAvatar, memberName } from '../voice-view.util';

const MUTE_LABEL = 'Stummschalten';
const UNMUTE_LABEL = 'Stummschaltung aufheben';
const DEAFEN_LABEL = 'Ton deaktivieren';
const UNDEAFEN_LABEL = 'Ton aktivieren';

/** Placement variant of the bar. */
export type VoiceBarVariant = 'docked' | 'shell';

/**
 * Route-independent control surface of the active voice connection.
 * Mute/deafen are toggle buttons with aria-pressed; leaving is the only
 * way to end the connection.
 */
@Component({
  selector: 'app-voice-bar',
  imports: [AvatarFallbackDirective],
  templateUrl: './voice-bar.component.html',
  styleUrl: './voice-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.voice-bar-host--shell]': "variant() === 'shell'",
  },
})
export class VoiceBarComponent {
  private readonly connectionService = inject(VoiceConnectionService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly userService = inject(UserService);

  readonly variant = input<VoiceBarVariant>('docked');

  protected readonly channel = this.connectionService.connectedChannel;

  protected readonly isMuted = this.connectionService.isMuted;

  protected readonly isDeafened = this.connectionService.isDeafened;

  protected readonly participants = computed(() => {
    const connected = this.channel();
    return connected ? this.rosterService.participantsOf(connected.id) : [];
  });

  protected readonly muteLabel = computed(() => (this.isMuted() ? UNMUTE_LABEL : MUTE_LABEL));

  protected readonly deafenLabel = computed(() =>
    this.isDeafened() ? UNDEAFEN_LABEL : DEAFEN_LABEL,
  );


  /**
   * Toggles the own microphone.
   */
  protected toggleMute(): void {
    this.connectionService.toggleMute();
  }


  /**
   * Toggles the deafen state (silences all remote audio, forces self-mute).
   */
  protected toggleDeafen(): void {
    this.connectionService.toggleDeafen();
  }


  /**
   * Leaves the voice channel.
   */
  protected leave(): void {
    void this.connectionService.leave();
  }


  /**
   * Resolves a participant's display name from the live user stream.
   * @param uid Uid of the participant.
   */
  protected displayName(uid: string): string {
    return memberName(this.userService.users(), uid);
  }


  /**
   * Resolves a participant's avatar still image.
   * @param uid Uid of the participant.
   */
  protected avatarFor(uid: string): string {
    return memberAvatar(this.userService.users(), uid);
  }


  /**
   * Whether a participant currently speaks (local analysis only).
   * @param participant Roster participant.
   */
  protected isSpeaking(participant: VoiceParticipant): boolean {
    return isParticipantSpeaking(this.connectionService.speakingSessions(), participant);
  }
}
