/**
 * @file Privacy policy page with the DSGVO information sections.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Static legal page describing how Vibo processes personal data. The back
 * arrow links straight to the login screen, regardless of how the page was
 * reached.
 */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements AfterViewInit {
  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }
}
