/**
 * @file Binds one composer to its per-conversation draft. A thin, path-guarded
 * wrapper over DraftService: reads the stored draft for a conversation path,
 * saves the live text and clears it on send. Conversationless composers (thread,
 * new message) pass a null path and are silently skipped.
 */
import { DraftService } from '../../services/draft.service';

/** Per-composer draft binding; created with the shared DraftService. */
export class ComposerDraft {
  /**
   * @param drafts Shared draft store backing this composer's persistence.
   */
  constructor(private readonly drafts: DraftService) {}


  /**
   * Returns the stored draft for a conversation path, or empty when there is
   * no path (a conversationless composer).
   * @param path Conversation document path, or null.
   */
  read(path: string | null): string {
    return path ? this.drafts.read(path) : '';
  }


  /**
   * Persists the current composer text for a conversation path.
   * @param path Conversation document path, or null.
   * @param text Current composer text.
   */
  save(path: string | null, text: string): void {
    if (path) this.drafts.write(path, text);
  }


  /**
   * Clears the stored draft for a conversation path (on send).
   * @param path Conversation document path, or null.
   */
  clear(path: string | null): void {
    if (path) this.drafts.clear(path);
  }


  /**
   * Writes a restored draft straight into the textarea (value and grown
   * height), so switching conversations never flashes the previous draft —
   * the DOM value binding is unreliable under the app's coalesced change
   * detection, hence the imperative write.
   * @param element Composer textarea element.
   * @param value Draft text placed into the composer.
   * @param maxHeightPx Height cap of the grown textarea in pixels.
   */
  restoreIntoDom(element: HTMLTextAreaElement, value: string, maxHeightPx: number): void {
    element.value = value;
    element.style.height = 'auto';
    if (value) element.style.height = `${Math.min(element.scrollHeight, maxHeightPx)}px`;
  }
}
