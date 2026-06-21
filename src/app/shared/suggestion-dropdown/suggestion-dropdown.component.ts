/**
 * @file Generic listbox dropdown for mention and address suggestions.
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AvatarFallbackDirective } from '../avatar/avatar-fallback.directive';

/** One selectable suggestion row. */
export interface Suggestion {
  /** Stable id (uid or channel id). */
  readonly id: string;
  /** Display label (user name or channel name). */
  readonly label: string;
  /** Avatar asset URL for user rows. */
  readonly avatar?: string;
  /** Renders the channel hash icon instead of an avatar. */
  readonly isHash?: boolean;
  /** Online presence of a user row; omitted for channel rows. */
  readonly online?: boolean;
}

/**
 * Listbox per the Figma component sheet: avatar or hash rows with hover
 * and active states. Keyboard handling stays in the owning input; the
 * active option is controlled via activeIndex and exposed through option
 * ids for aria-activedescendant.
 */
@Component({
  selector: 'app-suggestion-dropdown',
  imports: [AvatarFallbackDirective],
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
