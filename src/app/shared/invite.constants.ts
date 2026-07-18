/**
 * @file Shared constants of the channel invite links and their optional
 * vanity slugs: the slug collection, the length bounds and the slug
 * pattern (mirrored in firestore.rules via matches()), plus the
 * deployment-aware share-URL builder used for token and slug links alike.
 */

/** Firestore collection reserving vanity slugs (doc id = the slug). */
export const INVITE_SLUGS_COLLECTION = 'inviteSlugs';

/** Minimum length of a vanity invite slug (mirrored in firestore.rules). */
export const INVITE_SLUG_MIN_LENGTH = 3;

/** Maximum length of a vanity invite slug (mirrored in firestore.rules). */
export const INVITE_SLUG_MAX_LENGTH = 32;

/**
 * Slug pattern source: lowercase letters, digits and hyphens, starting and
 * ending alphanumeric, within the shared length bounds. The literal
 * `[a-z0-9][a-z0-9-]{1,30}[a-z0-9]` in firestore.rules mirrors this
 * expression and must change together with it.
 */
export const INVITE_SLUG_PATTERN = `[a-z0-9][a-z0-9-]{${INVITE_SLUG_MIN_LENGTH - 2},${
  INVITE_SLUG_MAX_LENGTH - 2
}}[a-z0-9]`;

/** Full-match client pre-validation of the shared slug pattern. */
export const INVITE_SLUG_REGEX = new RegExp(`^${INVITE_SLUG_PATTERN}$`);

/** Hash-route fragment of the invite redeem page. */
export const INVITE_ROUTE_FRAGMENT = '#/invite/';


/**
 * Builds the shareable invite URL of a token or slug against the deployed
 * app base, so the link is correct on both the root and the subfolder
 * deployment.
 * @param tokenOrSlug Invite token or vanity slug.
 */
export function buildInviteUrl(tokenOrSlug: string): string {
  return new URL(`${INVITE_ROUTE_FRAGMENT}${tokenOrSlug}`, document.baseURI).href;
}
