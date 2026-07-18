/**
 * @file Pure view helpers shared by the voice sidebar section and the
 * voice bar: display-name and avatar resolution from the live user stream
 * and the speaking predicate (muted or deafened participants never show as
 * speaking).
 */
import { VoiceParticipant } from '../../models/voice.model';
import { UserDoc } from '../../models/user.model';
import { DEFAULT_AVATAR_PATH, resolveAvatarStillSrc } from '../../services/registration.service';

const FALLBACK_MEMBER_NAME = 'Mitglied';

/**
 * Resolves a participant's display name from the user stream.
 * @param users Live user documents.
 * @param uid Uid of the participant.
 */
export function memberName(users: readonly UserDoc[], uid: string): string {
  return users.find(user => user.uid === uid)?.name ?? FALLBACK_MEMBER_NAME;
}


/**
 * Resolves a participant's avatar still image from the user stream.
 * @param users Live user documents.
 * @param uid Uid of the participant.
 */
export function memberAvatar(users: readonly UserDoc[], uid: string): string {
  const path = users.find(user => user.uid === uid)?.avatarPath;
  return resolveAvatarStillSrc(path ?? DEFAULT_AVATAR_PATH);
}


/**
 * Whether a participant currently counts as speaking: locally analysed
 * only, and never while muted or deafened.
 * @param speaking Session ids the local analysis reports as speaking.
 * @param participant Roster participant to evaluate.
 */
export function isParticipantSpeaking(
  speaking: ReadonlySet<string>,
  participant: VoiceParticipant,
): boolean {
  if (participant.muted || participant.deafened) return false;
  return speaking.has(participant.sessionId);
}
