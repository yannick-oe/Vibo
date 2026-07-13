/**
 * @file Discord-style friends view rendered in the main content area:
 * "Alle" (accepted friends grouped by presence) and "Anfragen" (incoming
 * and outgoing requests) behind a keyboard-accessible segmented control,
 * plus an integrated user search that temporarily replaces the tab panels.
 * All rows reuse the shared friend-action component.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { UserDoc } from '../../../models/user.model';
import { FriendshipService } from '../../../services/friendship.service';
import { PresenceService } from '../../../services/presence.service';
import { SearchService, UserHit } from '../../../services/search.service';
import { UserService } from '../../../services/user.service';
import { SkeletonComponent } from '../../../shared/skeleton/skeleton.component';
import { FriendRowComponent } from '../friend-row/friend-row.component';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;
const USER_SCOPE_PREFIX = '@';
const SORT_LOCALE = 'de';
const FRIENDS_SKELETON_COUNT = 5;

/** Identifier of a friends-view tab. */
export type FriendsTab = 'all' | 'requests' | 'blocked';

const TAB_ORDER: readonly FriendsTab[] = ['all', 'requests', 'blocked'];

/**
 * Main-area friends view: the single home for the friend list, open
 * requests and finding new people.
 */
@Component({
  selector: 'app-friends-view',
  imports: [FriendRowComponent, ReactiveFormsModule, SkeletonComponent],
  templateUrl: './friends-view.component.html',
  styleUrl: './friends-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendsViewComponent implements AfterViewInit {
  private readonly friendshipService = inject(FriendshipService);

  private readonly userService = inject(UserService);

  private readonly searchService = inject(SearchService);

  protected readonly presenceService = inject(PresenceService);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly activeTab = signal<FriendsTab>('all');

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly term = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly searchResults = signal<UserHit[]>([]);

  private searchRequestId = 0;

  protected readonly isSearching = computed(() => this.term().trim().length >= MIN_TERM_LENGTH);

  private readonly friends = computed(() =>
    this.usersFor([...this.friendshipService.friendUids()]),
  );

  protected readonly onlineFriends = computed(() =>
    this.friends().filter(friend => this.presenceService.isOnline(friend.uid)),
  );

  protected readonly offlineFriends = computed(() =>
    this.friends().filter(friend => !this.presenceService.isOnline(friend.uid)),
  );

  protected readonly incoming = computed(() =>
    this.usersFor(this.friendshipService.pendingIncomingUids()),
  );

  protected readonly outgoing = computed(() =>
    this.usersFor(this.friendshipService.pendingOutgoingUids()),
  );

  protected readonly blocked = computed(() =>
    this.usersFor(this.friendshipService.blockedUids()),
  );

  protected readonly incomingCount = computed(() => this.incoming().length);

  protected readonly hasFriends = computed(() => this.friends().length > 0);

  protected readonly hasRequests = computed(
    () => this.incoming().length + this.outgoing().length > 0,
  );

  /** Whether the friendship stream has delivered its first snapshot. */
  protected readonly loaded = this.friendshipService.loaded;

  protected readonly friendsSkeletonCount = FRIENDS_SKELETON_COUNT;


  /**
   * Re-runs the user search whenever the debounced term changes.
   */
  constructor() {
    effect(() => void this.runSearch(this.term()));
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Activates a tab.
   * @param tab Tab to activate.
   */
  protected selectTab(tab: FriendsTab): void {
    this.activeTab.set(tab);
  }


  /**
   * Arrow-key navigation across the tabs (wrapping); activation follows
   * focus.
   * @param event Keydown event on the tablist.
   */
  protected onTablistKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const index = TAB_ORDER.indexOf(this.activeTab());
    const next = TAB_ORDER[(index + step + TAB_ORDER.length) % TAB_ORDER.length];
    this.activeTab.set(next);
    document.getElementById(`friends-tab-${next}`)?.focus();
  }


  /**
   * Moves focus into the search field (empty-state CTA).
   */
  protected focusSearch(): void {
    this.searchInput().nativeElement.focus();
  }


  /**
   * Runs the debounced user-scoped search; short terms clear the results.
   * @param term Current debounced term.
   */
  private async runSearch(term: string): Promise<void> {
    const raw = term.trim();
    if (raw.length < MIN_TERM_LENGTH) return this.searchResults.set([]);
    const requestId = (this.searchRequestId += 1);
    const results = await this.searchService.search(`${USER_SCOPE_PREFIX}${raw}`);
    if (requestId !== this.searchRequestId) return;
    this.searchResults.set(results.users);
  }


  /**
   * Resolves user documents for a list of uids, sorted by display name.
   * @param uids Uids to resolve.
   */
  private usersFor(uids: string[]): UserDoc[] {
    const wanted = new Set(uids);
    return this.userService
      .users()
      .filter(user => wanted.has(user.uid))
      .sort((a, b) => a.name.localeCompare(b.name, SORT_LOCALE));
  }
}
