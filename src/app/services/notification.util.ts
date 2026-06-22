/**
 * @file Pure helpers for incoming-message notifications: the per-conversation
 * watch descriptors the notification service subscribes to, parsing the open
 * conversation from the router URL, and building a short, safe message preview.
 * No Angular or Firestore access — kept apart so the service stays focused.
 */
import { Timestamp } from '@angular/fire/firestore';

import { Channel } from '../models/channel.model';
import { MessageDoc } from '../models/message.model';
import { UserDoc } from '../models/user.model';
import { buildConversationId } from '../models/direct-message.model';
import { channelMessagesPath, conversationDocPath, directMessagesPath } from './message.service';

const GIF_PREVIEW = 'GIF';
const NEW_MESSAGE_FALLBACK = 'Neue Nachricht';
const PREVIEW_MAX = 80;
const ELLIPSIS = '…';

/** One conversation the notifier watches; stable across renames and presence. */
export interface ConversationWatch {
  readonly key: string;
  readonly convPath: string;
  readonly messagesPath: string;
  readonly route: string[];
  readonly channelId: string | null;
}


/**
 * Builds the watch list for the signed-in user: their channels plus a direct
 * conversation per other user. Only stable identifiers are baked in; the
 * channel name and sender identity are resolved later at notify time.
 * @param me Signed-in user's uid.
 * @param channels The user's channels.
 * @param users All known users.
 */
export function buildWatchList(me: string, channels: Channel[], users: UserDoc[]): ConversationWatch[] {
  const channelWatches = channels.map(channel => channelWatch(channel));
  const dmWatches = users.filter(user => user.uid !== me).map(user => dmWatch(me, user.uid));
  return [...channelWatches, ...dmWatches];
}


/**
 * Watch descriptor for a channel conversation.
 * @param channel Channel to watch.
 */
function channelWatch(channel: Channel): ConversationWatch {
  const messagesPath = channelMessagesPath(channel.id);
  return {
    key: `channel:${channel.id}`,
    convPath: conversationDocPath(messagesPath),
    messagesPath,
    route: ['/app/channel', channel.id],
    channelId: channel.id,
  };
}


/**
 * Watch descriptor for the direct conversation with a partner.
 * @param me Signed-in user's uid.
 * @param partnerUid Partner's uid.
 */
function dmWatch(me: string, partnerUid: string): ConversationWatch {
  const messagesPath = directMessagesPath(buildConversationId(me, partnerUid));
  return {
    key: `dm:${partnerUid}`,
    convPath: conversationDocPath(messagesPath),
    messagesPath,
    route: ['/app/dm', partnerUid],
    channelId: null,
  };
}


/**
 * Whether two watch lists cover the same conversations regardless of order, so
 * the reactive list stays referentially stable across presence and rename
 * updates (the name-sorted user list reorders on a rename without changing the
 * set of watched conversations).
 * @param a Previous watch list.
 * @param b Next watch list.
 */
export function sameWatchKeys(a: ConversationWatch[], b: ConversationWatch[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(b.map(watch => watch.key));
  return a.every(watch => keys.has(watch.key));
}


/**
 * The currently open conversation key parsed from the router URL, or empty
 * when no chat is open; used to suppress notifying the open conversation.
 * @param url Current router URL.
 */
export function parseOpenKey(url: string): string {
  const path = url.split('?')[0];
  const channel = path.match(/\/app\/channel\/([^/]+)/);
  if (channel) return `channel:${channel[1]}`;
  const dm = path.match(/\/app\/dm\/([^/]+)/);
  return dm ? `dm:${dm[1]}` : '';
}


/**
 * Milliseconds of a Firestore timestamp, or zero when absent.
 * @param value Timestamp or undefined.
 */
export function millisOf(value: Timestamp | undefined): number {
  return value ? value.toMillis() : 0;
}


/**
 * A short, single-line preview of a message: "GIF" for a GIF, otherwise the
 * trimmed, whitespace-collapsed and length-capped text. Interpolation escapes
 * HTML, so this only needs to normalize whitespace and length.
 * @param message Latest message document, or undefined.
 */
export function previewOf(message: MessageDoc | undefined): string {
  if (!message) return NEW_MESSAGE_FALLBACK;
  if (message.gifUrl) return GIF_PREVIEW;
  const text = message.text.replace(/\s+/g, ' ').trim();
  if (!text) return NEW_MESSAGE_FALLBACK;
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}${ELLIPSIS}` : text;
}
