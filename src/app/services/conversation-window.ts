/**
 * @file Windowed message loading for a channel or direct conversation. Keeps ONE
 * live listener over the newest page (orderBy createdAt desc, limit PAGE_SIZE)
 * that powers realtime appends, stick-to-bottom and the jump-to-latest counter,
 * while older history is fetched on demand as one-shot pages (getDocs +
 * startAfter) and merged in. Loaded messages are accumulated by id and never
 * dropped, so a sliding live window never removes a message the reader already
 * has; messages that leave the live window keep their last-known state (one-shot)
 * until the conversation is reopened (documented staleness trade-off). A live
 * page that no longer overlaps the store (>= PAGE_SIZE arrived at once, e.g. an
 * offline resync) is a discontinuity: the store resets to that page so no gap is
 * left behind.
 */
import { EnvironmentInjector, Signal, computed, runInInjectionContext, signal } from '@angular/core';
import {
  Firestore,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Timestamp,
  Unsubscribe,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
} from '@angular/fire/firestore';

import { Message, MessageDoc } from '../models/message.model';

/** Messages fetched per page (initial live window and each older page). */
export const PAGE_SIZE = 50;

const CREATED_AT_FIELD = 'createdAt';

/**
 * A live-plus-paginated view over one conversation's messages. Create via
 * {@link MessageService.openWindow} and call {@link destroy} on context switch.
 */
export class ConversationWindow {
  private readonly store = signal<ReadonlyMap<string, Message>>(new Map());

  private readonly atStartState = signal(false);

  private readonly loadedState = signal(false);

  private readonly loadingOlderState = signal(false);

  private oldestSnapshot: QueryDocumentSnapshot | null = null;

  private initialized = false;

  private inFlight: Promise<void> | null = null;

  private unsubscribe: Unsubscribe | null = null;

  private readyResolve: (() => void) | null = null;

  private readonly readyPromise = new Promise<void>(resolve => (this.readyResolve = resolve));

  readonly messages: Signal<Message[]> = computed(() => sortMessages(this.store()));

  readonly atStart = this.atStartState.asReadonly();

  readonly loaded = this.loadedState.asReadonly();

  readonly loadingOlder = this.loadingOlderState.asReadonly();


  /**
   * @param firestore Firestore instance.
   * @param injector Environment injector for running SDK calls in context.
   * @param collectionPath Path of the conversation's messages collection.
   * @param onError Reports a load failure to the owner (e.g. a toast).
   */
  constructor(
    private readonly firestore: Firestore,
    private readonly injector: EnvironmentInjector,
    private readonly collectionPath: string,
    private readonly onError: () => void,
  ) {
    this.startLiveWindow();
  }


  /**
   * The oldest loaded message, or undefined when nothing is loaded yet.
   */
  oldestLoaded(): Message | undefined {
    return this.messages()[0];
  }


  /**
   * Fetches the next older page (one-shot) and merges it in, serialized so
   * concurrent callers share the same in-flight fetch. No-op at the start or
   * before the live window has anchored its cursor.
   */
  loadOlder(): Promise<void> {
    const cursor = this.oldestSnapshot;
    if (this.atStartState() || !cursor) return Promise.resolve();
    if (!this.inFlight) this.inFlight = this.runLoadOlder(cursor).finally(() => (this.inFlight = null));
    return this.inFlight;
  }


  /**
   * Loads older pages until `reached` holds, the true start is hit, or
   * `maxPages` real pages have been fetched; waits for the cursor first and
   * stops if a load makes no progress. Returns whether `reached` ended true.
   * @param reached Predicate over the currently loaded messages.
   * @param maxPages Hard cap on the pages fetched.
   */
  async loadOlderUntil(reached: () => boolean, maxPages: number): Promise<boolean> {
    await this.readyPromise;
    let pages = 0;
    while (!reached() && !this.atStartState() && pages < maxPages) {
      const before = this.oldestSnapshot;
      await this.loadOlder();
      if (this.oldestSnapshot === before && !this.atStartState()) break;
      pages += 1;
    }
    return reached();
  }


