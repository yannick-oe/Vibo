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
}
