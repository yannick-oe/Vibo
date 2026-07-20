/**
 * @file One leg of the full voice mesh: wraps a single RTCPeerConnection to
 * a remote client session — offer/answer negotiation with Opus-upgraded
 * local descriptions, ICE candidate exchange with buffering until the
 * remote description is set, an optional screen-share video track in
 * either direction and a grace-timed connection watchdog. The remote audio
 * stream is only REPORTED here — playback and per-user gain live in the
 * mesh's RemoteAudioMixer. Media flows only peer-to-peer (DTLS-SRTP); this
 * class never touches Firestore itself, it hands envelopes to the send hook.
 */
import { VoiceSignalKind, VoiceSignalPayload } from '../../../models/voice.model';
import { DISCONNECT_GRACE_MS, SCREEN_MAX_BITRATE, STUN_SERVERS } from '../../../shared/voice.constants';
import { enhanceOpusSdp } from './sdp-quality';

const UNSTABLE_STATES: readonly RTCPeerConnectionState[] = ['failed', 'disconnected'];

const SCREEN_DEGRADATION: RTCDegradationPreference = 'maintain-resolution';

/** Callbacks a peer uses to reach signaling, audio routing and teardown. */
export interface VoicePeerHooks {
  /** Sends one signaling envelope to this peer's remote session. */
  readonly sendSignal: (kind: VoiceSignalKind, payload: VoiceSignalPayload) => void;
  /** Delivers the remote audio stream (playback mixer plus analyser). */
  readonly onRemoteStream: (sessionId: string, stream: MediaStream) => void;
  /** Delivers or clears the remote screen-share video stream. */
  readonly onRemoteVideo: (sessionId: string, stream: MediaStream | null) => void;
  /** Asks the service to drop this peer after the watchdog grace expired. */
  readonly onDropped: (sessionId: string) => void;
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

  private audioDelivered = false;

  private videoSender: RTCRtpSender | null = null;

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
   * Starts a negotiation as the offering side — the initial join offer and
   * every later renegotiation (screen-share start/stop) use the same path:
   * create the offer, upgrade its Opus audio parameters and send it.
   */
  async initiate(): Promise<void> {
    const offer = await this.pc.createOffer();
    const upgraded = { type: offer.type, sdp: enhanceOpusSdp(offer.sdp ?? '') };
    await this.pc.setLocalDescription(upgraded);
    this.applyVideoParameters();
    this.hooks.sendSignal('offer', upgraded);
  }


  /**
   * Answers an incoming offer as the answering side, upgrading the Opus
   * parameters of the local answer. Serves both the initial join and a
   * renegotiation offer arriving on the established connection.
   * @param payload Remote session description of kind offer.
   */
  async acceptOffer(payload: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(payload);
    await this.drainCandidates();
    const answer = await this.pc.createAnswer();
    const upgraded = { type: answer.type, sdp: enhanceOpusSdp(answer.sdp ?? '') };
    await this.pc.setLocalDescription(upgraded);
    this.applyVideoParameters();
    this.hooks.sendSignal('answer', upgraded);
  }


  /**
   * Whether an incoming offer is a renegotiation of this established
   * connection (as opposed to initial-join glare): the connection is stable
   * with a remote description already applied.
   */
  canRenegotiate(): boolean {
    return this.pc.signalingState === 'stable' && this.pc.remoteDescription !== null;
  }


  /**
   * Adds the local screen-share video track for the next (re)negotiation;
   * a second call while a video sender exists is ignored.
   * @param track Captured screen video track.
   * @param stream Capture stream the track belongs to.
   */
  addVideo(track: MediaStreamTrack, stream: MediaStream): void {
    if (this.videoSender || this.isClosed) return;
    this.videoSender = this.pc.addTrack(track, stream);
  }


  /**
   * Removes the local screen-share video track again (share stopped); the
   * caller renegotiates afterwards. Idempotent.
   */
  removeVideo(): void {
    if (!this.videoSender || this.isClosed) return;
    this.pc.removeTrack(this.videoSender);
    this.videoSender = null;
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
   * Tears the peer down idempotently: watchdog and connection are
   * released; repeated calls are no-ops.
   */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.clearGrace();
    this.pc.close();
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
   * Routes remote tracks by kind: the first audio stream is reported once
   * (the mesh feeds it into the playback mixer and the speaking analyser);
   * video tracks are the peer's screen share and are reported separately.
   * @param event Track event carrying the remote stream.
   */
  private onTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    if (event.track.kind === 'video') return this.watchVideoTrack(event.track, stream);
    if (this.audioDelivered) return;
    this.audioDelivered = true;
    this.hooks.onRemoteStream(this.sessionId, stream);
  }


  /**
   * Reports a remote screen-share stream and clears it again when the
   * track mutes (sharer removed it via renegotiation) or ends; an unmute
   * after a later re-share restores it.
   * @param track Remote screen-share video track.
   * @param stream Stream the track arrived in.
   */
  private watchVideoTrack(track: MediaStreamTrack, stream: MediaStream): void {
    this.hooks.onRemoteVideo(this.sessionId, stream);
    track.onmute = () => this.hooks.onRemoteVideo(this.sessionId, null);
    track.onended = () => this.hooks.onRemoteVideo(this.sessionId, null);
    track.onunmute = () => this.hooks.onRemoteVideo(this.sessionId, stream);
  }


  /**
   * Caps the outgoing screen-share bitrate and pins the degradation
   * preference to resolution (crisp text over smooth motion); a no-op
   * without an active video sender. Applied after every local description,
   * when the sender's encodings exist.
   */
  private applyVideoParameters(): void {
    const sender = this.videoSender;
    if (!sender) return;
    const parameters = sender.getParameters();
    parameters.degradationPreference = SCREEN_DEGRADATION;
    for (const encoding of parameters.encodings) encoding.maxBitrate = SCREEN_MAX_BITRATE;
    void sender.setParameters(parameters).catch(() => undefined);
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
