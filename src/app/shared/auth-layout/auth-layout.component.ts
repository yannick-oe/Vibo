/**
 * @file Shared page shell for all auth screens: header, centered content, footer.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

const LOGIN_URL_FRAGMENT = '/auth/login';

/**
 * Renders the auth page frame and centers the routed card. The header
 * call-to-action is only shown on the login screen.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  private readonly router = inject(Router);

  protected readonly shouldShowCta = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects.includes(LOGIN_URL_FRAGMENT)),
    ),
    { initialValue: this.router.url.includes(LOGIN_URL_FRAGMENT) },
  );
}
