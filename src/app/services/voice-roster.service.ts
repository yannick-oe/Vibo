/**
 * @file Live roster of all voice-channel participants from ONE persistent
 * collection-group listener (§14 listener budget: this single stream powers
 * both the sidebar occupancy and the in-channel roster, client-filtered).
 * Stale sessions — whose lastSeen heartbeat is older than VOICE_STALE_MS —
 * are filtered client-side on a sweep ticker, so orphaned documents from
 * crashed tabs disappear from the UI without any server-side cleanup.
 */
import {
  EnvironmentInjector,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  Firestore,
  QuerySnapshot,
  Timestamp,
  Unsubscribe,
  collectionGroup,
  onSnapshot,
} from '@angular/fire/firestore';
import { Subscription, skip, take } from 'rxjs';

import { VoiceParticipant, VoiceParticipantDoc } from '../models/voice.model';
import {
  VOICE_PARTICIPANTS_SEGMENT,
  VOICE_STALE_MS,
  VOICE_STALE_SWEEP_MS,
} from '../shared/voice.constants';
import { AuthService } from './auth.service';
import { VoiceChannelService } from './voice-channel.service';

/**
 * Streams the participant sessions of every voice channel and exposes them
 * as stale-filtered signals grouped by channel. Also self-heals the cached
 * channel list: a participant referencing an unknown channel id triggers a
 * one-shot list refresh in {@link VoiceChannelService}.
 */
@Injectable({ providedIn: 'root' })
export class VoiceRosterService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly voiceChannelService = inject(VoiceChannelService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly participantsState = signal<VoiceParticipant[]>([]);

  private readonly nowMs = signal(Date.now());

  private readonly retryTick = signal(0);

  private retryArm: Subscription | null = null;

  /** All non-stale participant sessions across every voice channel. */
  readonly activeParticipants: Signal<VoiceParticipant[]> = computed(() =>
    this.filterFresh(this.participantsState()),
  );

  /** Non-stale participants grouped by channel id, ordered by join time. */
  readonly byChannel: Signal<ReadonlyMap<string, VoiceParticipant[]>> = computed(() =>
    groupByChannel(this.activeParticipants()),
  );


  /**
   * Starts the staleness sweep, binds the collection-group listener to the
   * auth state (plus the retry tick that revives a dead listener) and
   * wires the unknown-channel list refresh.
   */
  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), VOICE_STALE_SWEEP_MS);
    effect(onCleanup => {
      this.retryTick();
      if (!this.authService.currentUser()) return this.participantsState.set([]);
      onCleanup(this.listen());
    });
    effect(() => this.refreshUnknownChannels());
  }


  /**
   * The non-stale participants of one voice channel, ordered by join time.
   * @param channelId Firestore id of the voice channel.
   */
  participantsOf(channelId: string): VoiceParticipant[] {
    return this.byChannel().get(channelId) ?? [];
  }


  /**
   * Opens the single persistent collection-group listener; errors reset to
   * an empty roster (best effort — occupancy is never load-bearing).
   */
  private listen(): Unsubscribe {
    return runInInjectionContext(this.injector, () =>
      onSnapshot(
        collectionGroup(this.firestore, VOICE_PARTICIPANTS_SEGMENT),
        snapshot => this.participantsState.set(mapParticipants(snapshot)),
        () => this.recoverFromError(),
      ),
    );
  }


  /**
   * Handles a terminal listener death: the roster empties (existing
   * behavior) and the single persistent listener is re-armed on the NEXT
   * ID-token emission — never immediately, so a persistent rejection
   * cannot loop — restoring the intended one-listener inventory instead of
   * staying dark for the rest of the session.
   */
  private recoverFromError(): void {
    this.participantsState.set([]);
    if (this.retryArm) return;
    this.retryArm = this.authService.tokenChanges
      .pipe(skip(1), take(1))
      .subscribe(() => this.rearmListener());
  }


  /**
   * Revives the dead listener by bumping the retry tick the binding effect
   * tracks; at most one listener exists at any time (effect cleanup).
   */
  private rearmListener(): void {
    this.retryArm = null;
    this.retryTick.update(tick => tick + 1);
  }


  /**
   * Keeps only participants whose heartbeat is within the staleness window.
   * @param participants Raw participants from the stream.
   */
  private filterFresh(participants: VoiceParticipant[]): VoiceParticipant[] {
    const cutoff = this.nowMs() - VOICE_STALE_MS;
    return participants.filter(participant => toMillisOrNow(participant.lastSeen) >= cutoff);
  }


  /**
   * Triggers a one-shot channel-list refresh when the roster references a
   * channel id the cached list does not contain (created elsewhere).
   */
  private refreshUnknownChannels(): void {
    const unknown = this.activeParticipants().some(participant =>
      this.voiceChannelService.isUnknownChannel(participant.channelId),
    );
    if (unknown) void this.voiceChannelService.refresh();
  }
}


/**
 * Maps a collection-group snapshot to participants, resolving each entry's
 * channel id from its document path.
 * @param snapshot Live snapshot of the voiceParticipants collection group.
 */
function mapParticipants(snapshot: QuerySnapshot): VoiceParticipant[] {
  return snapshot.docs
    .map(entry => ({
      ...(entry.data() as VoiceParticipantDoc),
      sessionId: entry.id,
      channelId: entry.ref.parent.parent?.id ?? '',
    }))
    .filter(participant => participant.channelId !== '');
}


/**
 * Groups participants by channel id, each group ordered by join time with a
 * session-id tiebreak for a stable rendering order.
 * @param participants Stale-filtered participants.
 */
function groupByChannel(
  participants: VoiceParticipant[],
): ReadonlyMap<string, VoiceParticipant[]> {
  const groups = new Map<string, VoiceParticipant[]>();
  for (const participant of participants) {
    const group = groups.get(participant.channelId) ?? [];
    group.push(participant);
    groups.set(participant.channelId, group);
  }
  for (const group of groups.values()) group.sort(byJoinTime);
  return groups;
}


/**
 * Compares two participants by join time, session id as tiebreak.
 * @param a First participant.
 * @param b Second participant.
 */
function byJoinTime(a: VoiceParticipant, b: VoiceParticipant): number {
  return (
    toMillisOrNow(a.joinedAt) - toMillisOrNow(b.joinedAt) ||
    a.sessionId.localeCompare(b.sessionId)
  );
}


/**
 * Resolves a timestamp field in milliseconds; a still-pending
 * serverTimestamp() (an own just-written document) counts as "now", so the
 * writer never appears stale to themselves.
 * @param value Timestamp or pending sentinel from the stream.
 */
function toMillisOrNow(value: VoiceParticipantDoc['lastSeen']): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}
