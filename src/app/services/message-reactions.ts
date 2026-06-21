/**
 * @file Atomic one-reaction-per-user updates on a message document: the field
 * path of a reaction emoji, the removal value and the combined apply operation.
 */
import {
  DocumentReference,
  FieldPath,
  FieldValue,
  arrayRemove,
  arrayUnion,
  deleteField,
  updateDoc,
} from '@angular/fire/firestore';

import { ReactionMap } from '../models/message.model';
import { userReaction } from '../models/reactions';


/**
 * Builds the document field path of a reaction emoji under the reactions map.
 * @param emoji Reaction emoji character.
 */
function field(emoji: string): FieldPath {
  return new FieldPath('reactions', emoji);
}


/**
 * Field value that removes a uid from a reaction, deleting the field entirely
 * when that uid was its last reactor.
 * @param uids Current reactors of the emoji.
 * @param uid Uid to remove.
 */
function removeReactor(uids: string[], uid: string): FieldValue {
  return uids.length === 1 && uids[0] === uid ? deleteField() : arrayRemove(uid);
}


/**
 * Applies the one-reaction-per-user change in a single atomic update: removes
 * the user from their current reaction and adds them to the chosen one,
 * removes only (toggle off) when re-selecting it, or adds when they hold none.
 * @param ref Message document reference.
 * @param reactions Current reaction map.
 * @param emoji Chosen reaction emoji.
 * @param uid Signed-in user's uid.
 */
export function applyReaction(ref: DocumentReference, reactions: ReactionMap, emoji: string, uid: string): Promise<void> {
  const current = userReaction(reactions, uid);
  if (current && current !== emoji) {
    return updateDoc(ref, field(current), removeReactor(reactions[current], uid), field(emoji), arrayUnion(uid));
  }
  if (current) return updateDoc(ref, field(current), removeReactor(reactions[current], uid));
  return updateDoc(ref, field(emoji), arrayUnion(uid));
}
