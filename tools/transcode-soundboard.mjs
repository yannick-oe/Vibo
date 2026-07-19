/**
 * @file Re-runnable build-prep tool: transcodes the curated soundboard
 * source clips (unmodified Pixabay downloads in tools/assets-src/soundboard/)
 * into the shipped preset files under public/sounds/soundboard/. Per file:
 * leading/trailing silence is trimmed (content is never cut), loudness is
 * normalized to a consistent EBU R128 target via two-pass loudnorm
 * (measure, then linear apply), audio is downmixed to mono at 48 kHz and
 * encoded as ~96 kbps MP3 with all metadata stripped. MP3 is the
 * deliberate delivery format (universal decodeAudioData support incl. iOS
 * Safari). Clips longer than the flag threshold are reported for the
 * owner's decision — never shortened. Requires ffmpeg + ffprobe on PATH.
 * Re-run with: node tools/transcode-soundboard.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOURCE_DIR = resolve('tools/assets-src/soundboard');
const OUT_DIR = resolve('public/sounds/soundboard');

const LOUDNORM_TARGET_I = -16;
const LOUDNORM_TARGET_TP = -1.5;
const LOUDNORM_TARGET_LRA = 11;

const SILENCE_THRESHOLD_DB = -50;
const SILENCE_KEEP_SECONDS = 0.05;

const OUTPUT_CHANNELS = 1;
const OUTPUT_SAMPLE_RATE = 48000;
const OUTPUT_BITRATE = '96k';

const FLAG_DURATION_SECONDS = 5;

const BYTES_PER_KILOBYTE = 1000;

const CLIPS = [
  { source: 'WOAH.mp3', out: 'woah.mp3' },
  { source: 'WHAT.mp3', out: 'what.mp3' },
  { source: 'WAIT A MINUTE.mp3', out: 'wait-a-minute.mp3' },
  { source: 'NEIN DOCH.mp3', out: 'nein-doch.mp3' },
  { source: 'I GOT THIS.mp3', out: 'i-got-this.mp3' },
  { source: 'HORN.mp3', out: 'horn.mp3' },
  { source: 'HEHE BOI.mp3', out: 'hehe-boi.mp3' },
  { source: 'FART.mp3', out: 'fart.mp3' },
  { source: 'EVIL LAUGH.mp3', out: 'evil-laugh.mp3' },
  { source: 'DRUMROLL.mp3', out: 'drumroll.mp3' },
];

const TRIM_FILTER = [
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD_DB}dB:start_silence=${SILENCE_KEEP_SECONDS}`,
  'areverse',
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD_DB}dB:start_silence=${SILENCE_KEEP_SECONDS}`,
  'areverse',
].join(',');

const LOUDNORM_TARGET = `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TARGET_TP}:LRA=${LOUDNORM_TARGET_LRA}`;


/**
 * Runs a command, failing loudly on a non-zero exit, and returns its
 * captured stderr (where ffmpeg prints its reports).
 * @param {string} binary Executable name.
 * @param {string[]} args Command arguments.
 * @returns {string} Captured stderr output.
 */
function run(binary, args) {
  const result = spawnSync(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`${binary} failed (${result.status}):\n${result.stderr}`);
  }
  return result.stderr.toString();
}


/**
 * First loudnorm pass: measures the trimmed clip's loudness stats from the
 * JSON block ffmpeg prints to stderr.
 * @param {string} sourcePath Absolute path of the source clip.
 * @returns {Record<string, string>} Measured loudnorm values.
 */
function measureLoudness(sourcePath) {
  const stderr = run('ffmpeg', [
    '-hide_banner', '-i', sourcePath,
    '-af', `${TRIM_FILTER},${LOUDNORM_TARGET}:print_format=json`,
    '-f', 'null', '-',
  ]);
  return JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
}


/**
 * Second pass: trims, applies the measured loudness linearly, downmixes to
 * mono 48 kHz and writes the metadata-stripped ~96 kbps MP3.
 * @param {string} sourcePath Absolute path of the source clip.
 * @param {string} outPath Absolute path of the output preset file.
 * @param {Record<string, string>} measured Loudnorm values of the first pass.
 */
function transcode(sourcePath, outPath, measured) {
  const applied = `${LOUDNORM_TARGET}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}:linear=true`;
  run('ffmpeg', [
    '-hide_banner', '-y', '-i', sourcePath,
    '-af', `${TRIM_FILTER},${applied}`,
    '-ac', String(OUTPUT_CHANNELS), '-ar', String(OUTPUT_SAMPLE_RATE),
    '-b:a', OUTPUT_BITRATE, '-map_metadata', '-1',
    outPath,
  ]);
}


/**
 * Probes the duration of an audio file in seconds via ffprobe.
 * @param {string} filePath Absolute path of the audio file.
 * @returns {number} Duration in seconds.
 */
function probeDurationSeconds(filePath) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return Number(result.stdout.toString().trim());
}


/**
 * Transcodes one clip and prints its report line (source size → output
 * size, duration, over-length flag).
 * @param {{source: string, out: string}} clip Source/output file pair.
 */
function processClip(clip) {
  const sourcePath = join(SOURCE_DIR, clip.source);
  const outPath = join(OUT_DIR, clip.out);
  transcode(sourcePath, outPath, measureLoudness(sourcePath));
  const duration = probeDurationSeconds(outPath);
  const sourceKb = (statSync(sourcePath).size / BYTES_PER_KILOBYTE).toFixed(1);
  const outKb = (statSync(outPath).size / BYTES_PER_KILOBYTE).toFixed(1);
  const flag = duration > FLAG_DURATION_SECONDS ? '  ⚠ LONGER THAN 5 s — owner decision needed' : '';
  process.stdout.write(`${clip.out}: ${sourceKb} kB → ${outKb} kB, ${duration.toFixed(2)} s${flag}\n`);
}


/**
 * Entry point: prepares the output directory and transcodes every clip in
 * the curated set.
 */
function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const clip of CLIPS) processClip(clip);
}

main();
