/**
 * @file Profile badges (Abzeichen) shown next to a user's name. An on-brand
 * cosmic/dev enhancement beyond the DA Figma. Ids are English, labels and
 * descriptions German; each icon is an inline SVG using `currentColor` so the
 * per-badge accent (an AA-measured token, both themes) tints it.
 */
import { UserDoc } from '../models/user.model';

/** A profile badge: English id, German label/description, inline SVG, accent token. */
export interface BadgeOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly accent: string;
}

/** Badge shown for a user that has no explicit badges field (demo default). */
export const DEFAULT_BADGE_ID = 'developer';

/** Badge auto-assigned to newly registered users; the rest stay manual. */
export const NEW_USER_BADGE_ID = 'verified';

const ICON_FOUNDER =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.25l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.3l-5.9 3.12 1.13-6.57L2.35 9.19l6.6-.96z"/></svg>';

const ICON_DEVELOPER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 6l-4 12"/></svg>';

const ICON_PIONEER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16.5" cy="7.5" r="3.25"/><path d="M13.8 9.8 4 19.6M10.5 9l-3 3M15 13.5l-3 3"/></svg>';

const ICON_VERIFIED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>';

/** Fixed badge registry; each accent token is AA in both themes (see _themes.scss). */
export const BADGE_OPTIONS: readonly BadgeOption[] = [
  { id: 'founder', label: 'Gründer', description: 'Gründer von Vibo', icon: ICON_FOUNDER, accent: 'var(--badge-founder)' },
  { id: DEFAULT_BADGE_ID, label: 'Entwickler', description: 'Entwickler im Devspace', icon: ICON_DEVELOPER, accent: 'var(--badge-developer)' },
  { id: 'pioneer', label: 'Pionier', description: 'Frühes Mitglied', icon: ICON_PIONEER, accent: 'var(--badge-pioneer)' },
  { id: 'verified', label: 'Verifiziert', description: 'Verifiziertes Konto', icon: ICON_VERIFIED, accent: 'var(--badge-verified)' },
];

const BADGE_BY_ID: ReadonlyMap<string, BadgeOption> = new Map(
  BADGE_OPTIONS.map(badge => [badge.id, badge]),
);


/**
 * Maps badge ids to their registry entries, dropping unknown ids so legacy or
 * misspelled values render nothing instead of breaking the row.
 * @param ids Badge ids stored on (or defaulted for) a user.
 */
export function resolveBadges(ids: readonly string[]): BadgeOption[] {
  return ids
    .map(id => BADGE_BY_ID.get(id))
    .filter((badge): badge is BadgeOption => badge !== undefined);
}


/**
 * Resolves which badges to display for a user: an explicit array always wins
 * (even when empty, so the guest opts out with `[]`); a user with no badges
 * field falls back to the developer badge so demo profiles are never bare.
 * Badges are never derived from identity (email, uid, account) — the founder
 * badge requires an explicit array on the Firestore document.
 * @param user User document field that drives the badge default.
 */
export function displayBadges(user: Pick<UserDoc, 'badges'>): string[] {
  return user.badges ?? [DEFAULT_BADGE_ID];
}
