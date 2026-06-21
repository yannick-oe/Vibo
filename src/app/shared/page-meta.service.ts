/**
 * @file Per-route document title and meta-description management with a
 * restore-to-default on page teardown.
 */
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const DEFAULT_TITLE = 'Vibo';
const DEFAULT_DESCRIPTION =
  'Vibo – Team-Chat mit Channels, Direktnachrichten, Threads und Reaktionen.';
const DESCRIPTION_NAME = 'description';


/**
 * Sets and restores the document title and meta description for pages that
 * need their own metadata, such as the public legal pages. Restoring on
 * teardown keeps a page's title from lingering after navigation.
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly titleService = inject(Title);

  private readonly meta = inject(Meta);


  /**
   * Applies a page-specific document title and meta description.
   * @param title Document title for the page.
   * @param description Meta-description content for the page.
   */
  set(title: string, description: string): void {
    this.titleService.setTitle(title);
    this.meta.updateTag({ name: DESCRIPTION_NAME, content: description });
  }


  /**
   * Restores the application's default title and meta description.
   */
  reset(): void {
    this.set(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  }
}
