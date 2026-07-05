/**
 * @file Presentational row of the friends view: avatar with presence dot,
 * display name, @username and the shared friend-action control.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { PresenceService } from '../../../services/presence.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { FriendActionComponent } from '../../../shared/friend-action/friend-action.component';

/**
 * One user row in the friends view lists (friends, requests, search
 * results); the shared friend-action renders the state-appropriate actions.
 */
@Component({
  selector: 'app-friend-row',
  imports: [AvatarFallbackDirective, FriendActionComponent],
  templateUrl: './friend-row.component.html',
  styleUrl: './friend-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendRowComponent {
  readonly uid = input.required<string>();

  readonly name = input.required<string>();

  readonly username = input('');

  readonly avatarPath = input('');

  protected readonly presenceService = inject(PresenceService);

  protected readonly avatarSrc = computed(() => resolveAvatarPath(this.avatarPath()));
}
