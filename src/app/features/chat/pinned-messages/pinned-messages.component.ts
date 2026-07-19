/**
 * @file Header pin button (always-rendered slot with an unseen badge that
 * clears on open, seen state persisted per context in localStorage) plus
 * the pinned-messages dialog of the open channel/DM: one-shot pinned
 * query, newest first, entries rendered via the shared message-content
 * pipeline with an unpin ("Lösen") action. Deliberately no
 * jump-to-message — with windowed history the target may not be loaded
 * (see DEVIATIONS.md).
 */
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { Message } from '../../../models/message.model';
import { PinnedMessagesService } from '../../../services/pinned-messages.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { gifWebpRendition } from '../gif-rendition';
import { MessageContentComponent } from '../message-content/message-content.component';
import { messageTime, runMessageAction } from '../message-item/message-item.util';

const UNKNOWN_AUTHOR = 'Unbekannt';

/**
 * Pin entry point in the chat header: badge-carrying trigger and the dialog
 * listing the context's pinned messages. Owns its context switching — the
 * chat views only pass the messages collection path.
 */
@Component({
  selector: 'app-pinned-messages',
  imports: [DialogShellComponent, MessageContentComponent],
  templateUrl: './pinned-messages.component.html',
  styleUrl: './pinned-messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PinnedMessagesComponent {
  readonly messagesPath = input.required<string | null>();

  private readonly pinnedMessages = inject(PinnedMessagesService);

  private readonly userService = inject(UserService);

  private readonly toastService = inject(ToastService);

  private readonly locale = inject(LOCALE_ID);

  protected readonly isOpen = signal(false);

  protected readonly entries = signal<Message[] | null>(null);

  protected readonly unseen = this.pinnedMessages.unseenCount;

  protected readonly triggerLabel = computed(() =>
    this.unseen() > 0
      ? `Angepinnte Nachrichten anzeigen (${this.unseen()} neu)`
      : 'Angepinnte Nachrichten anzeigen',
  );


  constructor() {
    effect(() => this.onContextSwitch(this.messagesPath()));
  }


  /**
   * Re-anchors the pin state to a new chat context: closes an open dialog,
   * drops stale entries and refreshes the count once. A null path (DM whose
   * auth state is still resolving) keeps the slot rendered but idle.
   * @param messagesPath Messages collection of the now-open context.
   */
  private onContextSwitch(messagesPath: string | null): void {
    this.isOpen.set(false);
    this.entries.set(null);
    if (messagesPath) void this.pinnedMessages.openContext(messagesPath);
  }


  /**
   * Opens the dialog, records the current pin state as seen (the unseen
   * badge disappears immediately) and fetches the pinned list once.
   */
  protected open(): void {
    if (!this.messagesPath()) return;
    this.pinnedMessages.markSeen();
    this.isOpen.set(true);
    void this.loadEntries();
  }


  /** Closes the dialog. */
  protected close(): void {
    this.isOpen.set(false);
  }


  /**
   * Runs the one-shot pinned query; the result is dropped when the context
   * switched while the query was in flight.
   */
  private async loadEntries(): Promise<void> {
    const messagesPath = this.messagesPath();
    if (!messagesPath) return;
    const list = await this.pinnedMessages.fetchPinned(messagesPath);
    if (this.messagesPath() === messagesPath) this.entries.set(list);
  }


  /**
   * Unpins an entry and removes it from the open list; failures surface as
   * the shared error toast.
   * @param message Pinned message to release.
   */
  protected async unpin(message: Message): Promise<void> {
    const messagePath = `${this.messagesPath()}/${message.id}`;
    const done = await runMessageAction(this.toastService, () =>
      this.pinnedMessages.setPinned(messagePath, false),
    );
    if (done) this.entries.update(list => list && list.filter(entry => entry.id !== message.id));
  }


  /**
   * Resolves an author uid to the display name.
   * @param uid Author uid of a pinned message.
   */
  protected authorName(uid: string): string {
    return this.userService.users().find(user => user.uid === uid)?.name ?? UNKNOWN_AUTHOR;
  }


  /**
   * Formats a pinned message's creation time (HH:mm).
   * @param message Pinned message.
   */
  protected timeOf(message: Message): string {
    return messageTime(message.createdAt, this.locale);
  }


  /**
   * WebP rendition of a pinned GIF entry, falling back to the stored URL.
   * @param message Pinned GIF message.
   */
  protected gifSrcOf(message: Message): string {
    const stored = message.gifUrl ?? '';
    return gifWebpRendition(stored) ?? stored;
  }
}
