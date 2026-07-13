/**
 * @file Loading-skeleton placeholder: renders a fixed number of shimmering
 * placeholder rows whose reserved heights mirror the real rows they stand in
 * for, so swapping in real content causes no layout shift (CLS 0). The shimmer
 * is a GPU-only sweep (see the `skeleton-shimmer` mixin) that collapses to a
 * static block under reduced motion. The container announces itself as a busy
 * status region; the placeholder blocks are decorative and aria-hidden.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Shape of the real rows a skeleton stands in for. */
export type SkeletonVariant = 'message' | 'list-row' | 'notification';

const DEFAULT_COUNT = 3;

const LOADING_LABELS: Record<SkeletonVariant, string> = {
  message: 'Nachrichten werden geladen',
  'list-row': 'Liste wird geladen',
  notification: 'Benachrichtigungen werden geladen',
};

/**
 * Presentational loading skeleton. The variant selects the row template
 * (chat message, list row, or notification row) and the count sets how many
 * placeholder rows to reserve.
 */
@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'skeleton',
    role: 'status',
    '[attr.aria-busy]': 'true',
    '[class.skeleton--message]': "variant() === 'message'",
    '[class.skeleton--notification]': "variant() === 'notification'",
  },
})
export class SkeletonComponent {
  readonly variant = input.required<SkeletonVariant>();

  readonly count = input(DEFAULT_COUNT);

  protected readonly rows = computed(() => Array.from({ length: this.count() }));

  protected readonly loadingLabel = computed(() => LOADING_LABELS[this.variant()]);
}
