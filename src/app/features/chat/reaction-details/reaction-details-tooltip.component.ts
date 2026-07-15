/**
 * @file Non-interactive reaction-details bubble ("who reacted") rendered once
 * per chat shell: positioned with the shared anchor math (flip + clamp),
 * pointer-events-free and explicitly NOT a dialog-shell surface — no scrim,
 * no focus trap, no open-stack entry. Content derives reactively from the
 * live reaction state, so it updates (and auto-closes) while open.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import { AuthService } from '../../../services/auth.service';
import { resolveAvatarStillSrc } from '../../../services/registration.service';
import {
  DialogAnchor,
  anchorToTrigger,
  placeVertically,
} from '../../../shared/dialog-shell/dialog-anchor';
import { emojiAsset } from '../emoji-catalog';
import { REACTION_DETAILS_TOOLTIP_ID, ReactionDetailsService } from './reaction-details.service';
import { ReactorLookupService } from './reactor-lookup.service';

const SELF_LABEL = 'Du';

const UNKNOWN_REACTOR = 'Unbekannt';

const REACTION_NAMES_MAX = 5;

const PLACED_CLASS = 'bubble--placed';

/** Render model of the visible tooltip. */
interface TooltipView {
  /** Unicode reaction key, rendered as text fallback for legacy keys. */
  readonly emoji: string;
  /** Twemoji asset path, or empty for keys outside the catalog. */
  readonly asset: string;
  /** Capped reactor uids shown by name, viewer first. */
  readonly visibleUids: readonly string[];
  /** Reactors beyond the cap, summarized as "und X weitere". */
  readonly hiddenCount: number;
}

/**
 * Tooltip overlay for reaction chips: the reaction emoji, small avatar
 * stills and the resolved reactor names (viewer first as "Du", capped with
 * an "und X weitere" summary). Anchored to the hovered chip via
 * anchorToTrigger/placeVertically so it never leaves the viewport; closes on
 * any scroll while open.
 */
