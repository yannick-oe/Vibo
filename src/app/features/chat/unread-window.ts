/**
 * @file Pagination helper for the unread divider: extends a conversation window
 * with older pages until the frozen first-unread boundary is loaded, bounded by
 * a page cap. Beyond the cap the divider gracefully rides the top of the loaded
 * window (it never silently vanishes), so this only improves where it settles.
 */
import { Timestamp } from '@angular/fire/firestore';

import { ConversationWindow } from '../../services/conversation-window';

const MAX_DIVIDER_PAGES = 5;

/**
 * Loads older pages until the oldest loaded message reaches (or passes) the
 * unread boundary; capped, and a no-op when there is no boundary.
 * @param window Conversation window to extend.
 * @param since Frozen unread boundary, or null.
 */
export function extendWindowToBoundary(
  window: ConversationWindow,
  since: Timestamp | null,
): Promise<boolean> {
  if (!since) return Promise.resolve(true);
  return window.loadOlderUntil(() => reachedBoundary(window, since), MAX_DIVIDER_PAGES);
}


/**
 * Whether the oldest loaded message is at or before the unread boundary.
 * @param window Conversation window.
 * @param since Unread boundary timestamp.
 */
function reachedBoundary(window: ConversationWindow, since: Timestamp): boolean {
  const oldest = window.oldestLoaded()?.createdAt;
  return oldest instanceof Timestamp && oldest.toMillis() <= since.toMillis();
}
