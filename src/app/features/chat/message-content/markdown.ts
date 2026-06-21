/**
 * @file Lazily-loaded Markdown rendering pipeline for message display. The
 * parser (marked) does NOT sanitize, so its output is always run through
 * DOMPurify with a strict allow-list before it can reach the DOM.
 */

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
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

const SANITIZE_CONFIG = { ALLOWED_TAGS, ALLOWED_ATTR };

let renderer: ((text: string) => string) | null = null;

let loading: Promise<(text: string) => string> | null = null;


/**
 * Forces every link to open safely in a new tab.
 * @param node Node visited by DOMPurify after attribute sanitization.
 */
function hardenLink(node: Element): void {
  if (node.tagName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
}


/**
 * Imports marked + DOMPurify once and builds the parse→sanitize renderer. The
 * dynamic imports keep both libraries in a deferred chunk so they never block
 * chat first paint; the DOMPurify link hook is registered a single time.
 */
async function buildRenderer(): Promise<(text: string) => string> {
  const [{ marked }, purifyModule] = await Promise.all([import('marked'), import('dompurify')]);
  const purify = purifyModule.default;
  purify.addHook('afterSanitizeAttributes', hardenLink);
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
