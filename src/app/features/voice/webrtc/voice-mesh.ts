/**
 * @file Full-mesh controller of one voice-channel connection: owns the
 * peer map (one {@link VoicePeer} per remote session), applies incoming
 * signaling envelopes, keeps the mesh in sync with the live roster and
 * feeds every stream into the shared {@link SpeakingMonitor}. Initiation
 * is deterministic and glare-free: the JOINER offers to all sessions that
 * were present before it; for the rare simultaneous join neither side saw,
 * the lexicographically smaller session id initiates, and an incoming
 * offer beats an own unanswered offer only from a smaller session id.
 */
import { Timestamp } from '@angular/fire/firestore';

import { VoiceParticipant, VoiceSignal, VoiceSignalKind, VoiceSignalPayload } from '../../../models/voice.model';
import { SpeakingMonitor } from './speaking-monitor';
import { VoicePeer } from './voice-peer';

/** Hooks the mesh uses to reach signaling and to publish speaking state. */
export interface VoiceMeshDeps {
  /** Own client-session id (the mesh never connects to itself). */
  readonly ownSessionId: string;
  /** Shared local microphone stream published to every peer. */
  readonly localStream: MediaStream;
  /** Sends one envelope to a remote session. */
  readonly sendSignal: (
    toSession: string,
    toUid: string,
    kind: VoiceSignalKind,
    payload: VoiceSignalPayload,
  ) => void;
  /** Deletes one applied envelope (self-cleaning mailbox). */
  readonly consumeSignal: (signalId: string) => void;
  /** Current deafen state for newly attached remote audio. */
  readonly isDeafened: () => boolean;
  /** Publishes the changed set of speaking session ids. */
  readonly onSpeakingChange: (speaking: ReadonlySet<string>) => void;
}

/**
 * Maintains the peer connections of one voice-channel membership. Created
 * on join, disposed on leave/switch; disposal is idempotent.
 */
export class VoiceMesh {
  private readonly deps: VoiceMeshDeps;

  private readonly peers = new Map<string, VoicePeer>();

  private readonly monitor: SpeakingMonitor;

  private readonly processedSignalIds = new Set<string>();


  /**
   * Creates the mesh and starts analysing the own microphone so the local
   * speaking indicator works even while alone in the channel.
   * @param deps Signaling and state hooks of the connection.
   */
  constructor(deps: VoiceMeshDeps) {
    this.deps = deps;
    this.monitor = new SpeakingMonitor(deps.onSpeakingChange);
    this.monitor.add(deps.ownSessionId, deps.localStream);
  }


  /**
   * Offers to every session that was already connected when we joined
   * (the joiner always initiates).
   * @param participants Non-stale participants present before the join.
   */
  initiateToExisting(participants: readonly VoiceParticipant[]): void {
    for (const participant of participants) {
      if (participant.sessionId === this.deps.ownSessionId) continue;
      this.initiatePeer(participant);
    }
  }


  /**
   * Applies a batch of inbox envelopes in creation order, skipping ones
   * already applied (deletes are asynchronous, so snapshots can repeat a
   * document) and deleting each applied envelope.
   * @param signals Current inbox snapshot.
   */
  applySignals(signals: readonly VoiceSignal[]): void {
    for (const signal of [...signals].sort(byCreation)) {
      if (this.processedSignalIds.has(signal.id)) continue;
      this.processedSignalIds.add(signal.id);
      void this.applySignal(signal);
      this.deps.consumeSignal(signal.id);
    }
  }


  /**
   * Reconciles the mesh with the live roster: peers whose session vanished
   * or went stale are dropped, and a simultaneous joiner neither side saw
   * at join time is back-filled by the smaller session id.
   * @param participants Current non-stale participants of the channel.
   */
  syncWithRoster(participants: readonly VoiceParticipant[]): void {
    const sessions = new Set(participants.map(participant => participant.sessionId));
    for (const sessionId of this.peers.keys()) {
      if (!sessions.has(sessionId)) this.dropPeer(sessionId);
    }
    for (const participant of participants) this.backfillPeer(participant);
  }


  /**
   * Mutes or unmutes the audio elements of every peer (deafen toggle).
   * @param muted Whether all remote audio is silenced.
   */
  setRemoteMuted(muted: boolean): void {
    for (const peer of this.peers.values()) peer.setRemoteMuted(muted);
  }


