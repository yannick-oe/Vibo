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

const CODE_BLOCK_CLASS = 'code-block__pre';

const COPY_BUTTON_CLASS = 'code-block__copy';

const COPIED_CLASS = 'code-block__copy--copied';

const COPY_STATUS = 'Kopiert';

const COPY_FEEDBACK_MS = 1500;


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
  host: {
    '(click)': 'onContentClick($event)',
  },
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
      const chrome = enhanceMessageHtml(await renderMarkdown(text), userNames);
      if (token !== this.renderToken) return;
      this.rendered.set(this.sanitizer.bypassSecurityTrustHtml(chrome));
      if (chrome.includes(CODE_BLOCK_CLASS)) await this.highlight(chrome, token);
    } catch {
      if (token === this.renderToken) this.rendered.set(null);
    }
  }


  /**
   * Lazily loads the highlighter (a deferred chunk reached only when a message
   * has a fenced block) and recolours the code text; on failure the
   * already-rendered, un-highlighted chrome is kept.
   * @param chrome Sanitized HTML that already carries the block chrome.
   * @param token Render token guarding against stale results.
   */
  private async highlight(chrome: string, token: number): Promise<void> {
    try {
      const { highlightCodeBlocks } = await import('./highlighter');
      if (token !== this.renderToken) return;
      this.rendered.set(this.sanitizer.bypassSecurityTrustHtml(highlightCodeBlocks(chrome)));
    } catch {
      return;
    }
  }


  /**
   * Copies a code block's raw text when its copy button is activated (mouse or
   * keyboard); other clicks are ignored.
   * @param event Click event bubbled from the rendered content.
   */
  protected onContentClick(event: Event): void {
    const target = event.target;
    const button = target instanceof Element ? target.closest(`.${COPY_BUTTON_CLASS}`) : null;
    if (button instanceof HTMLElement) void this.copyCode(button);
  }


  /**
   * Writes the raw code text (not the highlighted markup) to the clipboard and
   * flashes the "Kopiert" feedback on success.
   * @param button Activated copy button.
   */
  private async copyCode(button: HTMLElement): Promise<void> {
    const pre = button.closest('.code-block')?.querySelector(`.${CODE_BLOCK_CLASS}`);
    try {
      await navigator.clipboard.writeText(pre?.textContent ?? '');
      this.flashCopied(button);
    } catch {
      return;
    }
  }


  /**
   * Briefly shows the "Kopiert" feedback: filling the `role="status"` region
   * announces it to assistive tech, while the CSS reveal respects
   * prefers-reduced-motion.
   * @param button Copy button to flash.
   */
  private flashCopied(button: HTMLElement): void {
    const status = button.querySelector('.code-block__copy-status');
    if (!(status instanceof HTMLElement)) return;
    status.textContent = COPY_STATUS;
    button.classList.add(COPIED_CLASS);
    setTimeout(() => this.resetCopied(button, status), COPY_FEEDBACK_MS);
  }


  /**
   * Hides the copy feedback and clears the status text so the next copy is
   * announced again.
   * @param button Copy button to reset.
   * @param status Live status region to clear.
   */
  private resetCopied(button: HTMLElement, status: HTMLElement): void {
    button.classList.remove(COPIED_CLASS);
    status.textContent = '';
  }
}
