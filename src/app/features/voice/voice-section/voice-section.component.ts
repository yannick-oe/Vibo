/**
 * @file Collapsible "Sprachkanäle" sidebar section: one row per voice
 * channel (speaker glyph, name, live occupancy) with the connected
 * participants listed beneath — avatars, names, mute/deafen glyphs and the
 * local speaking ring. All occupancy data derives from the single
 * collection-group roster stream; clicking a row joins the channel in
 * place (no route change).
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { VoiceChannel, VoiceParticipant } from '../../../models/voice.model';
import { UserService } from '../../../services/user.service';
import { VoiceChannelService } from '../../../services/voice-channel.service';
import { VoiceConnectionService } from '../../../services/voice-connection.service';
import { VoiceCreateService } from '../../../services/voice-create.service';
import { VoiceRosterService } from '../../../services/voice-roster.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { MAX_VOICE_PARTICIPANTS } from '../../../shared/voice.constants';
import { isParticipantSpeaking, memberAvatar, memberName } from '../voice-view.util';

/**
 * Sidebar section listing every voice channel with its live roster.
 * Creation is triggered from the section header's plus button; the dialog
 * itself is rendered by the app shell (same containing-block workaround as
 * the text-channel dialog).
 */
@Component({
  selector: 'app-voice-section',
  imports: [AvatarFallbackDirective],
  templateUrl: './voice-section.component.html',
  styleUrl: './voice-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceSectionComponent {
  private readonly voiceChannelService = inject(VoiceChannelService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly connectionService = inject(VoiceConnectionService);

  private readonly voiceCreate = inject(VoiceCreateService);

  private readonly userService = inject(UserService);

  protected readonly maxParticipants = MAX_VOICE_PARTICIPANTS;

  protected readonly channels = this.voiceChannelService.channels;

  protected readonly isOpen = signal(true);

  protected readonly connectedChannelId = computed(
    () => this.connectionService.connectedChannel()?.id ?? null,
  );


  /**
   * Toggles the voice-channels section.
   */
  protected toggleSection(): void {
    this.isOpen.update(open => !open);
  }


  /**
   * Opens the voice-channel-creation dialog (rendered by the app shell).
   */
  protected openDialog(): void {
    this.voiceCreate.open();
  }


  /**
   * Joins a voice channel (or seamlessly switches into it).
   * @param channel Voice channel row that was clicked.
   */
  protected join(channel: VoiceChannel): void {
    void this.connectionService.join({ id: channel.id, name: channel.name });
  }


  /**
   * The non-stale participants of a channel, ordered by join time.
   * @param channelId Voice channel id.
   */
  protected participantsOf(channelId: string): VoiceParticipant[] {
    return this.rosterService.participantsOf(channelId);
  }


  /**
   * Accessible label of a channel row, including the live occupancy.
   * @param channel Voice channel of the row.
   */
  protected rowLabel(channel: VoiceChannel): string {
    const count = this.participantsOf(channel.id).length;
    const connected = this.connectedChannelId() === channel.id ? ' – verbunden' : '';
    return `Sprachkanal ${channel.name} beitreten (${count} von ${this.maxParticipants} verbunden)${connected}`;
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
