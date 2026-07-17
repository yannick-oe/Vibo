/**
 * @file Pin-toggle controller of a message row: derives pinnability and the
 * current pinned state from the entry and runs the toggle with the shared
 * error-toast handling. Kept outside the row component for file-size reasons,
 * mirroring the delete controller.
 */
import { Signal, computed, inject } from '@angular/core';

import { ChatEntry, Message } from '../../../models/message.model';
import { PinnedMessagesService } from '../../../services/pinned-messages.service';
import { ToastService } from '../../../services/toast.service';
import { runMessageAction } from './message-item.util';

const REPLIES_SEGMENT = '/replies/';

/**
 * Row-scoped pin state and toggle action. Only top-level chat messages are
 * pinnable: thread replies (path contains /replies/) and tombstones are not;
 * system messages never render a row action bar in the first place.
 */
export class MessagePinToggle {
  readonly isPinned = computed(() => Boolean((this.entry() as Message).pinned));

  readonly isPinnable = computed(() => {
    const messagePath = this.messagePath();
    if (!messagePath || messagePath.includes(REPLIES_SEGMENT)) return false;
    return !this.entry().deletedAt;
  });


  constructor(
    private readonly pinnedMessages: PinnedMessagesService,
    private readonly toastService: ToastService,
    private readonly entry: Signal<ChatEntry>,
    private readonly messagePath: () => string | null,
  ) {}


  /**
   * Pins or unpins the row's message; failures surface as the shared error
   * toast via runMessageAction.
   */
  async toggle(): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath || !this.isPinnable()) return;
    const next = !this.isPinned();
    await runMessageAction(this.toastService, () =>
      this.pinnedMessages.setPinned(messagePath, next),
    );
  }
}


/**
 * Builds the row's pin toggle with its injected collaborators; must be called
 * in an injection context (component field initializer).
 * @param entry Row entry signal.
 * @param messagePath Accessor of the row's full message document path.
 */
export function createPinToggle(
  entry: Signal<ChatEntry>,
  messagePath: () => string | null,
): MessagePinToggle {
  return new MessagePinToggle(inject(PinnedMessagesService), inject(ToastService), entry, messagePath);
}
