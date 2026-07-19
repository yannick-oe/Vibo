/**
 * @file Typed shapes of the GIF feature: the selectable Giphy result shared
 * by the GIF service, the picker, the composer and the message-send path,
 * plus the per-user favorites document stored at userGifFavorites/{uid}.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/** A single Giphy result mapped to the fields the app stores and renders. */
export interface GifResult {
  /** Giphy media id (favorite identity). */
  readonly id: string;
  /** Animated GIF URL (Giphy fixed-height rendition). */
  readonly url: string;
  /** Still-frame URL shown under prefers-reduced-motion. */
  readonly still: string;
  /** Small animated preview URL (Giphy fixed_height_small rendition). */
  readonly preview: string;
  /** Still frame of the small preview for prefers-reduced-motion. */
  readonly previewStill: string;
  /** Intrinsic width in pixels, reserving an aspect ratio so the bubble never shifts. */
  readonly width: number;
  /** Intrinsic height in pixels. */
  readonly height: number;
  /** Accessible label (the Giphy title). */
  readonly alt: string;
}

/** One stored favorite inside the user's favorites document. */
export interface GifFavorite {
  /** Giphy media id (toggle identity). */
  readonly id: string;
  /** Giphy title (accessible label). */
  readonly title: string;
  /** Small animated preview URL rendered in the favorites grid. */
  readonly previewUrl: string;
  /** Animated GIF URL used when the favorite is sent. */
  readonly url: string;
  /** Intrinsic width of the GIF in pixels. */
  readonly width: number;
  /** Intrinsic height of the GIF in pixels. */
  readonly height: number;
  /** Client timestamp of the toggle in epoch milliseconds (newest first). */
  readonly addedAt: number;
}

/** Firestore document stored at userGifFavorites/{uid}. */
export interface GifFavoritesDoc {
  /** The user's favorites, newest first, capped at MAX_GIF_FAVORITES. */
  readonly gifs: readonly GifFavorite[];
  /** Server time of the last toggle; serverTimestamp() sentinel on write. */
  readonly updatedAt: Timestamp | FieldValue;
}
