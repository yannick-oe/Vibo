/**
 * @file Re-injects Twemoji emoji and @mention spans into already-sanitized
 * Markdown HTML by re-segmenting its text nodes (outside code), reusing the
 * shared message segmenter. The emoji images and mention spans added here are
 * our own trusted nodes; DOMPurify already ran on the Markdown itself.
 */
import { MessageSegment, buildMessageSegments } from '../message-segments';
import { enhanceCodeBlocks } from './code-block';

const CODE_TAGS = ['CODE', 'PRE'];


/**
 * Returns sanitized Markdown HTML with catalog emoji rendered as Twemoji
 * images, @mentions wrapped in highlight spans, and every fenced code block
 * wrapped in its chrome. Emoji/mention enrichment runs first so the chrome's
 * own header text is never processed.
 * @param html Sanitized Markdown HTML string.
 * @param userNames Known display names used to detect mentions.
 * @param selfName Signed-in user's display name, or null.
 */
export function enhanceMessageHtml(
  html: string,
  userNames: readonly string[],
  selfName: string | null = null,
): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  collectTextNodes(template.content).forEach(node => replaceTextNode(node, userNames, selfName));
  enhanceCodeBlocks(template.content);
  return template.innerHTML;
}


/**
 * Collects the text nodes eligible for emoji/mention rendering — everything
 * outside code and preformatted blocks.
 * @param root Parsed Markdown fragment.
 */
function collectTextNodes(root: DocumentFragment): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent && !isInCode(node)) nodes.push(node);
  }
  return nodes;
}


/**
 * Reports whether a node lives inside a code or preformatted element.
 * @param node Text node being inspected.
 */
function isInCode(node: Node): boolean {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (CODE_TAGS.includes(parent.tagName)) return true;
  }
  return false;
}


/**
 * Replaces a text node with its segmented nodes when it actually contains an
 * emoji or a mention; plain text is left untouched.
 * @param node Eligible text node.
 * @param userNames Known display names used to detect mentions.
 * @param selfName Signed-in user's display name, or null.
 */
function replaceTextNode(node: Text, userNames: readonly string[], selfName: string | null): void {
  const segments = buildMessageSegments(node.textContent ?? '', [...userNames], selfName);
  if (!segments.some(segment => segment.asset || segment.isMention)) return;
  const fragment = document.createDocumentFragment();
  segments.forEach(segment => fragment.appendChild(segmentToNode(segment)));
  node.replaceWith(fragment);
}


/**
 * Builds the DOM node for a single message segment.
 * @param segment Segment produced by the message segmenter.
 */
function segmentToNode(segment: MessageSegment): Node {
  if (segment.asset) return emojiImage(segment.asset, segment.name ?? '');
  if (segment.isMention) return mentionSpan(segment.text, segment.isSelfMention);
  return document.createTextNode(segment.text);
}


/**
 * Builds an inline Twemoji emoji image node.
 * @param asset Emoji SVG asset path.
 * @param name German emoji name used as alt text.
 */
function emojiImage(asset: string, name: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'message__emoji';
  image.src = asset;
  image.alt = name;
  return image;
}


/**
 * Builds a highlighted @mention span node; a mention of the signed-in user
 * additionally carries the pill modifier class.
 * @param text Mention text including the leading "@".
 * @param isSelf Whether the mention targets the signed-in user.
 */
function mentionSpan(text: string, isSelf: boolean): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = isSelf ? 'message__mention message__mention--me' : 'message__mention';
  span.textContent = text;
  return span;
}
