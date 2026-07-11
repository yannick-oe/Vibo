/**
 * @file Channel chat view: header, shared message list and composer.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { switchMap } from 'rxjs';

import { Channel } from '../../../models/channel.model';
import { GifResult } from '../../../models/gif.model';
import { Message, ReplyRef } from '../../../models/message.model';
import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { LayoutService } from '../../../services/layout.service';
import { MessageService, channelMessagesPath, conversationDocPath } from '../../../services/message.service';
import { NotificationFanoutService } from '../../../services/notification-fanout.service';
import { ReadEntry, ReadStateService } from '../../../services/read-state.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { DialogAnchor, anchorBelow } from '../../../shared/dialog-shell/dialog-anchor';
import { ChannelAddMembersDialogComponent } from '../channel-add-members-dialog/channel-add-members-dialog.component';
import { ChannelMembersDialogComponent } from '../channel-members-dialog/channel-members-dialog.component';
import { ChannelSettingsDialogComponent } from '../channel-settings-dialog/channel-settings-dialog.component';
import { MessageInputComponent, ReplyContext } from '../message-input/message-input.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { buildReplyRef } from '../reply-ref';
import { TypingIndicatorComponent } from '../typing-indicator/typing-indicator.component';

const SEND_ERROR = 'Die Nachricht konnte nicht gesendet werden.';
const HEAD_AVATAR_LIMIT = 3;
const UNKNOWN_AUTHOR = 'Unbekannt';

type ChannelDialog = 'settings' | 'members' | 'add';

/**
 * Chat view of a channel per Figma frames 06/09: header with name and
 * member cluster, the shared live message list and the composer, which is
 * focused automatically on every channel switch.
 */
