/**
 * @file Broadcast "big laugh" reactions. Writes a 😂 laugh event onto a
 * message so every viewer's existing message listener picks it up — reusing
 * that per-conversation stream keeps this within the listener budget (§14):
 * no separate full-collection listener is added. Also exposes the play
 * request the laugh-burst overlay renders, and dispatches the local
 * full-screen effect of the brand big reactions via {@link EffectsService}.
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
import { LAUGH_EMOJI } from '../models/reactions';
import { AuthService } from './auth.service';
import { EffectsService } from './effects.service';

const MESSAGE_ELEMENT_PREFIX = 'message-';

/** Screen position a laugh burst originates from, in viewport CSS pixels. */
export interface BurstOrigin {
  readonly x: number;
  readonly y: number;
}

/** One laugh-burst play request, consumed by the overlay; token forces change. */
export interface LaughBurstRequest {
  readonly origin: BurstOrigin;
  readonly token: number;
}

/**
 * Owns the broadcast laugh reaction: triggering its write, requesting its
 * playback and routing the local big-reaction effects.
 */
@Injectable({ providedIn: 'root' })
export class BigReactionService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly effectsService = inject(EffectsService);

  private nextToken = 0;

  private readonly requestState = signal<LaughBurstRequest | null>(null);

  /** Latest laugh-burst request, consumed by the laugh-burst overlay. */
  readonly request: Signal<LaughBurstRequest | null> = this.requestState.asReadonly();


  /**
   * Dispatches the effect of a just-added reaction: the local full-screen
   * effect of a brand big reaction, plus the broadcast laugh for 😂.
   * @param emoji Reaction emoji the user added.
   * @param messagePath Firestore path of the reacted message.
   */
  onReactionAdded(emoji: string, messagePath: string): void {
    this.effectsService.playFor(emoji);
    if (emoji === LAUGH_EMOJI) this.trigger(messagePath);
  }


  /**
   * Writes a laugh event onto the message (fire-and-forget; the reaction
   * write surfaces failures). The server timestamp lets every client replay
   * it once after they started listening — see the play-once tracker.
   * @param messagePath Firestore path of the message document.
   */
  private trigger(messagePath: string): void {
    const event: BigReactionEvent = {
      id: crypto.randomUUID(),
      type: 'laugh',
      by: this.authService.requireUid(),
      at: serverTimestamp(),
    };
    void runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), { lastBigReaction: event }),
    ).catch(() => undefined);
  }


  /**
   * Requests a laugh burst at a message's on-screen position; skipped when
   * the row is not currently rendered (the user is not looking at it).
   * @param messageId Firestore id of the message the laugh targets.
   */
  play(messageId: string): void {
    const element = document.getElementById(`${MESSAGE_ELEMENT_PREFIX}${messageId}`);
    if (!element) return;
    this.requestState.set({ origin: bubbleOrigin(element), token: this.nextToken++ });
  }
}


/**
 * Center of a message row in viewport CSS pixels, used as the burst origin.
 * @param element Message row element.
 */
function bubbleOrigin(element: HTMLElement): BurstOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
