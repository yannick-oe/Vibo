/**
 * @file Pure helper that splits message text into plain and @mention parts,
 * shared by the composer (live preview) and the rendered message bubble.
 */

/** A run of message text flagged as either an @mention or plain text. */
export interface MentionPart {
  readonly text: string;
  readonly isMention: boolean;
}

/**
 * Escapes a string for literal use inside a RegExp.
 * @param value Raw member name.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenizes text into mention/plain parts for the known member names. Longer
 * names are matched first so "@Anna Lee" wins over "@Anna".
 * @param text Message text to tokenize.
 * @param names Known member display names.
 */
export function parseMentions(text: string, names: string[]): MentionPart[] {
  const valid = names.filter(name => name.trim().length > 0);
  if (valid.length === 0) return [{ text, isMention: false }];
  const sorted = [...valid].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(@(?:${sorted.map(escapeRegExp).join('|')}))`, 'g');
  return text
    .split(regex)
    .filter(part => part.length > 0)
    .map(part => ({ text: part, isMention: part.startsWith('@') && sorted.includes(part.slice(1)) }));
}
