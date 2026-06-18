/**
 * @file Imprint page with operator and contact information.
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
 * Static legal page identifying the DABubble operators. The back arrow
 * returns to the previous page, falling back to the login screen.
 */
@Component({
  selector: 'app-imprint',
  templateUrl: './imprint.component.html',
  styleUrl: './imprint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImprintComponent implements AfterViewInit {
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
   * when the imprint was opened directly via deep link.
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
