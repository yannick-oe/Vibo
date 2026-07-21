/**
 * @file Full-mesh controller of one voice-channel connection: owns the
 * peer map (one {@link VoicePeer} per remote session), applies incoming
 * signaling envelopes, keeps the mesh in sync with the live roster and
 * feeds every remote stream into the {@link RemoteAudioMixer} (playback
 * with per-user gain) plus the shared {@link SpeakingMonitor}. Initiation
 * is deterministic and glare-free: the JOINER offers to all sessions that
 * were present before it; for the rare simultaneous join neither side saw,
 * the lexicographically smaller session id initiates, and an incoming
 * offer beats an own unanswered offer only from a smaller session id. An
 * offer arriving on an ESTABLISHED connection is a renegotiation (screen
 * share start/stop) and is answered on the same connection; the SHARER is
 * always the renegotiation initiator.
 */
import {
  SoundSignalPayload,
  VoiceParticipant,
  VoiceSignal,
  VoiceSignalKind,
  VoiceSignalPayload,
} from '../../../models/voice.model';
import { RemoteAudioMixer } from './remote-audio-mixer';
import { byCreation } from './signal-order';
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
  /** Current deafen state for the playback mixer's master gain. */
  readonly isDeafened: () => boolean;
  /** Current effective per-user playback gain (0–2) of a remote user. */
  readonly gainForUid: (uid: string) => number;
  /** Publishes the changed set of speaking session ids. */
  readonly onSpeakingChange: (speaking: ReadonlySet<string>) => void;
  /** Publishes the changed map of remote screen streams by session id. */
  readonly onRemoteScreensChange: (screens: ReadonlyMap<string, MediaStream>) => void;
  /** Dispatches a received soundboard broadcast. */
  readonly onSoundSignal: (fromSession: string, soundId: string) => void;
}

/**
 * Maintains the peer connections of one voice-channel membership. Created
 * on join, disposed on leave/switch; disposal is idempotent.
 */
export class VoiceMesh {
  private readonly deps: VoiceMeshDeps;

  private readonly peers = new Map<string, VoicePeer>();

  private readonly monitor: SpeakingMonitor;

  private readonly mixer: RemoteAudioMixer;

  private readonly processedSignalIds = new Set<string>();

  private localStream: MediaStream;

  private shareTrack: MediaStreamTrack | null = null;

  private shareStream: MediaStream | null = null;

  private readonly remoteScreens = new Map<string, MediaStream>();


