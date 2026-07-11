/**
 * @file "{name} schreibt …" indicator for a conversation. Streams the typing
 * subcollection, keeps only entries whose state is within a recency window
 * (re-checked on a timer so stale states self-expire) excluding the viewer's own
 * client session, and resolves names — multi-user aware for channels. The bar
 * reserves its height permanently so it never shifts the layout (CLS 0).
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { Observable, interval, of, switchMap } from 'rxjs';

import { ClientSessionService } from '../../../services/client-session.service';
import { TypingEntry, TypingService } from '../../../services/typing.service';
import { UserService } from '../../../services/user.service';

const RECENCY_MS = 8000;
const RECHECK_MS = 1500;
const TYPING_VERB_ONE = 'schreibt …';
const TYPING_VERB_MANY = 'schreiben …';
const TYPING_CONNECTOR = 'und';
const TYPING_MORE = 'und weitere';

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

  private readonly clientSession = inject(ClientSessionService);

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
   * "{name} schreibt …" for one, and named plural forms for several.
   */
  private buildText(): string {
    this.tick();
    const names = this.recentTypers();
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} ${TYPING_VERB_ONE}`;
    if (names.length === 2) return `${names[0]} ${TYPING_CONNECTOR} ${names[1]} ${TYPING_VERB_MANY}`;
    return `${names[0]}, ${names[1]} ${TYPING_MORE} ${TYPING_VERB_MANY}`;
  }


  /**
   * Distinct names of other client sessions whose typing state is within the
   * recency window right now; the viewer's own session and unknown users are
   * excluded, and shared names (e.g. two guest windows) collapse to one.
   */
  private recentTypers(): string[] {
    const mySession = this.clientSession.id;
    const now = Date.now();
    const names = this.entries()
      .filter(entry => entry.sessionId !== mySession && isRecent(entry.updatedAt, now))
      .map(entry => this.nameOf(entry.uid))
      .filter((name): name is string => name !== null);
    return [...new Set(names)].sort();
  }


  /**
   * Resolves a uid to its display name, or null when it is missing or has no
   * user document.
   * @param uid Uid stored on a typing marker, if present.
   */
  private nameOf(uid: string | undefined): string | null {
    if (!uid) return null;
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
