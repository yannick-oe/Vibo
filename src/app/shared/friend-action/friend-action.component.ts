/**
 * @file Shared friend-action control rendering the correct action set for
 * the relationship to a user: send, withdraw (plus block), accept/decline
 * (plus block), message plus remove/block behind an overflow menu with
 * confirm steps, or unblock while the user is blocked. Guests never see the
 * destructive actions — the shared account would block/remove for everyone —
 * and get the explanatory note in the overflow menu instead. Reused
 * unchanged by every surface (sidebar, search, profile dialog, notification
 * center).
 * Optimistic UI comes from Firestore's latency compensation: local writes
 * flip the streamed relationship immediately and roll back automatically
 * when the server rejects — the catch then surfaces an error toast.
 */
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { FriendshipService } from '../../services/friendship.service';
import { ToastService } from '../../services/toast.service';
import { DialogAnchor, anchorBelow } from '../dialog-shell/dialog-anchor';
import { DialogShellComponent } from '../dialog-shell/dialog-shell.component';

const ACTION_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';
const DM_ROUTE = '/app/dm';
const MESSAGE_LABEL_FALLBACK = 'Nachricht senden';
const GUEST_MENU_NOTE =
  'Als Gast kannst du keine Freunde entfernen oder blockieren.';

/** Dangerous menu action awaiting its inline confirmation step. */
type ConfirmAction = 'remove' | 'block';

/**
 * Relationship-aware action buttons for one user; hidden for the own
 * account. Emits `navigated` after opening the direct-message view so
 * hosting overlays (profile dialog, search dropdown) can close themselves.
 * In compact mode the message action renders as an icon-only quick action
 * (row surfaces such as the friends view) instead of the full text button.
 */
@Component({
  selector: 'app-friend-action',
  imports: [DialogShellComponent],
  templateUrl: './friend-action.component.html',
  styleUrl: './friend-action.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendActionComponent {
  readonly uid = input.required<string>();

  readonly name = input('');

  readonly compact = input(false, { transform: booleanAttribute });

  readonly navigated = output<void>();

  protected readonly messageLabel = computed(() => {
    const name = this.name().trim();
    return name ? `Nachricht an ${name} senden` : MESSAGE_LABEL_FALLBACK;
  });

  private readonly friendshipService = inject(FriendshipService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  protected readonly menuAnchor = signal<DialogAnchor | null>(null);

  protected readonly state = computed(() =>
    this.friendshipService.relationshipState(this.uid())(),
  );

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  protected readonly isGuest = this.authService.isGuest;

  protected readonly guestMenuNote = GUEST_MENU_NOTE;

  protected readonly isBusy = signal(false);

  protected readonly isMenuOpen = signal(false);

  protected readonly confirmAction = signal<ConfirmAction | null>(null);


  /**
   * Sends a friend request to the user.
   */
  protected sendRequest(): void {
    void this.run(() => this.friendshipService.sendRequest(this.uid()));
  }


  /**
   * Withdraws the own pending request.
   */
  protected withdrawRequest(): void {
    void this.run(() => this.friendshipService.withdrawRequest(this.uid()));
  }


  /**
   * Accepts the incoming request.
   */
  protected acceptRequest(): void {
    void this.run(() => this.friendshipService.acceptRequest(this.uid()));
  }


  /**
   * Declines the incoming request.
   */
  protected declineRequest(): void {
    void this.run(() => this.friendshipService.declineRequest(this.uid()));
  }


  /**
   * Opens (or lazily creates on first send) the direct conversation and
   * notifies the hosting surface.
   */
  protected openConversation(): void {
    void this.router.navigate([DM_ROUTE, this.uid()]);
    this.navigated.emit();
  }


  /**
   * Opens the overflow menu anchored below its trigger (flipping above when
   * space is short; sheets on mobile), always leaving the confirm step. The
   * dialog-shell owns outside-click, Escape, focus trap and focus restore.
   * @param event Click that opened the menu.
   */
  protected openMenu(event: Event): void {
    const trigger = event.currentTarget;
    this.menuAnchor.set(trigger instanceof HTMLElement ? anchorBelow(trigger, 'right') : null);
    this.confirmAction.set(null);
    this.isMenuOpen.set(true);
  }


  /**
   * Opens the menu directly in the block confirmation step (used by the
   * standalone "Blockieren" button of the incoming-request state).
   * @param event Click that opened the confirm.
   */
  protected openBlockConfirm(event: Event): void {
    this.openMenu(event);
    this.confirmAction.set('block');
  }


  /**
   * Switches the overflow menu to the remove confirmation step.
   */
  protected startRemove(): void {
    this.confirmAction.set('remove');
  }


  /**
   * Switches the overflow menu to the block confirmation step.
   */
  protected startBlock(): void {
    this.confirmAction.set('block');
  }


  /**
   * Closes the overflow menu and leaves any confirm step.
   */
  protected closeMenu(): void {
    this.isMenuOpen.set(false);
    this.confirmAction.set(null);
  }


  /**
   * Removes the friendship after the confirm step and closes the menu.
   */
  protected confirmRemove(): void {
    this.closeMenu();
    void this.run(() => this.friendshipService.removeFriend(this.uid()));
  }


  /**
   * Blocks the user after the confirm step and closes the menu.
   */
  protected confirmBlock(): void {
    this.closeMenu();
    void this.run(() => this.friendshipService.blockUser(this.uid()));
  }


  /**
   * Unblocks a user the signed-in user has blocked (blocker only).
   */
  protected unblock(): void {
    void this.run(() => this.friendshipService.unblockUser(this.uid()));
  }


  /**
   * Runs a friendship write with a busy guard; a rejected write rolled
   * back by Firestore surfaces as an error toast.
   * @param action Friendship mutation to execute.
   */
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await action();
    } catch {
      this.toastService.show(ACTION_ERROR_MESSAGE);
    } finally {
      this.isBusy.set(false);
    }
  }
}
