/**
 * @file localStorage persistence of the per-context "pins seen" state: the
 * pinned-message count recorded when the user last opened the pinned view
 * of a channel/conversation. The header badge renders only while the live
 * count exceeds this recorded state. Storage failures (private mode,
 * blocked storage) never surface: reads fall back to zero and writes are
 * silently skipped — the badge then simply behaves per-session.
 */

/** Key prefix of the per-context seen state (suffix = messages path). */
export const PINS_SEEN_KEY_PREFIX = 'vibo:pins-seen:';


/**
 * Reads the recorded seen pin count of a chat context.
 * @param messagesPath Messages collection path of the context.
 * @returns The recorded count; zero when nothing valid is stored.
 */
export function readSeenPinCount(messagesPath: string): number {
  try {
    const parsed = Number(localStorage.getItem(`${PINS_SEEN_KEY_PREFIX}${messagesPath}`));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}


/**
 * Records the seen pin count of a chat context (on opening the pinned view
 * and when clamping after unpins below the recorded state).
 * @param messagesPath Messages collection path of the context.
 * @param count Current pinned count to record.
 */
export function storeSeenPinCount(messagesPath: string, count: number): void {
  try {
    localStorage.setItem(`${PINS_SEEN_KEY_PREFIX}${messagesPath}`, String(count));
  } catch {
    return;
  }
}
