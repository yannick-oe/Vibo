/**
 * @file Controller for a message row's action-bar pin. The bar stays visible
 * while the row owns an open overlay (⋮ menu, reaction picker, edit picker),
 * the pin is released on every close path (action, Escape, outside click,
 * unmount) and true hover is then re-evaluated via a hit-test against the
 * last pointer position — the overlay's scrim swallowed the row's pointer
 * events, so CSS hover alone may be stale. Instantiated per row inside the
 * component's injection context (the constructor creates effects).
 */
import { DestroyRef, Signal, computed, effect, signal, untracked } from '@angular/core';

import { LayoutService } from '../../../services/layout.service';
import { MessagePinService } from '../../../services/message-pin.service';
import { PointerPositionService } from '../../../services/pointer-position.service';

/** Collaborators and row context wired in by the message row component. */
export interface BarPinContext {
  /** App-wide single-owner pin state. */
  readonly pinService: MessagePinService;
  /** Last-pointer-position hit-testing. */
  readonly pointerService: PointerPositionService;
  /** Hover-capability gate for the hit-test hold. */
  readonly layoutService: LayoutService;
  /** Row component's destroy hook, releasing the pin on unmount. */
  readonly destroyRef: DestroyRef;
  /** Row host element the hover hit-test runs against. */
  readonly host: HTMLElement;
  /** Whether a row-owned overlay outside this controller is open. */
  readonly ownsOverlay: Signal<boolean>;
  /** Whether the ⋮ menu state must be force-reset (tombstone, edit mode). */
  readonly menuInvalid: Signal<boolean>;
}

/**
 * Per-row pin state machine: mirrors the row's owned-overlay state into the
 * app-wide single pin and drives the post-close hover hold.
 */
export class MessageBarPin {
  /** Whether the ⋮ options menu of this row is open (fed by the action bar). */
  readonly menuOpen = signal(false);

  /** Keeps the bar visible after release while the pointer is on the row. */
  readonly hoverHold = signal(false);

  /** Whether this row currently holds the app-wide bar pin. */
  readonly isPinned: Signal<boolean>;


  /**
   * Wires the pin effects: overlay state → pin transitions, invalid menu
   * state → forced menu reset, row unmount → release.
   * @param context Collaborators and row context.
   */
  constructor(private readonly context: BarPinContext) {
    this.isPinned = computed(() => context.pinService.owner() === this);
    effect(() => {
      const owns = context.ownsOverlay() || this.menuOpen();
      untracked(() => this.sync(owns));
    });
    effect(() => {
      if (context.menuInvalid()) this.menuOpen.set(false);
    });
    context.destroyRef.onDestroy(() => context.pinService.release(this));
  }


  /**
   * Pins the row while it owns an open overlay and releases on every close
   * path; on release the hover hold is set only when the pointer really is
   * over the row (cleared again by the row's pointerleave).
   * @param owns Whether any row-owned overlay is currently open.
   */
  private sync(owns: boolean): void {
    const { pinService, pointerService, layoutService, host } = this.context;
    if (owns) return pinService.pin(this);
    if (pinService.owner() !== this) return;
    pinService.release(this);
    if (!layoutService.isHoverCapable()) return;
    this.hoverHold.set(pointerService.isOver(host));
  }
}
