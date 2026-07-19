/**
 * @file Anchoring model of the dialog shell: width presets and the
 * viewport-position helpers that dock a dialog card below or above its trigger
 * and flip it toward the available space when the preferred side would
 * overflow the viewport.
 */

const ANCHOR_GAP_PX = 8;

const ANCHOR_MIN_VIEWPORT_PX = 768;

const ANCHORED_BOTTOM_INSET_PX = 24;

/** Width preset of the dialog card, mapped to the Figma measurements. */
export type DialogSize =
  | 'default'
  | 'members'
  | 'add-members'
  | 'profile'
  | 'settings'
  | 'menu'
  | 'search'
  | 'viewer'
  | 'gif';

/**
 * Viewport position a dialog card is anchored to. Exactly one vertical edge
 * (top for below-trigger, bottom for above-trigger) and one horizontal edge
 * are set; the trigger's vertical extent is carried so {@link placeVertically}
 * can flip the card to the other side after measuring it.
 */
export interface DialogAnchor {
  /** Top edge of the card in viewport pixels (card opens below the trigger). */
  readonly top?: number;
  /** Bottom inset in viewport pixels (card opens above the trigger). */
  readonly bottom?: number;
  /** Left edge for trigger-left-aligned cards. */
  readonly left?: number;
  /** Right inset for cards aligned with a reference right edge. */
  readonly right?: number;
  /** Trigger's top edge, used when flipping to open above. */
  readonly triggerTop?: number;
  /** Trigger's bottom edge, used when flipping to open below. */
  readonly triggerBottom?: number;
}


/**
 * Builds the anchor docking a dialog below its trigger per the Figma
 * prototype; null on small viewports, where dialogs center (or sheet) instead.
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
  const base = { top: rect.bottom + ANCHOR_GAP_PX, triggerTop: rect.top, triggerBottom: rect.bottom };
  if (align === 'left') return { ...base, left: rect.left };
  return { ...base, right: window.innerWidth - (edgeElement ?? trigger).getBoundingClientRect().right };
}


/**
 * Builds the anchor docking a card above its trigger, aligned to the trigger's
 * left or right edge; null on small viewports (where the card sheets). Used by
 * the message action menu, which opens above its bubble.
 * @param trigger Element the card opens above (e.g. the message bubble).
 * @param align Left-align with the trigger's left edge, or right with its right.
 */
export function anchorAbove(trigger: HTMLElement, align: 'left' | 'right'): DialogAnchor | null {
  if (window.innerWidth <= ANCHOR_MIN_VIEWPORT_PX) return null;
  const rect = trigger.getBoundingClientRect();
  const base = {
    bottom: window.innerHeight - rect.top + ANCHOR_GAP_PX,
    triggerTop: rect.top,
    triggerBottom: rect.bottom,
  };
  if (align === 'left') return { ...base, left: rect.left };
  return { ...base, right: window.innerWidth - rect.right };
}


/**
 * Builds the anchor docking a card to its trigger element, opening toward the
 * larger viewport half: a trigger in the upper half opens the card below
 * itself, one in the lower half above it. Horizontally the card edge-aligns
 * with the trigger and grows toward the farther viewport edge so it never
 * overflows sideways; {@link placeVertically} still corrects the vertical
 * side against the measured card height. Null on small viewports (where the
 * card sheets instead). Used by the message-options ⋮ menu.
 * @param trigger Button element the card is anchored to.
 */
export function anchorToTrigger(trigger: HTMLElement): DialogAnchor | null {
  if (window.innerWidth <= ANCHOR_MIN_VIEWPORT_PX) return null;
  const rect = trigger.getBoundingClientRect();
  const align = rect.left + rect.width / 2 > window.innerWidth / 2 ? 'right' : 'left';
  const opensBelow = rect.top + rect.height / 2 < window.innerHeight / 2;
  return opensBelow ? anchorBelow(trigger, align) : anchorAbove(trigger, align);
}


/**
 * Builds a fixed-point anchor docking a card at a viewport coordinate (e.g. a
 * right-click position). The card grows toward the larger space on both axes:
 * down from a point in the upper viewport half, up from one in the lower
 * half, and horizontally toward the farther edge (left half → left-aligned,
 * right half → right-aligned) so it never overflows sideways;
 * {@link placeVertically} flips the vertical side when the measured card
 * still does not fit.
 * @param x Horizontal viewport coordinate in pixels.
 * @param y Vertical viewport coordinate in pixels.
 */
export function anchorAtPoint(x: number, y: number): DialogAnchor {
  const horizontal =
    x > window.innerWidth / 2 ? { right: window.innerWidth - x } : { left: x };
  const vertical =
    y < window.innerHeight / 2 ? { top: y } : { bottom: window.innerHeight - y };
  return { triggerTop: y, triggerBottom: y, ...vertical, ...horizontal };
}


/**
 * Resolves an anchor's vertical side against the measured card height: a
 * below-anchored card that would overflow the viewport bottom flips above its
 * trigger (and vice versa), unless the opposite side has even less room, in
 * which case the preferred side is kept and its height capped separately via
 * {@link anchoredMaxHeightStyle} — an above-anchored card near the viewport
 * bottom (voice-bar popovers in short windows) must never flip into the
 * sliver below its trigger.
 * @param anchor Preferred anchor from anchorBelow/anchorAbove.
 * @param cardHeight Measured card height in pixels.
 */
export function placeVertically(anchor: DialogAnchor, cardHeight: number): DialogAnchor {
  const bottomLimit = window.innerHeight - ANCHORED_BOTTOM_INSET_PX;
  const fitsAbove = (anchor.triggerTop ?? 0) - cardHeight >= ANCHORED_BOTTOM_INSET_PX;
  if (anchor.top !== undefined && anchor.triggerTop !== undefined) {
    if (anchor.top + cardHeight <= bottomLimit || !fitsAbove) return anchor;
    return { ...anchor, top: undefined, bottom: window.innerHeight - anchor.triggerTop + ANCHOR_GAP_PX };
  }
  if (anchor.bottom !== undefined && anchor.triggerBottom !== undefined && !fitsAbove) {
    if (anchor.triggerBottom + ANCHOR_GAP_PX + cardHeight > bottomLimit) return anchor;
    return { ...anchor, bottom: undefined, top: anchor.triggerBottom + ANCHOR_GAP_PX };
  }
  return anchor;
}


/**
 * The max-height style that limits an anchored card to the space between its
 * anchored edge and the opposite viewport edge; null while centered (SCSS).
 * @param anchor Active anchor, or null when the dialog is centered.
 */
export function anchoredMaxHeightStyle(anchor: DialogAnchor | null): string | null {
  if (!anchor) return null;
  const offset = anchor.top ?? anchor.bottom ?? 0;
  return `calc(100dvh - ${offset + ANCHORED_BOTTOM_INSET_PX}px)`;
}
