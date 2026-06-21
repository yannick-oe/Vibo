/**
 * @file Lazily loaded GIF picker: a modal over trending/searched Giphy
 * results; selecting one emits it for the composer to send.
 */
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { GifResult } from '../../../models/gif.model';
import { GiphyService } from '../../../services/giphy.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';

const SEARCH_DEBOUNCE_MS = 300;

const TITLE_ID = 'gif-picker-title';

/**
 * Modal GIF picker opened from the composer. Loads trending GIFs on open and
 * debounced search results as the user types; every Giphy request is pg-13
 * rated by the service. Selecting a thumbnail emits the GIF and closes. The
 * dialog shell provides the dialog role, focus trap, Escape and focus return.
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

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly gifs = signal<GifResult[]>([]);

  protected readonly isLoading = signal(true);

  protected readonly hasError = signal(false);

  private readonly giphy = inject(GiphyService);


  /**
   * Loads trending GIFs and wires the debounced search input.
   */
  constructor() {
    void this.load(this.giphy.trending());
    this.searchControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(term => this.runQuery(term.trim()));
  }


  /**
   * Runs trending (empty term) or a search for the term.
   * @param term Trimmed search term.
   */
  private runQuery(term: string): void {
    void this.load(term ? this.giphy.search(term) : this.giphy.trending());
  }


  /**
   * Awaits a Giphy request into the grid, toggling loading and the error
   * state so a failed or rate-limited request degrades gracefully.
   * @param request Pending Giphy request.
   */
  private async load(request: Promise<GifResult[]>): Promise<void> {
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
