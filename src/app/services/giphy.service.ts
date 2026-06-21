/**
 * @file Thin Giphy REST client (trending + search) for the lazily loaded GIF
 * picker. Every request runs through one builder that always sends
 * rating=pg-13, so no path can surface adult content.
 */
import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';
import { GifResult } from '../models/gif.model';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

const GIPHY_RATING = 'pg-13';

const GIPHY_LIMIT = 24;

/** Giphy rendition: url plus the intrinsic size (Giphy returns size as strings). */
interface GiphyImage {
  readonly url: string;
  readonly width: string;
  readonly height: string;
}

/** The subset of a Giphy result the app consumes. */
interface GiphyGif {
  readonly title: string;
  readonly images: {
    readonly fixed_height: GiphyImage;
    readonly fixed_height_still: { readonly url: string };
  };
}

/** Shape of a Giphy list response. */
interface GiphyResponse {
  readonly data: readonly GiphyGif[];
}


/**
 * Maps a raw Giphy result to the app's GifResult; the still frame backs the
 * reduced-motion rendering and the width/height reserve the bubble.
 * @param gif Raw Giphy result.
 */
function toGifResult(gif: GiphyGif): GifResult {
  const image = gif.images.fixed_height;
  return {
    url: image.url,
    still: gif.images.fixed_height_still.url,
    width: Number(image.width),
    height: Number(image.height),
    alt: gif.title || 'GIF',
  };
}


/**
 * Loads PG-rated GIFs from Giphy for the picker. Trending and search share a
 * single request builder that always sends rating=pg-13 and a fixed limit; the
 * picker debounces the search term before calling.
 */
@Injectable({ providedIn: 'root' })
export class GiphyService {
  private readonly apiKey = environment.giphyApiKey;


  /**
   * Loads the current trending GIFs.
   */
  trending(): Promise<GifResult[]> {
    return this.load('trending');
  }


  /**
   * Searches GIFs for the given term.
   * @param term Non-empty search term.
   */
  search(term: string): Promise<GifResult[]> {
    return this.load('search', term);
  }


  /**
   * Fetches a Giphy endpoint with the shared pg-13 rating and limit and maps
   * the results; rejects on a non-OK response so callers can show an error.
   * @param endpoint Giphy endpoint segment ("trending" or "search").
   * @param term Optional search term.
   */
  private async load(endpoint: string, term = ''): Promise<GifResult[]> {
    const params = new URLSearchParams({ api_key: this.apiKey, rating: GIPHY_RATING, limit: String(GIPHY_LIMIT) });
    if (term) params.set('q', term);
    const response = await fetch(`${GIPHY_BASE}/${endpoint}?${params.toString()}`);
    if (!response.ok) throw new Error(`Giphy request failed: ${response.status}`);
    const body = (await response.json()) as GiphyResponse;
    return body.data.map(toGifResult);
  }
}
