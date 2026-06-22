/**
 * @file Self-contained, best-effort profanity blocklist (German + English)
 * used by the display-name validator. Terms are matched after normalization
 * (see display-name.validators), so plain lowercase base forms are enough —
 * diacritics, leetspeak and casing are handled by the matcher. Extend by
 * appending further base-form terms to the array below.
 */

/**
 * Offensive terms blocked as display names. Conservative on purpose: the
 * matcher compares whole normalized tokens and the full normalized string,
 * never raw substrings, so short entries do not flag legitimate names.
 */
export const PROFANITY_BLOCKLIST: readonly string[] = [
  'fuck',
  'fucker',
  'motherfucker',
  'shit',
  'bullshit',
  'bitch',
  'cunt',
  'asshole',
  'dickhead',
  'dick',
  'cock',
  'pussy',
  'slut',
  'whore',
  'bastard',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'retard',
  'wanker',
  'twat',
  'jackass',
  'dumbass',
  'prick',
  'bollocks',
  'douchebag',
  'scheisse',
  'scheiss',
  'arsch',
  'arschloch',
  'fotze',
  'hurensohn',
  'hure',
  'wichser',
  'schlampe',
  'nutte',
  'schwuchtel',
  'missgeburt',
  'fick',
  'ficker',
  'kacke',
  'kacker',
  'spasti',
  'spast',
  'kanake',
  'neger',
  'mongo',
  'drecksau',
  'miststueck',
  'untermensch',
];
