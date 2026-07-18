/**
 * @file One leg of the full voice mesh: wraps a single RTCPeerConnection to
 * a remote client session — offer/answer negotiation with Opus-upgraded
 * local descriptions, ICE candidate exchange with buffering until the
 * remote description is set, a hidden autoplaying audio element for the
 * remote stream and a grace-timed connection watchdog. Audio flows only
 * peer-to-peer (DTLS-SRTP); this class never touches Firestore itself, it
 * hands envelopes to the send hook.
 */
import { VoiceSignalKind, VoiceSignalPayload } from '../../../models/voice.model';
import { DISCONNECT_GRACE_MS, STUN_SERVERS } from '../../../shared/voice.constants';
import { enhanceOpusSdp } from './sdp-quality';

const UNSTABLE_STATES: readonly RTCPeerConnectionState[] = ['failed', 'disconnected'];

/** Callbacks a peer uses to reach signaling, audio routing and teardown. */
export interface VoicePeerHooks {
  /** Sends one signaling envelope to this peer's remote session. */
  readonly sendSignal: (kind: VoiceSignalKind, payload: VoiceSignalPayload) => void;
  /** Delivers the remote audio stream (for the speaking analyser). */
  readonly onRemoteStream: (sessionId: string, stream: MediaStream) => void;
  /** Asks the service to drop this peer after the watchdog grace expired. */
  readonly onDropped: (sessionId: string) => void;
  /** Current deafen state, applied to newly attached audio elements. */
  readonly isDeafened: () => boolean;
}

/**
 * Peer connection to one remote client session. The joining side calls
 * {@link initiate}; the existing side answers incoming offers via
 * {@link acceptOffer} — the joiner always initiates, so there is no glare.
 */
export class VoicePeer {
  readonly sessionId: string;

  private readonly pc: RTCPeerConnection;

  private readonly hooks: VoicePeerHooks;

  private readonly pendingCandidates: RTCIceCandidateInit[] = [];

  private audio: HTMLAudioElement | null = null;

  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  private isClosed = false;


  /**
   * Creates the connection, publishes the local microphone tracks and wires
   * the ICE, track and connection-state handlers.
   * @param sessionId Remote client-session id this peer connects to.
   * @param localStream Local microphone stream shared across all peers.
   * @param hooks Signaling, audio-routing and teardown callbacks.
   */
  constructor(sessionId: string, localStream: MediaStream, hooks: VoicePeerHooks) {
    this.sessionId = sessionId;
    this.hooks = hooks;
    this.pc = new RTCPeerConnection({ iceServers: [...STUN_SERVERS] });
    for (const track of localStream.getTracks()) this.pc.addTrack(track, localStream);
    this.pc.onicecandidate = event => this.onIceCandidate(event);
    this.pc.ontrack = event => this.onTrack(event);
    this.pc.onconnectionstatechange = () => this.onConnectionStateChange();
  }


  /**
   * Starts the negotiation as the joining (offering) side: creates the
   * offer, upgrades its Opus parameters and sends it to the remote session.
   */
  async initiate(): Promise<void> {
    const offer = await this.pc.createOffer();
    const upgraded = { type: offer.type, sdp: enhanceOpusSdp(offer.sdp ?? '') };
    await this.pc.setLocalDescription(upgraded);
    this.hooks.sendSignal('offer', upgraded);
  }


  /**
   * Answers an incoming offer as the existing (answering) side, upgrading
   * the Opus parameters of the local answer.
   * @param payload Remote session description of kind offer.
   */
  async acceptOffer(payload: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(payload);
    await this.drainCandidates();
    const answer = await this.pc.createAnswer();
    const upgraded = { type: answer.type, sdp: enhanceOpusSdp(answer.sdp ?? '') };
    await this.pc.setLocalDescription(upgraded);
    this.hooks.sendSignal('answer', upgraded);
  }


