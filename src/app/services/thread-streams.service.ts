/**
 * @file Live read streams of an open thread: the origin message document
 * and its replies subcollection. Context-scoped — the thread panel
 * subscribes on open and tears down on close, so a reopen rebuilds any
 * stream that degraded after an error. Split out of MessageService, which
 * keeps message creation and mutations.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { Observable, catchError, of } from 'rxjs';

import { Message, Reply } from '../models/message.model';
import { MESSAGES_LOAD_ERROR } from './message.service';
import { ToastService } from './toast.service';

/**
 * Streams a thread's origin message and replies with per-stream error
 * recovery, so a dead listener degrades to a safe empty value instead of
 * terminating the thread panel's subscription chains.
 */
@Injectable({ providedIn: 'root' })
export class ThreadStreamsService {
  private readonly firestore = inject(Firestore);

  private readonly toastService = inject(ToastService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Streams a single message document live, e.g. the origin message of an
   * open thread; emits undefined when the document is missing and degrades
   * to undefined on stream errors (silent — the replies stream raises the
   * shared load toast for the visible failure).
   * @param messagePath Firestore path of the message document.
   */
  streamMessage(messagePath: string): Observable<Message | undefined> {
    const message = runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, messagePath), { idField: 'id' }),
    ) as Observable<Message | undefined>;
    return message.pipe(catchError(() => this.recoverMessageDoc()));
  }


  /**
   * Streams a message's thread replies live, oldest first.
   * @param messagePath Firestore path of the parent message document.
   */
  streamReplies(messagePath: string): Observable<Reply[]> {
    return runInInjectionContext(this.injector, () => this.queryReplies(messagePath));
  }


  /**
   * Builds the live replies query; on Firestore errors a toast is shown
   * and an empty list keeps the UI functional.
   * @param messagePath Firestore path of the parent message document.
   */
  private queryReplies(messagePath: string): Observable<Reply[]> {
    const repliesQuery = query(
      collection(this.firestore, `${messagePath}/replies`),
      orderBy('createdAt'),
    );
    return (collectionData(repliesQuery, { idField: 'id' }) as Observable<Reply[]>).pipe(
      catchError(() => this.reportLoadError()),
    );
  }


  /**
   * Degrades a dead origin-message stream to undefined; the next thread
   * open rebuilds it.
   */
  private recoverMessageDoc(): Observable<Message | undefined> {
    return of(undefined);
  }


  /**
   * Shows the load-error toast and recovers with an empty replies list.
   */
  private reportLoadError(): Observable<Reply[]> {
    this.toastService.show(MESSAGES_LOAD_ERROR);
    return of([]);
  }
}
