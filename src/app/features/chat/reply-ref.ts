/**
 * @file Builds the inline-reply snapshot ({@link ReplyRef}) stored on an
 * answering message. Kept apart from the chat views so both the channel and
 * direct-message views share one derivation; the preview reuses the existing
 * {@link previewOf} helper with the wider inline-reply cap.
 */
import { Message, REPLY_PREVIEW_MAX, ReplyRef } from '../../models/message.model';
import { previewOf } from '../../services/notification.util';


/**
 * Builds the frozen reply reference for the message being answered: its id,
 * author and a length-capped, single-line text snapshot ("GIF" for GIFs).
 * @param message Answered MAIN-stream message.
 */
export function buildReplyRef(message: Message): ReplyRef {
  return {
    messageId: message.id,
    authorUid: message.authorId,
    previewText: previewOf(message, REPLY_PREVIEW_MAX),
  };
}
