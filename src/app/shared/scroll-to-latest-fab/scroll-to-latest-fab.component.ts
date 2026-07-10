/**
 * @file Floating "jump to latest" button shown above the composer of a chat
 * scroll region. Presentational: the owning list decides when it is visible and
 * how many messages arrived while the user was scrolled up; this component only
 * renders the circle, the arrival-count badge and emits the jump request. The
 * badge reserves its geometry and the host stays out of flow, so it never shifts
 * the layout (CLS 0).
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

const COUNT_CAP = 99;
const COUNT_CAP_LABEL = '99+';

/**
 * Circular scroll-to-latest button with an arrival-count badge. Focusable and
 * clickable only while visible; hidden it is inert (aria-hidden, not tabbable).
 */
@Component({
  selector: 'app-scroll-to-latest-fab',
  templateUrl: './scroll-to-latest-fab.component.html',
  styleUrl: './scroll-to-latest-fab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollToLatestFabComponent {
  readonly visible = input(false);

  readonly count = input(0);

  readonly jump = output<void>();

  protected readonly badgeLabel = computed(() =>
    this.count() > COUNT_CAP ? COUNT_CAP_LABEL : String(this.count()),
  );
}
