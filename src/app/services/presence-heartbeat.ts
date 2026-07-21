/**
 * @file Heartbeat engine of the presence service: owns the lastActive
 * interval, the auto-offline suspension and the resume-on-activity revival.
 * Extracted from PresenceService for file-size reasons; it performs no
 * Firestore access of its own — the service passes the write callback in.
 */

const HEARTBEAT_INTERVAL_MS = 60_000;

/** Callback writing one lastActive heartbeat for a user. */
type BeatWriter = (uid: string) => void;

/**
 * Interval wrapper around the presence heartbeat with an explicit suspended
 * state: after the auto-offline deadline the service suspends the beat so
 * lastActive goes stale (every client's freshness check then reads the user
 * as offline), and the first fresh activity revives it.
 */
export class PresenceHeartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;

  private suspended = false;


  /**
   * @param writeBeat Callback persisting one server-time heartbeat.
   */
  constructor(private readonly writeBeat: BeatWriter) {}


  /**
   * Starts (or restarts) the regular heartbeat with an immediate first beat;
   * clears any suspension.
   * @param uid User whose lastActive is refreshed.
   */
  start(uid: string): void {
    this.stop();
    this.writeBeat(uid);
    this.interval = setInterval(() => this.writeBeat(uid), HEARTBEAT_INTERVAL_MS);
  }


  /**
   * Stops the interval and clears the suspension (sign-out or restart).
   */
  stop(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.suspended = false;
  }


  /**
   * Suspends the beat after the auto-offline deadline; lastActive goes
   * stale until {@link resume} revives it.
   */
  suspend(): void {
    this.stop();
    this.suspended = true;
  }


  /**
   * Revives a suspended heartbeat on fresh activity; no-op while running.
   * @param uid User whose lastActive is refreshed again.
   */
  resume(uid: string): void {
    if (!this.suspended) return;
    this.start(uid);
  }
}
