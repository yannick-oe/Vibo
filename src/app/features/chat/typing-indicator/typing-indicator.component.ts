/**
 * @file "{name} tippt…" indicator for a conversation. Streams the typing
 * subcollection, keeps only other users whose state is within a recency window
 * (re-checked on a timer so stale states self-expire) and resolves names. The
 * bar reserves its height permanently so it never shifts the layout (CLS 0).
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { Observable, interval, of, switchMap } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { TypingEntry, TypingService } from '../../../services/typing.service';
import { UserService } from '../../../services/user.service';

const RECENCY_MS = 5000;
const RECHECK_MS = 1500;
const MULTIPLE_TYPING_TEXT = 'mehrere tippen…';

/**
 * Shows the live typing text for the conversation at `conversationPath`. Empty
 * when nobody else is typing; the host still occupies its reserved height.
 */
@Component({
  selector: 'app-typing-indicator',
  templateUrl: './typing-indicator.component.html',
  styleUrl: './typing-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypingIndicatorComponent {
  readonly conversationPath = input<string | null>(null);

  private readonly typingService = inject(TypingService);

  private readonly authService = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly entries = toSignal(
    toObservable(this.conversationPath).pipe(switchMap(path => this.streamFor(path))),
    { initialValue: [] as TypingEntry[] },
  );

  private readonly tick = toSignal(interval(RECHECK_MS), { initialValue: 0 });

  protected readonly typingText = computed(() => this.buildText());


  /**
   * Streams the typing entries for a path, or nothing when there is no path.
   * @param path Conversation document path, or null.
   */
  private streamFor(path: string | null): Observable<TypingEntry[]> {
    return path ? this.typingService.typingUsers(path) : of([] as TypingEntry[]);
  }


  /**
   * Builds the indicator text from the current recent typers: empty for none,
   * "{name} tippt…" for one, "mehrere tippen…" for several.
   */
  private buildText(): string {
    this.tick();
    const names = this.recentTypers();
    if (names.length === 0) return '';
    return names.length === 1 ? `${names[0]} tippt…` : MULTIPLE_TYPING_TEXT;
  }


  /**
   * Names of other users whose typing state is within the recency window right
   * now; entries for users without a document are skipped.
   */
  private recentTypers(): string[] {
    const me = this.authService.currentUser()?.uid;
    const now = Date.now();
    return this.entries()
      .filter(entry => entry.uid !== me && isRecent(entry.updatedAt, now))
      .map(entry => this.nameOf(entry.uid))
      .filter((name): name is string => name !== null);
  }


  /**
   * Resolves a uid to its display name, or null when no user document exists.
   * @param uid Uid of a typing user.
   */
  private nameOf(uid: string): string | null {
    return this.userService.users().find(user => user.uid === uid)?.name ?? null;
  }
}


/**
 * Whether a typing timestamp falls within the recency window before `now`.
 * @param updatedAt Server timestamp of the typing marker, if present.
 * @param now Current client time in milliseconds.
 */
function isRecent(updatedAt: Timestamp | undefined, now: number): boolean {
  return updatedAt !== undefined && now - updatedAt.toMillis() < RECENCY_MS;
}
