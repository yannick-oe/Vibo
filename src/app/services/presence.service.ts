/**
 * @file Real online-presence tracking backed by a Firestore heartbeat. While a
 * user is signed in, the app refreshes users/{uid}.lastActive on an interval; a
 * user counts as online when that timestamp is within a recent threshold, which
 * is re-evaluated on a ticker so silent disconnects flip to offline. On top of
 * that, users/{uid}.presence carries 'online' | 'away' and is written ONLY on
 * state transitions (never on an interval): away when the tab hides or after
 * the idle deadline without user activity, back to online on the first
 * activity or visibility regain. Offline always derives from the stale
 * heartbeat and takes precedence over the presence field.
 */
import {
  EnvironmentInjector,
  Injectable,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { User } from '@angular/fire/auth';
import {
  FieldValue,
  Firestore,
  Timestamp,
  doc,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';

import { UserDoc } from '../models/user.model';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

const HEARTBEAT_INTERVAL_MS = 60_000;
const ONLINE_THRESHOLD_MS = 120_000;
const PRESENCE_TICK_MS = 30_000;
const OFFLINE_BACKDATE_MS = 86_400_000;
const AWAY_AFTER_MS = 300_000;
const ACTIVITY_THROTTLE_MS = 10_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Session presence written on transitions; offline derives client-side. */
type SessionPresence = 'online' | 'away';

/** Displayed presence of a user, offline taking precedence. */
export type PresenceState = SessionPresence | 'offline';

/**
 * Tracks which users are currently online via a Firestore heartbeat and a
 * client-side freshness check, maintains the own transition-only away
 * state, and exposes both as signals for the UI.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly firestore = inject(Firestore);

  private readonly injector = inject(EnvironmentInjector);

  private readonly nowMs = signal(Date.now());

  private heartbeat: ReturnType<typeof setInterval> | null = null;

  private currentPresence: SessionPresence | null = null;

  private lastActivityMs = Date.now();

  private lastArmMs = 0;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly onlineUids = computed(() => this.collectOnlineUids());

  private readonly awayUids = computed(() => this.collectAwayUids());


  /**
   * Starts the freshness ticker, the auth-driven heartbeat and the away
   * tracking, and marks the user offline when the tab is closed.
   */
  constructor() {
    this.startTicker();
    effect(() => this.syncHeartbeat(this.auth.currentUser()));
    window.addEventListener('beforeunload', () => void this.markOffline());
    this.attachActivityTracking();
  }


  /**
   * Reports whether the given user counts as online right now.
   * @param uid User id to check.
   */
  isOnline(uid: string): boolean {
    return this.onlineUids().has(uid);
  }


  /**
   * Resolves the displayed presence of a user: offline while the heartbeat
   * is stale, otherwise the transition-written session state.
   * @param uid User id to resolve.
   */
  stateFor(uid: string): PresenceState {
    if (!this.onlineUids().has(uid)) return 'offline';
    return this.awayUids().has(uid) ? 'away' : 'online';
  }


  /**
   * Builds the set of uids whose session presence is 'away'.
   */
  private collectAwayUids(): Set<string> {
    const away = this.userService.users().filter(user => user.presence === 'away');
    return new Set(away.map(user => user.uid));
  }


  /**
   * Builds the set of uids whose last heartbeat is within the online window.
   */
  private collectOnlineUids(): Set<string> {
    const cutoff = this.nowMs() - ONLINE_THRESHOLD_MS;
    const fresh = this.userService.users().filter(user => lastActiveMs(user) >= cutoff);
    return new Set(fresh.map(user => user.uid));
  }


  /**
   * Re-evaluates presence periodically so users who vanish without a clean
   * logout flip to offline once their threshold elapses.
   */
  private startTicker(): void {
    setInterval(() => this.nowMs.set(Date.now()), PRESENCE_TICK_MS);
  }


  /**
   * Restarts the heartbeat for the signed-in user, or stops it when signed
   * out; a fresh sign-in also (re)initializes the session presence.
   * @param user Currently authenticated user, or null.
   */
  private syncHeartbeat(user: User | null): void {
    this.stopHeartbeat();
    if (!user) return this.stopIdleTracking();
    this.beat(user.uid);
    this.heartbeat = setInterval(() => this.beat(user.uid), HEARTBEAT_INTERVAL_MS);
    this.currentPresence = null;
    this.transitionTo(document.visibilityState === 'hidden' ? 'away' : 'online');
    this.armIdleTimer();
  }


  /**
   * Wires the away detection once for the app lifetime: passive activity
   * listeners with throttled timer re-arming plus the visibility flips.
   * Transitions no-op while signed out.
   */
  private attachActivityTracking(): void {
    for (const type of ACTIVITY_EVENTS) {
      document.addEventListener(type, () => this.onActivity(), { passive: true });
    }
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());
  }


  /**
   * Registers user activity: the first interaction of an away session
   * flips back to online; the idle deadline is re-armed (throttled so the
   * high-frequency listeners stay cheap).
   */
  private onActivity(): void {
    this.lastActivityMs = Date.now();
    if (this.currentPresence === 'away' && document.visibilityState === 'visible') {
      this.transitionTo('online');
    }
    this.armIdleTimerThrottled();
  }


  /**
   * Flips to away when the tab hides and back to online when it becomes
   * visible again.
   */
  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') return this.transitionTo('away');
    this.lastActivityMs = Date.now();
    this.transitionTo('online');
    this.armIdleTimer();
  }


  /**
   * Re-arms the idle deadline at most once per throttle window.
   */
  private armIdleTimerThrottled(): void {
    if (Date.now() - this.lastArmMs < ACTIVITY_THROTTLE_MS) return;
    this.armIdleTimer();
  }


  /**
   * (Re)starts the timer that fires at the earliest possible away moment.
   */
  private armIdleTimer(): void {
    this.lastArmMs = Date.now();
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.onIdleDeadline(), AWAY_AFTER_MS);
  }


  /**
   * Goes away when the last activity is old enough; because the arming is
   * throttled the timer can fire slightly early, in which case it re-arms
   * for the exact remaining time instead of writing anything.
   */
  private onIdleDeadline(): void {
    const remaining = AWAY_AFTER_MS - (Date.now() - this.lastActivityMs);
    if (remaining <= 0) return this.transitionTo('away');
    this.idleTimer = setTimeout(() => this.onIdleDeadline(), remaining);
  }


  /**
   * Stops the idle timer and forgets the session state (sign-out).
   */
  private stopIdleTracking(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.currentPresence = null;
  }


  /**
   * Writes the session presence exactly once per transition (never on an
   * interval); no-ops while signed out or when the state is unchanged.
   * @param state Session presence the client transitions into.
   */
  private transitionTo(state: SessionPresence): void {
    const uid = this.auth.currentUser()?.uid;
    if (!uid || this.currentPresence === state) return;
    this.currentPresence = state;
    void this.writePresence(uid, state).catch(() => undefined);
  }


  /**
   * Updates only the presence field of the own user document.
   * @param uid Own user document id.
   * @param presence Session presence to store.
   */
  private writePresence(uid: string, presence: SessionPresence): Promise<void> {
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `users/${uid}`), { presence }),
    );
  }


  /**
   * Clears any running heartbeat interval.
   */
  private stopHeartbeat(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }


  /**
   * Writes a fresh server-time heartbeat for the user (best effort).
   * @param uid User whose lastActive is refreshed.
   */
  private beat(uid: string): void {
    void this.writeLastActive(uid, serverTimestamp()).catch(() => undefined);
  }


  /**
   * Best-effort backdates lastActive so the user appears offline immediately on
   * a clean logout or tab close.
   */
  markOffline(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return Promise.resolve();
    const past = Timestamp.fromMillis(Date.now() - OFFLINE_BACKDATE_MS);
    return this.writeLastActive(uid, past).catch(() => undefined);
  }


  /**
   * Updates only the lastActive field of the user document.
   * @param uid Target user document id.
   * @param lastActive Server sentinel or explicit timestamp to store.
   */
  private writeLastActive(uid: string, lastActive: Timestamp | FieldValue): Promise<void> {
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `users/${uid}`), { lastActive }),
    );
  }
}


/**
 * Resolves a user's last-active time in milliseconds; missing or still-pending
 * values resolve to 0 so the user is treated as offline.
 * @param user User document read from the live stream.
 */
function lastActiveMs(user: UserDoc): number {
  return user.lastActive instanceof Timestamp ? user.lastActive.toMillis() : 0;
}