  /**
   * Stops the live listener and unblocks any pending readiness wait; call on
   * context switch or teardown.
   */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.markReady();
  }


  /**
   * Opens the live listener over the newest page and merges each snapshot.
   */
  private startLiveWindow(): void {
    const liveQuery = query(
      collection(this.firestore, this.collectionPath),
      orderBy(CREATED_AT_FIELD, 'desc'),
      limit(PAGE_SIZE),
    );
    this.unsubscribe = runInInjectionContext(this.injector, () =>
      onSnapshot(
        liveQuery,
        { includeMetadataChanges: true },
        snapshot => this.onLiveSnapshot(snapshot),
        () => this.handleListenError(),
      ),
    );
  }


  /**
   * Applies a live snapshot: initialises on the first server page, resets on a
   * discontinuity (a page that shares nothing with the store), else merges.
   * @param snapshot Live query snapshot of the newest page.
   */
  private onLiveSnapshot(snapshot: QuerySnapshot): void {
    if (!this.initialized) return this.tryInitialize(snapshot);
    if (hasGap(this.store(), snapshot)) this.reset(snapshot);
    else this.merge(snapshot.docs);
  }


  /**
   * Merges early cache snapshots, and on the first server snapshot anchors the
   * cursor, detects a fully loaded conversation and signals readiness.
   * @param snapshot Live query snapshot of the newest page.
   */
  private tryInitialize(snapshot: QuerySnapshot): void {
    this.merge(snapshot.docs);
    if (snapshot.size > 0 || !snapshot.metadata.fromCache) this.loadedState.set(true);
    if (snapshot.metadata.fromCache) return;
    this.initialized = true;
    this.oldestSnapshot = snapshot.docs[snapshot.size - 1] ?? null;
    this.atStartState.set(snapshot.size < PAGE_SIZE);
    this.markReady();
  }


  /**
   * Replaces the store with a discontinuous newest page and re-anchors the
   * cursor, so older history is re-fetchable and no gap is silently left.
   * @param snapshot Live query snapshot that no longer overlaps the store.
   */
  private reset(snapshot: QuerySnapshot): void {
    const next = new Map<string, Message>();
    for (const document of snapshot.docs) next.set(document.id, toMessage(document));
    this.store.set(next);
    this.oldestSnapshot = snapshot.docs[snapshot.size - 1] ?? null;
    this.atStartState.set(snapshot.size < PAGE_SIZE);
  }


  /**
   * Runs the one-shot older-page query before the given cursor.
   * @param cursor Oldest loaded document to page before.
   */
  private fetchOlderPage(cursor: QueryDocumentSnapshot): Promise<QuerySnapshot> {
    const olderQuery = query(
      collection(this.firestore, this.collectionPath),
      orderBy(CREATED_AT_FIELD, 'desc'),
      startAfter(cursor),
      limit(PAGE_SIZE),
    );
    return runInInjectionContext(this.injector, () => getDocs(olderQuery));
  }


  /**
   * Executes one older-page load (guarded by loadingOlder), merging the result
   * and advancing the cursor; failures surface via onError.
   * @param cursor Oldest loaded document to page before.
   */
  private async runLoadOlder(cursor: QueryDocumentSnapshot): Promise<void> {
    this.loadingOlderState.set(true);
    try {
      this.applyOlderPage(await this.fetchOlderPage(cursor));
    } catch {
      this.onError();
    } finally {
      this.loadingOlderState.set(false);
    }
  }


  /**
   * Merges an older page, advances the cursor and flags the true start.
   * @param snapshot Older-page query snapshot.
   */
  private applyOlderPage(snapshot: QuerySnapshot): void {
    if (snapshot.size > 0) {
      this.oldestSnapshot = snapshot.docs[snapshot.size - 1];
      this.merge(snapshot.docs);
    }
    if (snapshot.size < PAGE_SIZE) this.atStartState.set(true);
  }


  /**
   * Upserts documents into the id-keyed store (never removing), so sliding the
   * live window keeps already-loaded messages and edits update them in place.
   * @param docs Query documents to merge.
   */
  private merge(docs: QueryDocumentSnapshot[]): void {
    const next = new Map(this.store());
    for (const document of docs) next.set(document.id, toMessage(document));
    this.store.set(next);
  }


  /**
   * Reports a listener error and unblocks readiness so paged loads stop waiting.
   */
  private handleListenError(): void {
    this.onError();
    this.markReady();
  }


  /**
   * Resolves the one-shot readiness promise (idempotent).
   */
  private markReady(): void {
    this.readyResolve?.();
    this.readyResolve = null;
  }
}


/**
 * Whether a live page is a discontinuity: it has documents, the store already
 * holds messages, and the page shares no id with the store (>= PAGE_SIZE newer
 * messages surfaced at once, leaving a hole the merge could not bridge).
 * @param store Current id-keyed store.
 * @param snapshot Incoming live page.
 */
function hasGap(store: ReadonlyMap<string, Message>, snapshot: QuerySnapshot): boolean {
  return snapshot.size > 0 && store.size > 0 && !snapshot.docs.some(document => store.has(document.id));
}


/**
 * Maps a query document to a Message with its id and pending-write flag.
 * @param document Query document snapshot.
 */
function toMessage(document: QueryDocumentSnapshot): Message {
  return {
    ...(document.data() as MessageDoc),
    id: document.id,
    hasPendingWrites: document.metadata.hasPendingWrites,
  };
}


/**
 * Sorts the store's messages ascending by creation time, breaking ties by id to
 * match Firestore; an unresolved serverTimestamp sentinel sorts last (newest).
 * @param store Id-keyed message store.
 */
function sortMessages(store: ReadonlyMap<string, Message>): Message[] {
  return [...store.values()].sort(
    (a, b) => createdMillis(a) - createdMillis(b) || (a.id < b.id ? -1 : 1),
  );
}


/**
 * Milliseconds of a message's createdAt; a pending sentinel sorts as newest.
 * @param message Message to read.
 */
function createdMillis(message: Message): number {
  return message.createdAt instanceof Timestamp
    ? message.createdAt.toMillis()
    : Number.MAX_SAFE_INTEGER;
}
