/**
 * @file Pure day-grouping for the message list: splits an ordered message list
 * into consecutive same-day groups and builds the German separator label. Runs
 * on the whole ordered list, so it stays correct across paginated page seams.
 */
import { formatDate } from '@angular/common';
import { Timestamp } from '@angular/fire/firestore';

import { Message } from '../../models/message.model';

const TODAY_LABEL = 'Heute';
const DATE_KEY_FORMAT = 'yyyy-MM-dd';
const DAY_LABEL_FORMAT = 'EEEE, d. MMMM';

/** Consecutive messages of one calendar day under a shared separator. */
export interface MessageGroup {
  readonly key: string;
  readonly label: string;
  readonly messages: Message[];
}

/**
 * Groups ordered (ascending) messages by calendar day for the date separators.
 * @param messages Ordered messages.
 * @param locale Active locale id for date formatting.
 */
export function groupMessagesByDay(messages: Message[], locale: string): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const date = resolveDate(message.createdAt);
    const key = formatDate(date, DATE_KEY_FORMAT, locale);
    const current = groups[groups.length - 1];
    if (current?.key === key) current.messages.push(message);
    else groups.push({ key, label: dayLabel(date, locale), messages: [message] });
  }
  return groups;
}

/**
 * Builds the separator label: "Heute" for today, else the German long form
 * like "Dienstag, 14. Januar".
 * @param date Calendar day of the group.
 * @param locale Active locale id.
 */
function dayLabel(date: Date, locale: string): string {
  const dayKey = formatDate(date, DATE_KEY_FORMAT, locale);
  const todayKey = formatDate(new Date(), DATE_KEY_FORMAT, locale);
  return dayKey === todayKey ? TODAY_LABEL : formatDate(date, DAY_LABEL_FORMAT, locale);
}

/**
 * Converts a Firestore timestamp to a Date; a pending serverTimestamp sentinel
 * (just-sent) resolves to now.
 * @param value createdAt field value from a message document.
 */
function resolveDate(value: Message['createdAt']): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}