@Component({
  selector: 'app-reaction-details-tooltip',
  templateUrl: './reaction-details-tooltip.component.html',
  styleUrl: './reaction-details-tooltip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactionDetailsTooltipComponent {
  private readonly detailsService = inject(ReactionDetailsService);

  private readonly lookupService = inject(ReactorLookupService);

  private readonly authService = inject(AuthService);

  private readonly bubbleRef = viewChild<ElementRef<HTMLDivElement>>('bubble');

  protected readonly tooltipId = REACTION_DETAILS_TOOLTIP_ID;

  protected readonly view = computed<TooltipView | null>(() => this.buildView());

  protected readonly namesText = computed<string>(() => this.buildNamesText());


  /**
   * Wires the reactive side effects: one-shot profile loading for the capped
   * visible uids, auto-close on emptied reactions and on any scroll, and
   * anchor placement against the measured bubble after each render.
   */
  constructor() {
    effect(() => this.ensureVisibleProfiles());
    effect(() => this.closeWhenEmpty());
    effect(onCleanup => this.closeOnScroll(onCleanup));
    afterRenderEffect(() => this.placeBubble());
  }


  /**
   * Resolves a reactor's avatar still for the stacked mini avatars; unknown
   * uids fall back to the neutral placeholder still.
   * @param uid Uid of the reacting user.
   */
  protected avatarSrcFor(uid: string): string {
    return resolveAvatarStillSrc(this.lookupService.profileFor(uid)?.avatarPath);
  }


  /**
   * Builds the render model from the active request: live uids ordered
   * viewer-first, capped at the names maximum; null while hidden or once the
   * reaction emptied.
   */
  private buildView(): TooltipView | null {
    const details = this.detailsService.details();
    if (!details) return null;
    const uids = details.uids();
    if (uids.length === 0) return null;
    const ordered = this.orderSelfFirst(uids);
    const visibleUids = ordered.slice(0, REACTION_NAMES_MAX);
    return {
      emoji: details.emoji,
      asset: emojiAsset(details.emoji),
      visibleUids,
      hiddenCount: ordered.length - visibleUids.length,
    };
  }


  /**
   * Moves the signed-in viewer to the front of the reactor list so the names
   * line always starts with "Du".
   * @param uids Live reacting uids in stored order.
   */
  private orderSelfFirst(uids: readonly string[]): readonly string[] {
    const selfUid = this.authService.currentUser()?.uid;
    if (selfUid === undefined || !uids.includes(selfUid)) return uids;
    return [selfUid, ...uids.filter(uid => uid !== selfUid)];
  }


  /**
   * Formats the visible reactor names ("Du, Gast und Alice"), appending the
   * "und X weitere" summary when reactors exceed the cap.
   */
  private buildNamesText(): string {
    const view = this.view();
    if (!view) return '';
    const names = view.visibleUids.map(uid => this.nameFor(uid));
    if (view.hiddenCount > 0) return `${names.join(', ')} und ${view.hiddenCount} weitere`;
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  }


  /**
   * Resolves a uid to its display name; the viewer reads "Du", unresolved
   * or deleted accounts read "Unbekannt".
   * @param uid Uid of the reacting user.
   */
  private nameFor(uid: string): string {
    if (uid === this.authService.currentUser()?.uid) return SELF_LABEL;
    return this.lookupService.profileFor(uid)?.name ?? UNKNOWN_REACTOR;
  }


  /**
   * Requests one-shot profile fetches for the capped visible uids only —
   * hidden reactors behind "und X weitere" are never fetched.
   */
  private ensureVisibleProfiles(): void {
    const view = this.view();
    if (view) this.lookupService.ensureLoaded(view.visibleUids);
  }


  /**
   * Closes the tooltip once the live reaction it describes has no reactors
   * left (its chip is about to unmount).
   */
  private closeWhenEmpty(): void {
    const details = this.detailsService.details();
    if (details && details.uids().length === 0) this.detailsService.closeNow();
  }


  /**
   * Closes the tooltip on any scroll anywhere (capture phase) while it is
   * open, since the anchored position goes stale with the message window.
   * @param onCleanup Effect cleanup registering the listener removal.
   */
  private closeOnScroll(onCleanup: (fn: () => void) => void): void {
    if (!this.detailsService.details()) return;
    const close = (): void => this.detailsService.closeNow();
    window.addEventListener('scroll', close, { capture: true, passive: true });
    onCleanup(() => window.removeEventListener('scroll', close, { capture: true }));
  }


  /**
   * Anchors the rendered bubble to its trigger with the shared flip/clamp
   * math after each render, re-measuring when the names line changes; a
   * trigger that left the DOM or lost its anchor closes the tooltip.
   */
  private placeBubble(): void {
    const element = this.bubbleRef()?.nativeElement;
    const details = this.detailsService.details();
    this.namesText();
    if (!element || !details) return;
    if (!details.trigger.isConnected) return this.detailsService.closeNow();
    const anchor = anchorToTrigger(details.trigger);
    if (!anchor) return this.detailsService.closeNow();
    applyAnchor(element, placeVertically(anchor, element.offsetHeight));
  }
}


/**
 * Writes the resolved anchor to the fixed-positioned bubble and reveals it;
 * the placed class gates the fade-in so the bubble is never visible at an
 * unmeasured position.
 * @param element Bubble element to position.
 * @param anchor Resolved anchor after vertical placement.
 */
function applyAnchor(element: HTMLElement, anchor: DialogAnchor): void {
  element.style.top = anchor.top !== undefined ? `${anchor.top}px` : 'auto';
  element.style.bottom = anchor.bottom !== undefined ? `${anchor.bottom}px` : 'auto';
  element.style.left = anchor.left !== undefined ? `${anchor.left}px` : 'auto';
  element.style.right = anchor.right !== undefined ? `${anchor.right}px` : 'auto';
  element.classList.add(PLACED_CLASS);
}
