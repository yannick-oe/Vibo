/**
 * @file Hover action bar of a message row: quick reactions, emoji picker
 * trigger, thread toggle and the own-message options menu.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { emojiAsset, emojiName, reactionTriggerLabel } from '../emoji-catalog';

type MenuState = 'closed' | 'menu' | 'confirm';

const GHOST_TAP_GUARD_MS = 500;

/**
 * Pill-shaped action bar per the Figma frames, shown by the message row on
 * hover and focus. Foreign messages offer the two recent quick emojis, the
 * emoji picker and the thread toggle; own messages additionally get the
 * options menu with edit (within its time window) and the two delete
 * variants behind a confirmation step.
 */
@Component({
  selector: 'app-message-actions',
  templateUrl: './message-actions.component.html',
  styleUrl: './message-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.actions--open]': "menuState() !== 'closed'",
    '[class.actions--own]': 'isOwn()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class MessageActionsComponent {
  readonly isOwn = input(false);

  readonly isThreadable = input(false);

  readonly isThreadOpen = input(false);

  readonly canEdit = input(false);

  readonly reacted = output<string>();

  readonly pickerRequested = output<void>();

  readonly threadToggled = output<void>();

  readonly editRequested = output<void>();

  readonly deleteForMe = output<void>();

  readonly deleteForAll = output<void>();

  private readonly recentEmojiService = inject(RecentEmojiService);

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');

  protected readonly menuState = signal<MenuState>('closed');

  private confirmOpenedAt = 0;

  protected readonly quickEmojis = computed(() => this.recentEmojiService.recent());

  protected readonly assetFor = emojiAsset;

  protected readonly nameFor = emojiName;


  /**
   * Builds the quick-reaction button label ("Mit … reagieren"); the two big
   * reactions read "Mit Konfetti/Herzen reagieren" via the shared helper.
   * @param emoji Quick-reaction emoji character.
   */
  protected reactLabel(emoji: string): string {
    return reactionTriggerLabel(emoji);
  }


  /**
   * Opens or closes the options menu.
   */
  protected toggleMenu(): void {
    this.menuState.update(state => (state === 'closed' ? 'menu' : 'closed'));
  }


  /**
   * Toggles the menu from a touch tap and cancels the compatibility mouse
   * events the browser synthesizes at the trigger position shortly after;
   * that residual click would otherwise re-enter toggleMenu and collapse an
   * open confirmation back to closed, dismissing it before the user chooses.
   * @param event Touch end of the trigger tap.
   */
  protected toggleMenuTouch(event: TouchEvent): void {
    event.preventDefault();
    this.toggleMenu();
  }


  /**
   * Closes the menu and returns focus to its trigger.
   */
  protected closeMenu(): void {
    if (this.menuState() === 'closed') return;
    this.menuState.set('closed');
    this.menuTrigger()?.nativeElement.focus();
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


  /**
   * Closes the menu when a click lands outside the action bar.
   * @param event Document-level click event.
   */
  protected onDocumentClick(event: Event): void {
    if (this.menuState() === 'closed') return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuState.set('closed');
  }
}
