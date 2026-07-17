/**
 * @file One-off build-prep tool: rasterizes the existing logo
 * (public/logos/logo.svg) into the PWA icon set under public/pwa-icons/
 * using headless Chrome (no npm dependencies). "any" icons keep the logo's
 * own rounded-square artwork on transparency; "maskable" icons sample the
 * logo's edge color and compose a full-bleed background with the logo
 * centered inside the safe zone. Re-run with: node tools/generate-pwa-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_BIN =
  process.env['CHROME_BIN'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOGO_SVG = resolve('public/logos/logo.svg');
const OUT_DIR = resolve('public/pwa-icons');
const VIRTUAL_TIME_BUDGET_MS = 4000;
const MASKABLE_SAFE_SCALE = 0.78;

const ICONS = [
  { file: 'icon-192.png', size: 192, mode: 'any' },
  { file: 'icon-512.png', size: 512, mode: 'any' },
  { file: 'icon-maskable-192.png', size: 192, mode: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, mode: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'maskable' },
];

const COMPOSER_HTML = `<!DOCTYPE html>
<meta charset="utf-8">
<body style="margin:0">
<canvas id="c"></canvas>
<script>
  const params = new URLSearchParams(location.search);
  const size = Number(params.get('size'));
  const mode = params.get('mode');
  const canvas = document.getElementById('c');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    if (mode === 'maskable') {
      const probe = document.createElement('canvas');
      probe.width = img.width;
      probe.height = img.height;
      const pctx = probe.getContext('2d');
      pctx.drawImage(img, 0, 0);
      const [r, g, b] = pctx.getImageData(
        Math.floor(img.width / 2),
        Math.floor(img.height * 0.08),
        1,
        1,
      ).data;
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(0, 0, size, size);
      const inner = Math.round(size * ${MASKABLE_SAFE_SCALE});
      const offset = Math.round((size - inner) / 2);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, offset, offset, inner, inner);
    } else {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
    }
    document.title = 'composed';
  };
  img.src = 'logo.svg';
</script>
`;


/**
 * Renders one icon by screenshotting the composer page in headless Chrome.
 * @param {string} workDir Temp directory holding composer.html + logo.svg.
 * @param {{file: string, size: number, mode: string}} icon Icon spec.
 */
function renderIcon(workDir, icon) {
  const url = `file://${workDir}/composer.html?size=${icon.size}&mode=${icon.mode}`;
  execFileSync(CHROME_BIN, [
    '--headless=new',
    `--screenshot=${join(OUT_DIR, icon.file)}`,
    `--window-size=${icon.size},${icon.size}`,
    '--default-background-color=00000000',
    `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`,
    '--allow-file-access-from-files',
    '--no-first-run',
    url,
  ]);
  process.stdout.write(`generated ${icon.file} (${icon.size}px, ${icon.mode})\n`);
}


/**
 * Entry point: prepares the temp composer workspace, renders every icon in
 * the set and cleans the workspace up again.
 */
function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const workDir = mkdtempSync(join(tmpdir(), 'vibo-icons-'));
  writeFileSync(join(workDir, 'composer.html'), COMPOSER_HTML);
  copyFileSync(LOGO_SVG, join(workDir, 'logo.svg'));
  for (const icon of ICONS) renderIcon(workDir, icon);
  rmSync(workDir, { recursive: true, force: true });
}

main();
