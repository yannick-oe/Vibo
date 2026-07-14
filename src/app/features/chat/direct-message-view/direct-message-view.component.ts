/**
 * @file Direct-message chat view: partner header, empty state, shared
 * message list and composer.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';

import { GifResult } from '../../../models/gif.model';
import { Message, ReplyRef } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { ConversationWindow } from '../../../services/conversation-window';
import { DirectMessageService } from '../../../services/direct-message.service';
import { FriendshipService } from '../../../services/friendship.service';
import { MessageService, conversationDocPath } from '../../../services/message.service';
import { NotificationFanoutService } from '../../../services/notification-fanout.service';
import { ReadEntry, ReadStateService } from '../../../services/read-state.service';
import { DEFAULT_AVATAR_PATH, resolveAvatarPath } from '../../../services/registration.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { AuroraNameComponent } from '../../../shared/aurora-name/aurora-name.component';
import { AvatarActivatorDirective } from '../../../shared/avatar/avatar-activator.directive';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { BadgeListComponent } from '../../../shared/badge-list/badge-list.component';
import { displayBadges } from '../../../shared/badge-options';
import { PresenceDotComponent } from '../../../shared/presence-dot/presence-dot.component';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { MessageInputComponent, ReplyContext } from '../message-input/message-input.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { buildReplyRef } from '../reply-ref';
import { DmBlockState, blockStateOf, isUnfriendedState } from './dm-relationship';
import { TypingIndicatorComponent } from '../typing-indicator/typing-indicator.component';
import { extendWindowToBoundary } from '../unread-window';

const SEND_ERROR = 'Die Nachricht konnte nicht gesendet werden.';
const UNBLOCK_ERROR = 'Entsperren hat nicht geklappt. Bitte versuche es erneut.';
const UNKNOWN_PARTNER = 'Unbekannt';
const SELF_SUFFIX = ' (Du)';
const DM_START_MARKER = 'Das ist der Anfang eurer Unterhaltung';

/**
 * Chat view of a direct conversation per the Figma DM frames: header with
 * the partner's live identity, the empty state before the first message
 * (self conversations get their own copy), the shared message list and the
 * composer, which is focused automatically on every conversation switch.
 */
