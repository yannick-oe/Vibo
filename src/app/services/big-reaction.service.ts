/**
 * @file Broadcast big reactions. Writes a big-reaction event onto a message so
 * every viewer's existing message listener picks it up — reusing that
 * per-conversation stream keeps this within the listener budget (§14): no
 * separate full-collection listener is added. Also exposes the play request
 * the big-reaction overlay renders. Every big reaction (confetti, hearts,
 * rocket, laugh) broadcasts and plays its own screen effect for all viewers.
 */
import {
  EnvironmentInjector,
  Injectable,
  Signal,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Firestore, doc, serverTimestamp, updateDoc } from '@angular/fire/firestore';

import { BigReactionEvent } from '../models/message.model';
import { EffectKind, bigReactionEffect } from '../models/reactions';
import { AuthService } from './auth.service';

const MESSAGE_ELEMENT_PREFIX = 'message-';

/** Screen position a big-reaction effect originates from, in viewport CSS pixels. */
export interface BurstOrigin {
  readonly x: number;
  readonly y: number;
}

/** One big-reaction play request, consumed by the overlay; token forces change. */
export interface BigReactionRequest {
  readonly type: EffectKind;
  readonly origin: BurstOrigin;
  readonly token: number;
}

/**
 * Owns the broadcast big reactions: triggering their write and requesting
 * their playback.
 */
@Injectable({ providedIn: 'root' })
export class BigReactionService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);

  private nextToken = 0;

  private readonly requestState = signal<BigReactionRequest | null>(null);

  /** Latest big-reaction request, consumed by the big-reaction overlay. */
  readonly request: Signal<BigReactionRequest | null> = this.requestState.asReadonly();


  /**
   * Broadcasts the effect of a just-added reaction when it is a big reaction
   * (confetti, hearts, rocket or laugh); normal reactions do nothing here.
   * @param emoji Reaction emoji the user added.
   * @param messagePath Firestore path of the reacted message.
   */
  onReactionAdded(emoji: string, messagePath: string): void {
    const type = bigReactionEffect(emoji);
    if (type) this.trigger(messagePath, type);
  }


  /**
   * Writes a big-reaction event onto the message (fire-and-forget; the
   * reaction write surfaces failures). The server timestamp lets every client
   * replay it once after they started listening — see the play-once tracker.
   * @param messagePath Firestore path of the message document.
   * @param type Effect type to broadcast.
   */
  private trigger(messagePath: string, type: EffectKind): void {
    const event: BigReactionEvent = {
      id: crypto.randomUUID(),
      type,
      by: this.authService.requireUid(),
      at: serverTimestamp(),
    };
    void runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), { lastBigReaction: event }),
    ).catch(() => undefined);
  }


  /**
   * Requests a big-reaction effect at a message's on-screen position; skipped
   * when the row is not currently rendered (the user is not looking at it).
   * @param messageId Firestore id of the message the reaction targets.
   * @param type Effect type to play.
   */
  play(messageId: string, type: EffectKind): void {
    const element = document.getElementById(`${MESSAGE_ELEMENT_PREFIX}${messageId}`);
    if (!element) return;
    this.requestState.set({ type, origin: bubbleOrigin(element), token: this.nextToken++ });
  }
}


/**
 * Center of a message row in viewport CSS pixels, used as the effect origin.
 * @param element Message row element.
 */
function bubbleOrigin(element: HTMLElement): BurstOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
