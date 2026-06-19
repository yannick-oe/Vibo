/**
 * @file Imprint page with operator and contact information.
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
 * Static legal page identifying the Vibo operators. The back arrow links
 * straight to the login screen, regardless of how the page was reached.
 */
@Component({
  selector: 'app-imprint',
  imports: [RouterLink],
  templateUrl: './imprint.component.html',
  styleUrl: './imprint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImprintComponent implements AfterViewInit {
  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }
}
