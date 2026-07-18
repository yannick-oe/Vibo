/**
 * @file Pure join/leave chime evaluation over roster deltas of the
 * connected voice channel: compares each roster emission against the
 * previous one and reports whether another session entered or left. The
 * first emission after (re)priming only establishes the baseline, so the
 * own join never double-chimes.
 */
import { VoiceParticipant } from '../../../models/voice.model';

/** Chime a roster delta resolves to (palette sound kinds). */
export type RosterChime = 'voiceJoin' | 'voiceLeave';

/**
 * Stateful comparator of consecutive roster snapshots. Reset on every
 * join/leave/switch so a fresh connection re-primes its baseline.
 */
export class RosterChimes {
  private previous: ReadonlySet<string> | null = null;


  /**
   * Clears the baseline; the next evaluation only primes it.
   */
  reset(): void {
    this.previous = null;
  }


  /**
   * Evaluates a roster snapshot against the previous one.
   * @param participants Current non-stale participants of the channel.
   * @param ownSession Own client-session id (never chimes for itself).
   * @returns The chime to play, or null when nothing changed.
   */
  evaluate(participants: readonly VoiceParticipant[], ownSession: string): RosterChime | null {
    const sessions = new Set(participants.map(participant => participant.sessionId));
    const previous = this.previous;
    this.previous = sessions;
    if (!previous) return null;
    for (const sessionId of sessions) {
      if (!previous.has(sessionId) && sessionId !== ownSession) return 'voiceJoin';
    }
    for (const sessionId of previous) {
      if (!sessions.has(sessionId) && sessionId !== ownSession) return 'voiceLeave';
    }
    return null;
  }
}
