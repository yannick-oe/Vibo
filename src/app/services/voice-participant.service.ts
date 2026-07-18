/**
 * @file Firestore IO of the OWN voice-participant document: create on
 * join, delete on leave, the lastSeen heartbeat and the mute/deafen
 * transition writes. Every update stamps lastSeen with the server clock,
 * as the security rules require — the heartbeat is the liveness proof.
 * All writes are best-effort except the join create, whose failure aborts
 * the join.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';

import { VoiceParticipantDoc } from '../models/voice.model';
import {
  VOICE_CHANNELS_COLLECTION,
  VOICE_PARTICIPANTS_SEGMENT,
} from '../shared/voice.constants';
import { AuthService } from './auth.service';
import { ClientSessionService } from './client-session.service';

/** Mute/deafen flag pair written on every control transition. */
export interface VoiceFlags {
  readonly muted: boolean;
  readonly deafened: boolean;
}

/**
 * Writes the participant document of this client session. The document id
 * is the session id (shared-guest windows stay distinct participants);
 * the uid rides inside for the rule checks.
 */
@Injectable({ providedIn: 'root' })
export class VoiceParticipantService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly clientSession = inject(ClientSessionService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Creates the own participant document (join).
   * @param channelId Channel being joined.
   * @param flags Current mute/deafen state carried into the join.
   * @returns Whether the write succeeded.
   */
  create(channelId: string, flags: VoiceFlags): Promise<boolean> {
    const participant: VoiceParticipantDoc = {
      uid: this.authService.requireUid(),
      sessionId: this.clientSession.id,
      joinedAt: serverTimestamp(),
      muted: flags.muted,
      deafened: flags.deafened,
      sharing: false,
      lastSeen: serverTimestamp(),
    };
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, this.path(channelId)), participant),
    ).then(
      () => true,
      () => false,
    );
  }


  /**
   * Deletes the own participant document (leave); failures are swallowed —
   * peers filter the stale document after the heartbeat window.
   * @param channelId Channel being left.
   */
  async remove(channelId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, this.path(channelId))),
    ).catch(() => undefined);
  }


  /**
   * Refreshes the own lastSeen heartbeat; written only while connected.
   * @param channelId Connected channel.
   */
  heartbeat(channelId: string): void {
    void runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, this.path(channelId)), {
        lastSeen: serverTimestamp(),
      }),
    ).catch(() => undefined);
  }


  /**
   * Transition-writes the mute/deafen flags (with the mandatory lastSeen
   * refresh); failures are swallowed.
   * @param channelId Connected channel.
   * @param flags New mute/deafen state.
   */
  writeFlags(channelId: string, flags: VoiceFlags): void {
    void runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, this.path(channelId)), {
        muted: flags.muted,
        deafened: flags.deafened,
        lastSeen: serverTimestamp(),
      }),
    ).catch(() => undefined);
  }


  /**
   * Transition-writes the screen-sharing flag (with the mandatory lastSeen
   * refresh) on share start/stop; failures are swallowed.
   * @param channelId Connected channel.
   * @param sharing Whether this session now shares its screen.
   */
  writeSharing(channelId: string, sharing: boolean): void {
    void runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, this.path(channelId)), {
        sharing,
        lastSeen: serverTimestamp(),
      }),
    ).catch(() => undefined);
  }


  /**
   * Builds the own participant-document path in a channel.
   * @param channelId Voice channel id.
   */
  private path(channelId: string): string {
    return `${VOICE_CHANNELS_COLLECTION}/${channelId}/${VOICE_PARTICIPANTS_SEGMENT}/${this.clientSession.id}`;
  }
}
