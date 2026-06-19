/**
 * @file Reaction domain helpers: the one-reaction-per-user model and the two
 * "big" reactions whose selection triggers an on-brand full-screen effect.
 */
import { ReactionMap } from './message.model';

/** Kinds of celebratory full-screen effect a big reaction can trigger. */
export type EffectKind = 'confetti' | 'hearts';

/** Emoji whose selection fires a full-screen effect, mapped to that effect. */
export const BIG_REACTIONS: Readonly<Record<string, EffectKind>> = {
  '🎉': 'confetti',
  '💖': 'hearts',
};

/** German display noun of each big reaction, used in its accessible label. */
export const BIG_REACTION_LABELS: Readonly<Record<string, string>> = {
  '🎉': 'Konfetti',
  '💖': 'Herzen',
};


/**
 * The single emoji the signed-in user currently reacts with, or null. Each
 * user holds at most one reaction per message.
 * @param reactions Reaction map of the message.
 * @param uid Signed-in user's uid.
 */
export function userReaction(reactions: ReactionMap, uid: string): string | null {
  for (const [emoji, uids] of Object.entries(reactions)) {
    if (uids.includes(uid)) return emoji;
  }
  return null;
}


/**
 * The full-screen effect a reaction triggers, or null for normal reactions.
 * @param emoji Reaction emoji character.
 */
export function bigReactionEffect(emoji: string): EffectKind | null {
  return BIG_REACTIONS[emoji] ?? null;
}


/**
 * The German display noun of a big reaction (e.g. "Konfetti"), or null when
 * the emoji is a normal reaction.
 * @param emoji Reaction emoji character.
 */
export function bigReactionLabel(emoji: string): string | null {
  return BIG_REACTION_LABELS[emoji] ?? null;
}
