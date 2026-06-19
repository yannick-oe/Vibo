/**
 * @file Emoji picker popover with the predefined Twemoji set. In a reaction
 * context it leads with a highlighted "Große Reaktionen" section above the
 * main grid; in the composer it shows the full flat grid for text insertion.
 */
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';

import { BIG_REACTION_EMOJIS } from '../../../models/reactions';
import { EMOJI_SET, GRID_EMOJI_SET, emojiAsset, emojiName, reactionTriggerLabel } from '../emoji-catalog';

/**
 * Popover with the predefined Twemoji emoji grid, shared by the reaction
 * flows and the composer. When reacting it surfaces the big reactions in a
 * labelled section above a divider; the rest of the catalog forms the grid.
 * Emits the picked emoji character and closes on Escape or any click outside;
 * the opening component positions it and restores focus.
 */
@Component({
  selector: 'app-emoji-picker',
  templateUrl: './emoji-picker.component.html',
  styleUrl: './emoji-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class EmojiPickerComponent {
  private static instanceCounter = 0;

  readonly picked = output<string>();

  readonly closed = output<void>();

  readonly isReactionTrigger = input(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly bigEmojis = BIG_REACTION_EMOJIS;

  protected readonly gridEmojis = computed(() =>
    this.isReactionTrigger() ? GRID_EMOJI_SET : EMOJI_SET,
  );

  protected readonly headingId = `big-reactions-${EmojiPickerComponent.instanceCounter++}`;

  protected readonly assetFor = emojiAsset;

  protected readonly nameFor = emojiName;


  /**
   * Accessible label of an emoji button: the reaction-trigger phrasing
   * ("Mit … reagieren") when reacting to a message, the plain emoji name when
   * inserting into text.
   * @param emoji Emoji character of the button.
   */
  protected labelFor(emoji: string): string {
    return this.isReactionTrigger() ? reactionTriggerLabel(emoji) : emojiName(emoji) ?? emoji;
  }


  /**
   * Closes the picker when a click lands outside of it. Openers stop the
   * propagation of their own toggle click.
   * @param event Document-level click event.
   */
  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closed.emit();
  }
}
