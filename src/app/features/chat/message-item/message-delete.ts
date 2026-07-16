/**
 * @file Deletion flows of a message row: "Für mich löschen" (client-side
 * hide with a brief collapse-out) and "Für alle löschen" (tombstone), plus
 * the one-shot tombstone pop that plays only on a deletion observed live.
 * Instantiated per row inside the component's injection context (the
 * constructor creates the observation effect).
 */
import { Signal, effect, signal } from '@angular/core';

import { MessageService } from '../../../services/message.service';
import { SoundService } from '../../../services/sound.service';
import { ToastService } from '../../../services/toast.service';
import { delay, prefersReducedMotion, runMessageAction } from './message-item.util';

const DELETE_POP_MS = 220;

/**
 * Per-row deletion controller shared by the chat lists and the thread panel.
 */
export class MessageDelete {
  /** Whether the tombstone pop plays (deletion observed live this session). */
  readonly justDeleted = signal(false);

  /** Whether the row is playing its hide-for-me collapse-out. */
  readonly isHiding = signal(false);

  private hasObservedDeletion = false;

  private wasDeleted = false;


  /**
   * Wires the live deletion observation for the tombstone pop.
   * @param messageService Message write API.
   * @param soundService Own-action delete sound.
   * @param toastService Error surface for failed writes.
   * @param isDeleted Whether the row currently is a tombstone.
   * @param messagePath Accessor for the row's message document path.
   */
  constructor(
    private readonly messageService: MessageService,
    private readonly soundService: SoundService,
    private readonly toastService: ToastService,
    private readonly isDeleted: Signal<boolean>,
    private readonly messagePath: () => string | null,
  ) {
    effect(() => this.trackDeletion());
  }


  /**
   * Hides the message for the signed-in user only; plays a brief collapse-out
   * first (unless reduced motion), then writes the hide — reverting the
   * collapse if the write fails so the row never stays stuck invisible.
   */
  async forMe(): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath) return;
    this.soundService.play('delete');
    const animates = !prefersReducedMotion();
    this.isHiding.set(animates);
    if (animates) await delay(DELETE_POP_MS);
    const hidden = await runMessageAction(this.toastService, () => this.messageService.hideForMe(messagePath));
    if (!hidden) this.isHiding.set(false);
  }


  /**
   * Deletes the message for everyone (tombstone).
   */
  async forAll(): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath) return;
    this.soundService.play('delete');
    await runMessageAction(this.toastService, () => this.messageService.deleteForAll(messagePath));
  }


  /**
   * Records the deletion state per emission so the tombstone pop plays only
   * on a genuine not-deleted → deleted transition observed live; a message
   * that loads already deleted does not pop.
   */
  private trackDeletion(): void {
    const deleted = this.isDeleted();
    if (this.hasObservedDeletion && deleted && !this.wasDeleted) this.justDeleted.set(true);
    this.hasObservedDeletion = true;
    this.wasDeleted = deleted;
  }
}
