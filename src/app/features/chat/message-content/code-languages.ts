/**
 * @file Curated set of code languages offered by the message highlighter. Maps
 * fence info strings to a highlight.js language id and a display label. Kept
 * free of any highlight.js import so the header label resolves without loading
 * the deferred highlighter chunk.
 */

/** A curated language: its highlight.js id, accepted fence aliases and label. */
export interface CuratedLanguage {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly label: string;
}

/** Neutral header label for missing or unsupported languages. */
export const NEUTRAL_LABEL = 'Code';

/** Languages registered with highlight.js and shown with a friendly label. */
export const CURATED_LANGUAGES: readonly CuratedLanguage[] = [
  { id: 'typescript', aliases: ['ts', 'typescript'], label: 'TypeScript' },
  { id: 'javascript', aliases: ['js', 'javascript', 'mjs'], label: 'JavaScript' },
  { id: 'xml', aliases: ['html', 'xml', 'svg'], label: 'HTML' },
  { id: 'css', aliases: ['css'], label: 'CSS' },
  { id: 'scss', aliases: ['scss', 'sass'], label: 'SCSS' },
  { id: 'json', aliases: ['json'], label: 'JSON' },
  { id: 'bash', aliases: ['bash', 'sh', 'shell', 'zsh'], label: 'Bash' },
  { id: 'python', aliases: ['python', 'py'], label: 'Python' },
  { id: 'java', aliases: ['java'], label: 'Java' },
  { id: 'sql', aliases: ['sql'], label: 'SQL' },
  { id: 'yaml', aliases: ['yaml', 'yml'], label: 'YAML' },
  { id: 'markdown', aliases: ['markdown', 'md'], label: 'Markdown' },
];


/**
 * Resolves a fence info string to a curated language, or null when it is
 * missing or unsupported.
 * @param fence Lowercased-or-not fence language token (e.g. "ts").
 */
export function resolveLanguage(fence: string): CuratedLanguage | null {
  const key = fence.trim().toLowerCase();
  if (!key) return null;
  return CURATED_LANGUAGES.find(language => language.aliases.includes(key)) ?? null;
}


/**
 * Returns the header label for a fence: the language's friendly name, or the
 * neutral label when it is missing or unsupported.
 * @param fence Fence language token from the ``` info string.
 */
export function languageLabel(fence: string): string {
  return resolveLanguage(fence)?.label ?? NEUTRAL_LABEL;
}
