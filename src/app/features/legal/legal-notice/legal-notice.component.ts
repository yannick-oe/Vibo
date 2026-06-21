/**
 * @file Imprint (Impressum) page with operator and contact information.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PageMetaService } from '../../../shared/page-meta.service';

const PAGE_TITLE = 'Impressum · Vibo';
const PAGE_DESCRIPTION =
  'Impressum von Vibo – Anbieterkennzeichnung nach § 5 ECG und § 25 MedienG.';


/**
 * Static legal page identifying the Vibo operator (Impressum). The back
 * arrow links straight to the login screen, regardless of how the page was
 * reached.
 */
@Component({
  selector: 'app-legal-notice',
  imports: [RouterLink],
  templateUrl: './legal-notice.component.html',
  styleUrl: './legal-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalNoticeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('title');

  private readonly pageMeta = inject(PageMetaService);


  /**
   * Applies the page-specific document title and meta description.
   */
  ngOnInit(): void {
    this.pageMeta.set(PAGE_TITLE, PAGE_DESCRIPTION);
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.heading()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Restores the default document metadata when leaving the page.
   */
  ngOnDestroy(): void {
    this.pageMeta.reset();
  }
}
