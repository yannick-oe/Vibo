/**
 * @file Emoticon auto-conversion for the composer: the classic emoticon →
 * Unicode map, the boundary-guarded detection of a convertible token
 * ending at the caret and the {@link EmoticonTracker} holding the
 * single-step revert Backspace uses right after a conversion. The emoji
 * characters render through the existing Twemoji pipeline like any other
 * message emoji. Pure helpers plus one small state holder — free of
 * component and Firestore concerns.
 */

/** Classic emoticons and the Unicode emoji each converts to. */
export const EMOTICON_MAP: ReadonlyMap<string, string> = new Map([
  [':)', '🙂'],
  [':-)', '🙂'],
  [':D', '😃'],
  [':-D', '😃'],
  [';)', '😉'],
  [';-)', '😉'],
  [':P', '😛'],
  [':-P', '😛'],
  [':(', '🙁'],
  [':-(', '🙁'],
  [":'(", '😢'],
  [':o', '😮'],
  [':O', '😮'],
  [':|', '😐'],
  ['<3', '❤️'],
  ['xD', '😆'],
  ['XD', '😆'],
  ['8)', '😎'],
]);

const MAX_EMOTICON_LENGTH = 3;

const MIN_EMOTICON_LENGTH = 2;

/** A detected convertible emoticon ending at the caret. */
export interface EmoticonMatch {
  /** Literal emoticon text found in the input. */
  readonly emoticon: string;
  /** Unicode emoji it converts to. */
  readonly emoji: string;
  /** Start index of the emoticon inside the input value. */
  readonly start: number;
}


/**
 * Finds a convertible emoticon ending exactly at the caret. The token
 * must be preceded by start-of-input or whitespace, so ":)" inside a word
 * or URL ("https://…") never converts.
 * @param text Full input value.
 * @param caret Caret position the token must end at.
 */
export function detectEmoticonBefore(text: string, caret: number): EmoticonMatch | null {
  for (let length = MAX_EMOTICON_LENGTH; length >= MIN_EMOTICON_LENGTH; length -= 1) {
    const start = caret - length;
    if (start < 0) continue;
    const emoji = EMOTICON_MAP.get(text.slice(start, caret));
    if (!emoji) continue;
    if (start > 0 && !/\s/.test(text[start - 1])) continue;
    return { emoticon: text.slice(start, caret), emoji, start };
  }
  return null;
}


/**
 * Converts a trailing emoticon at the very end of an outgoing message
 * (send is a boundary like the space keystroke); the rest of the text is
 * untouched.
 * @param text Trimmed message text about to be sent.
 */
export function convertTrailingEmoticon(text: string): string {
  const match = detectEmoticonBefore(text, text.length);
  return match ? text.slice(0, match.start) + match.emoji : text;
}


/**
 * Per-composer conversion state: performs the space-boundary conversion
 * in the textarea and keeps the single-step revert buffer alive across
 * exactly the one input event the space keystroke produces.
 */
export class EmoticonTracker {
  private revertState: EmoticonMatch | null = null;

  private inputAllowance = 0;


  /**
   * Space keydown: converts an emoticon ending at the caret in place (the
   * space itself inserts afterwards via the default keystroke).
   * @param element Composer textarea.
   * @returns Whether a conversion happened.
   */
  convertBeforeSpace(element: HTMLTextAreaElement): boolean {
    const caret = element.selectionStart ?? element.value.length;
    if (element.selectionEnd !== caret) return false;
    const match = detectEmoticonBefore(element.value, caret);
    if (!match) return false;
    element.setRangeText(match.emoji, match.start, caret, 'end');
    this.revertState = match;
    this.inputAllowance = 1;
    return true;
  }


  /**
   * Backspace keydown immediately after a conversion: restores the
   * literal emoticon text (the typed space survives) and moves the caret
   * along with the length difference.
   * @param element Composer textarea.
   * @returns Whether a revert happened (the keystroke is then consumed).
   */
  revertOnBackspace(element: HTMLTextAreaElement): boolean {
    const state = this.revertState;
    if (!state) return false;
    this.revertState = null;
    const caret = element.selectionStart ?? element.value.length;
    element.setRangeText(state.emoticon, state.start, state.start + state.emoji.length, 'preserve');
    const position = Math.max(0, caret + state.emoticon.length - state.emoji.length);
    element.setSelectionRange(position, position);
    return true;
  }


  /**
   * Tracks input events: the single space following a conversion keeps
   * the revert buffer alive, any other edit invalidates it.
   */
  trackInput(): void {
    if (this.inputAllowance > 0) {
      this.inputAllowance -= 1;
      return;
    }
    this.revertState = null;
  }
}
