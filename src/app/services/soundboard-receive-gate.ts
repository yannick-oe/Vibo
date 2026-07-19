/**
 * @file Pure per-session spam guard of the soundboard receiving side: each
 * remote session may trigger at most one playback per throttle interval,
 * mirroring the sender-side press throttle. No I/O, fully testable.
 */
import { SOUNDBOARD_THROTTLE_MS } from '../shared/soundboard.constants';

/**
 * Tracks the last accepted broadcast per sending session and enforces the
 * shared throttle interval between them.
 */
export class SoundboardReceiveGate {
  private readonly lastAcceptedMs = new Map<string, number>();


  /**
   * Reports whether a broadcast from a session may play now and, if so,
   * consumes the session's throttle window.
   * @param fromSession Client session that sent the broadcast.
   * @param nowMs Current monotonic time in milliseconds.
   */
  accepts(fromSession: string, nowMs: number): boolean {
    const last = this.lastAcceptedMs.get(fromSession) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - last < SOUNDBOARD_THROTTLE_MS) return false;
    this.lastAcceptedMs.set(fromSession, nowMs);
    return true;
  }
}
