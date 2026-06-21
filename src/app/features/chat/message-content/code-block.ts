/**
 * @file Builds the chrome around each fenced code block (surface, header with
 * a language label and a copy button) as plain DOM, so the block renders fully
 * before the deferred highlighter loads — the highlighter then only recolours
 * the code text, with no reflow. Copy is handled by the message content
 * component via event delegation on the copy button.
 */
import { languageLabel } from './code-languages';

const LANGUAGE_CLASS = /^language-([\w-]+)$/;

const COPY_LABEL = 'Code kopieren';

const COPY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';


/**
 * Wraps every fenced code block in the document fragment with its chrome.
 * @param root Parsed Markdown fragment.
 */
export function enhanceCodeBlocks(root: DocumentFragment): void {
  root.querySelectorAll('pre').forEach(buildCodeBlock);
}


/**
 * Wraps a single `<pre>` in a `.code-block` with a header; skips a `<pre>`
 * that has no `<code>` child.
 * @param pre Preformatted block from the sanitized Markdown.
 */
function buildCodeBlock(pre: HTMLPreElement): void {
  const code = pre.querySelector('code');
  if (!code) return;
  const block = document.createElement('div');
  block.className = 'code-block';
  pre.before(block);
  block.appendChild(codeHeader(fenceOf(code)));
  pre.className = 'code-block__pre';
  block.appendChild(pre);
}


/**
 * Reads the fence language token from a code element's `language-*` class.
 * @param code Code element of the block.
 */
function fenceOf(code: Element): string {
  return code.className.match(LANGUAGE_CLASS)?.[1] ?? '';
}


/**
 * Builds the header bar with the language label and the copy button.
 * @param fence Fence language token used to resolve the label.
 */
function codeHeader(fence: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'code-block__header';
  header.appendChild(labelNode(languageLabel(fence)));
  header.appendChild(copyButton());
  return header;
}


/**
 * Builds the language label node.
 * @param text Display label of the language.
 */
function labelNode(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'code-block__label';
  span.textContent = text;
  return span;
}


/**
 * Builds the copy button (icon + the visually-revealed "Kopiert" status).
 */
function copyButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'code-block__copy';
  button.type = 'button';
  button.setAttribute('aria-label', COPY_LABEL);
  button.innerHTML = COPY_ICON;
  button.appendChild(copyStatus());
  return button;
}


/**
 * Builds the live status region whose text the component fills on a successful
 * copy, so the "Kopiert" feedback is both shown and announced.
 */
function copyStatus(): HTMLElement {
  const status = document.createElement('span');
  status.className = 'code-block__copy-status';
  status.setAttribute('role', 'status');
  return status;
}
