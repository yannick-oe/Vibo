/**
 * @file Mute/deafen state of the one voice connection, extracted from the
 * connection service: both flags as signals, the Discord-parity toggle
 * semantics (deafen forces self-mute, the mic press lifts deafen first),
 * mirroring the mute onto the local tracks and triggering the transition
 * write. Mesh, stream and Firestore access come in via the hooks so the
 * class stays free of service dependencies.
 */
import { signal } from '@angular/core';

import { VoiceMesh } from './voice-mesh';

/** Accessors the controls use to reach the live connection state. */
export interface MuteDeafenHooks {
  /** Current mesh, or null while not connected. */
  readonly mesh: () => VoiceMesh | null;
  /** Current local microphone stream, or null while not connected. */
  readonly localStream: () => MediaStream | null;
  /** Transition-writes the flags onto the own participant document. */
  readonly writeFlags: () => void;
}

/**
 * Owns the mute and deafen flags of the voice connection and applies
 * every transition to the local tracks, the remote master gain and the
 * participant document.
 */
export class MuteDeafenControls {
  readonly isMuted = signal(false);

  readonly isDeafened = signal(false);

  private muteBeforeDeafen = false;

  private readonly hooks: MuteDeafenHooks;


  /**
   * @param hooks Accessors to the mesh, the local stream and the flag write.
   */
  constructor(hooks: MuteDeafenHooks) {
    this.hooks = hooks;
  }


  /**
   * Toggles the own microphone. While deafened, the mic press lifts the
   * deafen first and unmutes (Discord parity).
   */
  toggleMute(): void {
    if (this.isDeafened()) return this.undeafen(false);
    this.setMuted(!this.isMuted());
  }


  /**
   * Toggles deafen: deafening silences all remote audio and forces
   * self-mute; un-deafening restores the mute state from before.
   */
  toggleDeafen(): void {
    if (this.isDeafened()) return this.undeafen(this.muteBeforeDeafen);
    this.muteBeforeDeafen = this.isMuted();
    this.isDeafened.set(true);
    this.hooks.mesh()?.setRemoteMuted(true);
    this.setMuted(true);
  }


  /**
   * Mirrors the mute flag onto every local audio track.
   */
  applyTrackMute(): void {
    const enabled = !this.isMuted();
    this.hooks.localStream()?.getAudioTracks().forEach(track => (track.enabled = enabled));
  }


  /**
   * Applies a mute state to the flag, the local tracks and the own
   * participant document (transition write).
   * @param muted New microphone mute state.
   */
  private setMuted(muted: boolean): void {
    this.isMuted.set(muted);
    this.applyTrackMute();
    this.hooks.writeFlags();
  }


  /**
   * Lifts the deafen state, restores remote audio and applies the target
   * mute state.
   * @param muted Mute state to restore after un-deafening.
   */
  private undeafen(muted: boolean): void {
    this.isDeafened.set(false);
    this.hooks.mesh()?.setRemoteMuted(false);
    this.setMuted(muted);
  }
}
