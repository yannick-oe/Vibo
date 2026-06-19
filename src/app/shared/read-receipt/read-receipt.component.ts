/**
 * @file Read-receipt checkmarks for the user's own sent messages (WhatsApp
 * style): one grey check while sending, two grey once stored on the server,
 * two blue once every other participant has read it. The checks are a button
 * that opens a readers popover. Every state is derived from the conversation's
 * single reads-collection subscription plus snapshot metadata — no per-message
 * Firestore reads.
 */
import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

import { Message } from '../../models/message.model';
import { ReadEntry } from '../../services/read-state.service';
import { UserService } from '../../services/user.service';
import {
  DialogAnchor,
  DialogShellComponent,
  anchorBelow,
} from '../dialog-shell/dialog-shell.component';

type ReceiptState = 'sending' | 'stored' | 'read';

const UNKNOWN_READER = 'Unbekannt';
const TIME_FORMAT = 'HH:mm';
const SHOW_READERS_LABEL = 'Lesebestätigungen anzeigen';
const READERS_TITLE_ID_PREFIX = 'read-receipt-title-';
const STATE_LABEL: Record<ReceiptState, string> = {
  sending: 'Wird gesendet',
  stored: 'Zugestellt',
  read: 'Von allen gelesen',
};

/** One reader of a message: display name and last-seen time. */
interface ReaderEntry {
  readonly uid: string;
  readonly name: string;
  readonly time: string;
}

/**
 * Receipt checkmarks shown only on the signed-in user's own messages. Clicking
 * (when there are other participants) opens a popover listing who has read the
 * message and when, worded honestly as "gelesen" from each reader's lastReadAt.
 */
@Component({
  selector: 'app-read-receipt',
  imports: [DialogShellComponent],
  templateUrl: './read-receipt.component.html',
  styleUrl: './read-receipt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadReceiptComponent {
  private static instanceCounter = 0;

  readonly entry = input.required<Message>();

  readonly reads = input<ReadEntry[]>([]);

  readonly otherUids = input<string[]>([]);

  private readonly userService = inject(UserService);

  private readonly locale = inject(LOCALE_ID);

  protected readonly titleId = `${READERS_TITLE_ID_PREFIX}${ReadReceiptComponent.instanceCounter++}`;

  protected readonly menuOpen = signal(false);

  protected readonly anchor = signal<DialogAnchor | null>(null);

  protected readonly hasOthers = computed(() => this.otherUids().length > 0);

  protected readonly state = computed<ReceiptState>(() => this.deriveState());

  protected readonly stateLabel = computed(() => STATE_LABEL[this.state()]);

  protected readonly buttonLabel = computed(() => `${this.stateLabel()}, ${SHOW_READERS_LABEL}`);

  protected readonly readers = computed(() => this.resolveReaders());


  /**
   * Opens the readers popover anchored below the checkmarks.
   * @param event Click event of the checkmark button.
   */
  protected open(event: Event): void {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    this.anchor.set(anchorBelow(trigger, 'right'));
    this.menuOpen.set(true);
  }


  /**
   * Closes the readers popover.
   */
  protected close(): void {
    this.menuOpen.set(false);
  }


  /**
   * Derives the receipt state from snapshot metadata and the read markers.
   */
  private deriveState(): ReceiptState {
    if (this.entry().hasPendingWrites) return 'sending';
    return this.readByAll() ? 'read' : 'stored';
  }


  /**
   * True only when every other participant's lastReadAt is at or after this
   * message's createdAt; false without other participants or before createdAt
   * resolves (no escalation to blue in self-conversations).
   */
  private readByAll(): boolean {
    const created = this.createdMillis();
    if (created === null || !this.hasOthers()) return false;
    return this.otherUids().every(uid => this.hasRead(uid, created));
  }


  /**
   * Whether a participant has read this message.
   * @param uid Participant uid.
   * @param created Message createdAt in milliseconds.
   */
  private hasRead(uid: string, created: number): boolean {
    const lastReadAt = this.reads().find(read => read.uid === uid)?.lastReadAt;
    return lastReadAt instanceof Timestamp && lastReadAt.toMillis() >= created;
  }


  /**
   * Resolves the other participants who have read this message into named,
   * time-stamped reader entries for the popover.
   */
  private resolveReaders(): ReaderEntry[] {
    const created = this.createdMillis();
    if (created === null) return [];
    return this.otherUids()
      .map(uid => this.toReader(uid, created))
      .filter((reader): reader is ReaderEntry => reader !== null);
  }


  /**
   * Builds a reader entry for a participant who has read the message, or null.
   * @param uid Participant uid.
   * @param created Message createdAt in milliseconds.
   */
  private toReader(uid: string, created: number): ReaderEntry | null {
    const lastReadAt = this.reads().find(read => read.uid === uid)?.lastReadAt;
    if (!(lastReadAt instanceof Timestamp) || lastReadAt.toMillis() < created) return null;
    const name = this.userService.users().find(user => user.uid === uid)?.name ?? UNKNOWN_READER;
    return { uid, name, time: formatDate(lastReadAt.toDate(), TIME_FORMAT, this.locale) };
  }


  /**
   * The message's createdAt in milliseconds, or null while the
   * serverTimestamp() sentinel has not resolved yet.
   */
  private createdMillis(): number | null {
    const createdAt = this.entry().createdAt;
    return createdAt instanceof Timestamp ? createdAt.toMillis() : null;
  }
}