@Component({
  selector: 'app-channel-view',
  imports: [
    ChannelAddMembersDialogComponent,
    ChannelMembersDialogComponent,
    ChannelSettingsDialogComponent,
    MessageInputComponent,
    MessageListComponent,
    TypingIndicatorComponent,
    ProfileDialogComponent,
  ],
  templateUrl: './channel-view.component.html',
  styleUrl: './channel-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelViewComponent {
  readonly channelId = input.required<string>();

  private readonly channelService = inject(ChannelService);

  private readonly messageService = inject(MessageService);

  private readonly notificationFanout = inject(NotificationFanoutService);

  private readonly readState = inject(ReadStateService);

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly threadService = inject(ThreadService);

  private readonly layout = inject(LayoutService);

  private readonly composer = viewChild(MessageInputComponent);

  private readonly host = inject(ElementRef<HTMLElement>);

  private focusedChannelId: string | null = null;

  protected readonly dialog = signal<ChannelDialog | null>(null);

  protected readonly dialogAnchor = signal<DialogAnchor | null>(null);

  protected readonly profileUid = signal<string | null>(null);

  private readonly replyTarget = signal<ReplyRef | null>(null);

  protected readonly replyContext = computed<ReplyContext | null>(() => this.buildReplyContext());

  protected readonly unreadSince = signal<Timestamp | null>(null);

  private readonly boundaryCapturedFor = signal<string | null>(null);


  /**
   * Closes the members dialog and opens the member's profile.
   * @param uid Uid of the selected member.
   */
  protected openProfile(uid: string): void {
    this.dialog.set(null);
    this.profileUid.set(uid);
  }

  protected readonly messages = toSignal(
    toObservable(this.channelId).pipe(
      switchMap(id => this.messageService.streamMessages(channelMessagesPath(id))),
    ),
    { initialValue: [] as Message[] },
  );

  protected readonly channel = computed<Channel | undefined>(() =>
    this.channelService.channels().find(channel => channel.id === this.channelId()),
  );

  private readonly resolvedMembers = computed(() => this.resolveMembers());

  protected readonly headMembers = computed(() => this.resolvedMembers().slice(0, HEAD_AVATAR_LIMIT));

  protected readonly memberCount = computed(() => this.resolvedMembers().length);

  protected readonly showIntro = computed(
    () => this.messages().length === 0 && this.channel()?.createdBy === this.authService.currentUser()?.uid,
  );

  protected readonly composerPlaceholder = computed(
    () => `Nachricht an #${this.channel()?.name ?? ''}`,
  );

  protected readonly openThreadMessageId = computed(() =>
    this.threadService.openMessageIdIn(channelMessagesPath(this.channelId())),
  );

  protected readonly messagesCollectionPath = computed(() =>
    channelMessagesPath(this.channelId()),
  );

  protected readonly conversationPath = computed(() =>
    conversationDocPath(this.messagesCollectionPath()),
  );

  private readonly lastMessageId = computed(() => {
    const list = this.messages();
    return list.length ? list[list.length - 1].id : null;
  });

  protected readonly reads = toSignal(
    toObservable(this.conversationPath).pipe(
      switchMap(path => this.readState.conversationReads(path)),
    ),
    { initialValue: [] as ReadEntry[] },
  );

  protected readonly otherUids = computed(() => {
    const me = this.authService.currentUser()?.uid;
    return (this.channel()?.memberIds ?? []).filter(uid => uid !== me);
  });


  /**
   * Focuses the composer on every channel switch and keeps the open channel
   * marked read as it is opened and as new messages arrive.
   */
  constructor() {
    effect(() => this.handleChannelSwitch(this.channelId()));
    effect(() => this.markRead());
  }


  /**
   * Marks the open channel read once it has a message, advancing on every new
   * one so the active channel always shows zero unread.
   */
  private markRead(): void {
    const path = this.conversationPath();
    if (!this.lastMessageId() || this.boundaryCapturedFor() !== path) return;
    void this.readState.markRead(path);
  }


  /**
   * Freezes the unread boundary for the just-opened channel from the read
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
    if (!uid) return;
    const marker = await this.readState.getReadMarkerOnce(path, uid).catch(() => undefined);
    if (this.conversationPath() !== path) return;
    this.unreadSince.set(marker?.lastReadAt ?? null);
    this.boundaryCapturedFor.set(path);
  }


  /**
   * Sends a composer message, attaching the open inline-reply reference;
   * notifies @mentioned members and the answered author (mention supersedes
   * reply). Failures surface as a toast.
   * @param text Trimmed message text from the composer.
   */
  protected async sendMessage(text: string): Promise<void> {
    const collectionPath = channelMessagesPath(this.channelId());
    const replyTo = this.takeReplyTarget();
    try {
      const id = await this.messageService.sendMessage(collectionPath, text, replyTo);
      const mentioned = this.notificationFanout.mentionsSent(`${collectionPath}/${id}`, text);
      if (replyTo) this.notificationFanout.replySent(`${collectionPath}/${id}`, replyTo.authorUid, text, mentioned);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Sends a GIF picked in the composer, attaching the open inline-reply
   * reference and notifying the answered author; failures surface as a toast.
   * @param gif Selected GIF result.
   */
  protected async sendGif(gif: GifResult): Promise<void> {
    const collectionPath = channelMessagesPath(this.channelId());
    const replyTo = this.takeReplyTarget();
    try {
      const id = await this.messageService.sendGif(collectionPath, gif, replyTo);
      if (replyTo) this.notificationFanout.replySent(`${collectionPath}/${id}`, replyTo.authorUid, '', [], gif.url);
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
    return { authorName: author?.name ?? UNKNOWN_AUTHOR, previewText: ref.previewText };
  }


  /**
   * Maps an avatar path to an absolute asset URL; missing paths and
   * external URLs fall back to the placeholder.
   * @param path Avatar path stored on a user document.
   */
  protected avatarSrc(path: string | undefined): string {
    return resolveAvatarPath(path);
  }


  /**
   * Opens a header dialog anchored to its trigger per the Figma prototype:
   * the settings card left-aligns with the channel name, member dialogs
   * right-align with the chat card edge. Small viewports fall back to the
   * centered variant.
   * @param kind Dialog to open.
   * @param event Click event of the header trigger.
   */
  protected openDialog(kind: ChannelDialog, event: Event): void {
    if (kind === 'add' && this.layout.isMobile()) {
      kind = 'members';
    }
    this.dialogAnchor.set(this.anchorFor(kind, event));
    this.dialog.set(kind);
  }


  /**
   * Computes the viewport anchor for a dialog; null centers it.
   * @param kind Dialog to open.
   * @param event Click event of the header trigger.
   */
  private anchorFor(kind: ChannelDialog, event: Event): DialogAnchor | null {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return null;
    if (kind === 'settings') return anchorBelow(trigger, 'left');
    return anchorBelow(trigger, 'right', this.host.nativeElement);
  }


  /**
   * Toggles the thread panel for a channel message: closes it when the
   * message's thread is already open, otherwise opens or switches to it.
   * @param message Message whose thread was requested.
   */
  protected toggleThread(message: Message): void {
    this.threadService.toggle({
      messagePath: `${channelMessagesPath(this.channelId())}/${message.id}`,
      contextLabel: `# ${this.channel()?.name ?? ''}`,
    });
  }


  /**
   * Focuses the composer and closes a thread from the previous channel
   * once per channel switch.
   * @param channelId Currently routed channel id.
   */
  private handleChannelSwitch(channelId: string): void {
    if (channelId === this.focusedChannelId) return;
    if (this.focusedChannelId !== null) this.threadService.close();
    this.focusedChannelId = channelId;
    this.replyTarget.set(null);
    void this.captureUnreadBoundary();
    requestAnimationFrame(() => this.composer()?.focusInput());
  }


  /**
   * Resolves the channel's member documents, skipping any member uid without a
   * user document (e.g. a deleted account) so the count and the avatar cluster
   * reflect only real, renderable members — a single source for both.
   */
  private resolveMembers(): UserDoc[] {
    const memberIds = this.channel()?.memberIds ?? [];
    const users = new Map(this.userService.users().map(user => [user.uid, user]));
    return memberIds.map(uid => users.get(uid)).filter((user): user is UserDoc => user !== undefined);
  }
}
