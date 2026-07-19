/**
 * @file Lazily loaded GIF picker: persistent category chips („Favoriten",
 * „Angesagt" and the curated category terms) over one large masonry grid,
 * mirroring the emoji picker's category navigation. The grid fills directly
 * on open (one trending request); chips and the debounced search share the
 * grid, and an IntersectionObserver sentinel pages further results in up to
 * a hard cap (chat windowing pattern). Every Giphy request is pg-13 rated
 * by the service; the permanently visible „Powered by GIPHY" footer
 * satisfies the Giphy attribution terms.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { GifResult } from '../../../models/gif.model';
import { AuthService } from '../../../services/auth.service';
import { GifFavoritesService } from '../../../services/gif-favorites.service';
import { GIF_MAX_RESULTS, GIF_PAGE_SIZE, GiphyService } from '../../../services/giphy.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import {
  FAVORITES_CHIP_ID,
  GifChip,
  TRENDING_CHIP_ID,
  buildChips,
  chipTerm,
} from './gif-picker.constants';
import { dedupeById, favoriteToResult } from './gif-picker.results';

const SEARCH_DEBOUNCE_MS = 300;

const TITLE_ID = 'gif-picker-title';

const FAVORITES_EMPTY_NOTE = 'Noch keine Favoriten — markiere GIFs mit dem Stern.';

const SENTINEL_MARGIN_PX = 300;

/**
 * Modal GIF picker opened from the composer. „Angesagt" is active on open
 * and fills the masonry grid immediately; chip taps and the debounced
 * search swap the grid's feed, „Favoriten" renders the cached favorites
 * document. The dialog shell provides the dialog role, focus trap, Escape
 * and focus return.
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

  protected readonly favoritesChipId = FAVORITES_CHIP_ID;

  protected readonly favoritesEmptyNote = FAVORITES_EMPTY_NOTE;

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly activeChip = signal<string | null>(TRENDING_CHIP_ID);

  protected readonly gifs = signal<GifResult[]>([]);

  protected readonly isLoading = signal(false);

  protected readonly hasError = signal(false);

  protected readonly endReached = signal(false);

  protected readonly favoritesReady = signal(false);

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  private readonly scrollRegion = viewChild.required<ElementRef<HTMLElement>>('scroll');

  private readonly giphy = inject(GiphyService);

  private readonly favoritesService = inject(GifFavoritesService);

  private readonly authService = inject(AuthService);

  protected readonly isGuest = this.authService.isGuest;

  protected readonly chips = computed<readonly GifChip[]>(() => buildChips(this.isGuest()));

  protected readonly showsFavorites = computed(() => this.activeChip() === FAVORITES_CHIP_ID);

  private readonly favoriteResults = computed(() =>
    this.favoritesService.favorites().map(favoriteToResult),
  );

  protected readonly displayedGifs = computed<readonly GifResult[]>(() =>
    this.showsFavorites() ? this.favoriteResults() : this.gifs(),
  );

  private feedTerm: string | null = null;

  private lastChip: string = TRENDING_CHIP_ID;

  private nextOffset = 0;

  private requestToken = 0;

  private pageInFlight = false;


  /**
   * Wires the debounced search input, starts the one-shot favorites load,
   * attaches the pagination sentinel watcher and fills the grid with the
   * trending feed (the single request an open costs).
   */
  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(term => this.onSearchTerm(term.trim()));
    void this.favoritesService.ensureLoaded().then(() => this.favoritesReady.set(true));
    this.watchSentinel();
    this.startFeed(null);
  }


  /**
   * Activates a chip: clears a typed search term, remembers the chip for
   * the search-clear restore and loads its feed („Favoriten" renders the
   * cached document without any request).
   * @param chipId Id of the pressed chip.
   */
  protected selectChip(chipId: string): void {
    this.searchControl.setValue('');
    this.lastChip = chipId;
    this.activeChip.set(chipId);
    if (chipId !== FAVORITES_CHIP_ID) this.startFeed(chipTerm(chipId));
  }


  /**
   * Applies a debounced search term: a non-empty term takes the grid over
   * (no chip active), a cleared field returns to the previously active
   * chip.
   * @param term Trimmed search term.
   */
  private onSearchTerm(term: string): void {
    if (!term) return this.restoreChipAfterSearch();
    this.activeChip.set(null);
    this.startFeed(term);
  }


  /**
   * Re-activates the chip that was active before the search took the grid
   * over; a no-op when a chip tap already cleared the field itself.
   */
  private restoreChipAfterSearch(): void {
    if (this.activeChip() !== null) return;
    this.activeChip.set(this.lastChip);
    if (this.lastChip !== FAVORITES_CHIP_ID) this.startFeed(chipTerm(this.lastChip));
  }


  /**
   * Resets the grid to a new feed and loads its first page.
   * @param term Search term of the feed; null for trending.
   */
  private startFeed(term: string | null): void {
    this.feedTerm = term;
    this.nextOffset = 0;
    this.gifs.set([]);
    this.endReached.set(false);
    this.hasError.set(false);
    void this.loadPage();
  }


  /**
   * Re-observes the pagination sentinel whenever it (re)enters the DOM or
   * a page lands, so a sentinel still inside the prefetch margin keeps
   * paging without another scroll event.
   */
  private watchSentinel(): void {
    effect(onCleanup => {
      this.gifs();
      const sentinel = this.sentinel()?.nativeElement;
      if (!sentinel) return;
      const observer = this.createSentinelObserver();
      observer.observe(sentinel);
      onCleanup(() => observer.disconnect());
    });
  }


  /**
   * Builds the IntersectionObserver that pages further results in as the
   * sentinel nears the scroll region's lower edge.
   */
  private createSentinelObserver(): IntersectionObserver {
    return new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) this.loadMore();
      },
      { root: this.scrollRegion().nativeElement, rootMargin: `0px 0px ${SENTINEL_MARGIN_PX}px 0px` },
    );
  }


  /**
   * Loads the next page of the active feed when the sentinel reports
   * visibility; no-op while a page is in flight, at the cap or on the
   * favorites view.
   */
  private loadMore(): void {
    if (this.pageInFlight || this.endReached() || this.showsFavorites()) return;
    if (this.nextOffset === 0) return;
    void this.loadPage();
  }


  /**
   * Fetches one page of the active feed at the current offset, dropping
   * stale responses (the feed changed mid-flight) so a slow page can never
   * overwrite a newer feed.
   */
  private async loadPage(): Promise<void> {
    const token = ++this.requestToken;
    const offset = this.nextOffset;
    this.pageInFlight = true;
    if (offset === 0) this.isLoading.set(true);
    try {
      const page = await this.fetchPage(offset);
      if (token === this.requestToken) this.appendPage(page);
    } catch {
      if (token === this.requestToken) this.failPage(offset);
    } finally {
      if (token === this.requestToken) this.finishPage(offset);
    }
  }


  /**
   * Runs the feed's Giphy request for one page.
   * @param offset Result offset of the page.
   */
  private fetchPage(offset: number): Promise<GifResult[]> {
    const term = this.feedTerm;
    return term === null ? this.giphy.trending(offset) : this.giphy.search(term, offset);
  }


  /**
   * Appends a landed page de-duplicated by id, advances the offset and
   * flags the end after a short page or at the result cap.
   * @param page Landed page of the active feed.
   */
  private appendPage(page: GifResult[]): void {
    this.nextOffset += GIF_PAGE_SIZE;
    this.gifs.set(dedupeById([...this.gifs(), ...page]));
    if (page.length < GIF_PAGE_SIZE || this.nextOffset >= GIF_MAX_RESULTS) this.endReached.set(true);
  }


  /**
   * Degrades a failed page gracefully: a failed first page shows the error
   * state, any failure stops further pagination of the feed.
   * @param offset Offset the failed request was sent with.
   */
  private failPage(offset: number): void {
    if (offset === 0) this.hasError.set(true);
    this.endReached.set(true);
  }


  /**
   * Clears the in-flight flag and the initial loading state of a settled
   * page request.
   * @param offset Offset the settled request was sent with.
   */
  private finishPage(offset: number): void {
    this.pageInFlight = false;
    if (offset === 0) this.isLoading.set(false);
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
