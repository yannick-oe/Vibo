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
import { switchMap } from 'rxjs';

import { Channel } from '../../../models/channel.model';
import { Message } from '../../../models/message.model';
import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { LayoutService } from '../../../services/layout.service';
import { MessageService, channelMessagesPath, conversationDocPath } from '../../../services/message.service';
import { ReadEntry, ReadStateService } from '../../../services/read-state.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { DialogAnchor, anchorBelow } from '../../../shared/dialog-shell/dialog-shell.component';
import { ChannelAddMembersDialogComponent } from '../channel-add-members-dialog/channel-add-members-dialog.component';
import { ChannelMembersDialogComponent } from '../channel-members-dialog/channel-members-dialog.component';
import { ChannelSettingsDialogComponent } from '../channel-settings-dialog/channel-settings-dialog.component';
import { MessageInputComponent } from '../message-input/message-input.component';
import { MessageListComponent } from '../message-list/message-list.component';

const SEND_ERROR = 'Die Nachricht konnte nicht gesendet werden.';
const HEAD_AVATAR_LIMIT = 3;

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

  protected readonly headMembers = computed(() => this.resolveHeadMembers());

  protected readonly memberCount = computed(() => this.channel()?.memberIds.length ?? 0);

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

  private readonly conversationPath = computed(() =>
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
    if (!this.lastMessageId()) return;
    void this.readState.markRead(this.conversationPath());
  }


  /**
   * Sends a composer message; failures surface as a toast.
   * @param text Trimmed message text from the composer.
   */
  protected async sendMessage(text: string): Promise<void> {
    try {
      await this.messageService.sendMessage(channelMessagesPath(this.channelId()), text);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
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
    requestAnimationFrame(() => this.composer()?.focusInput());
  }


  /**
   * Resolves up to three member documents for the header avatar cluster.
   */
  private resolveHeadMembers(): UserDoc[] {
    const memberIds = this.channel()?.memberIds ?? [];
    const users = new Map(this.userService.users().map(user => [user.uid, user]));
    return memberIds
      .map(uid => users.get(uid))
      .filter((user): user is UserDoc => user !== undefined)
      .slice(0, HEAD_AVATAR_LIMIT);
  }
}