  /**
   * Tears the whole mesh down: every peer connection, every hidden audio
   * element and the speaking monitor. Idempotent.
   */
  dispose(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.monitor.dispose();
  }


  /**
   * Routes one envelope to its peer; answers and candidates for unknown
   * sessions are stale leftovers and are dropped silently.
   * @param signal Envelope addressed to this session.
   */
  private async applySignal(signal: VoiceSignal): Promise<void> {
    if (signal.kind === 'offer') return this.handleOffer(signal);
    const peer = this.peers.get(signal.fromSession);
    if (!peer) return;
    if (signal.kind === 'answer') {
      return peer.acceptAnswer(signal.payload as RTCSessionDescriptionInit);
    }
    return peer.addCandidate(signal.payload as RTCIceCandidateInit);
  }


  /**
   * Answers an incoming offer. Glare guard: with an own unanswered offer
   * pending toward the same session, the smaller session id wins — an
   * offer from a smaller id replaces the own attempt, a larger one is
   * ignored (that side will answer ours by the mirrored rule).
   * @param signal Offer envelope.
   */
  private async handleOffer(signal: VoiceSignal): Promise<void> {
    if (this.peers.has(signal.fromSession)) {
      if (signal.fromSession >= this.deps.ownSessionId) return;
      this.dropPeer(signal.fromSession);
    }
    const peer = this.createPeer(signal.fromSession, signal.fromUid);
    await peer
      .acceptOffer(signal.payload as RTCSessionDescriptionInit)
      .catch(() => this.dropPeer(signal.fromSession));
  }


  /**
   * Creates and registers the peer wrapper for a remote session.
   * @param sessionId Remote client session.
   * @param uid Uid of the remote user (addressing the envelopes).
   */
  private createPeer(sessionId: string, uid: string): VoicePeer {
    const peer = new VoicePeer(sessionId, this.deps.localStream, {
      sendSignal: (kind, payload) => this.deps.sendSignal(sessionId, uid, kind, payload),
      onRemoteStream: (session, stream) => this.monitor.add(session, stream),
      onDropped: session => this.dropPeer(session),
      isDeafened: this.deps.isDeafened,
    });
    this.peers.set(sessionId, peer);
    return peer;
  }


  /**
   * Creates a peer and starts the offer toward it; a failed negotiation
   * start drops only this peer.
   * @param participant Remote participant to connect to.
   */
  private initiatePeer(participant: VoiceParticipant): void {
    const peer = this.createPeer(participant.sessionId, participant.uid);
    void peer.initiate().catch(() => this.dropPeer(participant.sessionId));
  }


  /**
   * Back-fills the mesh for a roster session without a peer: only the
   * smaller session id initiates, so exactly one side offers even when
   * both joined in the same instant.
   * @param participant Roster participant to check.
   */
  private backfillPeer(participant: VoiceParticipant): void {
    if (participant.sessionId === this.deps.ownSessionId) return;
    if (this.peers.has(participant.sessionId)) return;
    if (this.deps.ownSessionId < participant.sessionId) this.initiatePeer(participant);
  }


  /**
   * Removes one peer: connection, audio element and analyser — without
   * touching the rest of the mesh or the channel membership.
   * @param sessionId Session whose peer is dropped.
   */
  private dropPeer(sessionId: string): void {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    this.peers.delete(sessionId);
    peer.close();
    this.monitor.remove(sessionId);
  }
}


/**
 * Compares two envelopes by creation time so descriptions are applied
 * before their trailing candidates; unresolved timestamps sort last.
 * @param a First envelope.
 * @param b Second envelope.
 */
function byCreation(a: VoiceSignal, b: VoiceSignal): number {
  return signalMillis(a) - signalMillis(b);
}


/**
 * Resolves an envelope's creation time in milliseconds; unresolved server
 * timestamps sort last (they cannot occur in the inbox, which only ever
 * carries other clients' server-acknowledged writes).
 * @param signal Envelope from the inbox stream.
 */
function signalMillis(signal: VoiceSignal): number {
  return signal.createdAt instanceof Timestamp
    ? signal.createdAt.toMillis()
    : Number.MAX_SAFE_INTEGER;
}
