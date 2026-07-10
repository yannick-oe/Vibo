/**
 * @file One-shot generator for the full self-hosted emoji set. Produces the
 * Twemoji (jdecked fork) SVG assets in public/emojis/ and the German metadata
 * catalogue public/emoji-data.de.json consumed lazily by the emoji picker.
 *
 * Sources (no runtime deps — everything is generated into public/):
 *  - Artwork: @twemoji/svg (jdecked fork, CC-BY 4.0), codepoint filenames.
 *  - Metadata: emojibase-data de locale (MIT) — labels, keyword tags, groups.
 *
 * Run: `node scripts/generate-emoji.mjs` (needs network: fetches the emojibase
 * de data.json and `npm pack`s @twemoji/svg into a temp dir). Only emojis whose
 * SVG exists are included (Twemoji lags the newest Unicode releases); this is a
 * data-driven availability filter, never a hand-curated exclusion list.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMOJIBASE_URL = 'https://cdn.jsdelivr.net/npm/emojibase-data@17.0.0/de/data.json';
const SKIN_TONE_GROUP = 2;
const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const GROUPS = [
  { id: 0, label: 'Smileys' },
  { id: 1, label: 'Gesten & Personen' },
  { id: 3, label: 'Tiere & Natur' },
  { id: 4, label: 'Essen' },
  { id: 6, label: 'Aktivitäten' },
  { id: 5, label: 'Reisen & Orte' },
  { id: 7, label: 'Objekte' },
  { id: 8, label: 'Symbole' },
  { id: 9, label: 'Flaggen' },
];

const root = fileURLToPath(new URL('..', import.meta.url));
const emojisDir = join(root, 'public', 'emojis');
const metadataFile = join(root, 'public', 'emoji-data.de.json');


/**
 * The Twemoji asset filename (without extension) of an emoji: codepoints in
 * lowercase hex joined by "-", with FE0F stripped unless the sequence is a ZWJ
 * sequence (Twemoji's own naming rule, so the derived name matches the file).
 * @param {string} emoji Emoji character sequence.
 */
function twemojiName(emoji) {
  const cps = [...emoji].map(ch => ch.codePointAt(0));
  const kept = cps.includes(ZWJ) ? cps : cps.filter(cp => cp !== VS16);
  return kept.map(cp => cp.toString(16)).join('-');
}


/**
 * Extracts the @twemoji/svg package into a temp dir and returns the folder
 * holding the SVGs plus the set of available filenames (without extension).
 */
function loadArtwork() {
  const dir = mkdtempSync(join(tmpdir(), 'twemoji-'));
  execSync('npm pack @twemoji/svg@15 --silent', { cwd: dir, stdio: 'ignore' });
  const tgz = readdirSync(dir).find(f => f.endsWith('.tgz'));
  execSync(`tar -xzf ${tgz}`, { cwd: dir });
  const svgDir = join(dir, 'package');
  const files = new Set(readdirSync(svgDir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)));
  return { dir, svgDir, files };
}


/**
 * The searchable keyword string of an emoji: its German label plus tags,
 * lowercased and de-duplicated so the picker search matches either.
 * @param {{label: string, tags?: string[]}} entry Emojibase entry.
 */
function keywords(entry) {
  const words = new Set([...entry.label.toLowerCase().split(/\s+/), ...(entry.tags ?? [])]);
  return [...words].join(' ');
}


/**
 * Builds the grouped metadata and copies each included emoji's SVG, skipping
 * entries whose artwork is missing. Returns the metadata and the counts.
 * @param {object[]} data Emojibase de data entries.
 * @param {{svgDir: string, files: Set<string>}} art Loaded artwork.
 */
function build(data, art) {
  const groups = GROUPS.map(g => ({ id: g.id, label: g.label, emojis: [] }));
  const byId = new Map(groups.map(g => [g.id, g]));
  let copied = 0;
  let skipped = 0;
  for (const entry of data) {
    const group = byId.get(entry.group);
    const file = twemojiName(entry.emoji);
    if (!group || entry.group === SKIN_TONE_GROUP || !art.files.has(file)) {
      if (group && entry.group !== SKIN_TONE_GROUP) skipped += 1;
      continue;
    }
    cpSync(join(art.svgDir, `${file}.svg`), join(emojisDir, `${file}.svg`));
    group.emojis.push({ u: entry.emoji, n: entry.label, k: keywords(entry), f: file });
    copied += 1;
  }
  return { groups: groups.filter(g => g.emojis.length > 0), copied, skipped };
}


/**
 * Fetches the metadata, generates the assets and catalogue, and reports.
 */
async function main() {
  mkdirSync(emojisDir, { recursive: true });
  const data = await (await fetch(EMOJIBASE_URL)).json();
  const art = loadArtwork();
  const { groups, copied, skipped } = build(data, art);
  writeFileSync(metadataFile, JSON.stringify({ groups }));
  rmSync(art.dir, { recursive: true, force: true });
  const bytes = (JSON.stringify({ groups }).length / 1024).toFixed(0);
  process.stdout.write(`emojis copied: ${copied}, skipped (no art): ${skipped}\n`);
  process.stdout.write(`metadata: ${metadataFile} (${bytes} KB), groups: ${groups.length}\n`);
}

await main();
