/**
 * @file Firestore-facing plumbing of one live voice connection: the
 * subscription on the connection-scoped signals inbox and the periodic
 * lastSeen heartbeat (writes only while connected). Owned by the
 * connection service; opened on join, closed on every local teardown —
 * closing is idempotent and also runs as part of every channel switch.
 */
import { Observable, Subscription } from 'rxjs';

import { VoiceSignal } from '../../../models/voice.model';
import { VOICE_HEARTBEAT_MS } from '../../../shared/voice.constants';

/**
 * Holds the inbox subscription and the heartbeat interval of the active
 * voice connection. One instance lives as long as the connection service;
 * the service guarantees a close between two connections.
 */
export class ConnectionPlumbing {
  private subscription: Subscription | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;


  /**
   * Subscribes the connection-scoped inbox and starts the heartbeat.
   * @param inbox Signal-inbox stream of the joined channel.
   * @param applySignals Applies one inbox snapshot to the mesh.
   * @param heartbeat Writes one lastSeen heartbeat.
   */
  open(
    inbox: Observable<VoiceSignal[]>,
    applySignals: (signals: VoiceSignal[]) => void,
    heartbeat: () => void,
  ): void {
    this.subscription = inbox.subscribe(applySignals);
    this.timer = setInterval(heartbeat, VOICE_HEARTBEAT_MS);
  }


  /**
   * Unsubscribes the inbox and stops the heartbeat. Idempotent.
   */
  close(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
