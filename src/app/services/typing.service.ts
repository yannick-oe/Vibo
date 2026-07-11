/**
 * @file Per-conversation "is typing" state in Firestore. Markers live in a
 * co-located typing subcollection keyed by the client session (not the uid) so
 * two windows of the shared guest account see each other type; the uid rides
 * inside the document for name resolution and rule checks. Writes are throttled
 * to a heartbeat while typing (cost §14) and cleared on send, on blur and after
 * an idle timeout; readers stream the subcollection and apply a recency window
 * so stale states self-expire even if a clear write is missed.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  collection,
  collectionData,
  deleteDoc,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';
import { ClientSessionService } from './client-session.service';

const TYPING_SEGMENT = 'typing';
const TYPING_HEARTBEAT_MS = 4000;
const TYPING_IDLE_MS = 5000;
const TYPING_READ_LIMIT = 20;

/** A client session's live typing state stored at <conversation>/typing/{sessionId}. */
export interface TypingEntry {
  readonly sessionId: string;
  readonly uid?: string;
  readonly updatedAt?: Timestamp;
}

/** The persisted typing-marker payload: the writer's uid and a server heartbeat. */
interface TypingMarker {
  readonly uid: string;
  readonly updatedAt: FieldValue;
}

/**
 * Reads and writes typing state for channels and direct messages alike; all
 * paths are conversation-document paths, with the typing subcollection
 * co-located so one listener covers every participant.
 */
@Injectable({ providedIn: 'root' })
export class TypingService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly clientSession = inject(ClientSessionService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly lastWriteAt = new Map<string, number>();

  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();


  /**
   * Marks the signed-in session as typing, throttled to at most one Firestore
   * write per TYPING_HEARTBEAT_MS so a burst of keystrokes costs a single write
   * (cost §14), and (re)arms the idle timeout that clears it after a pause.
   * @param conversationPath Path of the conversation document.
   */
  notifyTyping(conversationPath: string): void {
    this.scheduleIdleClear(conversationPath);
    const now = Date.now();
    if (now - (this.lastWriteAt.get(conversationPath) ?? 0) < TYPING_HEARTBEAT_MS) return;
    this.lastWriteAt.set(conversationPath, now);
    void this.write(conversationPath, { uid: this.authService.requireUid(), updatedAt: serverTimestamp() });
  }


  /**
   * Clears the session's typing state (on send, blur or idle) and resets the
   * throttle so the next keystroke writes immediately. No-op when no marker was
   * written (e.g. blurring an untouched composer), so it never issues a delete
   * for a document that does not exist.
   * @param conversationPath Path of the conversation document.
   */
  clearTyping(conversationPath: string): void {
    this.cancelIdleClear(conversationPath);
    if (!this.lastWriteAt.has(conversationPath)) return;
    this.lastWriteAt.delete(conversationPath);
    void this.remove(conversationPath);
  }


  /**
   * Streams the most recent sessions' typing state for a conversation from one
   * listener; callers apply the recency window, exclude their own session and
   * resolve names. Ordered by updatedAt desc and capped so the read cost stays
   * bounded even if abandoned (orphaned) markers accumulate — active typers, the
   * freshest, are always within the window.
   * @param conversationPath Path of the conversation document.
   */
  typingUsers(conversationPath: string): Observable<TypingEntry[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, `${conversationPath}/${TYPING_SEGMENT}`),
          orderBy('updatedAt', 'desc'),
          limit(TYPING_READ_LIMIT),
        ),
        { idField: 'sessionId' },
      ),
    ) as Observable<TypingEntry[]>;
  }


  /**
   * Re-arms the idle timeout for a conversation: a pause longer than
   * TYPING_IDLE_MS clears the marker without waiting for blur.
   * @param conversationPath Path of the conversation document.
   */
  private scheduleIdleClear(conversationPath: string): void {
    this.cancelIdleClear(conversationPath);
    const timer = setTimeout(() => this.clearTyping(conversationPath), TYPING_IDLE_MS);
    this.idleTimers.set(conversationPath, timer);
  }


  /**
   * Cancels any pending idle-clear timer for a conversation.
   * @param conversationPath Path of the conversation document.
   */
  private cancelIdleClear(conversationPath: string): void {
    const timer = this.idleTimers.get(conversationPath);
    if (timer !== undefined) clearTimeout(timer);
    this.idleTimers.delete(conversationPath);
  }


  /**
   * Writes the session's typing marker; failures are swallowed because typing
   * is best-effort and must never surface an error to the user.
   * @param conversationPath Path of the conversation document.
   * @param data Marker payload (the writer uid and server-time heartbeat).
   */
  private write(conversationPath: string, data: TypingMarker): Promise<void> {
    const ref = doc(this.firestore, this.typingPath(conversationPath));
    return runInInjectionContext(this.injector, () => setDoc(ref, data)).catch(() => undefined);
  }


  /**
   * Deletes the session's typing marker; failures are swallowed.
   * @param conversationPath Path of the conversation document.
   */
  private remove(conversationPath: string): Promise<void> {
    const ref = doc(this.firestore, this.typingPath(conversationPath));
    return runInInjectionContext(this.injector, () => deleteDoc(ref)).catch(() => undefined);
  }


  /**
   * Builds the typing-marker document path for the current client session.
   * @param conversationPath Path of the conversation document.
   */
  private typingPath(conversationPath: string): string {
    return `${conversationPath}/${TYPING_SEGMENT}/${this.clientSession.id}`;
  }
}
