/**
 * @file Firestore transport of the WebRTC signaling envelopes: directed
 * offer/answer/candidate documents in a per-channel signals subcollection.
 * The inbox stream is connection-scoped (subscribed only while connected to
 * a voice channel, §14) and self-cleaning — every applied envelope is
 * deleted immediately, and leaving best-effort clears all remaining own
 * envelopes. Both query filters pair the session id with the uid so the
 * uid-scoped security rules can prove every read.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, of } from 'rxjs';

import {
  VoiceSignal,
  VoiceSignalDoc,
  VoiceSignalKind,
  VoiceSignalPayload,
} from '../models/voice.model';
import {
  VOICE_CHANNELS_COLLECTION,
  VOICE_SIGNALS_SEGMENT,
} from '../shared/voice.constants';
import { AuthService } from './auth.service';
import { ClientSessionService } from './client-session.service';

/**
 * Sends, streams and cleans up voice signaling envelopes. All writes are
 * best-effort — a lost envelope surfaces as a failed peer connection, which
 * the connection watchdog handles gracefully.
 */
@Injectable({ providedIn: 'root' })
export class VoiceSignalingService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly clientSession = inject(ClientSessionService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Sends one directed signaling envelope into a channel's signals
   * subcollection; failures are swallowed (the watchdog covers the peer).
   * @param channelId Voice channel the envelope belongs to.
   * @param toSession Addressee client session.
   * @param toUid Addressee uid (scopes the read rule).
   * @param kind Envelope kind: offer, answer or candidate.
   * @param payload Session description or ICE candidate.
   */
  send(
    channelId: string,
    toSession: string,
    toUid: string,
    kind: VoiceSignalKind,
    payload: VoiceSignalPayload,
  ): void {
    try {
      const envelope = this.buildEnvelope(toSession, toUid, kind, payload);
      void runInInjectionContext(this.injector, () =>
        addDoc(collection(this.firestore, this.signalsPath(channelId)), envelope),
      ).catch(() => undefined);
    } catch {
      return;
    }
  }


  /**
   * Builds one envelope from this session to an addressee; throws while
   * signed out (callers treat that as a swallowed best-effort failure).
   * @param toSession Addressee client session.
   * @param toUid Addressee uid.
   * @param kind Envelope kind.
   * @param payload Session description or ICE candidate.
   */
  private buildEnvelope(
    toSession: string,
    toUid: string,
    kind: VoiceSignalKind,
    payload: VoiceSignalPayload,
  ): VoiceSignalDoc {
    return {
      fromSession: this.clientSession.id,
      fromUid: this.authService.requireUid(),
      toSession,
      toUid,
      kind,
      payload,
      createdAt: serverTimestamp(),
    };
  }


  /**
   * Streams the envelopes addressed to this client session in a channel.
   * Subscribed only while connected (connection-scoped listener, §14); the
   * consumer deletes every applied envelope via {@link consume}. Degrades
   * to an empty inbox on stream errors — lost envelopes surface as failed
   * peer connections, which the watchdog handles; the consuming
   * subscription itself must never be terminated by the error.
   * @param channelId Voice channel to listen in.
   */
  streamInbox(channelId: string): Observable<VoiceSignal[]> {
    const inbox = runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, this.signalsPath(channelId)),
          where('toSession', '==', this.clientSession.id),
          where('toUid', '==', this.authService.requireUid()),
        ),
        { idField: 'id' },
      ),
    ) as Observable<VoiceSignal[]>;
    return inbox.pipe(catchError(() => this.recoverInbox()));
  }


  /**
   * Degrades an errored inbox stream to the empty list; the next connection
   * rebuilds the connection-scoped query.
   */
  private recoverInbox(): Observable<VoiceSignal[]> {
    return of([] as VoiceSignal[]);
  }


  /**
   * Deletes one applied envelope (self-cleaning mailbox); failures are
   * swallowed — a leftover doc is re-cleared on leave.
   * @param channelId Voice channel the envelope lives in.
   * @param signalId Firestore id of the envelope.
   */
  consume(channelId: string, signalId: string): void {
    const reference = doc(this.firestore, `${this.signalsPath(channelId)}/${signalId}`);
    void runInInjectionContext(this.injector, () => deleteDoc(reference)).catch(() => undefined);
  }


  /**
   * Best-effort removal of every remaining envelope this session sent or
   * received in a channel (leave/switch cleanup). Never rejects — a leave
   * after sign-out simply leaves orphans for the stale filter.
   * @param channelId Voice channel to clean up.
   */
  async clearOwn(channelId: string): Promise<void> {
    try {
      await this.deleteMatching(channelId, 'fromSession', 'fromUid');
      await this.deleteMatching(channelId, 'toSession', 'toUid');
    } catch {
      return;
    }
  }


  /**
   * Deletes all envelopes whose session/uid field pair points at this
   * client session; failures are swallowed.
   * @param channelId Voice channel to clean up.
   * @param sessionField Field carrying the session id.
   * @param uidField Field carrying the uid (proves the read).
   */
  private async deleteMatching(
    channelId: string,
    sessionField: 'fromSession' | 'toSession',
    uidField: 'fromUid' | 'toUid',
  ): Promise<void> {
    const matches = await runInInjectionContext(this.injector, () =>
      getDocs(
        query(
          collection(this.firestore, this.signalsPath(channelId)),
          where(sessionField, '==', this.clientSession.id),
          where(uidField, '==', this.authService.requireUid()),
        ),
      ),
    ).catch(() => null);
    if (!matches) return;
    await Promise.all(matches.docs.map(entry => deleteDoc(entry.ref).catch(() => undefined)));
  }


  /**
   * Builds the signals-subcollection path of a voice channel.
   * @param channelId Voice channel id.
   */
  private signalsPath(channelId: string): string {
    return `${VOICE_CHANNELS_COLLECTION}/${channelId}/${VOICE_SIGNALS_SEGMENT}`;
  }
}
