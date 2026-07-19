/**
 * @file Thin Giphy REST client (trending + search + category previews) for
 * the lazily loaded GIF picker. Every request runs through one builder that
 * always sends rating=pg-13, so no path can surface adult content.
 */
import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';
import { GifResult } from '../models/gif.model';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

const GIPHY_RATING = 'pg-13';

const GIPHY_LIMIT = 24;

const GIPHY_PREVIEW_LIMIT = 1;

/** Giphy rendition: url plus the intrinsic size (Giphy returns size as strings). */
interface GiphyImage {
  readonly url: string;
  readonly width: string;
  readonly height: string;
}

/** The subset of a Giphy result the app consumes. */
interface GiphyGif {
  readonly id: string;
  readonly title: string;
  readonly images: {
    readonly fixed_height: GiphyImage;
    readonly fixed_height_still: { readonly url: string };
    readonly fixed_height_small: GiphyImage;
    readonly fixed_height_small_still: { readonly url: string };
  };
}

/** Shape of a Giphy list response. */
interface GiphyResponse {
  readonly data: readonly GiphyGif[];
}


/**
 * Maps a raw Giphy result to the app's GifResult; the still frames back the
 * reduced-motion rendering and the width/height reserve the bubble.
 * @param gif Raw Giphy result.
 */
function toGifResult(gif: GiphyGif): GifResult {
  const image = gif.images.fixed_height;
  return {
    id: gif.id,
    url: image.url,
    still: gif.images.fixed_height_still.url,
    preview: gif.images.fixed_height_small.url,
    previewStill: gif.images.fixed_height_small_still.url,
    width: Number(image.width),
    height: Number(image.height),
    alt: gif.title || 'GIF',
  };
}


/**
 * Loads PG-rated GIFs from Giphy for the picker. Trending, search and the
 * category previews share a single request builder that always sends
 * rating=pg-13; the picker debounces the search term before calling.
 */
@Injectable({ providedIn: 'root' })
export class GiphyService {
  private readonly apiKey = environment.giphyApiKey;


  /**
   * Loads the current trending GIFs.
   */
  trending(): Promise<GifResult[]> {
    return this.load('trending', '', GIPHY_LIMIT);
  }


  /**
   * Searches GIFs for the given term.
   * @param term Non-empty search term.
   */
  search(term: string): Promise<GifResult[]> {
    return this.load('search', term, GIPHY_LIMIT);
  }


  /**
   * Loads the representative preview GIF of a start-view category tile
   * (the term's first search result).
   * @param term Category term of the tile.
   * @returns The first result, or null when the term has none.
   */
  async categoryPreview(term: string): Promise<GifResult | null> {
    const results = await this.load('search', term, GIPHY_PREVIEW_LIMIT);
    return results[0] ?? null;
  }


  /**
   * Fetches a Giphy endpoint with the shared pg-13 rating and maps the
   * results; rejects on a non-OK response so callers can show an error.
   * @param endpoint Giphy endpoint segment ("trending" or "search").
   * @param term Search term; empty for trending.
   * @param limit Maximum number of results.
   */
  private async load(endpoint: string, term: string, limit: number): Promise<GifResult[]> {
    const params = new URLSearchParams({ api_key: this.apiKey, rating: GIPHY_RATING, limit: String(limit) });
    if (term) params.set('q', term);
    const response = await fetch(`${GIPHY_BASE}/${endpoint}?${params.toString()}`);
    if (!response.ok) throw new Error(`Giphy request failed: ${response.status}`);
    const body = (await response.json()) as GiphyResponse;
    return body.data.map(toGifResult);
  }
}
