/**
 * @file Pure SDP munger raising the Opus audio quality of a WebRTC session:
 * every LOCAL description is rewritten before setLocalDescription so the
 * negotiated Opus parameters carry full-band stereo at a high average
 * bitrate with inband FEC and without DTX. Because the munged SDP is what
 * travels through signaling, the remote side receives the same parameters —
 * both directions of every peer link are covered when each client munges
 * its own local descriptions. No I/O, fully testable.
 */

/** Target Opus average bitrate in bit/s (Discord "boosted" territory). */
export const OPUS_MAX_AVERAGE_BITRATE = 128000;

/** Enables stereo decoding (1 = on). */
export const OPUS_STEREO = 1;

/** Announces stereo sending capability (1 = on). */
export const OPUS_SPROP_STEREO = 1;

/** Enables inband forward error correction against packet loss (1 = on). */
export const OPUS_USE_INBAND_FEC = 1;

/** Disables discontinuous transmission so quiet passages keep quality (0 = off). */
export const OPUS_USE_DTX = 0;

/** Full-band playback sample rate in hertz. */
export const OPUS_MAX_PLAYBACK_RATE = 48000;

const OPUS_QUALITY_PARAMS: ReadonlyArray<readonly [string, number]> = [
  ['maxaveragebitrate', OPUS_MAX_AVERAGE_BITRATE],
  ['stereo', OPUS_STEREO],
  ['sprop-stereo', OPUS_SPROP_STEREO],
  ['useinbandfec', OPUS_USE_INBAND_FEC],
  ['usedtx', OPUS_USE_DTX],
  ['maxplaybackrate', OPUS_MAX_PLAYBACK_RATE],
];

const OPUS_RTPMAP_PATTERN = /^a=rtpmap:(\d+)\s+opus\/48000/im;

const SDP_LINE_BREAK = '\r\n';


/**
 * Rewrites the Opus fmtp parameters of a session description to the
 * high-quality profile; descriptions without an Opus codec (or without an
 * audio section) pass through unchanged.
 * @param sdp Raw SDP of a local offer or answer.
 * @returns The SDP with the Opus fmtp line upgraded or inserted.
 */
export function enhanceOpusSdp(sdp: string): string {
  const payloadType = findOpusPayloadType(sdp);
  if (payloadType === null) return sdp;
  const lines = sdp.split(SDP_LINE_BREAK);
  const fmtpIndex = lines.findIndex(line => line.startsWith(`a=fmtp:${payloadType} `));
  if (fmtpIndex >= 0) {
    lines[fmtpIndex] = upgradeFmtpLine(lines[fmtpIndex], payloadType);
    return lines.join(SDP_LINE_BREAK);
  }
  const rtpmapIndex = lines.findIndex(line => line.startsWith(`a=rtpmap:${payloadType} `));
  if (rtpmapIndex < 0) return sdp;
  lines.splice(rtpmapIndex + 1, 0, buildFmtpLine(payloadType, []));
  return lines.join(SDP_LINE_BREAK);
}


/**
 * Finds the RTP payload type mapped to the Opus codec.
 * @param sdp Raw SDP text.
 * @returns The payload type digits, or null when Opus is not offered.
 */
function findOpusPayloadType(sdp: string): string | null {
  const match = OPUS_RTPMAP_PATTERN.exec(sdp);
  return match ? match[1] : null;
}


/**
 * Merges the quality parameters into an existing fmtp line, overriding
 * duplicates and preserving unrelated parameters (e.g. minptime).
 * @param line Existing `a=fmtp:<pt> ...` line.
 * @param payloadType Opus payload type of the line.
 */
function upgradeFmtpLine(line: string, payloadType: string): string {
  const existing = line
    .slice(`a=fmtp:${payloadType} `.length)
    .split(';')
    .map(parameter => parameter.trim())
    .filter(parameter => parameter !== '')
    .filter(parameter => !isQualityParameter(parameter));
  return buildFmtpLine(payloadType, existing);
}


/**
 * Reports whether a `key=value` parameter is one of the quality parameters
 * this munger owns (and therefore replaces).
 * @param parameter One trimmed fmtp parameter.
 */
function isQualityParameter(parameter: string): boolean {
  const key = parameter.split('=')[0];
  return OPUS_QUALITY_PARAMS.some(([name]) => name === key);
}


/**
 * Builds the fmtp line from the preserved foreign parameters plus the full
 * quality profile.
 * @param payloadType Opus payload type.
 * @param preserved Parameters kept from the original line.
 */
function buildFmtpLine(payloadType: string, preserved: readonly string[]): string {
  const quality = OPUS_QUALITY_PARAMS.map(([name, value]) => `${name}=${value}`);
  return `a=fmtp:${payloadType} ${[...preserved, ...quality].join(';')}`;
}
