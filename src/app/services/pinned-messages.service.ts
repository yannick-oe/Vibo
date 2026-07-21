/**
 * @file Message pinning: the pinned flag mutation, the one-shot pinned-list
 * query for the header dialog, the pinned count of the open chat context
 * and the per-context "pins seen" state backing the header's unseen badge
 * (persisted in localStorage, clamped whenever the count drops below it).
 * Deliberately listener-free — the count is fetched once per context switch
 * (aggregate read) and kept in sync locally for the user's own pin actions;
 * foreign pins refresh on the next context open.
 */
import { Injectable, Injector, computed, inject, runInInjectionContext, signal } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import { readSeenPinCount, storeSeenPinCount } from '../features/chat/pinned-messages/pins-seen.storage';
import { Message, MessageDoc } from '../models/message.model';

/** Maximum pinned messages fetched for the header dialog. */
export const PINNED_QUERY_LIMIT = 50;

const PINNED_FIELD = 'pinned';


/**
 * Milliseconds of a message creation time; write sentinels sort oldest.
 * @param value Stored creation time.
 */
function createdMillis(value: Timestamp | FieldValue): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

/**
 * Holds the pinned count of the currently open channel/DM context and runs
 * all pin reads/writes. Reads are one-shot (no new Firestore listeners); the
 * live message window already streams each row's own pinned flag.
 */
@Injectable({ providedIn: 'root' })
export class PinnedMessagesService {
  private readonly firestore = inject(Firestore);

  private readonly injector = inject(Injector);

  private readonly contextPath = signal<string | null>(null);

  private readonly count = signal(0);

  private readonly seenCount = signal(0);

  /** Pinned-message count of the current context (stale-tolerant, see @file). */
  readonly pinnedCount = this.count.asReadonly();

  /** Pins of the current context not yet seen in the pinned view. */
  readonly unseenCount = computed(() => Math.max(0, this.count() - this.seenCount()));


  /**
   * Switches the pinned context to a messages collection, fetches its
   * pinned count once via aggregate query and reconciles the persisted
   * seen state against the fresh count. A failed fetch keeps the count at
   * zero (stale-tolerant by design, retried on the next context switch)
   * instead of leaking an unhandled rejection.
   * @param messagesPath Messages collection of the open channel/conversation.
   */
  async openContext(messagesPath: string): Promise<void> {
    this.contextPath.set(messagesPath);
    this.count.set(0);
    this.seenCount.set(readSeenPinCount(messagesPath));
    try {
      const pinnedQuery = query(
        collection(this.firestore, messagesPath),
        where(PINNED_FIELD, '==', true),
      );
      const snapshot = await this.inContext(() => getCountFromServer(pinnedQuery));
      if (this.contextPath() !== messagesPath) return;
      this.count.set(snapshot.data().count);
      this.clampSeen(messagesPath);
    } catch {
      return;
    }
  }


  /**
   * Records the current pin state as seen (the pinned view was opened);
   * the unseen badge disappears immediately.
   */
  markSeen(): void {
    const context = this.contextPath();
    if (!context) return;
    storeSeenPinCount(context, this.count());
    this.seenCount.set(this.count());
  }


  /**
   * Sets or clears the pinned flag on a message and keeps the local count in
   * sync when the message belongs to the open context.
   * @param messagePath Full document path of the message.
   * @param pinned Next pinned state.
   */
  async setPinned(messagePath: string, pinned: boolean): Promise<void> {
    await this.inContext(() => updateDoc(doc(this.firestore, messagePath), { pinned }));
    const context = this.contextPath();
    if (!context || !messagePath.startsWith(`${context}/`)) return;
    this.count.update(current => Math.max(0, current + (pinned ? 1 : -1)));
    this.clampSeen(context);
  }


  /**
   * Clamps the seen state down to the current count after unpins below the
   * recorded value, so a later new pin badges correctly instead of hiding
   * behind a stale recorded state.
   * @param messagesPath Context whose seen state is reconciled.
   */
  private clampSeen(messagesPath: string): void {
    if (this.seenCount() <= this.count()) return;
    storeSeenPinCount(messagesPath, this.count());
    this.seenCount.set(this.count());
  }


  /**
   * Fetches the pinned messages of a collection once, newest first (sorted
   * client-side so the equality query needs no composite index). A failed
   * fetch degrades to an empty list (the dialog reopens retry it).
   * @param messagesPath Messages collection of the open channel/conversation.
   */
  async fetchPinned(messagesPath: string): Promise<Message[]> {
    try {
      const pinnedQuery = query(
        collection(this.firestore, messagesPath),
        where(PINNED_FIELD, '==', true),
        limit(PINNED_QUERY_LIMIT),
      );
      const snapshot = await this.inContext(() => getDocs(pinnedQuery));
      const messages = snapshot.docs.map(entry => ({ id: entry.id, ...(entry.data() as MessageDoc) }));
      return messages.sort((a, b) => createdMillis(b.createdAt) - createdMillis(a.createdAt));
    } catch {
      return [];
    }
  }


  /**
   * Runs a Firebase call inside the injection context, as AngularFire
   * requires for calls scheduled from event handlers.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
