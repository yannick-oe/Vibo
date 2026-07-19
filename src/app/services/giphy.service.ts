/**
 * @file Thin Giphy REST client (trending + search with offset pagination)
 * for the lazily loaded GIF picker. Every request runs through one builder
 * that always sends rating=pg-13, so no path can surface adult content.
 */
import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';
import { GifResult } from '../models/gif.model';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

const GIPHY_RATING = 'pg-13';

/** Results fetched per picker page (initial fill and each sentinel load). */
export const GIF_PAGE_SIZE = 24;

/** Hard cap on paged results per term or query (4 pages of GIF_PAGE_SIZE). */
export const GIF_MAX_RESULTS = 96;

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
    readonly fixed_width: GiphyImage;
    readonly fixed_width_still: { readonly url: string };
  };
}

/** Shape of a Giphy list response. */
interface GiphyResponse {
  readonly data: readonly GiphyGif[];
}


/**
 * Maps a raw Giphy result to the app's GifResult; the stored/sent fields
 * stay on the fixed_height rendition (unchanged message format) while the
 * preview pair carries the fixed_width rendition for the masonry grid. The
 * still frames back the reduced-motion rendering and the width/height
 * reserve the aspect ratio (identical across renditions of one media).
 * @param gif Raw Giphy result.
 */
function toGifResult(gif: GiphyGif): GifResult {
  const image = gif.images.fixed_height;
  return {
    id: gif.id,
    url: image.url,
    still: gif.images.fixed_height_still.url,
    preview: gif.images.fixed_width.url,
    previewStill: gif.images.fixed_width_still.url,
    width: Number(image.width),
    height: Number(image.height),
    alt: gif.title || 'GIF',
  };
}


/**
 * Loads PG-rated GIFs from Giphy for the picker. Trending and search share
 * a single request builder that always sends rating=pg-13 and pages via
 * offset; the picker debounces the search term before calling.
 */
@Injectable({ providedIn: 'root' })
export class GiphyService {
  private readonly apiKey = environment.giphyApiKey;


  /**
   * Loads one page of the current trending GIFs.
   * @param offset Result offset of the page (0 for the first page).
   */
  trending(offset: number): Promise<GifResult[]> {
    return this.load('trending', '', offset);
  }


  /**
   * Loads one page of the search results for the given term.
   * @param term Non-empty search term.
   * @param offset Result offset of the page (0 for the first page).
   */
  search(term: string, offset: number): Promise<GifResult[]> {
    return this.load('search', term, offset);
  }


  /**
   * Fetches a Giphy endpoint with the shared pg-13 rating, page size and
   * offset, and maps the results; rejects on a non-OK response so callers
   * can show an error.
   * @param endpoint Giphy endpoint segment ("trending" or "search").
   * @param term Search term; empty for trending.
   * @param offset Result offset of the requested page.
   */
  private async load(endpoint: string, term: string, offset: number): Promise<GifResult[]> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      rating: GIPHY_RATING,
      limit: String(GIF_PAGE_SIZE),
      offset: String(offset),
    });
    if (term) params.set('q', term);
    const response = await fetch(`${GIPHY_BASE}/${endpoint}?${params.toString()}`);
    if (!response.ok) throw new Error(`Giphy request failed: ${response.status}`);
    const body = (await response.json()) as GiphyResponse;
    return body.data.map(toGifResult);
  }
}
