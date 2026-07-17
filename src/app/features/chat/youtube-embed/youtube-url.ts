/**
 * @file Detects YouTube video URLs in message text and derives the embed
 * data (video id + optional start offset). Pure string parsing — no network,
 * no DOM. Only the FIRST YouTube URL of a message is embedded
 * ({@link YOUTUBE_EMBEDS_PER_MESSAGE}); the URL itself keeps its normal link
 * rendering in the text.
 */

/** Maximum YouTube embeds rendered per message. */
export const YOUTUBE_EMBEDS_PER_MESSAGE = 1;

const URL_PATTERN = /https?:\/\/[^\s<>]+/g;

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const EMBED_PATH_PATTERN = /^\/(?:shorts|embed|live)\/([^/?#]+)/;

const TIME_UNITS_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

const SHORT_HOST = 'youtu.be';

const WATCH_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];

const SECONDS_PER_MINUTE = 60;

const SECONDS_PER_HOUR = 3600;

/** Embeddable YouTube video reference extracted from a message. */
export interface YoutubeVideo {
  /** 11-character YouTube video id. */
  readonly videoId: string;
  /** Playback start offset in seconds, or null when the URL carries none. */
  readonly startSeconds: number | null;
}


/**
 * Finds the first embeddable YouTube URL in a message text.
 * @param text Raw message text.
 */
export function firstYoutubeVideo(text: string): YoutubeVideo | null {
  for (const candidate of text.match(URL_PATTERN) ?? []) {
    const video = parseYoutubeUrl(candidate);
    if (video) return video;
  }
  return null;
}


/**
 * Parses one URL candidate into a video reference; null for non-YouTube
 * URLs, unknown paths and malformed ids.
 * @param candidate URL-shaped substring of the message.
 */
function parseYoutubeUrl(candidate: string): YoutubeVideo | null {
  try {
    const url = new URL(candidate);
    const videoId = extractVideoId(url);
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;
    return { videoId, startSeconds: parseStart(url) };
  } catch {
    return null;
  }
}


/**
 * Extracts the raw video id from the supported URL shapes: youtu.be/<id>,
 * watch?v=<id>, shorts/<id>, embed/<id> (and live/<id>).
 * @param url Parsed URL.
 */
function extractVideoId(url: URL): string | null {
  if (url.hostname === SHORT_HOST) return url.pathname.split('/')[1] ?? null;
  if (!WATCH_HOSTS.includes(url.hostname)) return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  return EMBED_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
}


/**
 * Reads the start offset from the t/start query parameter; supports plain
 * seconds ("90") and unit notation ("1h2m3s", "90s").
 * @param url Parsed YouTube URL.
 */
function parseStart(url: URL): number | null {
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const units = TIME_UNITS_PATTERN.exec(raw);
  if (!units || (!units[1] && !units[2] && !units[3])) return null;
  return (
    Number(units[1] ?? 0) * SECONDS_PER_HOUR +
    Number(units[2] ?? 0) * SECONDS_PER_MINUTE +
    Number(units[3] ?? 0)
  );
}
