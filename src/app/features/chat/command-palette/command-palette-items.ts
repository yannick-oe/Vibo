/**
 * @file Item model plus pure builders and the filter for the command
 * palette: the user's channels and DMs and a small fixed action set.
 */
import { Channel } from '../../../models/channel.model';
import { UserDoc } from '../../../models/user.model';

/** Category of a palette entry, driving its leading glyph. */
export type PaletteKind = 'channel' | 'dm' | 'action';

/** A single selectable palette entry. */
export interface PaletteItem {
  /** Stable DOM id of the rendered option (for aria-activedescendant). */
  readonly id: string;
  /** Visible, filterable label. */
  readonly label: string;
  /** Category driving the leading glyph. */
  readonly kind: PaletteKind;
  /** Runs the entry: navigate or perform the action. */
  readonly run: () => void;
}

/** Side effects the palette items invoke when selected. */
export interface PaletteActions {
  /** Navigates to a hash route from its segments. */
  readonly navigate: (segments: string[]) => void;
  /** Toggles the light/dark theme. */
  readonly toggleTheme: () => void;
  /** Opens the signed-in user's profile. */
  readonly openProfile: () => void;
  /** Whether the dark theme is active (selects the theme label). */
  readonly isDark: boolean;
}

const SELF_SUFFIX = ' (Du)';
const THEME_TO_LIGHT = 'Zum hellen Design wechseln';
const THEME_TO_DARK = 'Zum dunklen Design wechseln';
const PROFILE_LABEL = 'Mein Profil öffnen';

/**
 * Builds the full ordered item list: channels, then DMs, then actions.
 * @param channels Channels the user can open.
 * @param users All users, rendered as DM targets.
 * @param selfUid Signed-in user's uid (marks the self DM).
 * @param actions Side effects the items invoke.
 */
export function buildPaletteItems(
  channels: readonly Channel[],
  users: readonly UserDoc[],
  selfUid: string | null,
  actions: PaletteActions,
): PaletteItem[] {
  return [
    ...channels.map(channel => channelItem(channel, actions)),
    ...users.map(user => dmItem(user, selfUid, actions)),
    ...actionItems(actions),
  ];
}


/**
 * Filters items by a case-insensitive substring of the query; returns the
 * whole list when the query is blank.
 * @param items Items to filter.
 * @param query Raw query string.
 */
export function filterPaletteItems(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter(item => item.label.toLowerCase().includes(needle));
}


/**
 * Builds a channel item that navigates to the channel route.
 * @param channel Channel to open.
 * @param actions Navigation side effect.
 */
function channelItem(channel: Channel, actions: PaletteActions): PaletteItem {
  return {
    id: `palette-channel-${channel.id}`,
    label: channel.name,
    kind: 'channel',
    run: () => actions.navigate(['/app/channel', channel.id]),
  };
}


/**
 * Builds a DM item that navigates to the conversation route.
 * @param user DM target user.
 * @param selfUid Signed-in uid, to mark the self conversation.
 * @param actions Navigation side effect.
 */
function dmItem(user: UserDoc, selfUid: string | null, actions: PaletteActions): PaletteItem {
  const label = user.uid === selfUid ? `${user.name}${SELF_SUFFIX}` : user.name;
  return {
    id: `palette-dm-${user.uid}`,
    label,
    kind: 'dm',
    run: () => actions.navigate(['/app/dm', user.uid]),
  };
}


/**
 * Builds the fixed action items: theme toggle and open-profile.
 * @param actions Side effects and the current theme state.
 */
function actionItems(actions: PaletteActions): PaletteItem[] {
  return [themeAction(actions), profileAction(actions)];
}


/**
 * Builds the theme-toggle action; its label reflects the target theme.
 * @param actions Theme state and toggle side effect.
 */
function themeAction(actions: PaletteActions): PaletteItem {
  return {
    id: 'palette-action-theme',
    label: actions.isDark ? THEME_TO_LIGHT : THEME_TO_DARK,
    kind: 'action',
    run: actions.toggleTheme,
  };
}


/**
 * Builds the open-profile action.
 * @param actions Open-profile side effect.
 */
function profileAction(actions: PaletteActions): PaletteItem {
  return {
    id: 'palette-action-profile',
    label: PROFILE_LABEL,
    kind: 'action',
    run: actions.openProfile,
  };
}
