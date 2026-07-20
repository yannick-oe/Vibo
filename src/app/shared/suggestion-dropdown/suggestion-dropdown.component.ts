/**
 * @file Generic listbox dropdown for mention and address suggestions.
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AvatarFallbackDirective } from '../avatar/avatar-fallback.directive';
import { PresenceDotComponent } from '../presence-dot/presence-dot.component';

/** One selectable suggestion row. */
export interface Suggestion {
  /** Stable id (uid, channel id or the emoji character itself). */
  readonly id: string;
  /** Display label (user name, channel name or German emoji name). */
  readonly label: string;
  /** Avatar asset URL for user rows. */
  readonly avatar?: string;
  /** Renders the channel hash icon instead of an avatar. */
  readonly isHash?: boolean;
  /** Twemoji SVG URL for emoji rows. */
  readonly emojiSrc?: string;
  /** Uid whose live presence the row shows; omitted for channel rows. */
  readonly presenceUid?: string;
}

/**
 * Listbox per the Figma component sheet: avatar or hash rows with hover
 * and active states. Keyboard handling stays in the owning input; the
 * active option is controlled via activeIndex and exposed through option
 * ids for aria-activedescendant.
 */
@Component({
  selector: 'app-suggestion-dropdown',
  imports: [AvatarFallbackDirective, PresenceDotComponent],
  templateUrl: './suggestion-dropdown.component.html',
  styleUrl: './suggestion-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestionDropdownComponent {
  readonly suggestions = input.required<Suggestion[]>();

  readonly activeIndex = input(0);

  readonly idPrefix = input.required<string>();

  readonly picked = output<Suggestion>();
}
