/**
 * @file Lazily loaded GIF picker: a Discord-style start view (Favoriten,
 * Angesagt and one tile per category term, each with a cached
 * representative preview) over the trending/search/category result grids
 * and the favorites grid; selecting a GIF emits it for the composer to
 * send. Every Giphy request is pg-13 rated by the service; the permanently
 * visible „Powered by GIPHY" footer satisfies the Giphy attribution terms.
 */
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { GifFavorite, GifResult } from '../../../models/gif.model';
import { AuthService } from '../../../services/auth.service';
import { GifFavoritesService } from '../../../services/gif-favorites.service';
import { GiphyService } from '../../../services/giphy.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { gifStillRendition } from '../gif-rendition';
import {
  CategoryPreview,
  GIF_CATEGORY_TERMS,
  readCachedPreviews,
  storeCachedPreviews,
} from './gif-category-previews';

const SEARCH_DEBOUNCE_MS = 300;

const TITLE_ID = 'gif-picker-title';

const TRENDING_TITLE = 'Angesagt';

const FAVORITES_EMPTY_NOTE = 'Noch keine Favoriten — markiere GIFs mit dem Stern.';

/** The picker's visible surface: start tiles, a result grid or favorites. */
type GifPickerView = 'start' | 'results' | 'favorites';

/**
 * Modal GIF picker opened from the composer. Opens on the category start
 * view; tiles, debounced search input and the favorites star drive the
 * result grids. The dialog shell provides the dialog role, focus trap,
 * Escape and focus return.
 */
@Component({
  selector: 'app-gif-picker',
  imports: [DialogShellComponent, ReactiveFormsModule],
  templateUrl: './gif-picker.component.html',
  styleUrl: './gif-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GifPickerComponent {
  readonly picked = output<GifResult>();

  readonly closed = output<void>();

  protected readonly titleId = TITLE_ID;

  protected readonly categoryTerms = GIF_CATEGORY_TERMS;

  protected readonly favoritesEmptyNote = FAVORITES_EMPTY_NOTE;

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly view = signal<GifPickerView>('start');

  protected readonly resultsTitle = signal('');

  protected readonly gifs = signal<GifResult[]>([]);

  protected readonly isLoading = signal(false);

  protected readonly hasError = signal(false);

  protected readonly previews = signal<Record<string, CategoryPreview>>({});

  protected readonly favoritesReady = signal(false);

  private readonly giphy = inject(GiphyService);

  private readonly favoritesService = inject(GifFavoritesService);

  private readonly authService = inject(AuthService);

  protected readonly isGuest = this.authService.isGuest;

  protected readonly favoriteResults = computed(() =>
    this.favoritesService.favorites().map(favoriteToResult),
  );


  /**
   * Wires the debounced search input and starts the one-shot loads of the
   * category previews and the favorites document.
   */
  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(term => this.runQuery(term.trim()));
    void this.loadCategoryPreviews();
    void this.favoritesService.ensureLoaded().then(() => this.favoritesReady.set(true));
  }


  /**
   * Runs a search for a typed term or returns to the start view when the
   * input was cleared.
   * @param term Trimmed search term.
   */
  private runQuery(term: string): void {
    if (!term) return this.view.set('start');
    this.resultsTitle.set(term);
    void this.load(this.giphy.search(term));
  }


  /**
   * Opens the trending feed from its start-view tile.
   */
  protected openTrending(): void {
    this.resultsTitle.set(TRENDING_TITLE);
    void this.load(this.giphy.trending());
  }


  /**
   * Opens a category's results from its start-view tile.
   * @param term Category term of the pressed tile.
   */
  protected openCategory(term: string): void {
    this.resultsTitle.set(term);
    void this.load(this.giphy.search(term));
  }


  /**
   * Opens the favorites grid from its start-view tile.
   */
  protected openFavorites(): void {
    this.view.set('favorites');
  }


  /**
   * Returns to the start view, clearing a typed search term.
   */
  protected back(): void {
    this.searchControl.setValue('');
    this.view.set('start');
  }


  /**
   * Awaits a Giphy request into the result grid, toggling loading and the
   * error state so a failed or rate-limited request degrades gracefully.
   * @param request Pending Giphy request.
   */
  private async load(request: Promise<GifResult[]>): Promise<void> {
    this.view.set('results');
    this.isLoading.set(true);
    this.hasError.set(false);
    try {
      this.gifs.set(await request);
    } catch {
      this.hasError.set(true);
      this.gifs.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }


  /**
   * Loads the start-view tile previews: served entirely from the two-layer
   * cache within its TTL, otherwise fetched once per term and cached when
   * complete.
   */
  private async loadCategoryPreviews(): Promise<void> {
    const cached = readCachedPreviews();
    if (cached) return this.previews.set(cached);
    const entries = await Promise.all(
      GIF_CATEGORY_TERMS.map(async term => [term, await this.previewOf(term)] as const),
    );
    const previews: Record<string, CategoryPreview> = {};
    for (const [term, preview] of entries) if (preview) previews[term] = preview;
    this.previews.set(previews);
    if (Object.keys(previews).length === GIF_CATEGORY_TERMS.length) storeCachedPreviews(previews);
  }


  /**
   * Fetches one category's representative preview; failures resolve to
   * null so a single miss never breaks the start view.
   * @param term Category term of the tile.
   */
  private async previewOf(term: string): Promise<CategoryPreview | null> {
    try {
      const gif = await this.giphy.categoryPreview(term);
      return gif ? { url: gif.preview, still: gif.previewStill } : null;
    } catch {
      return null;
    }
  }


  /**
   * Resolves the cached preview of a category tile; null renders the
   * tile's plain fallback.
   * @param term Category term of the tile.
   */
  protected previewFor(term: string): CategoryPreview | null {
    return this.previews()[term] ?? null;
  }


  /**
   * Reports whether a GIF is currently favorited (drives aria-pressed and
   * the star's active state).
   * @param gifId Giphy media id.
   */
  protected isFavorite(gifId: string): boolean {
    return this.favoritesService.isFavorite(gifId);
  }


  /**
   * Toggles a GIF's favorite state.
   * @param gif GIF of the pressed star.
   */
  protected toggleFavorite(gif: GifResult): void {
    void this.favoritesService.toggle(gif);
  }


  /**
   * German label of a star toggle, reflecting the current state.
   * @param gif GIF of the star.
   */
  protected favoriteLabel(gif: GifResult): string {
    return this.isFavorite(gif.id)
      ? `${gif.alt} aus Favoriten entfernen`
      : `${gif.alt} zu Favoriten hinzufügen`;
  }


  /**
   * Emits the selected GIF and requests the modal to close.
   * @param gif Selected GIF.
   */
  protected select(gif: GifResult): void {
    this.picked.emit(gif);
    this.closed.emit();
  }


  /**
   * Requests the modal to close (Escape or backdrop click).
   */
  protected close(): void {
    this.closed.emit();
  }
}


/**
 * Maps a stored favorite back to a sendable GIF result; the still frames
 * derive from Giphy's sibling renditions.
 * @param favorite Stored favorite entry.
 */
function favoriteToResult(favorite: GifFavorite): GifResult {
  return {
    id: favorite.id,
    url: favorite.url,
    still: gifStillRendition(favorite.url) ?? favorite.url,
    preview: favorite.previewUrl,
    previewStill: gifStillRendition(favorite.previewUrl) ?? favorite.previewUrl,
    width: favorite.width,
    height: favorite.height,
    alt: favorite.title,
  };
}
