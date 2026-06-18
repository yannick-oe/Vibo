/**
 * @file Shared target for scrolling a searched message into view.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds the id of the message a search result navigated to. The message
 * list scrolls the row into view once rendered and clears the target after
 * the brief highlight.
 */
@Injectable({ providedIn: 'root' })
export class MessageFocusService {
  private readonly targetState = signal<string | null>(null);

  readonly target = this.targetState.asReadonly();


  /**
   * Marks a message to be scrolled into view and highlighted.
   * @param messageId Firestore id of the message.
   */
  focus(messageId: string): void {
    this.targetState.set(messageId);
  }


  /**
   * Clears the highlight target.
   */
  clear(): void {
    this.targetState.set(null);
  }
}
