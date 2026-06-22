/**
 * @file Play-once gate for broadcast laugh reactions, mirroring the entrance
 * tracker. It anchors a wall-clock baseline the moment a chat context opens
 * and reports the messages whose laugh event is newer, deduped by event id.
 * Each laugh thus animates at most once per client: never on load (history
 * predates the baseline), never again on reconnect, scroll or an unrelated
 * re-emit of the same message (its id is already seen). Anchoring to open
 * time rather than the first rendered batch is deliberate — the stream starts
 * empty and loads asynchronously, so a batch baseline would replay history.
 */
import { Timestamp } from '@angular/fire/firestore';

import { BigReactionEvent, Message } from '../../models/message.model';

/**
 * Per-context laugh gate held as a plain field on the message list and
 * re-opened on every context switch, alongside the entrance tracker.
 */
export class BigReactionTracker {
  private openedAtMs = 0;

  private readonly seen = new Set<string>();


  /**
   * Anchors the baseline to now and clears the seen ids; call on every
   * context switch so only laughs triggered afterwards play.
   */
  open(): void {
    this.openedAtMs = Date.now();
    this.seen.clear();
  }


  /**
   * Returns the ids of messages carrying a fresh laugh event — triggered
   * after the baseline and not seen before — marking each as seen.
   * @param messages Current messages of the open context.
   */
  collect(messages: Message[]): string[] {
    const fresh: string[] = [];
    for (const message of messages) this.collectOne(message, fresh);
    return fresh;
  }


  /**
   * Records a message id in `fresh` when its laugh event is new, remembering
   * the event id so it never replays.
   * @param message Message to inspect.
   * @param fresh Accumulator of message ids to play.
   */
  private collectOne(message: Message, fresh: string[]): void {
    const event = message.lastBigReaction;
    if (!event || this.seen.has(event.id) || eventMs(event.at) <= this.openedAtMs) return;
    this.seen.add(event.id);
    fresh.push(message.id);
  }
}


/**
 * Resolves a laugh event's time to milliseconds; a pending serverTimestamp()
 * of the triggerer's own optimistic write counts as now, so they see it
 * immediately and the later server echo is deduped by id.
 * @param at Event timestamp field.
 */
function eventMs(at: BigReactionEvent['at']): number {
  return at instanceof Timestamp ? at.toMillis() : Date.now();
}
