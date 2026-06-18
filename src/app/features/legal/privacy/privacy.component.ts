/**
 * @file Privacy policy page with the DSGVO information sections.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Static full-width legal page describing how Vibo processes
 * personal data.
 */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements AfterViewInit {
  private readonly location = inject(Location);

  private readonly router = inject(Router);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Navigates back in browser history, falling back to the login page
   * when the privacy page was opened directly via deep link.
   */
  protected goBack(): void {
    const state = this.location.getState() as { navigationId?: number };
    if ((state.navigationId ?? 1) > 1) {
      this.location.back();
      return;
    }
    this.router.navigate(['/auth/login']);
  }
}
