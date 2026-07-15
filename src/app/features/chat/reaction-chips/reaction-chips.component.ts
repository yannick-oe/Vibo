/**
 * @file Reaction chips below a message bubble with visibility limits.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ReactionMap } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import {
  REACTION_DETAILS_TOOLTIP_ID,
  ReactionDetailsRequest,
  ReactionDetailsService,
} from '../reaction-details/reaction-details.service';
import { emojiAsset, emojiName } from '../emoji-catalog';

const DESKTOP_REACTION_LIMIT = 20;

/** One reaction chip: emoji plus the reacting uids. */
interface ReactionEntry {
  readonly emoji: string;
  readonly uids: string[];
}

/**
 * Reaction chips per the Figma frames: emoji + count pills below the
 * bubble, active styling for own reactions, a context-dependent visibility
 * limit with "+x weitere" / "Weniger anzeigen" pills and a trailing
 * add-reaction trigger. Hovering or keyboard-focusing a chip requests the
 * shared reaction-details tooltip naming the reactors (desktop only).
 */
@Component({
  selector: 'app-reaction-chips',
  templateUrl: './reaction-chips.component.html',
  styleUrl: './reaction-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactionChipsComponent implements OnDestroy {
  readonly reactions = input.required<ReactionMap>();

  readonly limit = input(DESKTOP_REACTION_LIMIT);

  readonly toggled = output<string>();

  readonly addRequested = output<void>();

  private readonly authService = inject(AuthService);

  private readonly detailsService = inject(ReactionDetailsService);

  protected readonly isExpanded = signal(false);

  protected readonly assetFor = emojiAsset;

  protected readonly nameFor = emojiName;

  protected readonly entries = computed<ReactionEntry[]>(() =>
    Object.entries(this.reactions())
      .filter(([, uids]) => uids.length > 0)
      .map(([emoji, uids]) => ({ emoji, uids }))
      .sort((a, b) => a.emoji.localeCompare(b.emoji)),
  );

  protected readonly visibleEntries = computed(() =>
    this.isExpanded() ? this.entries() : this.entries().slice(0, this.limit()),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.entries().length - this.limit()),
  );


  /**
   * Closes a tooltip still owned by this chip list when the message row
   * unmounts (context switch, deletion).
   */
  ngOnDestroy(): void {
    this.detailsService.closeFor(this);
  }


  /**
   * Reports whether the signed-in user reacted with this entry's emoji.
   * @param entry Reaction entry of the chip.
   */
  protected hasReacted(entry: ReactionEntry): boolean {
    const uid = this.authService.currentUser()?.uid;
    return uid !== undefined && entry.uids.includes(uid);
  }


  /**
   * Builds the chip's accessible toggle label using the emoji's name, with
   * the raw character as fallback for legacy keys outside the catalog.
   * @param entry Reaction entry of the chip.
   */
  protected reactionLabel(entry: ReactionEntry): string {
    return `Reaktion ${emojiName(entry.emoji) ?? entry.emoji} umschalten`;
  }


  /**
   * References the reaction-details tooltip while it is open for this chip,
   * per the ARIA tooltip pattern.
   * @param entry Reaction entry of the chip.
   */
  protected describedBy(entry: ReactionEntry): string | null {
    const details = this.detailsService.details();
    const isOpen = details?.owner === this && details.emoji === entry.emoji;
    return isOpen ? REACTION_DETAILS_TOOLTIP_ID : null;
  }


  /**
   * Requests the reaction-details tooltip after the hover-intent delay.
   * @param event Pointerenter event on the chip button.
   * @param entry Reaction entry of the chip.
   */
  protected onChipEnter(event: Event, entry: ReactionEntry): void {
    this.detailsService.requestOpen(this.detailsRequest(event, entry));
  }


  /**
   * Releases the tooltip with the grace period when the pointer leaves.
   */
  protected onChipLeave(): void {
    this.detailsService.requestClose();
  }


  /**
   * Opens the tooltip immediately on keyboard focus; pointer clicks (focus
   * without :focus-visible) keep the hover-intent behavior instead.
   * @param event Focus event on the chip button.
   * @param entry Reaction entry of the chip.
   */
  protected onChipFocus(event: Event, entry: ReactionEntry): void {
    const chip = event.currentTarget as HTMLElement;
    if (!chip.matches(':focus-visible')) return;
    this.detailsService.openNow(this.detailsRequest(event, entry));
  }


  /**
   * Closes the tooltip when the chip loses keyboard focus.
   */
  protected onChipBlur(): void {
    this.detailsService.closeNow();
  }


  /**
   * Builds the tooltip request for a chip: the live uids derive from the
   * reactions input so the open tooltip updates and auto-closes reactively.
   * @param event Event whose currentTarget is the chip button.
   * @param entry Reaction entry of the chip.
   */
  private detailsRequest(event: Event, entry: ReactionEntry): ReactionDetailsRequest {
    return {
      owner: this,
      emoji: entry.emoji,
      trigger: event.currentTarget as HTMLElement,
      uids: computed(() => this.reactions()[entry.emoji] ?? []),
    };
  }
}
