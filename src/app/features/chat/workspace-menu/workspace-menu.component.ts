/**
 * @file Workspace column with live channel and direct-message lists.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { LayoutService } from '../../../services/layout.service';
import { PresenceService } from '../../../services/presence.service';
import { DEFAULT_AVATAR_PATH, resolveAvatarPath } from '../../../services/registration.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { MobileSearchViewComponent } from '../../search/mobile-search-view/mobile-search-view.component';
import { ChannelCreateDialogComponent } from '../channel-create-dialog/channel-create-dialog.component';
import { WORKSPACE_NAME } from '../../../shared/app.constants';

const GUEST_NAME = 'Gast';
const SORT_LOCALE = 'de';

/** Direct-message list entry of the signed-in user. */
interface SelfEntry {
  readonly uid: string;
  readonly name: string;
  readonly avatar: string;
}

/**
 * Workspace navigation column showing the Devspace header, the live channel
 * list and the direct-message user list. The signed-in user leads the
 * direct-message list with a "(Du)" suffix, all other users follow
 * alphabetically. Both add-channel triggers open the creation dialog.
 */
@Component({
  selector: 'app-workspace-menu',
  imports: [
    ChannelCreateDialogComponent,
    MobileSearchViewComponent,
    ProfileDialogComponent,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './workspace-menu.component.html',
  styleUrl: './workspace-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceMenuComponent {
  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  protected readonly workspaceName = WORKSPACE_NAME;

  protected readonly channels = this.channelService.channels;

  protected readonly isChannelsOpen = signal(true);

  protected readonly isDirectOpen = signal(true);

  protected readonly isDialogOpen = signal(false);

  protected readonly profileUid = signal<string | null>(null);

  protected readonly isSearchOpen = signal(false);

  protected readonly isMobile = inject(LayoutService).isMobile;

  protected readonly presenceService = inject(PresenceService);

  protected readonly self = computed(() => this.buildSelfEntry());

  protected readonly others = computed(() => this.sortOthers());


  /**
   * Opens a profile from a search hit and closes the search view.
   * @param uid User id picked in the search results.
   */
  protected onSearchUser(uid: string): void {
    this.isSearchOpen.set(false);
    this.profileUid.set(uid);
  }


  /**
   * Toggles the channels section.
   */
  protected toggleChannels(): void {
    this.isChannelsOpen.update(open => !open);
  }


  /**
   * Toggles the direct-messages section.
   */
  protected toggleDirect(): void {
    this.isDirectOpen.update(open => !open);
  }


  /**
   * Opens the channel-creation dialog.
   */
  protected openDialog(): void {
    this.isDialogOpen.set(true);
  }


  /**
   * Closes the channel-creation dialog.
   */
  protected closeDialog(): void {
    this.isDialogOpen.set(false);
  }


  /**
   * Maps a user document's avatar path to an absolute asset URL; external
   * URLs fall back to the placeholder because avatars are local-path based.
   * @param path Avatar path stored on the user document.
   */
  protected avatarSrc(path: string): string {
    return resolveAvatarPath(path);
  }


  /**
   * Builds the signed-in user's list entry from the live user document,
   * falling back to the auth profile while the document is still loading.
   */
  private buildSelfEntry(): SelfEntry | null {
    const current = this.authService.currentUser();
    if (!current) return null;
    const document = this.userService.users().find(user => user.uid === current.uid);
    const name = document?.name ?? current.displayName ?? GUEST_NAME;
    const avatar = document?.avatarPath ?? current.photoURL ?? DEFAULT_AVATAR_PATH;
    return { uid: current.uid, name: `${name} (Du)`, avatar: this.avatarSrc(avatar) };
  }


  /**
   * Returns all users except the signed-in one, sorted alphabetically.
   */
  private sortOthers(): UserDoc[] {
    const selfUid = this.authService.currentUser()?.uid;
    return this.userService
      .users()
      .filter(user => user.uid !== selfUid)
      .sort((a, b) => a.name.localeCompare(b.name, SORT_LOCALE));
  }
}