@Component({
  selector: 'app-direct-message-view',
  imports: [
    MessageInputComponent,
    MessageListComponent,
    TypingIndicatorComponent,
    ProfileDialogComponent,
    AuroraNameComponent,
    AvatarActivatorDirective,
    AvatarComponent,
    AvatarFallbackDirective,
    BadgeListComponent,
    PresenceDotComponent,
  ],
  templateUrl: './direct-message-view.component.html',
  styleUrl: './direct-message-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectMessageViewComponent {
  readonly uid = input.required<string>();

  private readonly directMessageService = inject(DirectMessageService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly messageService = inject(MessageService);

  private readonly notificationFanout = inject(NotificationFanoutService);

  private readonly readState = inject(ReadStateService);

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly threadService = inject(ThreadService);

  private readonly composer = viewChild(MessageInputComponent);

  private focusedUid: string | null = null;

  protected readonly profileUid = signal<string | null>(null);

  private readonly replyTarget = signal<ReplyRef | null>(null);

  protected readonly replyContext = computed<ReplyContext | null>(() => this.buildReplyContext());

  protected readonly unreadSince = signal<Timestamp | null>(null);

  private readonly boundaryCapturedFor = signal<string | null>(null);

  protected readonly messageWindow = signal<ConversationWindow | null>(null);

  protected readonly messages = computed(() => this.messageWindow()?.messages() ?? []);

  protected readonly startMarker = DM_START_MARKER;

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  private readonly partnerDoc = computed(() =>
    this.userService.users().find(user => user.uid === this.uid()),
  );

  protected readonly blockState = computed<DmBlockState>(() =>
    blockStateOf(this.friendshipService.relationshipState(this.uid())()),
  );

  protected readonly isUnfriended = computed(
    () =>
      !this.isSelf() &&
      isUnfriendedState(
        this.friendshipService.relationshipState(this.uid())(),
        this.friendshipService.loaded(),
      ),
  );

  protected readonly partnerHandle = computed(
    () => this.partnerDoc()?.username ?? this.partnerName(),
  );

  protected readonly partnerName = computed(() => this.partnerDoc()?.name ?? UNKNOWN_PARTNER);

  protected readonly displayName = computed(
    () => `${this.partnerName()}${this.isSelf() ? SELF_SUFFIX : ''}`,
  );

  protected readonly partnerAvatar = computed(() => resolveAvatarPath(this.partnerDoc()?.avatarPath));

  protected readonly partnerAvatarPath = computed(
    () => this.partnerDoc()?.avatarPath ?? DEFAULT_AVATAR_PATH,
  );

  protected readonly partnerStatus = computed(() => this.partnerDoc()?.status ?? '');

  protected readonly partnerAnimatedName = computed(() => this.partnerDoc()?.animatedName ?? false);

  protected readonly partnerBadges = computed(() => {
    const partner = this.partnerDoc();
    return partner ? displayBadges(partner) : [];
  });

  protected readonly composerPlaceholder = computed(() => `Nachricht an ${this.partnerName()}`);

  protected readonly openThreadMessageId = computed(() => this.resolveOpenThreadMessageId());

  protected readonly messagesCollectionPath = computed(() =>
    this.authService.currentUser()
      ? this.directMessageService.messagesPathWith(this.uid())
      : null,
  );

  protected readonly conversationPath = computed(() => {
    const path = this.messagesCollectionPath();
    return path ? conversationDocPath(path) : null;
  });

  private readonly lastMessageId = computed(() => {
    const list = this.messages();
    return list.length ? list[list.length - 1].id : null;
  });

  protected readonly reads = toSignal(
    toObservable(this.conversationPath).pipe(
      switchMap(path => (path ? this.readState.conversationReads(path) : of([] as ReadEntry[]))),
    ),
    { initialValue: [] as ReadEntry[] },
  );

  protected readonly otherUids = computed(() => {
    const me = this.authService.currentUser()?.uid;
    const partner = this.uid();
    return me && partner !== me ? [partner] : [];
  });


  /**
   * Focuses the composer on every conversation switch and keeps the open
   * conversation marked read as it is opened and as new messages arrive.
   */
  constructor() {
    effect(() => this.handleConversationSwitch(this.uid()));
    effect(() => this.markRead());
    effect(onCleanup => this.openWindow(this.messagesCollectionPath(), onCleanup));
  }


  /**
   * Opens a fresh windowed message source for the conversation and tears the
   * previous one down on switch or destroy; no window while signed out.
   * @param path Messages collection path, or null while signed out.
   * @param onCleanup Registers the teardown for the previous window.
   */
  private openWindow(path: string | null, onCleanup: (cleanup: () => void) => void): void {
    if (!path) {
      this.messageWindow.set(null);
      return;
    }
    const window = this.messageService.openWindow(path);
    this.messageWindow.set(window);
    onCleanup(() => window.destroy());
  }


  /**
   * Marks the open conversation read once it has a message, advancing on every
   * new one so the active conversation always shows zero unread.
   */
  private markRead(): void {
    const path = this.conversationPath();
    if (!path || !this.lastMessageId() || this.boundaryCapturedFor() !== path) return;
    void this.readState.markRead(path);
  }


  /**
   * Freezes the unread boundary for the just-opened conversation from the read
   * marker as it was before this visit. The markRead gate is re-closed
   * synchronously here (before the await, so a re-entry cannot advance the
   * marker on a stale capture) and re-opened once this visit's marker is read;
   * a stale capture from a fast re-switch is dropped.
   */
  private async captureUnreadBoundary(): Promise<void> {
    const path = this.conversationPath();
    const uid = this.authService.currentUser()?.uid;
    this.unreadSince.set(null);
    this.boundaryCapturedFor.set(null);
    if (!path || !uid) return;
    const marker = await this.readState.getReadMarkerOnce(path, uid).catch(() => undefined);
    if (this.conversationPath() !== path) return;
    this.unreadSince.set(marker?.lastReadAt ?? null);
    this.boundaryCapturedFor.set(path);
    const window = this.messageWindow();
    if (window) void extendWindowToBoundary(window, marker?.lastReadAt ?? null);
  }


  /**
   * Sends a composer message, attaching the open inline-reply reference;
   * notifies the partner on @mention and the answered author (mention
   * supersedes reply). The conversation is created lazily; failures toast.
   * @param text Trimmed message text from the composer.
   */
  protected async sendMessage(text: string): Promise<void> {
    const replyTo = this.takeReplyTarget();
    try {
      const id = await this.directMessageService.send(this.uid(), text, replyTo);
      if (!id) return;
      const path = this.directMessageService.messagePathFor(this.uid(), id);
      const mentioned = this.notificationFanout.mentionsSent(path, text);
      if (replyTo) this.notificationFanout.replySent(path, replyTo.authorUid, text, mentioned);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Sends a GIF picked in the composer, attaching the open inline-reply
   * reference and notifying the answered author; the conversation is created
   * lazily. Failures surface as a toast.
   * @param gif Selected GIF result.
   */
  protected async sendGif(gif: GifResult): Promise<void> {
    const replyTo = this.takeReplyTarget();
    try {
      const id = await this.directMessageService.sendGif(this.uid(), gif, replyTo);
      if (id && replyTo) {
        const path = this.directMessageService.messagePathFor(this.uid(), id);
        this.notificationFanout.replySent(path, replyTo.authorUid, '', [], gif.url);
      }
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Opens an inline-reply context for a message: the composer shows the
   * cancelable reply bar and regains focus.
   * @param message Message being answered.
   */
  protected startReply(message: Message): void {
    this.replyTarget.set(buildReplyRef(message));
    requestAnimationFrame(() => this.composer()?.focusInput());
  }


  /**
   * Clears the inline-reply context (composer X, Escape or after a send).
   */
  protected cancelReply(): void {
    this.replyTarget.set(null);
  }


  /**
   * Reads and clears the pending inline-reply reference for the next send.
   */
  private takeReplyTarget(): ReplyRef | undefined {
    const ref = this.replyTarget();
    this.replyTarget.set(null);
    return ref ?? undefined;
  }


  /**
   * Builds the composer reply bar's display data, resolving the answered
   * author's live name; null when no reply is in progress.
   */
  private buildReplyContext(): ReplyContext | null {
    const ref = this.replyTarget();
    if (!ref) return null;
    const author = this.userService.users().find(user => user.uid === ref.authorUid);
    return { authorName: author?.name ?? UNKNOWN_PARTNER, previewText: ref.previewText };
  }


  /**
   * Toggles the thread panel for a direct message: closes it when the
   * message's thread is already open, otherwise opens or switches to it.
   * @param message Message whose thread was requested.
   */
  protected toggleThread(message: Message): void {
    this.threadService.toggle({
      messagePath: this.directMessageService.messagePathFor(this.uid(), message.id),
      contextLabel: this.partnerName(),
    });
  }


  /**
   * Resolves the id of the message whose thread is open in this
   * conversation; null while signed out (session still restoring) because
   * the conversation path depends on the signed-in uid.
   */
  private resolveOpenThreadMessageId(): string | null {
    if (!this.authService.currentUser()) return null;
    return this.threadService.openMessageIdIn(
      this.directMessageService.messagesPathWith(this.uid()),
    );
  }


  /**
   * Focuses the composer and closes a thread from the previous
   * conversation once per conversation switch.
   * @param uid Currently routed partner uid.
   */
  private handleConversationSwitch(uid: string): void {
    if (uid === this.focusedUid) return;
    if (this.focusedUid !== null) this.threadService.close();
    this.focusedUid = uid;
    this.replyTarget.set(null);
    void this.captureUnreadBoundary();
    requestAnimationFrame(() => this.composer()?.focusInput());
  }

  /**
   * Unblocks the conversation partner from the blocker-side composer notice.
   */
  protected async unblockPartner(): Promise<void> {
    try {
      await this.friendshipService.unblockUser(this.uid());
    } catch {
      this.toastService.show(UNBLOCK_ERROR);
    }
  }
}
