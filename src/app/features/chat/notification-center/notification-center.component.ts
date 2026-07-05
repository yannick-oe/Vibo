/**
 * @file Topbar notification center: a bell with an aggregate badge (pending
 * incoming friend requests + conversations with unread messages) and an
 * anchored dropdown panel with inline request actions and unread rows.
 * Derives everything from the existing friendship and notification streams;
 * previews are bounded one-shot reads when the panel opens (§14).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { UserDoc } from '../../../models/user.model';
import { ChannelService } from '../../../services/channel.service';
import { FriendshipService } from '../../../services/friendship.service';
import { NotificationService } from '../../../services/notification.service';
import { ConversationWatch } from '../../../services/notification.util';
import { resolveAvatarPath } from '../../../services/registration.service';
import { UserService } from '../../../services/user.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import {
  DialogAnchor,
  DialogShellComponent,
  anchorBelow,
} from '../../../shared/dialog-shell/dialog-shell.component';
import { FriendActionComponent } from '../../../shared/friend-action/friend-action.component';
import { UnreadBadgeComponent } from '../../../shared/unread-badge/unread-badge.component';

const BADGE_CAP = 99;
const BADGE_CAP_LABEL = '99+';
const BELL_LABEL_IDLE = 'Benachrichtigungen';
const UNKNOWN_NAME = 'Unbekannt';
const SORT_LOCALE = 'de';

/** One unread conversation rendered in the panel. */
interface UnreadRow {
  readonly key: string;
  readonly name: string;
  readonly avatarPath: string | null;
  readonly route: string[];
  readonly convPath: string;
  readonly messagesPath: string;
}

/**
 * Persistent aggregate of pending friend requests and unread conversations,
 * complementing the transient incoming-message toasts.
 */
@Component({
  selector: 'app-notification-center',
  imports: [
    AvatarFallbackDirective,
    DialogShellComponent,
    FriendActionComponent,
    UnreadBadgeComponent,
  ],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterComponent {
  private readonly notificationService = inject(NotificationService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly userService = inject(UserService);

  private readonly channelService = inject(ChannelService);

  private readonly router = inject(Router);

  protected readonly isOpen = signal(false);

  protected readonly anchor = signal<DialogAnchor | null>(null);

  private readonly previews = signal<Record<string, string>>({});

  protected readonly requests = computed(() =>
    this.usersFor(this.friendshipService.pendingIncomingUids()),
  );

  protected readonly unreadRows = computed(() =>
    this.notificationService.unreadConversations().map(watch => this.rowFor(watch)),
  );

  protected readonly badgeValue = computed(() => this.notificationService.attentionCount());

  protected readonly badgeText = computed(() => {
    const value = this.badgeValue();
    if (value === 0) return '';
    return value > BADGE_CAP ? BADGE_CAP_LABEL : String(value);
  });

  protected readonly bellLabel = computed(() => {
    const value = this.badgeValue();
    return value === 0 ? BELL_LABEL_IDLE : `${BELL_LABEL_IDLE}: ${this.badgeText()} neue`;
  });

  protected readonly isEmpty = computed(() => this.badgeValue() === 0);


  /**
   * Opens the panel anchored below the bell and loads the previews.
   * @param event Click event of the bell button.
   */
  protected open(event: Event): void {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    this.anchor.set(anchorBelow(trigger, 'right'));
    this.isOpen.set(true);
    void this.loadPreviews();
  }


  /**
   * Closes the panel.
   */
  protected close(): void {
    this.isOpen.set(false);
  }


  /**
   * Navigates to an unread conversation and closes the panel.
   * @param row Picked unread row.
   */
  protected pick(row: UnreadRow): void {
    void this.router.navigate(row.route);
    this.close();
  }


  /**
   * The loaded preview line for an unread row; empty until loaded so the
   * reserved line never shifts the layout.
   * @param key Watch key of the row.
   */
  protected previewFor(key: string): string {
    return this.previews()[key] ?? '';
  }


  /**
   * Maps an avatar path to a renderable asset path.
   * @param path Stored avatar path.
   */
  protected avatarSrc(path: string): string {
    return resolveAvatarPath(path);
  }


  /**
   * Builds the panel row for a watched unread conversation: channels show
   * their #name with the tag icon, direct messages the partner identity.
   * @param watch Unread conversation descriptor.
   */
  private rowFor(watch: ConversationWatch): UnreadRow {
    const base = { key: watch.key, route: watch.route, convPath: watch.convPath, messagesPath: watch.messagesPath };
    if (watch.channelId) {
      const channel = this.channelService.channels().find(item => item.id === watch.channelId);
      return { ...base, name: `#${channel?.name ?? UNKNOWN_NAME}`, avatarPath: null };
    }
    const partner = this.userService.users().find(user => user.uid === watch.route[1]);
    return {
      ...base,
      name: partner?.name ?? UNKNOWN_NAME,
      avatarPath: this.avatarSrc(partner?.avatarPath ?? ''),
    };
  }


  /**
   * Resolves user documents for a list of uids, sorted by display name.
   * @param uids Uids to resolve.
   */
  private usersFor(uids: string[]): UserDoc[] {
    const wanted = new Set(uids);
    return this.userService
      .users()
      .filter(user => wanted.has(user.uid))
      .sort((a, b) => a.name.localeCompare(b.name, SORT_LOCALE));
  }


  /**
   * Loads the last-message previews for all unread rows with bounded
   * one-shot reads (no listeners).
   */
  private async loadPreviews(): Promise<void> {
    const rows = this.unreadRows();
    const entries = await Promise.all(
      rows.map(async row =>
        [row.key, await this.notificationService.latestPreview(row.messagesPath)] as const,
      ),
    );
    this.previews.set(Object.fromEntries(entries));
  }
}