  /**
   * Creates the mesh, starts analysing the own microphone so the local
   * speaking indicator works even while alone in the channel and builds
   * the playback mixer on the monitor's shared AudioContext.
   * @param deps Signaling and state hooks of the connection.
   */
  constructor(deps: VoiceMeshDeps) {
    this.deps = deps;
    this.localStream = deps.localStream;
    this.monitor = new SpeakingMonitor(deps.onSpeakingChange);
    this.monitor.add(deps.ownSessionId, this.localStream);
    this.mixer = new RemoteAudioMixer({
      context: this.monitor.acquireContext(),
      gainForUid: deps.gainForUid,
      isDeafened: deps.isDeafened,
    });
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
      void this.applySignal(signal).catch(() => undefined);
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
   * Silences or restores all remote audio via the mixer's master gain
   * (deafen toggle).
   * @param muted Whether all remote audio is silenced.
   */
  setRemoteMuted(muted: boolean): void {
    this.mixer.setDeafened(muted);
  }


  /**
   * Re-applies every remote user's current volume gain (ramped); called
   * whenever a per-user volume setting changes.
   */
  applyUserGains(): void {
    this.mixer.applyGains();
  }


  /**
   * Starts sharing a screen track: it is added to every existing peer and
   * each one is renegotiated; peers joining later receive it in their
   * negotiation automatically. A failed renegotiation is swallowed — the
   * peer keeps its working audio and only misses the video.
   * @param track Captured screen video track.
   * @param stream Capture stream the track belongs to.
   */
  startShare(track: MediaStreamTrack, stream: MediaStream): void {
    this.shareTrack = track;
    this.shareStream = stream;
    for (const peer of this.peers.values()) {
      peer.addVideo(track, stream);
      void peer.initiate().catch(() => undefined);
    }
  }


  /**
   * Stops the own screen share: the track is removed from every peer and
   * each one is renegotiated. Idempotent — repeated stops are no-ops.
   */
  stopShare(): void {
    if (!this.shareTrack) return;
    this.shareTrack = null;
    this.shareStream = null;
    for (const peer of this.peers.values()) {
      peer.removeVideo();
      void peer.initiate().catch(() => undefined);
    }
  }


  /**
   * Swaps the local microphone stream after an input-device switch: every
   * peer's audio sender replaces its track in place (no renegotiation),
   * the own speaking analyser is rewired to the fresh stream and peers
   * created later connect with it too. The caller applies the mute state
   * to the fresh track before calling and stops the old tracks afterwards.
   * @param stream Freshly captured microphone stream.
   */
  async replaceLocalAudio(stream: MediaStream): Promise<void> {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    this.localStream = stream;
    await Promise.all([...this.peers.values()].map(peer => peer.replaceAudioTrack(track)));
    this.monitor.remove(this.deps.ownSessionId);
    this.monitor.add(this.deps.ownSessionId, stream);
  }


  /**
   * Tears the whole mesh down: every peer connection, the playback mixer
   * and the speaking monitor (which closes the shared context). Idempotent.
   */
  dispose(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.mixer.dispose();
    this.monitor.dispose();
  }


  /**
   * Routes one envelope to its peer; answers and candidates for unknown
   * sessions are stale leftovers and are dropped silently. Soundboard
   * envelopes bypass the peer map entirely.
   * @param signal Envelope addressed to this session.
   */
  private async applySignal(signal: VoiceSignal): Promise<void> {
    if (signal.kind === 'sound') return this.handleSound(signal);
    if (signal.kind === 'offer') return this.handleOffer(signal);
    const peer = this.peers.get(signal.fromSession);
    if (!peer) return;
    if (signal.kind === 'answer') {
      return peer.acceptAnswer(signal.payload as RTCSessionDescriptionInit);
    }
    return peer.addCandidate(signal.payload as RTCIceCandidateInit);
  }


  /**
   * Dispatches a soundboard broadcast; malformed payloads are ignored.
   * @param signal Envelope of kind sound.
   */
  private handleSound(signal: VoiceSignal): void {
    const soundId = (signal.payload as SoundSignalPayload).soundId;
    if (typeof soundId !== 'string') return;
    this.deps.onSoundSignal(signal.fromSession, soundId);
  }


  /**
   * Answers an incoming offer. An offer on an established connection is a
   * renegotiation (screen share) and is answered in place. Otherwise the
   * glare guard applies: with an own unanswered offer pending toward the
   * same session, the smaller session id wins — an offer from a smaller id
   * replaces the own attempt, a larger one is ignored (that side will
   * answer ours by the mirrored rule).
   * @param signal Offer envelope.
   */
  private async handleOffer(signal: VoiceSignal): Promise<void> {
    const existing = this.peers.get(signal.fromSession);
    if (existing?.canRenegotiate()) {
      return existing
        .acceptOffer(signal.payload as RTCSessionDescriptionInit)
        .catch(() => undefined);
    }
    if (existing) {
      if (signal.fromSession >= this.deps.ownSessionId) return;
      this.dropPeer(signal.fromSession);
    }
    await this.answerAsNewPeer(signal);
  }


  /**
   * Creates the peer for a first offer and answers it; while an own share
   * is active, the video track is added afterwards and offered back in a
   * renegotiation, so late joiners receive the running share too.
   * @param signal Offer envelope of a session without a peer.
   */
  private async answerAsNewPeer(signal: VoiceSignal): Promise<void> {
    const peer = this.createPeer(signal.fromSession, signal.fromUid);
    try {
      await peer.acceptOffer(signal.payload as RTCSessionDescriptionInit);
    } catch {
      return this.dropPeer(signal.fromSession);
    }
    if (!this.shareTrack || !this.shareStream) return;
    peer.addVideo(this.shareTrack, this.shareStream);
    void peer.initiate().catch(() => undefined);
  }


  /**
   * Creates and registers the peer wrapper for a remote session.
   * @param sessionId Remote client session.
   * @param uid Uid of the remote user (addressing the envelopes).
   */
  private createPeer(sessionId: string, uid: string): VoicePeer {
    const peer = new VoicePeer(sessionId, this.localStream, {
      sendSignal: (kind, payload) => this.deps.sendSignal(sessionId, uid, kind, payload),
      onRemoteStream: (session, stream) => this.attachRemoteAudio(session, uid, stream),
      onRemoteVideo: (session, stream) => this.setRemoteScreen(session, stream),
      onDropped: session => this.dropPeer(session),
    });
    this.peers.set(sessionId, peer);
    return peer;
  }


  /**
   * Routes a delivered remote audio stream into both consumers: the
   * playback mixer (per-user gain) and the speaking analyser.
   * @param sessionId Remote session the stream belongs to.
   * @param uid Uid of the remote user (volume lookup key).
   * @param stream Remote audio stream.
   */
  private attachRemoteAudio(sessionId: string, uid: string, stream: MediaStream): void {
    this.mixer.attach(sessionId, uid, stream);
    this.monitor.add(sessionId, stream);
  }


  /**
   * Creates a peer and starts the offer toward it; an active own share is
   * included in that first offer. A failed negotiation start drops only
   * this peer.
   * @param participant Remote participant to connect to.
   */
  private initiatePeer(participant: VoiceParticipant): void {
    const peer = this.createPeer(participant.sessionId, participant.uid);
    if (this.shareTrack && this.shareStream) peer.addVideo(this.shareTrack, this.shareStream);
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
   * Removes one peer: connection, playback pipeline, analyser and a
   * screen stream it may have delivered — without touching the rest of
   * the mesh or the channel membership.
   * @param sessionId Session whose peer is dropped.
   */
  private dropPeer(sessionId: string): void {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    this.peers.delete(sessionId);
    peer.close();
    this.mixer.detach(sessionId);
    this.monitor.remove(sessionId);
    this.setRemoteScreen(sessionId, null);
  }


  /**
   * Records or clears a session's remote screen stream and publishes the
   * changed map (the roster glyphs and the viewer read it as a signal).
   * @param sessionId Remote session the stream belongs to.
   * @param stream New stream, or null when the share ended.
   */
  private setRemoteScreen(sessionId: string, stream: MediaStream | null): void {
    if (stream) this.remoteScreens.set(sessionId, stream);
    else if (!this.remoteScreens.delete(sessionId)) return;
    this.deps.onRemoteScreensChange(new Map(this.remoteScreens));
  }
}
