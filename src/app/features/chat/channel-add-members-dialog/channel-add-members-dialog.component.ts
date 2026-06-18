/**
 * @file Add-members dialog of a channel: user search with chips, adding
 * via atomic member-list update.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { Channel } from '../../../models/channel.model';
import { UserDoc } from '../../../models/user.model';
import { ChannelService } from '../../../services/channel.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import {
  DialogAnchor,
  DialogShellComponent,
} from '../../../shared/dialog-shell/dialog-shell.component';

const ADD_ERROR = 'Die Mitglieder konnten nicht hinzugefügt werden.';

/**
 * "Leute hinzufügen" dialog per the Figma frame: a name search offering
 * only users who are not channel members yet, selected users as removable
 * chips and the "Hinzufügen" button that stays disabled until at least
 * one person is selected. Any member may add users.
 */
@Component({
  selector: 'app-channel-add-members-dialog',
  imports: [DialogShellComponent, ReactiveFormsModule],
  templateUrl: './channel-add-members-dialog.component.html',
  styleUrl: './channel-add-members-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelAddMembersDialogComponent {
  readonly channel = input.required<Channel>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly toastService = inject(ToastService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly searchTerm = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  protected readonly selectedUsers = signal<UserDoc[]>([]);

  protected readonly isPending = signal(false);

  protected readonly candidates = computed(() => this.filterCandidates());

  protected readonly canAdd = computed(
    () => this.selectedUsers().length > 0 && !this.isPending(),
  );


  /**
   * Adds a user to the selection and resets the search for the next entry.
   * @param user User picked from the candidate list.
   */
  protected selectUser(user: UserDoc): void {
    this.selectedUsers.update(users => [...users, user]);
    this.searchControl.setValue('');
  }


  /**
   * Removes a user from the selection.
   * @param uid Uid of the chip being removed.
   */
  protected removeUser(uid: string): void {
    this.selectedUsers.update(users => users.filter(user => user.uid !== uid));
  }


  /**
   * Maps an avatar path to an absolute asset URL with placeholder fallback.
   * @param path Avatar path stored on a user document.
   */
  protected avatarSrc(path: string): string {
    return resolveAvatarPath(path);
  }


  /**
   * Persists the selection on the channel's member list and closes.
   */
  protected async add(): Promise<void> {
    if (!this.canAdd()) return;
    this.isPending.set(true);
    try {
      const uids = this.selectedUsers().map(user => user.uid);
      await this.channelService.addMembers(this.channel().id, uids);
      this.closed.emit();
    } catch {
      this.toastService.show(ADD_ERROR);
      this.isPending.set(false);
    }
  }


  /**
   * Filters selectable users by the search term; channel members and
   * already selected users are excluded.
   */
  private filterCandidates(): UserDoc[] {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [];
    const memberIds = new Set(this.channel().memberIds);
    const selectedIds = new Set(this.selectedUsers().map(user => user.uid));
    return this.userService
      .users()
      .filter(user => !memberIds.has(user.uid) && !selectedIds.has(user.uid))
      .filter(user => user.name.toLowerCase().includes(term));
  }
}
