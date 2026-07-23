/**
 * @file Screen-share state of one voice-channel mesh: holds the active
 * local share track/stream pair and applies it to peers — added to every
 * existing peer with a renegotiation on start, removed with one on stop,
 * included in a new peer's first offer and offered back to a peer that
 * connected by answering. A failed renegotiation is swallowed — the peer
 * keeps its working audio and only misses the video.
 */
import { VoicePeer } from './voice-peer';

/**
 * Tracks the own active screen share and its application to peers.
 * Created with the mesh, discarded with it; stopping without an active
 * share is a no-op.
 */
export class ShareState {
  private track: MediaStreamTrack | null = null;

  private stream: MediaStream | null = null;


  /**
   * Starts sharing: the track is added to every existing peer and each
   * one is renegotiated; peers appearing later receive it via includeIn
   * or renegotiateInto.
   * @param track Captured screen video track.
   * @param stream Capture stream the track belongs to.
   * @param peers Currently connected peers.
   */
  start(track: MediaStreamTrack, stream: MediaStream, peers: Iterable<VoicePeer>): void {
    this.track = track;
    this.stream = stream;
    for (const peer of peers) this.renegotiateInto(peer);
  }


  /**
   * Stops the share: the track is removed from every peer and each one
   * is renegotiated. Idempotent — repeated stops are no-ops.
   * @param peers Currently connected peers.
   */
  stop(peers: Iterable<VoicePeer>): void {
    if (!this.track) return;
    this.track = null;
    this.stream = null;
    for (const peer of peers) {
      peer.removeVideo();
      void peer.initiate().catch(() => undefined);
    }
  }


  /**
   * Adds an active share to a freshly created peer so it rides along in
   * that peer's first offer; a no-op without an active share.
   * @param peer Peer about to send its first offer.
   */
  includeIn(peer: VoicePeer): void {
    if (this.track && this.stream) peer.addVideo(this.track, this.stream);
  }


  /**
   * Offers an active share to a peer that connected by answering us: the
   * track is added to the established connection and renegotiated; a
   * no-op without an active share.
   * @param peer Established peer missing the share.
   */
  renegotiateInto(peer: VoicePeer): void {
    if (!this.track || !this.stream) return;
    peer.addVideo(this.track, this.stream);
    void peer.initiate().catch(() => undefined);
  }
}
