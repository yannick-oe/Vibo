/**
 * @file The one voice connection of the app: joining and leaving voice
 * channels, the microphone capture, the own participant document with its
 * heartbeat, the mute/deafen controls, the join/leave sounds and the bridge
 * into the mesh for screen sharing; received soundboard broadcasts are
 * forwarded to {@link SoundboardDispatchService}. The WebRTC mesh itself
 * lives in {@link VoiceMesh}; audio and
 * video flow strictly peer-to-peer — Firestore only ever carries presence
 * and signaling. Joining is the autoplay/microphone user gesture; leaving
 * happens only via the voice bar, on a seamless channel switch, or
 * implicitly through sign-out and tab close (peers detect the latter via
 * the stale heartbeat and the connection watchdog).
 */
import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { RosterChimes } from '../features/voice/webrtc/roster-chimes';
import { VoiceMesh } from '../features/voice/webrtc/voice-mesh';
import {
  MAX_VOICE_PARTICIPANTS,
  VOICE_CONSTRAINTS,
  VOICE_HEARTBEAT_MS,
} from '../shared/voice.constants';
import { AuthService } from './auth.service';
import { ClientSessionService } from './client-session.service';
import { SoundService } from './sound.service';
import { SoundboardDispatchService } from './soundboard-dispatch.service';
import { ToastService } from './toast.service';
import { VoiceParticipantService } from './voice-participant.service';
import { VoiceRosterService } from './voice-roster.service';
import { VoiceSignalingService } from './voice-signaling.service';

const CHANNEL_FULL_TOAST = `Sprachkanal ist voll (${MAX_VOICE_PARTICIPANTS}/${MAX_VOICE_PARTICIPANTS})`;
const MIC_DENIED_TOAST = 'Der Mikrofonzugriff wurde verweigert.';
const JOIN_FAILED_TOAST = 'Der Sprachkanal konnte nicht betreten werden.';

/** The voice channel this client is currently connected to. */
export interface ConnectedVoiceChannel {
  readonly id: string;
  readonly name: string;
}

/**
 * Orchestrates the app-wide single voice connection. Exposes the connected
 * channel, the mute/deafen flags and the speaking sessions as signals for
 * the sidebar roster and the voice bar.
 */
@Injectable({ providedIn: 'root' })
export class VoiceConnectionService {
  private readonly authService = inject(AuthService);

