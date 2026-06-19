/**
 * @file Reaction chips below a message bubble with visibility limits.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ReactionMap } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { emojiAsset, emojiName } from '../emoji-catalog';

const SELF_LABEL = 'Du';
const UNKNOWN_REACTOR = 'Unbekannt';
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
 * add-reaction trigger. Chip hover/focus shows a small tooltip naming the
 * reactors (no Figma counterpart — minimal and token-based).
 */
@Component({
  selector: 'app-reaction-chips',
  templateUrl: './reaction-chips.component.html',
  styleUrl: './reaction-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactionChipsComponent {
  readonly reactions = input.required<ReactionMap>();

  readonly limit = input(DESKTOP_REACTION_LIMIT);

  readonly toggled = output<string>();

  readonly addRequested = output<void>();

  private readonly authService = inject(AuthService);

  private readonly userService = inject(UserService);

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
   * Resolves the reactor names for the tooltip; the signed-in user is
   * shown as "Du".
   * @param entry Reaction entry of the chip.
   */
  protected reactorNames(entry: ReactionEntry): string {
    const selfUid = this.authService.currentUser()?.uid;
    const users = this.userService.users();
    return entry.uids
      .map(uid =>
        uid === selfUid ? SELF_LABEL : (users.find(user => user.uid === uid)?.name ?? UNKNOWN_REACTOR),
      )
      .join(', ');
  }
}
