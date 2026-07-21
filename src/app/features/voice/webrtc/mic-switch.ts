/**
 * @file Live microphone switching of the one active voice connection:
 * captures the newly selected input device, swaps the outgoing track on
 * every peer via RTCRtpSender.replaceTrack (no renegotiation), rewires the
 * local speaking analyser and stops the previous capture. The mute state
 * carries over because the flag is re-applied to the fresh track before it
 * replaces the old one. Outside a call there is nothing to swap — the
 * changed selection simply applies on the next join.
 */
import { VoiceMesh } from './voice-mesh';

/** Accessors the switcher uses to reach the live connection state. */
export interface MicSwitchHooks {
  /** Current mesh, or null while not connected. */
  readonly mesh: () => VoiceMesh | null;
  /** Current local microphone stream, or null while not connected. */
  readonly localStream: () => MediaStream | null;
  /** Replaces the connection's local stream reference. */
  readonly setLocalStream: (stream: MediaStream) => void;
  /** Re-applies the current mute flag to the local tracks. */
  readonly applyTrackMute: () => void;
  /** Captures the microphone with the current device constraints. */
  readonly capture: () => Promise<MediaStream | null>;
}

/**
 * Swaps the live microphone capture in place when the selected input
 * device changes during a call. One switch runs at a time; a change
 * arriving mid-switch applies on the next selection change or join.
 */
export class MicSwitcher {
  private readonly hooks: MicSwitchHooks;

  private isSwitching = false;


  /**
   * @param hooks Accessors to the mesh, the local stream and the capture.
   */
  constructor(hooks: MicSwitchHooks) {
    this.hooks = hooks;
  }


  /**
   * Performs the device switch on the live connection; a no-op while not
   * connected or while another switch is still in flight.
   */
  async switch(): Promise<void> {
    if (this.isSwitching || !this.hooks.mesh() || !this.hooks.localStream()) return;
    this.isSwitching = true;
    try {
      await this.performSwitch();
    } finally {
      this.isSwitching = false;
    }
  }


  /**
   * Captures the fresh stream, hands it to the connection (mute state
   * re-applied before any peer sends it), swaps every peer's sender and
   * stops the previous capture. Leaving — or leaving and rejoining —
   * mid-capture releases the fresh stream instead of swapping it into a
   * connection it was not captured for.
   */
  private async performSwitch(): Promise<void> {
    const previous = this.hooks.localStream();
    const fresh = await this.hooks.capture();
    if (!fresh) return;
    const mesh = this.hooks.mesh();
    if (!mesh || this.hooks.localStream() !== previous) return stopTracks(fresh);
    this.hooks.setLocalStream(fresh);
    this.hooks.applyTrackMute();
    await mesh.replaceLocalAudio(fresh);
    if (previous) stopTracks(previous);
  }
}


/**
 * Stops every track of a stream (releases the capture hardware).
 * @param stream Stream whose tracks are stopped.
 */
function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}
