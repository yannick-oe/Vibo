/**
 * @file App-level service that requests celebratory full-screen reaction
 * effects. The single overlay component renders each request; a monotonic
 * token makes repeated requests of the same kind distinct so the signal
 * always changes and the effect replays.
 */
import { Injectable, Signal, signal } from '@angular/core';

import { EffectKind, bigReactionEffect } from '../models/reactions';

/** One play request: the effect kind and a token that forces a signal change. */
export interface EffectRequest {
  readonly kind: EffectKind;
  readonly token: number;
}

/**
 * Broadcasts full-screen effect requests to the overlay. The effect plays
 * locally for the user who selects a big reaction; cross-user broadcasting is
 * a deliberate later enhancement and intentionally not built here.
 */
@Injectable({ providedIn: 'root' })
export class EffectsService {
  private nextToken = 0;

  private readonly requestState = signal<EffectRequest | null>(null);

  /** The latest effect request, consumed by the overlay component. */
  readonly request: Signal<EffectRequest | null> = this.requestState.asReadonly();


  /**
   * Plays the big-reaction effect mapped to `emoji`, if any; normal reactions
   * trigger nothing.
   * @param emoji Reaction emoji the user just added.
   */
  playFor(emoji: string): void {
    const kind = bigReactionEffect(emoji);
    if (kind) this.play(kind);
  }


  /**
   * Requests a full-screen effect of the given kind.
   * @param kind Effect to play.
   */
  play(kind: EffectKind): void {
    this.requestState.set({ kind, token: this.nextToken++ });
  }
}
