/**
 * @file Lazily-loaded Markdown rendering pipeline for message display. The
 * parser (marked, extended with Discord-style ||spoiler|| runs) does NOT
 * sanitize, so its output is always run through DOMPurify with a strict
 * allow-list before it can reach the DOM.
 */
import type { Token, TokenizerAndRendererExtension, Tokens } from 'marked';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'code',
  'pre',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'span',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'data-spoiler'];

const SPOILER_PATTERN = /^\|\|([\s\S]+?)\|\|/;

/**
 * marked inline extension for ||spoiler|| runs. Tokenized after code spans
 * (marked consumes a code span atomically, so `||` inside backticks stays
 * literal) and before emphasis, whose syntax still applies INSIDE the spoiler
 * via the nested inline tokens. An unclosed `||` never matches and renders
 * literally. Emits an inert `<span data-spoiler>`; the enhance step upgrades
 * it to the interactive button after sanitization.
 */
const SPOILER_EXTENSION: TokenizerAndRendererExtension = {
  name: 'spoiler',
  level: 'inline',
  start: (src: string) => src.indexOf('||'),
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = SPOILER_PATTERN.exec(src);
    if (!match) return undefined;
    const children: Token[] = [];
    this.lexer.inline(match[1], children);
    return { type: 'spoiler', raw: match[0], text: match[1], tokens: children };
  },
  renderer(token: Tokens.Generic): string {
    return `<span data-spoiler>${this.parser.parseInline(token.tokens ?? [])}</span>`;
  },
};

const SANITIZE_CONFIG = { ALLOWED_TAGS, ALLOWED_ATTR };

const LANGUAGE_CLASS = /^language-[\w-]+$/;

let renderer: ((text: string) => string) | null = null;

let loading: Promise<(text: string) => string> | null = null;


/**
 * Reports whether a node is a `<code>` carrying a sole `language-*` class — the
 * only place `class` survives sanitization (it feeds the syntax highlighter).
 * @param node Node visited by DOMPurify.
 */
function isLanguageCode(node: Element): boolean {
  return node.tagName === 'CODE' && LANGUAGE_CLASS.test(node.getAttribute('class') ?? '');
}


/**
 * Hardens each sanitized node: links open safely in a new tab, and every
 * `class` is stripped except the fenced-code `language-*` marker.
 * @param node Node visited by DOMPurify after attribute sanitization.
 */
function hardenNode(node: Element): void {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.hasAttribute('class') && !isLanguageCode(node)) node.removeAttribute('class');
}


/**
 * Imports marked + DOMPurify once and builds the parse→sanitize renderer. The
 * dynamic imports keep both libraries in a deferred chunk so they never block
 * chat first paint; the DOMPurify link hook is registered a single time.
 */
async function buildRenderer(): Promise<(text: string) => string> {
  const [{ marked }, purifyModule] = await Promise.all([import('marked'), import('dompurify')]);
  const purify = purifyModule.default;
  purify.addHook('afterSanitizeAttributes', hardenNode);
  marked.use({ extensions: [SPOILER_EXTENSION] });
  renderer = text =>
    purify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }), SANITIZE_CONFIG);
  return renderer;
}


/**
 * Renders Markdown to an allow-listed, sanitized HTML string. Only this
 * sanitized result may be trusted for binding — DOMPurify has already stripped
 * every disallowed tag and attribute; the raw input is never bound. Concurrent
 * first calls share one library load.
 * @param text Plain message text that may contain Markdown.
 */
export async function renderMarkdown(text: string): Promise<string> {
  const render = renderer ?? (await (loading ??= buildRenderer()));
  return render(text);
}
