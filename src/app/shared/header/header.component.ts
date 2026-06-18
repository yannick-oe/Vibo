/**
 * @file Global page header with the Vibo brand and the register call-to-action.
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_NAME } from '../app.constants';

/**
 * Displays the brand logo top-left and a "Neu bei Vibo?" call-to-action
 * with a link to the registration page on the right. The call-to-action can
 * be hidden on screens that are part of the registration flow itself.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  protected readonly appName = APP_NAME;

  readonly shouldShowCta = input(true);
}
