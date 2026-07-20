/**
 * @file Firestore path helpers for conversation message collections,
 * shared by the message data services and every view that derives
 * conversation or thread document paths.
 */

const MESSAGES_SEGMENT = '/messages';


/**
 * Strips the trailing "/messages" segment off a messages-collection path to
 * get the owning conversation document (channel or direct conversation).
 * @param messagesPath Path of a messages subcollection.
 */
export function conversationDocPath(messagesPath: string): string {
  return messagesPath.slice(0, -MESSAGES_SEGMENT.length);
}


/**
 * Builds the messages subcollection path of a channel.
 * @param channelId Firestore id of the channel.
 */
export function channelMessagesPath(channelId: string): string {
  return `channels/${channelId}/messages`;
}


/**
 * Builds the messages subcollection path of a direct conversation.
 * @param conversationId Deterministic id of the conversation.
 */
export function directMessagesPath(conversationId: string): string {
  return `directMessages/${conversationId}/messages`;
}
