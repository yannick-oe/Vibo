/**
 * @file Default /app child: redirects to the user's first channel.
 */
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ChannelService } from '../../../services/channel.service';
import { LayoutService } from '../../../services/layout.service';

const SORT_LOCALE = 'de';

/**
 * Rendered at /app while no channel is selected. On desktop it redirects
 * to the alphabetically first channel once the stream has loaded; users
 * without channels stay on the empty chat card. On mobile /app stays the
 * full-screen menu view, so no redirect happens there.
 */
@Component({
  selector: 'app-channel-redirect',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelRedirectComponent {
  private readonly channelService = inject(ChannelService);

  private readonly layoutService = inject(LayoutService);

  private readonly router = inject(Router);


  /**
   * Watches the channel stream and performs the one-time redirect.
   */
  constructor() {
    effect(() => this.redirectToFirstChannel());
  }


  /**
   * Navigates to the alphabetically first channel once channels are loaded.
   */
  private redirectToFirstChannel(): void {
    if (this.layoutService.isMobile()) return;
    if (!this.channelService.hasLoadedChannels()) return;
    const first = [...this.channelService.channels()].sort((a, b) =>
      a.name.localeCompare(b.name, SORT_LOCALE),
    )[0];
    if (!first) return;
    this.router.navigate(['/app/channel', first.id], { replaceUrl: true });
  }
}
