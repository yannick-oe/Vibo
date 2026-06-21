/**
 * @file Renders message text as sanitized Markdown (display side only). The
 * composer stays plain text; here the parser + sanitizer load lazily, and until
 * they do the text renders as the existing safe emoji/mention segments.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { UserService } from '../../../services/user.service';
import { buildMessageSegments } from '../message-segments';
import { enhanceMessageHtml } from './message-enhance';
import { renderMarkdown } from './markdown';


/**
 * Compares two name lists so the user-name signal only emits on real changes.
 * @param a Previous name list.
 * @param b Next name list.
 */
function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}


/**
 * Presentational message body. Renders `text` as Markdown — bold/italic/strike,
 * inline and fenced code, links, lists, blockquotes — once the lazy parser and
 * sanitizer load; Twemoji emoji and @mentions are re-applied to the sanitized
 * output. Binding the result via bypassSecurityTrustHtml is safe because
 * DOMPurify's allow-list ran first and only our own trusted emoji/mention nodes
 * are added afterwards.
 */
@Component({
  selector: 'app-message-content',
  templateUrl: './message-content.component.html',
  styleUrl: './message-content.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageContentComponent {
  readonly text = input.required<string>();

  private readonly userService = inject(UserService);

  private readonly sanitizer = inject(DomSanitizer);

  private renderToken = 0;

  private readonly userNames = computed(() => this.userService.users().map(user => user.name), {
    equal: sameNames,
  });

  protected readonly segments = computed(() => buildMessageSegments(this.text(), this.userNames()));

  protected readonly rendered = signal<SafeHtml | null>(null);


  /**
   * Re-renders the Markdown whenever the text or the known user names change.
   */
  constructor() {
    effect(() => void this.render(this.text(), this.userNames()));
  }


  /**
   * Runs the lazy Markdown pipeline and publishes the trusted result; only the
   * latest run is applied, and any failure clears it so the segment fallback
   * stays visible. Whitespace-only text renders nothing extra.
   * @param text Raw message text.
   * @param userNames Known display names for mention detection.
   */
  private async render(text: string, userNames: string[]): Promise<void> {
    const token = ++this.renderToken;
    if (!text.trim()) return this.rendered.set(null);
    try {
      const html = enhanceMessageHtml(await renderMarkdown(text), userNames);
      if (token === this.renderToken) this.rendered.set(this.sanitizer.bypassSecurityTrustHtml(html));
    } catch {
      if (token === this.renderToken) this.rendered.set(null);
    }
  }
}
