/**
 * @file Workspace column with live channel and direct-message lists.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { UserDoc } from '../../../models/user.model';
import { buildConversationId } from '../../../models/direct-message.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelCreateService } from '../../../services/channel-create.service';
import { ChannelService } from '../../../services/channel.service';
import { DirectMessageService } from '../../../services/direct-message.service';
import { FriendshipService } from '../../../services/friendship.service';
import { LayoutService } from '../../../services/layout.service';
import {
  channelMessagesPath,
  conversationDocPath,
  directMessagesPath,
} from '../../../services/message.service';
import { PresenceService } from '../../../services/presence.service';
import { DEFAULT_AVATAR_PATH, resolveAvatarPath } from '../../../services/registration.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { MobileSearchViewComponent } from '../../search/mobile-search-view/mobile-search-view.component';
import { UnreadBadgeComponent } from '../../../shared/unread-badge/unread-badge.component';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
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
 * list and the direct-message list. The signed-in user leads the
 * direct-message list with a "(Du)" suffix; below it appear accepted
 * friends and partners of already existing conversations, alphabetically.
 * Both add-channel triggers open the creation dialog, which the app shell
 * renders at the top level via {@link ChannelCreateService}.
 */
@Component({
  selector: 'app-workspace-menu',
  imports: [
    AvatarFallbackDirective,
    MobileSearchViewComponent,
    ProfileDialogComponent,
    RouterLink,
    RouterLinkActive,
    UnreadBadgeComponent,
  ],
  templateUrl: './workspace-menu.component.html',
  styleUrl: './workspace-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceMenuComponent {
  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly directMessageService = inject(DirectMessageService);

  private readonly channelCreate = inject(ChannelCreateService);

  protected readonly workspaceName = WORKSPACE_NAME;

  protected readonly channels = this.channelService.channels;

  protected readonly isChannelsOpen = signal(true);

  protected readonly isDirectOpen = signal(true);

  protected readonly profileUid = signal<string | null>(null);

  protected readonly isSearchOpen = signal(false);

  protected readonly isMobile = inject(LayoutService).isMobile;

  protected readonly presenceService = inject(PresenceService);

  protected readonly self = computed(() => this.buildSelfEntry());

  protected readonly selfUid = computed(() => this.authService.currentUser()?.uid ?? null);


  /**
   * Conversation-document path of a channel, for its unread badge.
   * @param channelId Firestore id of the channel.
   */
  protected channelConvPath(channelId: string): string {
    return conversationDocPath(channelMessagesPath(channelId));
  }


  /**
   * Messages-collection path of a channel, for its unread count.
   * @param channelId Firestore id of the channel.
   */
  protected channelMsgPath(channelId: string): string {
    return channelMessagesPath(channelId);
  }


  /**
   * Messages-collection path of the conversation with a partner, or empty
   * while signed out.
   * @param partnerUid Uid of the conversation partner.
   */
  protected dmMsgPath(partnerUid: string): string {
    const me = this.selfUid();
    return me ? directMessagesPath(buildConversationId(me, partnerUid)) : '';
  }


  /**
   * Conversation-document path of the conversation with a partner.
   * @param partnerUid Uid of the conversation partner.
   */
  protected dmConvPath(partnerUid: string): string {
    return conversationDocPath(this.dmMsgPath(partnerUid));
  }

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
   * Opens the channel-creation dialog. The app shell renders it at the top
   * level, outside the frosted sidebar's `position: fixed` containing block.
   */
  protected openDialog(): void {
    this.channelCreate.open();
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
   * Returns the direct-message partners of the signed-in user — accepted
   * friends plus partners of already existing conversations — sorted
   * alphabetically.
   */
  private sortOthers(): UserDoc[] {
    const selfUid = this.authService.currentUser()?.uid;
    const visible = this.visibleDmUids();
    return this.userService
      .users()
      .filter(user => user.uid !== selfUid && visible.has(user.uid))
      .sort((a, b) => a.name.localeCompare(b.name, SORT_LOCALE));
  }


  /**
   * Unions accepted friends with partners of existing conversations.
   */
  private visibleDmUids(): ReadonlySet<string> {
    return new Set([
      ...this.friendshipService.friendUids(),
      ...this.directMessageService.conversationPartnerUids(),
    ]);
  }
}
