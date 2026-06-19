/**
 * @file Small pure helpers for the message row: timestamp resolution and the
 * reduced-motion query used to gate the delete animations.
 */
import { Timestamp } from '@angular/fire/firestore';

import { ChatEntry } from '../../../models/message.model';

/**
 * Converts a Firestore timestamp to a Date; pending serverTimestamp()
 * sentinels (just-sent messages) resolve to now.
 * @param value Timestamp field value from a message document.
 */
export function resolveDate(value: ChatEntry['createdAt']): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}


/**
 * Whether the user prefers reduced motion, so delete animations are skipped.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


/**
 * Resolves after the given delay; awaited to let the collapse-out animation
 * play before the per-user hide is written.
 * @param ms Delay in milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
