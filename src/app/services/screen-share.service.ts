/**
 * @file Screen sharing over the existing voice mesh: capability gate
 * (getDisplayMedia feature-detected — where it is missing, e.g. iOS
 * Safari, the share control is not rendered; viewing works everywhere),
 * the capture lifecycle and the one-active-share-per-channel guard. The
 * shared track rides the established peer connections via renegotiation —
 * no new listener, no new Firestore surface beyond the participant
 * document's sharing flag. Captured is video only; tab/system audio is
 * deliberately out of scope this phase.
 */
import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';

import {
  SCREEN_IDEAL_FPS,
  SCREEN_IDEAL_HEIGHT,
  SCREEN_IDEAL_WIDTH,
} from '../shared/voice.constants';
import { VoiceConnectionService } from './voice-connection.service';
import { VoiceRosterService } from './voice-roster.service';

const SCREEN_CONTENT_HINT = 'detail';

const SCREEN_CAPTURE_CONSTRAINTS: DisplayMediaStreamOptions = {
  video: {
    width: { ideal: SCREEN_IDEAL_WIDTH },
    height: { ideal: SCREEN_IDEAL_HEIGHT },
    frameRate: { ideal: SCREEN_IDEAL_FPS },
  },
  audio: false,
};

/**
 * Owns the local screen capture: starting a share (browser picker), the
 * equivalent idempotent stop paths (toggle, the browser's native
 * stop-sharing UI via track.onended, leaving or switching the channel) and
 * the client-enforced single-sharer state derived from the roster.
 */
@Injectable({ providedIn: 'root' })
export class ScreenShareService {
  private readonly connectionService = inject(VoiceConnectionService);

  private readonly rosterService = inject(VoiceRosterService);

  /** Whether this browser can capture a screen at all. */
  readonly isSupported: boolean =
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  private readonly isSharingState = signal(false);

  /** Whether this session currently shares its screen. */
  readonly isSharing = this.isSharingState.asReadonly();

  /** The remote participant sharing in the connected channel, or null. */
  readonly remoteSharer = computed(() => {
    const channel = this.connectionService.connectedChannel();
    if (!channel) return null;
    const own = this.connectionService.ownSessionId;
    return (
      this.rosterService
        .participantsOf(channel.id)
        .find(participant => participant.sharing && participant.sessionId !== own) ?? null
    );
  });

  /** Whether starting a share is blocked by another active sharer. */
  readonly isBlocked: Signal<boolean> = computed(() => this.remoteSharer() !== null);

  private captureStream: MediaStream | null = null;

  private sharedChannelId: string | null = null;


  /**
   * Stops the local capture whenever the connection leaves or switches
   * away from the channel the share started in (the mesh teardown and the
   * participant document handle the peer/presence side).
   */
  constructor() {
    effect(() => {
      const channel = this.connectionService.connectedChannel();
      if (this.captureStream && channel?.id !== this.sharedChannelId) this.stopCapture();
    });
  }


  /**
   * Toggles the own screen share (voice-bar button).
   */
  toggle(): void {
    if (this.isSharingState()) return this.stop();
    void this.start();
  }


  /**
   * Starts a share: opens the browser's screen picker and publishes the
   * captured track to every peer. Silently a no-op when unsupported, not
   * connected, already sharing or blocked by another sharer; cancelling
   * the picker is equally silent. The simultaneous-start race of two
   * clients is tolerated (client-enforced cap, documented).
   */
  private async start(): Promise<void> {
    const channel = this.connectionService.connectedChannel();
    if (!this.isSupported || !channel || this.isSharingState() || this.isBlocked()) return;
    const stream = await this.capture();
    const track = stream?.getVideoTracks()[0];
    if (!stream || !track) return;
    track.contentHint = SCREEN_CONTENT_HINT;
    track.onended = () => this.stop();
    this.captureStream = stream;
    this.sharedChannelId = channel.id;
    this.isSharingState.set(true);
    this.connectionService.startScreenShare(track, stream);
  }


  /**
   * Stops the own share: peers are renegotiated without the track, the
   * sharing flag is cleared and the capture ends. Idempotent — the toggle,
   * the browser's stop UI and repeated calls all land here.
   */
  private stop(): void {
    if (!this.isSharingState()) return;
    this.connectionService.stopScreenShare();
    this.stopCapture();
  }


  /**
   * Requests the screen capture; a cancelled or denied picker resolves to
   * null (no toast — cancelling is a normal path).
   */
  private async capture(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getDisplayMedia(SCREEN_CAPTURE_CONSTRAINTS);
    } catch {
      return null;
    }
  }


  /**
   * Releases the local capture tracks and resets the share state without
   * touching the mesh (used by every stop path and the channel-switch
   * effect, where the mesh is already gone).
   */
  private stopCapture(): void {
    this.captureStream?.getTracks().forEach(track => track.stop());
    this.captureStream = null;
    this.sharedChannelId = null;
    this.isSharingState.set(false);
  }
}
