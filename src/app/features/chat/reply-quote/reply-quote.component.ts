/**
 * @file Quoted preview of the message an inline reply answers ("Antworten"),
 * rendered above the answering bubble. Shows the answered author (resolved
 * live) with the frozen text snapshot; clicking scrolls to and highlights the
 * original through the shared {@link MessageFocusService}. A missing or
 * tombstoned original degrades to a muted, non-interactive fallback line.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { ChatEntry, Message } from '../../../models/message.model';
import { MessageFocusService } from '../../../services/message-focus.service';
import { UserService } from '../../../services/user.service';

const UNKNOWN_AUTHOR = 'Unbekannt';

/**
 * Presentational inline-reply quote. Rendered only when its entry carries a
 * replyTo reference; the owning message list supplies the resolved original so
 * availability (present and not deleted) can gate the scroll-to link.
 */
@Component({
  selector: 'app-reply-quote',
  templateUrl: './reply-quote.component.html',
  styleUrl: './reply-quote.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplyQuoteComponent {
  readonly entry = input.required<ChatEntry>();

  readonly original = input<Message | undefined>(undefined);

  private readonly userService = inject(UserService);

  private readonly messageFocusService = inject(MessageFocusService);

  protected readonly replyRef = computed(() => (this.entry() as Message).replyTo);

  protected readonly available = computed(() => {
    const original = this.original();
    return Boolean(original && !original.deletedAt);
  });

  protected readonly authorName = computed(() => {
    const uid = this.replyRef()?.authorUid;
    return this.userService.users().find(user => user.uid === uid)?.name ?? UNKNOWN_AUTHOR;
  });


  /**
   * Scrolls to and highlights the answered original when it is still
   * available; a missing or deleted original does nothing.
   */
  protected focusOriginal(): void {
    const ref = this.replyRef();
    if (ref && this.available()) this.messageFocusService.focus(ref.messageId);
  }
}
