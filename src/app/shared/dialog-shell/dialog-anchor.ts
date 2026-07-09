/**
 * @file Anchoring model of the dialog shell: width presets and the
 * viewport-position helper docking a dialog card below its trigger element
 * per the Figma prototype.
 */

const ANCHOR_GAP_PX = 8;

const ANCHOR_MIN_VIEWPORT_PX = 768;

const ANCHORED_BOTTOM_INSET_PX = 24;

/** Width preset of the dialog card, mapped to the Figma measurements. */
export type DialogSize = 'default' | 'members' | 'add-members' | 'profile' | 'menu' | 'search';

/** Viewport position a dialog card is anchored to (Figma prototype). */
export interface DialogAnchor {
  /** Top edge of the card in viewport pixels. */
  readonly top: number;
  /** Left edge for trigger-left-aligned cards. */
  readonly left?: number;
  /** Right inset for cards aligned with a reference right edge. */
  readonly right?: number;
}


/**
 * Builds the anchor docking a dialog below its trigger per the Figma
 * prototype; null on small viewports, where dialogs center instead.
 * @param trigger Element the dialog is anchored to.
 * @param align Left-align with the trigger or right-align with an edge.
 * @param edgeElement Element whose right edge right-aligned cards use;
 * defaults to the trigger itself.
 */
export function anchorBelow(
  trigger: HTMLElement,
  align: 'left' | 'right',
  edgeElement?: HTMLElement,
): DialogAnchor | null {
  if (window.innerWidth <= ANCHOR_MIN_VIEWPORT_PX) return null;
  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + ANCHOR_GAP_PX;
  if (align === 'left') return { top, left: rect.left };
  const edge = (edgeElement ?? trigger).getBoundingClientRect().right;
  return { top, right: window.innerWidth - edge };
}


/**
 * The max-height style that limits an anchored card to the space between its
 * top edge and the bottom of the viewport; null while centered (SCSS-styled).
 * @param anchor Active anchor, or null when the dialog is centered.
 */
export function anchoredMaxHeightStyle(anchor: DialogAnchor | null): string | null {
  if (!anchor) return null;
  return `calc(100dvh - ${anchor.top + ANCHORED_BOTTOM_INSET_PX}px)`;
}
