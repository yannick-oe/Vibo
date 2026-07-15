/**
 * @file Centered, authorless system-message pill for channel joins
 * ("@username ist dem Kanal beigetreten") with the 👋 wave affordance.
 * Deliberately inert: no avatar, no hover/context actions, no replies,
 * threads or editing — the wave toggle is the only interaction. It routes
 * through the shared reaction pipeline (reactions-only update in the rules)
 * but never fans out notifications: system messages are excluded from the
 * activity feed entirely.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  input,
} from '@angular/core';

import { Message } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from '../../../services/message.service';
import { SoundService } from '../../../services/sound.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { emojiAsset } from '../emoji-catalog';
import { runMessageAction } from '../message-item/message-item.util';
import {
  REACTION_DETAILS_TOOLTIP_ID,
  ReactionDetailsRequest,
  ReactionDetailsService,
} from '../reaction-details/reaction-details.service';

const WAVE_EMOJI = '👋';
const JOIN_SUFFIX = ' ist dem Kanal beigetreten';
const UNKNOWN_AUTHOR = 'Unbekannt';
const WAVE_LABEL = 'Winken';
const UNWAVE_LABEL = 'Nicht mehr winken';

/**
 * Presentational join pill rendered by the message list instead of a chat
 * row. The wave button toggles the viewer's 👋 reaction on the join message
 * (chip counter shows the wavers; adding plays the own-action reaction
 * sound); all other reaction entry points do not exist on this row.
 */
@Component({
  selector: 'app-system-message',
  templateUrl: './system-message.component.html',
  styleUrl: './system-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemMessageComponent implements OnDestroy {
  readonly entry = input.required<Message>();

  readonly messagePath = input<string | null>(null);

  private readonly userService = inject(UserService);

  private readonly detailsService = inject(ReactionDetailsService);

  private readonly authService = inject(AuthService);

  private readonly messageService = inject(MessageService);

  private readonly soundService = inject(SoundService);

  private readonly toastService = inject(ToastService);

  protected readonly waveAsset = emojiAsset(WAVE_EMOJI);

  protected readonly waveEmoji = WAVE_EMOJI;

  protected readonly joinText = computed(() => `@${this.authorHandle()}${JOIN_SUFFIX}`);

  protected readonly wavers = computed(() => this.entry().reactions[WAVE_EMOJI] ?? []);

  protected readonly waverCount = computed(() => this.wavers().length);

  protected readonly hasWaved = computed(() =>
    this.wavers().includes(this.authService.currentUser()?.uid ?? ''),
  );

  protected readonly waveLabel = computed(() => (this.hasWaved() ? UNWAVE_LABEL : WAVE_LABEL));

  protected readonly waveDescribedBy = computed(() =>
    this.detailsService.details()?.owner === this ? REACTION_DETAILS_TOOLTIP_ID : null,
  );


  /**
   * Closes a tooltip still owned by this pill when it unmounts.
   */
  ngOnDestroy(): void {
    this.detailsService.closeFor(this);
  }


  /**
   * Requests the reaction-details tooltip (who waved) after the
   * hover-intent delay.
   * @param event Pointerenter event on the wave button.
   */
  protected onWaveEnter(event: Event): void {
    this.detailsService.requestOpen(this.waveDetailsRequest(event));
  }


  /**
   * Releases the tooltip with the grace period when the pointer leaves.
   */
  protected onWaveLeave(): void {
    this.detailsService.requestClose();
  }


  /**
   * Opens the tooltip immediately on keyboard focus; pointer clicks keep
   * the hover-intent behavior instead.
   * @param event Focus event on the wave button.
   */
  protected onWaveFocus(event: Event): void {
    const button = event.currentTarget as HTMLElement;
    if (!button.matches(':focus-visible')) return;
    this.detailsService.openNow(this.waveDetailsRequest(event));
  }


  /**
   * Closes the tooltip when the wave button loses keyboard focus.
   */
  protected onWaveBlur(): void {
    this.detailsService.closeNow();
  }


  /**
   * Toggles the viewer's 👋 reaction on the join message through the shared
   * reaction pipeline; adding plays the own-action reaction sound. System
   * messages never write notifications, so no fan-out happens here.
   */
  protected async wave(): Promise<void> {
    const path = this.messagePath();
    if (!path) return;
    if (!this.hasWaved()) this.soundService.play('reaction');
    await runMessageAction(this.toastService, () =>
      this.messageService.setReaction(path, WAVE_EMOJI, this.entry().reactions),
    );
  }


  /**
   * Builds the tooltip request for the wave chip; the live wavers signal
   * keeps the open tooltip current and auto-closes it when emptied.
   * @param event Event whose currentTarget is the wave button.
   */
  private waveDetailsRequest(event: Event): ReactionDetailsRequest {
    return {
      owner: this,
      emoji: WAVE_EMOJI,
      trigger: event.currentTarget as HTMLElement,
      uids: this.wavers,
    };
  }


  /**
   * Resolves the joining user's handle for the pill text: the @username
   * when known, the display name otherwise.
   */
  private authorHandle(): string {
    const author = this.userService.users().find(user => user.uid === this.entry().authorId);
    return author?.username ?? author?.name ?? UNKNOWN_AUTHOR;
  }
}
