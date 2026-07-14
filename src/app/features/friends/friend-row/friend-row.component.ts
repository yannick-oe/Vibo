/**
 * @file Row of the friends view: the row itself is a button opening the
 * user's profile dialog (Discord pattern), the shared friend-action renders
 * icon quick actions beside it.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ProfileOverlayService } from '../../../services/profile-overlay.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { FriendActionComponent } from '../../../shared/friend-action/friend-action.component';
import { PresenceDotComponent } from '../../../shared/presence-dot/presence-dot.component';

/**
 * One user row in the friends view lists (friends, requests, search
 * results). The avatar/name area is one large button opening the profile
 * dialog (which carries the full friend-action set); the compact
 * friend-action beside it offers the quick actions. The quick-action
 * buttons are siblings of — not children of — the profile button, so their
 * clicks can never bubble into the row action.
 */
@Component({
  selector: 'app-friend-row',
  imports: [AvatarFallbackDirective, FriendActionComponent, PresenceDotComponent],
  templateUrl: './friend-row.component.html',
  styleUrl: './friend-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendRowComponent {
  readonly uid = input.required<string>();

  readonly name = input.required<string>();

  readonly username = input('');

  readonly avatarPath = input('');

  private readonly profileOverlay = inject(ProfileOverlayService);

  protected readonly avatarSrc = computed(() => resolveAvatarPath(this.avatarPath()));


  /**
   * Opens the profile dialog of the row's user via the app-shell overlay.
   */
  protected openProfile(): void {
    this.profileOverlay.open(this.uid());
  }
}
