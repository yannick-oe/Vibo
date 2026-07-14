/**
 * @file Item model plus pure builders and the filter for the quick
 * switcher: accepted-friend DMs in recency order, then channels
 * alphabetically, then a small fixed action set. All rows derive from the
 * already-streamed sidebar data — the switcher adds no listener.
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
  /** Additionally matched text (the @username); the label always matches. */
  readonly searchText?: string;
  /** Category driving the leading glyph. */
  readonly kind: PaletteKind;
  /** Runs the entry: navigate or perform the action. */
  readonly run: () => void;
}

/** Already-streamed data the palette rows derive from. */
export interface PaletteSources {
  /** Channels the user is a member of. */
  readonly channels: readonly Channel[];
  /** All known users; filtered to accepted friends plus self. */
  readonly users: readonly UserDoc[];
  /** Signed-in user's uid (marks the self DM). */
  readonly selfUid: string | null;
  /** Uids of accepted friends. */
  readonly friendUids: ReadonlySet<string>;
  /** Last-activity millis per conversation partner, for recency order. */
  readonly recencyByPartner: ReadonlyMap<string, number>;
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
const SORT_LOCALE = 'de';

/**
 * Builds the full ordered item list: accepted-friend DMs (most recent
 * conversation first), then channels alphabetically, then actions.
 * @param sources Already-streamed channel/user/friendship data.
 * @param actions Side effects the items invoke.
 */
export function buildPaletteItems(
  sources: PaletteSources,
  actions: PaletteActions,
): PaletteItem[] {
  return [...dmItems(sources, actions), ...channelItems(sources.channels, actions), ...actionItems(actions)];
}


/**
 * Filters items by a case-insensitive substring of the query, matching the
 * label and the additional search text (@username); returns the whole list
 * when the query is blank.
 * @param items Items to filter.
 * @param query Raw query string.
 */
export function filterPaletteItems(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter(item => matchesQuery(item, needle));
}


/**
 * Whether an item's label or search text contains the needle.
 * @param item Palette item to test.
 * @param needle Lowercased, trimmed query.
 */
function matchesQuery(item: PaletteItem, needle: string): boolean {
  if (item.label.toLowerCase().includes(needle)) return true;
  return item.searchText?.toLowerCase().includes(needle) ?? false;
}


/**
 * Builds the DM rows: accepted friends plus the self conversation, ordered
 * by conversation recency with an alphabetical tiebreak.
 * @param sources Users, friendship set and recency map.
 * @param actions Navigation side effect.
 */
function dmItems(sources: PaletteSources, actions: PaletteActions): PaletteItem[] {
  const { users, selfUid, friendUids, recencyByPartner } = sources;
  return users
    .filter(user => user.uid === selfUid || friendUids.has(user.uid))
    .sort((a, b) => byRecency(a, b, recencyByPartner))
    .map(user => dmItem(user, selfUid, actions));
}


/**
 * Sorts users by their conversation recency, newest first; users without a
 * conversation follow alphabetically.
 * @param a First user.
 * @param b Second user.
 * @param recency Last-activity millis per partner uid.
 */
function byRecency(a: UserDoc, b: UserDoc, recency: ReadonlyMap<string, number>): number {
  const delta = (recency.get(b.uid) ?? 0) - (recency.get(a.uid) ?? 0);
  return delta !== 0 ? delta : a.name.localeCompare(b.name, SORT_LOCALE);
}


/**
 * Builds the channel rows in alphabetical order.
 * @param channels Channels the user is a member of.
 * @param actions Navigation side effect.
 */
function channelItems(channels: readonly Channel[], actions: PaletteActions): PaletteItem[] {
  return [...channels]
    .sort((a, b) => a.name.localeCompare(b.name, SORT_LOCALE))
    .map(channel => channelItem(channel, actions));
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
 * Builds a DM item that navigates to the conversation route; the @username
 * is matchable in addition to the display name.
 * @param user DM target user.
 * @param selfUid Signed-in uid, to mark the self conversation.
 * @param actions Navigation side effect.
 */
function dmItem(user: UserDoc, selfUid: string | null, actions: PaletteActions): PaletteItem {
  const label = user.uid === selfUid ? `${user.name}${SELF_SUFFIX}` : user.name;
  return {
    id: `palette-dm-${user.uid}`,
    label,
    searchText: user.username ? `@${user.username}` : undefined,
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
