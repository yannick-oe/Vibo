/**
 * @file Members dialog of a channel: member list plus the entry point to
 * the add-members dialog.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { Channel } from '../../../models/channel.model';
import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { resolveAvatarStillSrc } from '../../../services/registration.service';
import { UserService } from '../../../services/user.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import {
  DialogAnchor,
  DialogShellComponent,
} from '../../../shared/dialog-shell/dialog-shell.component';
import { PresenceDotComponent } from '../../../shared/presence-dot/presence-dot.component';

const SELF_SUFFIX = ' (Du)';

/** Resolved member row of the dialog. */
interface MemberRow {
  readonly uid: string;
  readonly name: string;
  readonly avatar: string;
}

/**
 * "Mitglieder" dialog per the Figma frame: the channel's members with the
 * signed-in user first and suffixed "(Du)", plus the "Mitglieder
 * hinzufügen" row that switches to the add dialog. Member rows are real
 * buttons prepared for the profile view (module 8) but still inert.
 */
@Component({
  selector: 'app-channel-members-dialog',
  imports: [AvatarFallbackDirective, DialogShellComponent, PresenceDotComponent],
  templateUrl: './channel-members-dialog.component.html',
  styleUrl: './channel-members-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelMembersDialogComponent {
  readonly channel = input.required<Channel>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  readonly addRequested = output<void>();

  readonly memberSelected = output<string>();

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  protected readonly members = computed(() => this.resolveMembers());


  /**
   * Resolves the member documents, self first with the "(Du)" suffix.
   */
  private resolveMembers(): MemberRow[] {
    const selfUid = this.authService.currentUser()?.uid;
    const users = this.userService.users();
    const rows = this.channel()
      .memberIds.map(uid => users.find(user => user.uid === uid))
      .filter((user): user is UserDoc => user !== undefined)
      .map(user => ({
        uid: user.uid,
        name: user.uid === selfUid ? `${user.name}${SELF_SUFFIX}` : user.name,
        avatar: avatarSrc(user.avatarPath),
      }));
    return rows.sort((a, b) => Number(b.uid === selfUid) - Number(a.uid === selfUid));
  }
}


/**
 * Maps an avatar path to its lightest still rendition (static WebP when
 * one ships); external URLs and stale paths fall back to the placeholder.
 * @param path Avatar path stored on a user document.
 */
function avatarSrc(path: string): string {
  return resolveAvatarStillSrc(path);
}
