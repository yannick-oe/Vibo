/**
 * @file Real online-presence tracking backed by a Firestore heartbeat. While a
 * user is signed in, the app refreshes users/{uid}.lastActive on an interval; a
 * user counts as connected when that timestamp is within a recent threshold,
 * which is re-evaluated on a ticker so silent disconnects flip to offline. On
 * top of that, users/{uid}.presence carries 'online' | 'away' and is written
 * ONLY on state transitions (never on an interval): away when the tab hides or
 * after the idle deadline without user activity, back to online on the first
 * activity or visibility regain. A second idle stage suspends the heartbeat
 * once inactivity spans the auto-offline window, so idle users read as offline
 * everywhere with zero extra writes. The DISPLAYED status of every user is
 * resolved through the shared effectivePresence helper, which lets the sticky
 * manual choice on the user document (away/busy/invisible) override the
 * automatic behavior; a stale heartbeat always takes precedence.
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

import { PresenceState, effectivePresence } from '../shared/presence-status';
import { AuthService } from './auth.service';
import { PresenceHeartbeat } from './presence-heartbeat';
import { collectAwayUids, collectManualStatuses, collectOnlineUids } from './presence-sets';
import { UserService } from './user.service';

const ONLINE_THRESHOLD_MS = 120_000;
const PRESENCE_TICK_MS = 30_000;
const OFFLINE_BACKDATE_MS = 86_400_000;
const AWAY_AFTER_MS = 300_000;
const OFFLINE_AFTER_MIN = 60;
const OFFLINE_AFTER_MS = OFFLINE_AFTER_MIN * 60_000;
const ACTIVITY_THROTTLE_MS = 10_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Session presence written on transitions; offline derives client-side. */
type SessionPresence = 'online' | 'away';

/**
 * Tracks which users are currently online via a Firestore heartbeat and a
 * client-side freshness check, maintains the own transition-only away and
 * auto-offline state, and resolves every user's displayed status through
 * the shared effectivePresence helper.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly firestore = inject(Firestore);

  private readonly injector = inject(EnvironmentInjector);

  private readonly nowMs = signal(Date.now());

  private readonly heartbeat = new PresenceHeartbeat(uid => this.beat(uid));

  private currentPresence: SessionPresence | null = null;

  private lastActivityMs = Date.now();

  private lastArmMs = 0;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly onlineUids = computed(() =>
    collectOnlineUids(this.userService.users(), this.nowMs() - ONLINE_THRESHOLD_MS),
  );

  private readonly awayUids = computed(() => collectAwayUids(this.userService.users()));

  private readonly manualStatusByUid = computed(() =>
    collectManualStatuses(this.userService.users()),
  );


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
   * Reports whether the given user reads as anything but offline right now
   * (drives the online/offline grouping of the friends view).
   * @param uid User id to check.
   */
  isOnline(uid: string): boolean {
    return this.stateFor(uid) !== 'offline';
  }


  /**
   * Resolves the displayed presence of a user through the shared effective
   * resolver: stale heartbeat → offline, then the sticky manual choice,
   * otherwise the transition-written session state.
   * @param uid User id to resolve.
   */
  stateFor(uid: string): PresenceState {
    const manual = this.manualStatusByUid().get(uid);
    return effectivePresence(manual, this.onlineUids().has(uid), this.awayUids().has(uid));
  }


  /**
   * Reports whether the OWN effective status is busy; the notification
   * toast suppresses its receive sound while it is.
   */
  isOwnBusy(): boolean {
    const uid = this.auth.currentUser()?.uid;
    return uid !== undefined && this.stateFor(uid) === 'busy';
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
    if (!user) {
      this.heartbeat.stop();
      return this.stopIdleTracking();
    }
    this.heartbeat.start(user.uid);
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
   * Registers user activity: a suspended heartbeat revives, the first
   * interaction of an away session flips back to online, and the idle
   * deadline is re-armed (throttled so the listeners stay cheap).
   */
  private onActivity(): void {
    this.lastActivityMs = Date.now();
    this.resumeOnActivity();
    if (this.currentPresence === 'away' && document.visibilityState === 'visible') {
      this.transitionTo('online');
    }
    this.armIdleTimerThrottled();
  }


  /**
   * Flips to away when the tab hides and back to online when it becomes
   * visible again (reviving a suspended heartbeat).
   */
  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') return this.transitionTo('away');
    this.lastActivityMs = Date.now();
    this.resumeOnActivity();
    this.transitionTo('online');
    this.armIdleTimer();
  }


  /**
   * Revives a suspended heartbeat for the signed-in user.
   */
  private resumeOnActivity(): void {
    const uid = this.auth.currentUser()?.uid;
    if (uid) this.heartbeat.resume(uid);
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
   * Goes away when the last activity is old enough and chains into the
   * auto-offline stage; because the arming is throttled the timer can fire
   * slightly early, in which case it re-arms for the exact remaining time
   * instead of writing anything.
   */
  private onIdleDeadline(): void {
    const remaining = AWAY_AFTER_MS - (Date.now() - this.lastActivityMs);
    if (remaining > 0) {
      this.idleTimer = setTimeout(() => this.onIdleDeadline(), remaining);
      return;
    }
    this.transitionTo('away');
    this.armOfflineTimer();
  }


  /**
   * Arms the second idle stage firing at the earliest possible auto-offline
   * moment (the away stage chains into it; no separate timer system).
   */
  private armOfflineTimer(): void {
    const remaining = OFFLINE_AFTER_MS - (Date.now() - this.lastActivityMs);
    this.idleTimer = setTimeout(() => this.onOfflineDeadline(), remaining);
  }


  /**
   * Suspends the heartbeat once the inactivity really spans the offline
   * window — but only in automatic mode: sticky manual choices are never
   * overridden by idle transitions. The stale heartbeat then flips the
   * user to offline on every client via the existing freshness check.
   */
  private onOfflineDeadline(): void {
    const remaining = OFFLINE_AFTER_MS - (Date.now() - this.lastActivityMs);
    if (remaining > 0) return this.armOfflineTimer();
    if (this.isAutomatic()) this.heartbeat.suspend();
  }


  /**
   * Reports whether the own presence runs in automatic mode, i.e. without
   * a sticky manual status choice.
   */
  private isAutomatic(): boolean {
    const uid = this.auth.currentUser()?.uid;
    const manual = uid ? this.manualStatusByUid().get(uid) : undefined;
    return (manual ?? 'online') === 'online';
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
