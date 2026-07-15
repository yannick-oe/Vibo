/**
 * @file Hover-intent state for the reaction-details tooltip: which reaction
 * chip is hovered or keyboard-focused, with an open delay and a close grace
 * period so the bubble neither flickers on drive-by pointers nor vanishes
 * while the pointer moves between adjacent chips. Desktop only — every entry
 * point is gated on the hover-capable pointer, so touch behavior (tap toggles
 * the reaction) is untouched.
 */
import { Injectable, Signal, inject, signal } from '@angular/core';

import { LayoutService } from '../../../services/layout.service';

export const REACTION_DETAILS_TOOLTIP_ID = 'reaction-details-tooltip';

const HOVER_OPEN_DELAY_MS = 350;

const HOVER_CLOSE_GRACE_MS = 150;

/** Reaction chip a details tooltip is requested for. */
export interface ReactionDetailsRequest {
  /** Component instance owning the chip; lets unmounts close their tooltip. */
  readonly owner: object;
  /** Unicode reaction key of the chip. */
  readonly emoji: string;
  /** Live reacting uids; the tooltip re-renders and auto-closes from these. */
  readonly uids: Signal<readonly string[]>;
  /** Chip button element the bubble is anchored to. */
  readonly trigger: HTMLElement;
}

/**
 * Single source of truth for the one reaction-details tooltip: chips request
 * open/close transitions here, the tooltip overlay renders whatever request
 * is active. Deliberately not a dialog-shell surface — no scrim, no focus
 * trap, no open-stack entry.
 */
@Injectable({ providedIn: 'root' })
export class ReactionDetailsService {
  private readonly layoutService = inject(LayoutService);

  private readonly state = signal<ReactionDetailsRequest | null>(null);

  /** Currently shown tooltip request, or null while hidden. */
  readonly details = this.state.asReadonly();

  private openTimer: number | null = null;

  private closeTimer: number | null = null;

  private pending: ReactionDetailsRequest | null = null;


  /**
   * Schedules the tooltip to open after the hover-intent delay; a pointer
   * that leaves before the delay elapses never opens it. No-op on devices
   * without a hover-capable pointer.
   * @param request Chip the tooltip is requested for.
   */
  requestOpen(request: ReactionDetailsRequest): void {
    if (!this.layoutService.isHoverCapable()) return;
    this.cancelClose();
    this.cancelOpen();
    this.pending = request;
    this.openTimer = window.setTimeout(() => this.openPending(), HOVER_OPEN_DELAY_MS);
  }


  /**
   * Opens the tooltip immediately (keyboard focus). No-op on devices without
   * a hover-capable pointer.
   * @param request Chip the tooltip is requested for.
   */
  openNow(request: ReactionDetailsRequest): void {
    if (!this.layoutService.isHoverCapable()) return;
    this.cancelOpen();
    this.cancelClose();
    this.state.set(request);
  }


  /**
   * Schedules the tooltip to close after a short grace period, cancelling any
   * pending open — re-entering a chip within the grace keeps it open.
   */
  requestClose(): void {
    this.cancelOpen();
    if (this.state() === null) return;
    this.closeTimer = window.setTimeout(() => this.closeNow(), HOVER_CLOSE_GRACE_MS);
  }


  /**
   * Closes the tooltip immediately and cancels every pending transition
   * (blur, scroll, emptied reaction, unmount).
   */
  closeNow(): void {
    this.cancelOpen();
    this.cancelClose();
    if (this.state() !== null) this.state.set(null);
  }


  /**
   * Closes the tooltip and drops any pending open if they belong to the given
   * owning component; called from the owners' destroy hooks.
   * @param owner Component instance whose chips are unmounting.
   */
  closeFor(owner: object): void {
    if (this.pending?.owner === owner) this.cancelOpen();
    if (this.state()?.owner === owner) this.closeNow();
  }


  /**
   * Promotes the pending request to the visible tooltip once the hover delay
   * elapsed; skipped when the chip left the DOM or its reactions emptied.
   */
  private openPending(): void {
    this.openTimer = null;
    const request = this.pending;
    this.pending = null;
    if (!request || !request.trigger.isConnected) return;
    if (request.uids().length === 0) return;
    this.state.set(request);
  }


  /**
   * Cancels a scheduled open and forgets the pending request.
   */
  private cancelOpen(): void {
    if (this.openTimer !== null) window.clearTimeout(this.openTimer);
    this.openTimer = null;
    this.pending = null;
  }


  /**
   * Cancels a scheduled grace-period close.
   */
  private cancelClose(): void {
    if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}
