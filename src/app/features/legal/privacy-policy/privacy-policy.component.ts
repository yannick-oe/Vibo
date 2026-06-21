/**
 * @file Privacy policy (Datenschutzerklärung) page with the DSGVO sections.
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

const PAGE_TITLE = 'Datenschutzerklärung · Vibo';
const PAGE_DESCRIPTION =
  'Datenschutzerklärung von Vibo – Verarbeitung personenbezogener Daten nach DSGVO und DSG.';


/**
 * Static legal page describing how Vibo processes personal data. The back
 * arrow links straight to the login screen, regardless of how the page was
 * reached.
 */
@Component({
  selector: 'app-privacy-policy',
  imports: [RouterLink],
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyComponent implements OnInit, AfterViewInit, OnDestroy {
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
