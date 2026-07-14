/**
 * @file Pure mappers from the friendship relationship state to the DM
 * view's composer gating: who-blocked resolution and the unfriended check.
 * Kept free of component state so the view stays under the file budget.
 */
import { RelationshipState } from '../../../models/friendship.model';

/** Blocking state of the conversation from the signed-in user's view. */
export type DmBlockState = 'none' | 'byMe' | 'me';


/**
 * Resolves who blocked the conversation; decides which composer notice
 * renders.
 * @param state Live relationship to the conversation partner.
 */
export function blockStateOf(state: RelationshipState): DmBlockState {
  if (state === 'blockedByMe') return 'byMe';
  return state === 'blockedMe' ? 'me' : 'none';
}


/**
 * Whether the composer freezes because the pair is not (or no longer)
 * befriended: history stays readable, sending pauses until a new request is
 * accepted. False until the friendship stream has loaded so the notice
 * never flashes during sign-in; blocked states take precedence elsewhere.
 * @param state Live relationship to the conversation partner.
 * @param loaded Whether the friendship stream delivered its first snapshot.
 */
export function isUnfriendedState(state: RelationshipState, loaded: boolean): boolean {
  if (!loaded) return false;
  return state !== 'friends' && state !== 'blockedByMe' && state !== 'blockedMe';
}
