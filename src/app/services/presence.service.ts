/**
 * @file Real online-presence tracking backed by a Firestore heartbeat. While a
 * user is signed in, the app refreshes users/{uid}.lastActive on an interval; a
 * user counts as online when that timestamp is within a recent threshold, which
 * is re-evaluated on a ticker so silent disconnects flip to offline.
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

/**
 * Tracks which users are currently online via a Firestore heartbeat and a
 * client-side freshness check, and exposes it as signals for the UI.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly firestore = inject(Firestore);

  private readonly injector = inject(EnvironmentInjector);

  private readonly nowMs = signal(Date.now());

  private heartbeat: ReturnType<typeof setInterval> | null = null;

  readonly onlineUids = computed(() => this.collectOnlineUids());


  /**
   * Starts the freshness ticker and the auth-driven heartbeat, and marks the
   * user offline when the tab is closed.
   */
  constructor() {
    this.startTicker();
    effect(() => this.syncHeartbeat(this.auth.currentUser()));
    window.addEventListener('beforeunload', () => void this.markOffline());
  }


  /**
   * Reports whether the given user counts as online right now.
   * @param uid User id to check.
   */
  isOnline(uid: string): boolean {
    return this.onlineUids().has(uid);
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
   * Restarts the heartbeat for the signed-in user, or stops it when signed out.
   * @param user Currently authenticated user, or null.
   */
  private syncHeartbeat(user: User | null): void {
    this.stopHeartbeat();
    if (!user) return;
    this.beat(user.uid);
    this.heartbeat = setInterval(() => this.beat(user.uid), HEARTBEAT_INTERVAL_MS);
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
