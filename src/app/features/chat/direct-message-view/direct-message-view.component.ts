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
import { switchMap } from 'rxjs';

import { Message } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { DirectMessageService } from '../../../services/direct-message.service';
import { PresenceService } from '../../../services/presence.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { MessageInputComponent } from '../message-input/message-input.component';
import { MessageListComponent } from '../message-list/message-list.component';

const SEND_ERROR = 'Die Nachricht konnte nicht gesendet werden.';
const UNKNOWN_PARTNER = 'Unbekannt';
const SELF_SUFFIX = ' (Du)';

/**
 * Chat view of a direct conversation per the Figma DM frames: header with
 * the partner's live identity, the empty state before the first message
 * (self conversations get their own copy), the shared message list and the
 * composer, which is focused automatically on every conversation switch.
 */
@Component({
  selector: 'app-direct-message-view',
  imports: [MessageInputComponent, MessageListComponent, ProfileDialogComponent],
  templateUrl: './direct-message-view.component.html',
  styleUrl: './direct-message-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectMessageViewComponent {
  readonly uid = input.required<string>();

  private readonly directMessageService = inject(DirectMessageService);

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  protected readonly presenceService = inject(PresenceService);

  private readonly toastService = inject(ToastService);

  private readonly threadService = inject(ThreadService);

  private readonly composer = viewChild(MessageInputComponent);

  private focusedUid: string | null = null;

  protected readonly profileOpen = signal(false);

  protected readonly messages = toSignal(
    toObservable(this.uid).pipe(
      switchMap(partnerUid => this.directMessageService.streamMessagesWith(partnerUid)),
    ),
    { initialValue: [] as Message[] },
  );

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  protected readonly partnerName = computed(
    () => this.userService.users().find(user => user.uid === this.uid())?.name ?? UNKNOWN_PARTNER,
  );

  protected readonly displayName = computed(
    () => `${this.partnerName()}${this.isSelf() ? SELF_SUFFIX : ''}`,
  );

  protected readonly partnerAvatar = computed(() => this.resolvePartnerAvatar());

  protected readonly composerPlaceholder = computed(() => `Nachricht an ${this.partnerName()}`);

  protected readonly openThreadMessageId = computed(() => this.resolveOpenThreadMessageId());

  protected readonly messagesCollectionPath = computed(() =>
    this.authService.currentUser()
      ? this.directMessageService.messagesPathWith(this.uid())
      : null,
  );


  /**
   * Focuses the composer on every conversation switch.
   */
  constructor() {
    effect(() => this.handleConversationSwitch(this.uid()));
  }


  /**
   * Sends a composer message; the conversation document is created lazily
   * by the service. Failures surface as a toast.
   * @param text Trimmed message text from the composer.
   */
  protected async sendMessage(text: string): Promise<void> {
    try {
      await this.directMessageService.send(this.uid(), text);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Resolves the partner's avatar with the placeholder as fallback.
   */
  private resolvePartnerAvatar(): string {
    const path = this.userService.users().find(user => user.uid === this.uid())?.avatarPath;
    return resolveAvatarPath(path);
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
    requestAnimationFrame(() => this.composer()?.focusInput());
  }
}
