/**
 * @file Hover action bar of a message row: the two last-used quick reactions,
 * the emoji picker trigger, thread toggle and the own-message options menu.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { bigReactionEffect } from '../../../models/reactions';
import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { DialogAnchor, anchorAbove } from '../../../shared/dialog-shell/dialog-anchor';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { emojiAsset, emojiName, reactionTriggerLabel } from '../emoji-catalog';

type MenuState = 'closed' | 'menu' | 'confirm';

const GHOST_TAP_GUARD_MS = 500;

/**
 * Pill-shaped action bar per the Figma frames, shown by the message row on
 * hover and focus. Every message offers the two last-used quick reactions
 * (a big reaction keeps its special highlight when it surfaces here), the
 * emoji picker and the thread toggle; own messages additionally get the
 * options menu with edit (within its time window) and the two delete variants
 * behind a confirmation step.
 */
@Component({
  selector: 'app-message-actions',
  imports: [DialogShellComponent],
  templateUrl: './message-actions.component.html',
  styleUrl: './message-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.actions--open]': "menuState() !== 'closed'",
    '[class.actions--own]': 'isOwn()',
  },
})
export class MessageActionsComponent {
  readonly isOwn = input(false);

  readonly isThreadable = input(false);

  readonly isThreadOpen = input(false);

  readonly isReplyable = input(false);

  readonly canEdit = input(false);

  readonly bubbleElement = input<HTMLElement | null>(null);

  readonly reacted = output<string>();

  readonly pickerRequested = output<void>();

  readonly threadToggled = output<void>();

  readonly replyRequested = output<void>();

  readonly editRequested = output<void>();

  readonly deleteForMe = output<void>();

  readonly deleteForAll = output<void>();

  private readonly recentEmojiService = inject(RecentEmojiService);

  protected readonly menuState = signal<MenuState>('closed');

  protected readonly menuAnchor = signal<DialogAnchor | null>(null);

  private confirmOpenedAt = 0;

  protected readonly quickEmojis = computed(() => this.recentEmojiService.recent());

  protected readonly assetFor = emojiAsset;

  protected readonly nameFor = emojiName;


  /**
   * Builds the reaction button label ("Mit … reagieren"); a big reaction
   * reads "Mit Konfetti/Herzen/Rakete reagieren" via the shared helper.
   * @param emoji Quick-reaction emoji character.
   */
  protected reactLabel(emoji: string): string {
    return reactionTriggerLabel(emoji);
  }


  /**
   * Whether the emoji is a big reaction, so it keeps the special highlight
   * and tooltip when it surfaces as a last-used quick reaction.
   * @param emoji Quick-reaction emoji character.
   */
  protected isBig(emoji: string): boolean {
    return bigReactionEffect(emoji) !== null;
  }


  /**
   * Opens the options menu above the message bubble (bubble-side aligned; a
   * null anchor sheets it on mobile). The dialog-shell owns outside-click,
   * Escape, focus trap and focus restore.
   * @param event Click or touch that opened the menu.
   */
  protected openMenu(event: Event): void {
    event.stopPropagation();
    const bubble = this.bubbleElement();
    this.menuAnchor.set(bubble ? anchorAbove(bubble, this.isOwn() ? 'right' : 'left') : null);
    this.menuState.set('menu');
  }


  /**
   * Opens the menu from a touch tap and cancels the synthesized mouse click,
   * which would otherwise land on the freshly opened overlay's scrim and
   * immediately close it.
   * @param event Touch end of the trigger tap.
   */
  protected openMenuTouch(event: TouchEvent): void {
    event.preventDefault();
    this.openMenu(event);
  }


  /**
   * Closes the options menu; the dialog-shell restores focus to the trigger.
   */
  protected closeMenu(): void {
    this.menuState.set('closed');
  }


  /**
   * Opens the delete confirmation and stamps the time, so the synthesized
   * "ghost" tap that touch devices fire at the same screen position right
   * after the menu swaps under the finger cannot trigger a deletion.
   */
  protected openConfirm(): void {
    this.menuState.set('confirm');
    this.confirmOpenedAt = Date.now();
  }


  /**
   * Opens the confirmation from a touch tap and cancels the synthesized mouse
   * events, so the opening tap leaves no residual click that could land on a
   * delete option or the trigger and dismiss the confirmation.
   * @param event Touch end of the delete-option tap.
   */
  protected openConfirmTouch(event: TouchEvent): void {
    event.preventDefault();
    this.openConfirm();
  }


  /**
   * Reports whether a confirm tap arrives within the ghost-tap guard window
   * after the confirmation opened (i.e. is the opening tap's residual event).
   */
  private isGhostTap(): boolean {
    return Date.now() - this.confirmOpenedAt < GHOST_TAP_GUARD_MS;
  }


  /**
   * Emits a menu action and closes the menu. Destructive deletes are ignored
   * while the ghost-tap guard is active so they need a deliberate tap.
   * @param action Output to emit.
   */
  protected emitAndClose(action: 'edit' | 'forMe' | 'forAll'): void {
    if (action !== 'edit' && this.isGhostTap()) return;
    if (action === 'edit') this.editRequested.emit();
    if (action === 'forMe') this.deleteForMe.emit();
    if (action === 'forAll') this.deleteForAll.emit();
    this.menuState.set('closed');
  }
}
