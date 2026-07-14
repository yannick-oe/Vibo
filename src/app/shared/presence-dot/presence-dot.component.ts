/**
 * @file Shared avatar presence indicator: one bottom-right anchored dot with
 * one size formula (proportional to the avatar box, capped at the topbar
 * reference size) and a German visually-hidden state label, so every surface
 * renders and announces presence identically — never color-only. Hosts place
 * it inside an avatar wrap styled with the avatar-status-wrap mixin.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { PresenceService, PresenceState } from '../../services/presence.service';

const STATE_LABELS: Record<PresenceState, string> = {
  online: 'Online',
  away: 'Abwesend',
  offline: 'Offline',
};

/**
 * Presence dot for one user, anchored to the bottom-right of the avatar it
 * shares its positioned wrap with. The dot sizes itself relative to that
 * wrap, so no consuming surface carries pixel offsets of its own; away and
 * offline render muted with distinct screen-reader labels.
 */
@Component({
  selector: 'app-presence-dot',
  template: '<span class="sr-only">{{ label() }}</span>',
  styleUrl: './presence-dot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.presence-dot--away]': "state() === 'away'",
    '[class.presence-dot--offline]': "state() === 'offline'",
  },
})
export class PresenceDotComponent {
  readonly uid = input.required<string>();

  private readonly presenceService = inject(PresenceService);

  protected readonly state = computed(() => this.presenceService.stateFor(this.uid()));

  protected readonly label = computed(() => STATE_LABELS[this.state()]);
}
