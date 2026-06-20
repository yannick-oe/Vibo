/**
 * @file Presentational name renderer that optionally fills the display name
 * with an animated aurora gradient (background-clip:text) in the cosmic
 * palette. The gradient stops are AA-legible tokens in both themes; under
 * reduced motion it renders a static gradient (no flow). When not animated the
 * name is plain and inherits the consumer's colour.
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders `name`; with `isAnimated` the text becomes a flowing aurora gradient.
 * Use it inside the consumer's styled name element (it inherits the font).
 */
@Component({
  selector: 'app-aurora-name',
  template: '<span class="aurora-name" [class.aurora-name--animated]="isAnimated()">{{ name() }}</span>',
  styleUrl: './aurora-name.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuroraNameComponent {
  readonly name = input('');

  readonly isAnimated = input(false);
}
