/**
 * @file Shared emoji picker for the reaction flow and the composer smiley,
 * driven by the lazily-loaded {@link EmojiDataService} catalogue. A pill search
 * (German label + keyword), sticky category tabs, a „Zuletzt verwendet" section
 * and a responsive auto-fill grid that fills its container. One category is
 * mounted at a time (bounded DOM, CLS 0); picking records the shared recents
 * and the action-bar quick reactions. Emits the picked emoji and closes on
 * Escape or an outside click; the opener positions it and restores focus.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { BIG_REACTION_EMOJIS, bigReactionLabel } from '../../../models/reactions';
import { EmojiDataService, EmojiEntry } from '../../../services/emoji-data.service';
import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { emojiAsset } from '../emoji-catalog';

const RECENTS_TAB = -1;
const FIRST_CATEGORY_TAB = 0;
const LOADING_CELL_COUNT = 24;

/**
 * Presentational picker. In a reaction context it leads with the „Große
 * Reaktionen" row; in the composer it is a plain flat picker whose insertion
 * behaviour is owned by the composer. Category navigation swaps one grid at a
 * time so the DOM never holds thousands of images.
 */
@Component({
  selector: 'app-emoji-picker',
  templateUrl: './emoji-picker.component.html',
  styleUrl: './emoji-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class EmojiPickerComponent {
  readonly isReactionTrigger = input(false);

  readonly picked = output<string>();

  readonly closed = output<void>();

  private readonly emojiData = inject(EmojiDataService);

  private readonly recentEmoji = inject(RecentEmojiService);

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly query = signal('');

  protected readonly activeTab = signal(FIRST_CATEGORY_TAB);

  protected readonly bigEmojis = BIG_REACTION_EMOJIS;

  protected readonly loadingCells = Array.from({ length: LOADING_CELL_COUNT });

  protected readonly assetFor = emojiAsset;

  protected readonly loading = computed(() => this.emojiData.groups() === null);

  protected readonly searching = computed(() => this.query().trim().length > 0);

  protected readonly tabs = computed(() => this.buildTabs());

  protected readonly activeEmojis = computed(() => this.resolveActive());

  protected readonly results = computed(() => this.emojiData.search(this.query()));


  /**
   * Kicks off the one-shot catalogue fetch as soon as the picker is created.
   */
  constructor() {
    this.emojiData.load();
  }


  /**
   * The accessible label of a big-reaction button ("Mit Konfetti reagieren").
   * @param emoji Big-reaction emoji character.
   */
  protected bigLabel(emoji: string): string {
    return `Mit ${bigReactionLabel(emoji) ?? emoji} reagieren`;
  }


  /**
   * The accessible label of a grid emoji: the reaction phrasing when reacting,
   * the plain German name when inserting into the composer.
   * @param entry Catalogue emoji entry.
   */
  protected gridLabel(entry: EmojiEntry): string {
    return this.isReactionTrigger() ? `Mit ${entry.n} reagieren` : entry.n;
  }


  /**
   * Updates the live search query from the input.
   * @param event Input event of the search field.
   */
  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }


  /**
   * Selects a category tab and leaves the search view.
   * @param id Tab id (a group id, or -1 for recents).
   */
  protected selectTab(id: number): void {
    this.query.set('');
    this.activeTab.set(id);
  }


  /**
   * Records the pick in the shared recents and the action-bar quick reactions,
   * then emits it to the opener.
   * @param emoji Picked emoji character.
   */
  protected pick(emoji: string): void {
    this.emojiData.record(emoji);
    this.recentEmoji.record(emoji);
    this.picked.emit(emoji);
  }


  /**
   * Closes the picker when a click lands outside of it (composer inline mode;
   * the reaction dialog-shell handles this itself, harmlessly).
   * @param event Document-level click event.
   */
  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closed.emit();
  }


  /**
   * The tab list: „Zuletzt verwendet" first when non-empty, then the nine
   * category groups.
   */
  private buildTabs(): { id: number; label: string }[] {
    const recents = this.emojiData.recentGroup();
    const categories = (this.emojiData.groups() ?? []).map(group => ({ id: group.id, label: group.label }));
    return recents.emojis.length ? [{ id: RECENTS_TAB, label: recents.label }, ...categories] : categories;
  }


  /**
   * The emojis of the active tab (recents or the selected category).
   */
  private resolveActive(): readonly EmojiEntry[] {
    if (this.activeTab() === RECENTS_TAB) return this.emojiData.recentGroup().emojis;
    return (this.emojiData.groups() ?? []).find(group => group.id === this.activeTab())?.emojis ?? [];
  }
}
