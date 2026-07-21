/**
 * @file Shared presence-status model: the sticky Discord-style manual status
 * stored on the user document, the effective displayed status, and the ONE
 * pure resolver every presence renderer derives its state from.
 */

/** Allowed Firestore values of the manual status field on users/{uid}. */
export const MANUAL_STATUS_VALUES = ['online', 'away', 'busy', 'invisible'] as const;

/** Sticky manual presence choice; absent or 'online' means automatic behavior. */
export type ManualStatus = (typeof MANUAL_STATUS_VALUES)[number];

/** Displayed presence of a user; invisible users resolve to 'offline'. */
export type PresenceState = 'online' | 'away' | 'busy' | 'offline';


/**
 * Resolves the effective displayed status of a user from the sticky manual
 * choice and the live activity signals. A stale heartbeat always wins — a
 * disconnected user is never shown by their manual choice; 'invisible'
 * renders as offline on every client (the own one included); 'away' and
 * 'busy' are sticky and ignore activity; only the automatic mode (absent or
 * 'online') falls through to the transition-written session presence.
 * @param manualStatus Stored manual choice, or undefined for automatic.
 * @param heartbeatFresh Whether the user's lastActive heartbeat is fresh.
 * @param sessionAway Whether the transition-written session presence is away.
 */
export function effectivePresence(
  manualStatus: ManualStatus | undefined,
  heartbeatFresh: boolean,
  sessionAway: boolean,
): PresenceState {
  if (!heartbeatFresh) return 'offline';
  if (manualStatus === 'invisible') return 'offline';
  if (manualStatus === 'busy') return 'busy';
  if (manualStatus === 'away') return 'away';
  return sessionAway ? 'away' : 'online';
}
