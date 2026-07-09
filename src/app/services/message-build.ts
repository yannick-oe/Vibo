/**
 * @file Pure builders for message and reply documents with the data-model
 * defaults. Kept apart from the message service so the service stays focused
 * and the builders can be reused by the channel, direct-message and thread
 * write paths (text and GIF variants alike).
 */
import { serverTimestamp } from '@angular/fire/firestore';

import { GifResult } from '../models/gif.model';
import { MessageDoc, ReplyDoc } from '../models/message.model';

/** The stored Giphy fields shared by GIF messages and GIF replies. */
function gifFields(gif: GifResult): Pick<ReplyDoc, 'gifUrl' | 'gifStill' | 'gifWidth' | 'gifHeight' | 'gifAlt'> {
  return { gifUrl: gif.url, gifStill: gif.still, gifWidth: gif.width, gifHeight: gif.height, gifAlt: gif.alt };
}


/**
 * Builds a thread reply document authored by the given user.
 * @param uid Author uid.
 * @param text Trimmed reply text.
 */
export function buildReply(uid: string, text: string): ReplyDoc {
  return { authorId: uid, text, createdAt: serverTimestamp(), reactions: {} };
}


/**
 * Builds a GIF reply: an empty-text reply plus the stored Giphy fields.
 * @param uid Author uid.
 * @param gif Selected GIF result.
 */
export function buildGifReply(uid: string, gif: GifResult): ReplyDoc {
  return { ...buildReply(uid, ''), ...gifFields(gif) };
}


/**
 * Builds a chat message document with the denormalized thread counters
 * initialized to their data-model defaults.
 * @param uid Author uid.
 * @param text Trimmed message text.
 */
export function buildMessage(uid: string, text: string): MessageDoc {
  return { ...buildReply(uid, text), replyCount: 0, lastReplyAt: null };
}


/**
 * Builds a GIF message: an empty-text message plus the stored Giphy fields.
 * @param uid Author uid.
 * @param gif Selected GIF result.
 */
export function buildGifMessage(uid: string, gif: GifResult): MessageDoc {
  return { ...buildMessage(uid, ''), ...gifFields(gif) };
}
