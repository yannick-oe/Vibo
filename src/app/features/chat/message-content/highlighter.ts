/**
 * @file Deferred syntax highlighter. Imports highlight.js core plus only the
 * curated language subset and registers them, then highlights the text of each
 * code block in sanitized Markdown HTML. Reached exclusively through a dynamic
 * import() so highlight.js never enters the initial bundle and loads only when
 * a message actually contains a fenced code block.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import { resolveLanguage } from './code-languages';

const LANGUAGE_CLASS = /^language-([\w-]+)$/;

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);


/**
 * Reads the fence language token from a code element's `language-*` class.
 * @param code Code element produced by the Markdown pipeline.
 */
function fenceOf(code: Element): string {
  return code.className.match(LANGUAGE_CLASS)?.[1] ?? '';
}


/**
 * Replaces a code element's plain text with highlighted markup. highlight.js
 * escapes HTML, so no user string is ever interpreted as HTML; unknown or
 * missing languages auto-detect and illegal syntax is ignored (never throws).
 * @param code Code element whose text content is highlighted in place.
 */
function highlightInto(code: Element): void {
  const language = resolveLanguage(fenceOf(code));
  const text = code.textContent ?? '';
  const result = language
    ? hljs.highlight(text, { language: language.id, ignoreIllegals: true })
    : hljs.highlightAuto(text);
  code.innerHTML = result.value;
}


/**
 * Highlights the text of every fenced code block in sanitized Markdown HTML,
 * returning the recoloured HTML. The block chrome is untouched.
 * @param html Sanitized Markdown HTML that already carries the block chrome.
 */
export function highlightCodeBlocks(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('.code-block__pre code').forEach(highlightInto);
  return template.innerHTML;
}
