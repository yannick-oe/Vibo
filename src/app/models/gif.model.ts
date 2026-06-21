/**
 * @file Typed shape of a selectable Giphy result, shared by the GIF service,
 * the picker, the composer and the message-send path.
 */

/** A single Giphy result mapped to the fields the app stores and renders. */
export interface GifResult {
  /** Animated GIF URL (Giphy fixed-height rendition). */
  readonly url: string;
  /** Still-frame URL shown under prefers-reduced-motion. */
  readonly still: string;
  /** Intrinsic width in pixels, reserving an aspect ratio so the bubble never shifts. */
  readonly width: number;
  /** Intrinsic height in pixels. */
  readonly height: number;
  /** Accessible label (the Giphy title). */
  readonly alt: string;
}
