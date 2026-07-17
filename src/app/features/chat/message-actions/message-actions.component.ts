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
import { DialogAnchor, anchorToTrigger } from '../../../shared/dialog-shell/dialog-anchor';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { emojiAsset, emojiName, reactionTriggerLabel } from '../emoji-catalog';

type MenuState = 'closed' | 'menu' | 'confirm';

const GHOST_TAP_GUARD_MS = 500;

const PIN_LABEL = 'Anpinnen';

const UNPIN_LABEL = 'Lösen';

/**
 * Pill-shaped action bar per the Figma frames, shown by the message row on
 * hover and focus. Every message offers the two last-used quick reactions
 * (a big reaction keeps its special highlight when it surfaces here), the
 * emoji picker and the thread toggle. The ⋮ options menu is context-
 * dependent and never empty: pin/unpin on every pinnable message, edit
 * (within its time window) and the delete variants behind a confirmation
 * step on own messages only.
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

  readonly isPinnable = input(false);

  readonly isPinned = input(false);

  readonly reacted = output<string>();

  readonly pickerRequested = output<void>();

  readonly threadToggled = output<void>();

  readonly replyRequested = output<void>();

  readonly editRequested = output<void>();

  readonly deleteForMe = output<void>();

  readonly deleteForAll = output<void>();

  readonly pinToggled = output<void>();

  readonly menuOpenChanged = output<boolean>();

  private readonly recentEmojiService = inject(RecentEmojiService);

  protected readonly menuState = signal<MenuState>('closed');

  protected readonly menuAnchor = signal<DialogAnchor | null>(null);

  private confirmOpenedAt = 0;

  protected readonly quickEmojis = computed(() => this.recentEmojiService.recent());

  protected readonly hasMenu = computed(() => this.isPinnable() || this.isOwn());

  protected readonly pinLabel = computed(() => (this.isPinned() ? UNPIN_LABEL : PIN_LABEL));

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
   * Opens the options menu anchored to the ⋮ trigger button itself: below the
   * button while it sits in the upper viewport half, above it otherwise (a
   * null anchor sheets the menu on mobile). The dialog-shell owns
   * outside-click, Escape, focus trap and focus restore.
   * @param event Click or touch that opened the menu.
   */
  protected openMenu(event: Event): void {
    event.stopPropagation();
    const trigger = event.currentTarget;
    this.menuAnchor.set(trigger instanceof HTMLElement ? anchorToTrigger(trigger) : null);
    if (this.menuState() === 'closed') this.menuOpenChanged.emit(true);
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
   * Closes the options menu and drops its trigger anchor; the dialog-shell
   * restores focus to the trigger.
   */
  protected closeMenu(): void {
    if (this.menuState() !== 'closed') this.menuOpenChanged.emit(false);
    this.menuState.set('closed');
    this.menuAnchor.set(null);
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
  protected emitAndClose(action: 'pin' | 'edit' | 'forMe' | 'forAll'): void {
    if ((action === 'forMe' || action === 'forAll') && this.isGhostTap()) return;
    if (action === 'pin') this.pinToggled.emit();
    if (action === 'edit') this.editRequested.emit();
    if (action === 'forMe') this.deleteForMe.emit();
    if (action === 'forAll') this.deleteForAll.emit();
    this.closeMenu();
  }
}
