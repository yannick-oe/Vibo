/**
 * @file Per-conversation "is typing" state in Firestore. Writes are throttled
 * to at most one per a few seconds while typing (cost §14) and cleared on send
 * and on blur; readers stream the typing subcollection and apply a client-side
 * recency window so stale states self-expire even if a clear write is missed.
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
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';

const TYPING_SEGMENT = 'typing';
const TYPING_THROTTLE_MS = 2500;

/** A user's live typing state stored at <conversation>/typing/{uid}. */
export interface TypingEntry {
  readonly uid: string;
  readonly updatedAt?: Timestamp;
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

  private readonly injector = inject(EnvironmentInjector);

  private readonly lastWriteAt = new Map<string, number>();


  /**
   * Marks the signed-in user as typing, throttled to at most one Firestore
   * write per TYPING_THROTTLE_MS so a burst of keystrokes costs a single
   * write (cost §14).
   * @param conversationPath Path of the conversation document.
   */
  notifyTyping(conversationPath: string): void {
    const now = Date.now();
    if (now - (this.lastWriteAt.get(conversationPath) ?? 0) < TYPING_THROTTLE_MS) return;
    this.lastWriteAt.set(conversationPath, now);
    void this.write(conversationPath, { updatedAt: serverTimestamp() });
  }


  /**
   * Clears the signed-in user's typing state (on send and on blur) and resets
   * the throttle so the next keystroke writes immediately.
   * @param conversationPath Path of the conversation document.
   */
  clearTyping(conversationPath: string): void {
    this.lastWriteAt.delete(conversationPath);
    void this.remove(conversationPath);
  }


  /**
   * Streams every user's typing state for a conversation from one listener;
   * callers apply the recency window and resolve names.
   * @param conversationPath Path of the conversation document.
   */
  typingUsers(conversationPath: string): Observable<TypingEntry[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        collection(this.firestore, `${conversationPath}/${TYPING_SEGMENT}`),
        { idField: 'uid' },
      ),
    ) as Observable<TypingEntry[]>;
  }


  /**
   * Writes the signed-in user's typing marker; failures are swallowed because
   * typing is best-effort and must never surface an error to the user.
   * @param conversationPath Path of the conversation document.
   * @param data Marker payload (the server-time updatedAt).
   */
  private write(conversationPath: string, data: { updatedAt: FieldValue }): Promise<void> {
    const ref = doc(this.firestore, this.typingPath(conversationPath));
    return runInInjectionContext(this.injector, () => setDoc(ref, data)).catch(() => undefined);
  }


  /**
   * Deletes the signed-in user's typing marker; failures are swallowed.
   * @param conversationPath Path of the conversation document.
   */
  private remove(conversationPath: string): Promise<void> {
    const ref = doc(this.firestore, this.typingPath(conversationPath));
    return runInInjectionContext(this.injector, () => deleteDoc(ref)).catch(() => undefined);
  }


  /**
   * Builds the typing-marker document path for the signed-in user.
   * @param conversationPath Path of the conversation document.
   */
  private typingPath(conversationPath: string): string {
    return `${conversationPath}/${TYPING_SEGMENT}/${this.authService.requireUid()}`;
  }
}