  /**
   * Applies the remote answer to an own offer; ignored when the connection
   * is not awaiting an answer (duplicate or stray envelope).
   * @param payload Remote session description of kind answer.
   */
  async acceptAnswer(payload: RTCSessionDescriptionInit): Promise<void> {
    if (this.pc.signalingState !== 'have-local-offer') return;
    await this.pc.setRemoteDescription(payload);
    await this.drainCandidates();
  }


  /**
   * Adds a remote ICE candidate, buffering it while the remote description
   * is not yet set (the standard candidate-race guard).
   * @param payload ICE candidate init from the signaling envelope.
   */
  async addCandidate(payload: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(payload);
      return;
    }
    await this.pc.addIceCandidate(payload).catch(() => undefined);
  }


  /**
   * Mutes or unmutes this peer's remote audio element (deafen toggle).
   * @param muted Whether remote audio is silenced.
   */
  setRemoteMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
  }


  /**
   * Tears the peer down idempotently: watchdog, connection and the hidden
   * audio element are all released; repeated calls are no-ops.
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.clearGrace();
    this.pc.close();
    this.detachAudio();
  }


  /**
   * Applies all candidates buffered before the remote description arrived.
   */
  private async drainCandidates(): Promise<void> {
    const buffered = this.pendingCandidates.splice(0);
    for (const candidate of buffered) {
      await this.pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }


  /**
   * Forwards each locally gathered ICE candidate to the remote session.
   * @param event ICE event; a null candidate marks the end of gathering.
   */
  private onIceCandidate(event: RTCPeerConnectionIceEvent): void {
    if (event.candidate) this.hooks.sendSignal('candidate', event.candidate.toJSON());
  }


  /**
   * Attaches the first remote audio stream to a hidden autoplaying element
   * and reports it for speaking analysis; repeated track events reuse the
   * existing element.
   * @param event Track event carrying the remote stream.
   */
  private onTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    if (!stream || this.audio) return;
    this.attachAudio(stream);
    this.hooks.onRemoteStream(this.sessionId, stream);
  }


  /**
   * Creates the hidden audio element for a remote stream. The join click is
   * the autoplay gesture; should a strict browser still block playback, one
   * retry is armed on the next pointer gesture.
   * @param stream Remote audio stream.
   */
  private attachAudio(stream: MediaStream): void {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.hidden = true;
    audio.muted = this.hooks.isDeafened();
    document.body.appendChild(audio);
    this.audio = audio;
    void audio.play().catch(() => this.retryPlayOnGesture(audio));
  }


  /**
   * Retries blocked playback once on the next user gesture (autoplay
   * fallback for strict mobile browsers).
   * @param audio Audio element whose play() was rejected.
   */
  private retryPlayOnGesture(audio: HTMLAudioElement): void {
    const resume = (): void => void audio.play().catch(() => undefined);
    document.addEventListener('pointerdown', resume, { once: true });
  }


  /**
   * Stops playback and removes the hidden audio element from the document.
   */
  private detachAudio(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.remove();
    this.audio = null;
  }


  /**
   * Watches the connection state: an unstable state arms the drop grace
   * timer, a recovery to connected cancels it. Only this single peer is
   * dropped on expiry — the channel connection itself stays alive.
   */
  private onConnectionStateChange(): void {
    if (this.isClosed) return;
    if (this.pc.connectionState === 'connected') return this.clearGrace();
    if (UNSTABLE_STATES.includes(this.pc.connectionState)) this.armGrace();
  }


  /**
   * Arms the watchdog once; an already running grace period keeps its
   * original deadline.
   */
  private armGrace(): void {
    if (this.graceTimer !== null) return;
    this.graceTimer = setTimeout(() => this.hooks.onDropped(this.sessionId), DISCONNECT_GRACE_MS);
  }


  /**
   * Cancels a running watchdog grace period.
   */
  private clearGrace(): void {
    if (this.graceTimer !== null) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }
}
