/**
 * @file Pure drag physics of the dialog-shell bottom sheet: finger-offset
 * mapping with rubber-band overdrag above the rest position, dismiss
 * heuristics, velocity smoothing, velocity-matched settle durations so the
 * release animation continues seamlessly from the drag, and the two-detent
 * model (half/tall rest positions with fling/nearest snap resolution) used
 * by the picker sheets.
 */

/** Rest position of a detent sheet: half height or (near) full height. */
export type Detent = 'half' | 'tall';

export const HALF_DETENT_DVH = 45;

export const TALL_DETENT_DVH = 85;

export const DETENT_FLING_VELOCITY_PX_PER_MS = 0.5;

export const DRAG_START_SLOP_PX = 8;

export const SWIPE_DISMISS_FRACTION = 0.33;

export const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.6;

export const SETTLE_MIN_DURATION_MS = 120;

export const SETTLE_MAX_DURATION_MS = 360;

export const SETTLE_FALLBACK_VELOCITY_PX_PER_MS = 0.9;

export const OVERDRAG_LIMIT_PX = 48;

export const VELOCITY_SMOOTHING = 0.6;

export const VELOCITY_STALE_MS = 100;

export const TEXT_ENTRY_SELECTOR =
  'input:not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]';

export const GRABBER_SELECTOR = '.dialog-shell__grabber';


/**
 * The offset in pixels a detent sheet is translated down from the tall rest
 * position: zero at tall, a fixed fraction of the measured card height at
 * half, so the visible part shrinks from TALL_DETENT_DVH to HALF_DETENT_DVH.
 * @param detent Target detent.
 * @param cardHeight Measured card height in pixels.
 */
export function detentRestOffset(detent: Detent, cardHeight: number): number {
  if (detent === 'tall') return 0;
  return (cardHeight * (TALL_DETENT_DVH - HALF_DETENT_DVH)) / TALL_DETENT_DVH;
}


/**
 * Maps a raw sheet offset (pixels below the tall rest position, measured
 * from the drag anchor) to the rendered offset: 1:1 downward, dampened
 * rubber-band resistance below `minOffset` instead of a hard clamp.
 * @param rawOffset Unclamped offset in pixels; negative above rest.
 * @param minOffset Offset the rubber band engages below; 0 for single-rest sheets.
 */
export function dragOffsetFor(rawOffset: number, minOffset = 0): number {
  if (rawOffset >= minOffset) return rawOffset;
  const overdrag = minOffset - rawOffset;
  return minOffset - (overdrag * OVERDRAG_LIMIT_PX) / (overdrag + OVERDRAG_LIMIT_PX);
}


/**
 * Resolves where a released detent sheet settles: an upward fling expands to
 * tall; a downward fling dismisses from the half offset downward and snaps
 * to half above it; without a fling the sheet dismisses past the dismiss
 * fraction of the remaining travel below half, otherwise snaps to the
 * nearest detent.
 * @param offset Sheet offset at release in pixels.
 * @param cardHeight Measured card height in pixels.
 * @param velocity Smoothed downward release velocity in px/ms (negative up).
 */
export function resolveDetentRelease(
  offset: number,
  cardHeight: number,
  velocity: number,
): Detent | 'dismiss' {
  const halfOffset = detentRestOffset('half', cardHeight);
  if (velocity < -DETENT_FLING_VELOCITY_PX_PER_MS) return 'tall';
  if (velocity > DETENT_FLING_VELOCITY_PX_PER_MS) return offset >= halfOffset ? 'dismiss' : 'half';
  if (offset > halfOffset + (cardHeight - halfOffset) * SWIPE_DISMISS_FRACTION) return 'dismiss';
  return offset < halfOffset / 2 ? 'tall' : 'half';
}


/**
 * Whether a released sheet dismisses: past the distance threshold or on a
 * fast downward flick.
 * @param offset Sheet offset at release in pixels.
 * @param height Sheet height in pixels.
 * @param velocity Smoothed downward release velocity in px/ms.
 */
export function shouldDismiss(offset: number, height: number, velocity: number): boolean {
  return offset > height * SWIPE_DISMISS_FRACTION || velocity > SWIPE_FLICK_VELOCITY_PX_PER_MS;
}


/**
 * Settle duration continuing the release motion: remaining distance over
 * release velocity, clamped between the named min/max durations; slow or
 * upward releases fall back to a base speed.
 * @param remaining Distance still to travel in pixels.
 * @param velocity Downward release velocity in px/ms.
 */
export function settleDurationMs(remaining: number, velocity: number): number {
  const speed = Math.max(velocity, SETTLE_FALLBACK_VELOCITY_PX_PER_MS);
  const duration = Math.abs(remaining) / speed;
  return Math.min(SETTLE_MAX_DURATION_MS, Math.max(SETTLE_MIN_DURATION_MS, duration));
}


/**
 * Exponentially smoothed drag velocity, damping single-frame jitter while
 * still following the finger closely.
 * @param previous Previous smoothed velocity in px/ms.
 * @param instantaneous Velocity of the latest pointer move in px/ms.
 */
export function smoothedVelocity(previous: number, instantaneous: number): number {
  return VELOCITY_SMOOTHING * instantaneous + (1 - VELOCITY_SMOOTHING) * previous;
}


/**
 * Scrim opacity coupled to the drag progress: fully opaque at (and above)
 * the lowest rest offset, fading to transparent as the sheet travels the
 * remaining distance to fully off-screen.
 * @param offset Current sheet offset in pixels.
 * @param height Sheet height in pixels.
 * @param restOffset Lowest rest offset (the half detent); 0 for single-rest sheets.
 */
export function scrimOpacityFor(offset: number, height: number, restOffset = 0): number {
  const travel = height - restOffset;
  if (travel <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (offset - restOffset) / travel));
}


/**
 * Current vertical translation of an element as rendered, so a new drag
 * can catch a sheet mid-settle without a jump; read once on drag start.
 * @param element Element whose computed transform is inspected.
 */
export function readTranslateY(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  return transform === 'none' ? 0 : new DOMMatrix(transform).m42;
}


/**
 * Whether the gesture target is a currently focused text-entry element,
 * where a vertical drag likely means text selection and must never start a
 * sheet drag; unfocused fields stay drag-eligible.
 * @param target Element the pointer gesture started on.
 */
export function isActiveTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target !== document.activeElement) return false;
  return target.matches(TEXT_ENTRY_SELECTOR);
}


/**
 * Whether the gesture started on the grabber element itself. A geometric
 * zone is deliberately not used: it would claim touches on adjacent card
 * content (especially once the card is scrolled) and deaden scrolling.
 * @param event Pointerdown event.
 */
export function isOnGrabber(event: PointerEvent): boolean {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return !!target?.closest(GRABBER_SELECTOR);
}


/**
 * Whether any scroll container between the event target and the card is
 * scrolled away from the top (then the gesture belongs to scrolling).
 * @param target Element the gesture started on.
 * @param card Sheet card element.
 */
export function hasScrolledContent(target: EventTarget | null, card: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== card.parentElement) {
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
}