  private readonly clientSession = inject(ClientSessionService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly signalingService = inject(VoiceSignalingService);

  private readonly participantService = inject(VoiceParticipantService);

  private readonly soundService = inject(SoundService);

  private readonly toastService = inject(ToastService);

  private readonly connectedChannelState = signal<ConnectedVoiceChannel | null>(null);

  private readonly isMutedState = signal(false);

  private readonly isDeafenedState = signal(false);

  private readonly speakingSessionsState = signal<ReadonlySet<string>>(new Set());

  private readonly remoteScreensState = signal<ReadonlyMap<string, MediaStream>>(new Map());

  private readonly isJoiningState = signal(false);

  /** Channel this client is connected to, or null. */
  readonly connectedChannel = this.connectedChannelState.asReadonly();

  /** Whether a voice connection is active. */
  readonly isConnected: Signal<boolean> = computed(() => this.connectedChannelState() !== null);

  /** Whether the own microphone is muted. */
  readonly isMuted = this.isMutedState.asReadonly();

  /** Whether all incoming audio is deafened (implies muted). */
  readonly isDeafened = this.isDeafenedState.asReadonly();

  /** Session ids currently speaking (local analysis only). */
  readonly speakingSessions = this.speakingSessionsState.asReadonly();

  /** Remote screen-share streams by sharing session id. */
  readonly remoteScreens = this.remoteScreensState.asReadonly();

  /** Own client-session id, for roster highlighting. */
  readonly ownSessionId = this.clientSession.id;

  private mesh: VoiceMesh | null = null;

  private localStream: MediaStream | null = null;

  private inboxSubscription: Subscription | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private readonly soundboardDispatch = inject(SoundboardDispatchService);

  private readonly rosterChimes = new RosterChimes();

  private muteBeforeDeafen = false;


  /**
   * Wires the roster reconciliation, the sign-out teardown and the
   * best-effort cleanup on tab close.
   */
  constructor() {
    effect(() => this.syncWithRoster());
    effect(() => {
      if (!this.authService.currentUser() && this.connectedChannelState()) void this.leave();
    });
    window.addEventListener('beforeunload', () => void this.leave());
  }


  /**
   * Joins a voice channel; joining while connected elsewhere performs a
   * seamless switch (full leave, then join). A full channel only shows the
   * capacity toast — client-enforced, a simultaneous-join race above the
   * cap is tolerated.
   * @param channel Id and name of the voice channel to join.
   */
  async join(channel: ConnectedVoiceChannel): Promise<void> {
    if (this.isJoiningState() || this.connectedChannelState()?.id === channel.id) return;
    if (this.rejectIfFull(channel.id)) return;
    this.isJoiningState.set(true);
    try {
      await this.performJoin(channel);
    } catch {
      this.abortJoin();
    } finally {
      this.isJoiningState.set(false);
    }
  }


  /**
   * Leaves the current voice channel: local teardown first (idempotent),
   * then the best-effort Firestore cleanup of the own participant document
   * and any remaining signaling envelopes.
   */
  async leave(): Promise<void> {
    const channel = this.connectedChannelState();
    if (!channel) return;
    this.connectedChannelState.set(null);
    this.teardownLocal();
    this.soundService.play('voiceLeave');
    await this.participantService.remove(channel.id);
    await this.signalingService.clearOwn(channel.id);
  }


  /**
   * Toggles the own microphone. While deafened, the mic press lifts the
   * deafen first and unmutes (Discord parity).
   */
  toggleMute(): void {
    if (this.isDeafenedState()) return this.undeafen(false);
    this.setMuted(!this.isMutedState());
  }


  /**
   * Toggles deafen: deafening silences all remote audio and forces
   * self-mute; un-deafening restores the mute state from before.
   */
  toggleDeafen(): void {
    if (this.isDeafenedState()) return this.undeafen(this.muteBeforeDeafen);
    this.muteBeforeDeafen = this.isMutedState();
    this.isDeafenedState.set(true);
    this.mesh?.setRemoteMuted(true);
    this.setMuted(true);
  }


  /**
   * Executes the join sequence: microphone FIRST (a denied permission
   * writes nothing), then the seamless switch, the participant document,
   * the connection-scoped inbox, the heartbeat and the offers to every
   * existing participant.
   * @param channel Channel being joined.
   */
  private async performJoin(channel: ConnectedVoiceChannel): Promise<void> {
    const stream = await this.captureMicrophone();
    if (!stream) return;
    if (this.connectedChannelState()) await this.leave();
    const existing = this.rosterService.participantsOf(channel.id);
    this.localStream = stream;
    this.applyTrackMute();
    this.connectedChannelState.set({ ...channel });
    const flags = { muted: this.isMutedState(), deafened: this.isDeafenedState() };
    if (!(await this.participantService.create(channel.id, flags))) {
      return this.abortJoin();
    }
    this.rosterChimes.reset();
    this.openPlumbing(channel.id, stream);
    this.mesh?.initiateToExisting(existing);
    this.soundService.play('voiceJoin');
  }


  /**
   * Requests the microphone with the high-quality voice constraints; a
   * denial shows the German toast and aborts before anything is written.
   */
  private async captureMicrophone(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...VOICE_CONSTRAINTS } });
    } catch {
      this.toastService.show(MIC_DENIED_TOAST);
      this.soundService.play('error');
      return null;
    }
  }


  /**
   * Creates the mesh, subscribes the connection-scoped signal inbox and
   * starts the lastSeen heartbeat (writes only while connected, §14).
   * @param channelId Channel being joined.
   * @param stream Captured microphone stream.
   */
  private openPlumbing(channelId: string, stream: MediaStream): void {
    this.mesh = new VoiceMesh({
      ownSessionId: this.clientSession.id,
      localStream: stream,
      sendSignal: (toSession, toUid, kind, payload) =>
        this.signalingService.send(channelId, toSession, toUid, kind, payload),
      consumeSignal: signalId => this.signalingService.consume(channelId, signalId),
      isDeafened: () => this.isDeafenedState(),
      onSpeakingChange: speaking => this.speakingSessionsState.set(speaking),
      onRemoteScreensChange: screens => this.remoteScreensState.set(screens),
      onSoundSignal: (fromSession, soundId) => this.soundboardDispatch.dispatch(fromSession, soundId),
    });
    this.inboxSubscription = this.signalingService
      .streamInbox(channelId)
      .subscribe(signals => this.mesh?.applySignals(signals));
    this.heartbeatTimer = setInterval(
      () => this.participantService.heartbeat(channelId),
      VOICE_HEARTBEAT_MS,
    );
  }


  /**
   * Aborts a failed join after the participant write was denied: local
   * teardown plus the error toast.
   */
  private abortJoin(): void {
    this.connectedChannelState.set(null);
    this.teardownLocal();
    this.toastService.show(JOIN_FAILED_TOAST);
    this.soundService.play('error');
  }


  /**
   * Releases everything local: mesh (peers, audio elements, analysers),
   * inbox subscription, heartbeat and microphone. Idempotent — it also
   * runs as part of every channel switch.
   */
  private teardownLocal(): void {
    this.mesh?.dispose();
    this.mesh = null;
    this.inboxSubscription?.unsubscribe();
    this.inboxSubscription = null;
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;
    this.rosterChimes.reset();
    this.speakingSessionsState.set(new Set());
    this.remoteScreensState.set(new Map());
  }


  /**
   * Reconciles the mesh with the live roster while connected and plays the
   * join/leave chimes for peers entering or leaving the own channel.
   */
  private syncWithRoster(): void {
    const channel = this.connectedChannelState();
    if (!channel || !this.mesh) return;
    const participants = this.rosterService.participantsOf(channel.id);
    this.mesh.syncWithRoster(participants);
    const chime = this.rosterChimes.evaluate(participants, this.clientSession.id);
    if (chime) this.soundService.play(chime);
  }


  /**
   * Adds the local screen-share track to every peer and marks the own
   * participant document as sharing; a no-op while not connected. Capture
   * itself is owned by {@link ScreenShareService}.
   * @param track Captured screen video track.
   * @param stream Capture stream the track belongs to.
   */
  startScreenShare(track: MediaStreamTrack, stream: MediaStream): void {
    const channel = this.connectedChannelState();
    if (!channel || !this.mesh) return;
    this.mesh.startShare(track, stream);
    this.participantService.writeSharing(channel.id, true);
  }


  /**
   * Removes the shared track from every peer again and clears the sharing
   * flag; idempotent and a no-op while not connected.
   */
  stopScreenShare(): void {
    const channel = this.connectedChannelState();
    if (!channel || !this.mesh) return;
    this.mesh.stopShare();
    this.participantService.writeSharing(channel.id, false);
  }


  /**
   * Rejects a join into a channel already at the participant cap with the
   * capacity toast and the error sound.
   * @param channelId Channel being joined.
   * @returns Whether the join was rejected.
   */
  private rejectIfFull(channelId: string): boolean {
    if (this.rosterService.participantsOf(channelId).length < MAX_VOICE_PARTICIPANTS) return false;
    this.toastService.show(CHANNEL_FULL_TOAST);
    this.soundService.play('error');
    return true;
  }


  /**
   * Applies a mute state to the flags, the local tracks and the own
   * participant document (transition write).
   * @param muted New microphone mute state.
   */
  private setMuted(muted: boolean): void {
    this.isMutedState.set(muted);
    this.applyTrackMute();
    this.writeFlags();
  }


  /**
   * Lifts the deafen state, restores remote audio and applies the target
   * mute state.
   * @param muted Mute state to restore after un-deafening.
   */
  private undeafen(muted: boolean): void {
    this.isDeafenedState.set(false);
    this.mesh?.setRemoteMuted(false);
    this.setMuted(muted);
  }


  /**
   * Mirrors the mute flag onto every local audio track.
   */
  private applyTrackMute(): void {
    const enabled = !this.isMutedState();
    this.localStream?.getAudioTracks().forEach(track => (track.enabled = enabled));
  }


  /**
   * Transition-writes the mute/deafen flags onto the own participant
   * document while connected.
   */
  private writeFlags(): void {
    const channel = this.connectedChannelState();
    if (!channel) return;
    const flags = { muted: this.isMutedState(), deafened: this.isDeafenedState() };
    this.participantService.writeFlags(channel.id, flags);
  }
}
