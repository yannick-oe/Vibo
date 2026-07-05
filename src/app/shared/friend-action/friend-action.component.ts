/**
 * @file Shared friend-action control rendering the correct action set for
 * the relationship to a user: send, withdraw, accept/decline, or message
 * plus remove behind an overflow menu with a confirm step. Reused unchanged
 * by every surface (sidebar, search, profile dialog, notification center).
 * Optimistic UI comes from Firestore's latency compensation: local writes
 * flip the streamed relationship immediately and roll back automatically
 * when the server rejects — the catch then surfaces an error toast.
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
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { FriendshipService } from '../../services/friendship.service';
import { ToastService } from '../../services/toast.service';

const ACTION_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';
const DM_ROUTE = '/app/dm';

/**
 * Relationship-aware action buttons for one user; hidden for the own
 * account. Emits `navigated` after opening the direct-message view so
 * hosting overlays (profile dialog, search dropdown) can close themselves.
 */
@Component({
  selector: 'app-friend-action',
  templateUrl: './friend-action.component.html',
  styleUrl: './friend-action.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'cancelRemove()',
  },
})
export class FriendActionComponent {
  readonly uid = input.required<string>();

  readonly navigated = output<void>();

  private readonly friendshipService = inject(FriendshipService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly state = computed(() =>
    this.friendshipService.relationshipState(this.uid())(),
  );

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  protected readonly isBusy = signal(false);

  protected readonly isMenuOpen = signal(false);

  protected readonly isConfirming = signal(false);


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
   * Toggles the overflow menu, always leaving the confirm step.
   */
  protected toggleMenu(): void {
    this.isMenuOpen.update(open => !open);
    this.isConfirming.set(false);
  }


  /**
   * Switches the overflow menu to the remove confirmation step.
   */
  protected startRemove(): void {
    this.isConfirming.set(true);
  }


  /**
   * Closes the overflow menu and leaves the confirm step.
   */
  protected cancelRemove(): void {
    this.isMenuOpen.set(false);
    this.isConfirming.set(false);
  }


  /**
   * Removes the friendship after the confirm step and closes the menu.
   */
  protected confirmRemove(): void {
    this.cancelRemove();
    void this.run(() => this.friendshipService.removeFriend(this.uid()));
  }


  /**
   * Closes the overflow menu when a click lands outside the component.
   * @param event Document-level click event.
   */
  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.cancelRemove();
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
