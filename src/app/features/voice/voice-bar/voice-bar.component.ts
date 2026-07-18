/**
 * @file The voice bar shown while connected to a voice channel: the
 * connection status line with the channel name, a facepile of the current
 * participants (speaking rings, mute/deafen glyphs, screen-share badge)
 * and the controls — mute, deafen, screen share (feature-gated), the
 * soundboard popover and leave. One component serves both placements:
 * docked at the bottom of the desktop workspace column and as a compact
 * bar in the mobile app shell.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { VoiceParticipant } from '../../../models/voice.model';
import { ScreenShareService } from '../../../services/screen-share.service';
import { ScreenViewerService } from '../../../services/screen-viewer.service';
import { UserService } from '../../../services/user.service';
import { VoiceConnectionService } from '../../../services/voice-connection.service';
import { VoiceRosterService } from '../../../services/voice-roster.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { DialogAnchor, anchorToTrigger } from '../../../shared/dialog-shell/dialog-anchor';
import { SoundboardPopoverComponent } from '../soundboard-popover/soundboard-popover.component';
import { isParticipantSpeaking, memberAvatar, memberName } from '../voice-view.util';

const MUTE_LABEL = 'Stummschalten';
const UNMUTE_LABEL = 'Stummschaltung aufheben';
const DEAFEN_LABEL = 'Ton deaktivieren';
const UNDEAFEN_LABEL = 'Ton aktivieren';
const SHARE_LABEL = 'Bildschirm teilen';
const SHARE_STOP_LABEL = 'Bildschirmübertragung beenden';
const SOUNDBOARD_LABEL = 'Soundboard öffnen';

/** Placement variant of the bar. */
export type VoiceBarVariant = 'docked' | 'shell';

/**
 * Route-independent control surface of the active voice connection.
 * Mute/deafen/share are toggle buttons with aria-pressed; the share
 * control is rendered only where getDisplayMedia exists and disables
 * itself with a German hint while another participant already shares.
 */
@Component({
  selector: 'app-voice-bar',
  imports: [AvatarFallbackDirective, SoundboardPopoverComponent],
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

  private readonly screenShareService = inject(ScreenShareService);

  private readonly screenViewerService = inject(ScreenViewerService);

  readonly variant = input<VoiceBarVariant>('docked');

  protected readonly channel = this.connectionService.connectedChannel;

  protected readonly isMuted = this.connectionService.isMuted;

  protected readonly isDeafened = this.connectionService.isDeafened;

  protected readonly shareSupported = this.screenShareService.isSupported;

  protected readonly isSharing = this.screenShareService.isSharing;

  protected readonly shareBlocked = this.screenShareService.isBlocked;

  protected readonly soundboardOpen = signal(false);

  protected readonly soundboardAnchor = signal<DialogAnchor | null>(null);

  protected readonly participants = computed(() => {
    const connected = this.channel();
    return connected ? this.rosterService.participantsOf(connected.id) : [];
  });

  protected readonly muteLabel = computed(() => (this.isMuted() ? UNMUTE_LABEL : MUTE_LABEL));

  protected readonly deafenLabel = computed(() =>
    this.isDeafened() ? UNDEAFEN_LABEL : DEAFEN_LABEL,
  );

  protected readonly shareLabel = computed(() => {
    const sharer = this.screenShareService.remoteSharer();
    if (sharer) return `${this.displayName(sharer.uid)} teilt bereits den Bildschirm`;
    return this.isSharing() ? SHARE_STOP_LABEL : SHARE_LABEL;
  });

  protected readonly soundboardLabel = SOUNDBOARD_LABEL;


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
   * Toggles the own screen share.
   */
  protected toggleShare(): void {
    this.screenShareService.toggle();
  }


  /**
   * Opens the soundboard popover anchored to its trigger button (bottom
   * sheet on mobile, where the anchor resolves to null).
   * @param event Click event of the soundboard button.
   */
  protected openSoundboard(event: Event): void {
    const trigger = event.currentTarget;
    this.soundboardAnchor.set(trigger instanceof HTMLElement ? anchorToTrigger(trigger) : null);
    this.soundboardOpen.set(true);
  }


  /**
   * Leaves the voice channel.
   */
  protected leave(): void {
    void this.connectionService.leave();
  }


  /**
   * Whether a participant's shared screen can be watched from here (a
   * remote stream for their session has arrived).
   * @param participant Roster participant.
   */
  protected hasScreenStream(participant: VoiceParticipant): boolean {
    return this.connectionService.remoteScreens().has(participant.sessionId);
  }


  /**
   * Opens the screen-share viewer for a sharing participant.
   * @param participant Roster participant with an active share.
   */
  protected viewScreen(participant: VoiceParticipant): void {
    this.screenViewerService.open(participant.sessionId);
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
