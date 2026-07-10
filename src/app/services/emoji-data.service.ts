/**
 * @file Lazily loads the full German emoji catalogue (public/emoji-data.de.json,
 * built by scripts/generate-emoji.mjs) on first picker open and caches it in
 * memory, so the ~200 KB metadata never enters the initial JS bundle. Also owns
 * the picker's "Zuletzt verwendet" recents (localStorage, capped). This is a
 * one-shot static asset fetch, not a Firestore listener (§14).
 */
import { Injectable, Signal, computed, signal } from '@angular/core';

/** One catalogue emoji: character, German name, search keywords, asset filename. */
export interface EmojiEntry {
  readonly u: string;
  readonly n: string;
  readonly k: string;
  readonly f: string;
}

/** A named category of emojis, one per picker tab (recents uses id -1). */
export interface EmojiGroup {
  readonly id: number;
  readonly label: string;
  readonly emojis: readonly EmojiEntry[];
}

const DATA_URL = 'emoji-data.de.json';
const RECENTS_KEY = 'vibo:recentPickerEmojis';
const RECENTS_MAX = 24;
const RECENTS_LABEL = 'Zuletzt verwendet';

/**
 * Streams the emoji catalogue and recents to the picker; a single cached fetch
 * feeds every open, and recents persist across sessions in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class EmojiDataService {
  private readonly groupsState = signal<readonly EmojiGroup[] | null>(null);

  private readonly recentsState = signal<readonly string[]>(readRecents());

  private readonly byChar = signal<ReadonlyMap<string, EmojiEntry>>(new Map());

  /** Category groups once loaded; null until the first fetch resolves. */
  readonly groups: Signal<readonly EmojiGroup[] | null> = this.groupsState.asReadonly();

  /** The recents group (possibly empty), rendered as the picker's first section. */
  readonly recentGroup: Signal<EmojiGroup> = computed(() => ({
    id: -1,
    label: RECENTS_LABEL,
    emojis: this.resolveRecents(),
  }));


  /**
   * Fetches the catalogue once and caches it; repeat calls are ignored. A
   * failed fetch degrades to an empty catalogue (the seed reactions still work).
   */
  load(): void {
    if (this.groupsState() !== null) return;
    void fetch(new URL(DATA_URL, document.baseURI))
      .then(response => response.json())
      .then((data: { groups: EmojiGroup[] }) => this.ingest(data.groups))
      .catch(() => this.groupsState.set([]));
  }


  /**
   * The emojis whose German name or keywords contain the query, across every
   * group; empty for a blank query so the picker shows its sections instead.
   * @param query Raw search input.
   */
  search(query: string): EmojiEntry[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return (this.groupsState() ?? []).flatMap(group => group.emojis).filter(e => e.k.includes(needle));
  }


  /**
   * Records a picked emoji at the front of the recents, de-duplicated and
   * capped, and persists it.
   * @param emoji Picked emoji character.
   */
  record(emoji: string): void {
    const next = [emoji, ...this.recentsState().filter(entry => entry !== emoji)].slice(0, RECENTS_MAX);
    this.recentsState.set(next);
    storeRecents(next);
  }


  /**
   * Builds the char → entry lookup and publishes the loaded groups.
   * @param groups Parsed catalogue groups.
   */
  private ingest(groups: EmojiGroup[]): void {
    this.byChar.set(new Map(groups.flatMap(group => group.emojis).map(entry => [entry.u, entry])));
    this.groupsState.set(groups);
  }


  /**
   * The recents resolved to catalogue entries (dropping any not yet loaded or
   * no longer present), so each recent renders with its artwork and name.
   */
  private resolveRecents(): EmojiEntry[] {
    const lookup = this.byChar();
    return this.recentsState()
      .map(char => lookup.get(char))
      .filter((entry): entry is EmojiEntry => entry !== undefined);
  }
}


/**
 * Reads the persisted recents, tolerating a missing or malformed value.
 */
function readRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}


/**
 * Persists the recents; storage errors are ignored (the feature degrades to
 * an empty recents section).
 * @param recents Current recents list.
 */
function storeRecents(recents: readonly string[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    return;
  }
}
