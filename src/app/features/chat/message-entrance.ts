/**
 * @file First-appearance gate for the message entrance animation. It anchors a
 * wall-clock baseline the moment a chat context is opened and reports whether a
 * given message was created after it. This animates only genuinely new messages
 * once — never the initial history (created before the context was opened),
 * never on a pending → server-acked metadata change (createdAt stays after the
 * baseline and the rendered row is reused, so the one-shot CSS animation cannot
 * replay) and never on navigation or theme toggle (a context switch re-anchors
 * the baseline instead of replaying). Anchoring to the open time rather than to
 * the first rendered batch is deliberate: the message stream starts at an empty
 * initialValue and Firestore loads asynchronously, so a batch-derived baseline
 * would mistake the whole history for new content on first open.
 */
import { Timestamp } from '@angular/fire/firestore';
import { signal } from '@angular/core';

import { ChatEntry } from '../../models/message.model';

/**
 * Per-context entrance gate shared by the chat lists and the thread panel.
 * Lives as a plain field on the owning component and is re-opened on every
 * context switch.
 */
export class MessageEntranceTracker {
  private readonly openedAtMs = signal(0);

  private readonly active = signal(false);


  /**
   * Anchors the baseline to the current time and activates the gate; call on
   * every context switch so only messages created afterwards animate.
   */
  open(): void {
    this.openedAtMs.set(Date.now());
    this.active.set(true);
  }


  /**
   * Whether an entry was created after the context was opened and may run the
   * entrance animation; false until the context is opened and for all history,
   * whose createdAt precedes the baseline.
   * @param entry Chat entry of the rendered row.
   */
  shouldEnter(entry: ChatEntry): boolean {
    return this.active() && createdMs(entry.createdAt) > this.openedAtMs();
  }
}


/**
 * Resolves a createdAt to milliseconds; an unresolved serverTimestamp()
 * sentinel of a just-sent message counts as now, so own sends animate.
 * @param value createdAt field value of a chat entry.
 */
function createdMs(value: ChatEntry['createdAt']): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}
