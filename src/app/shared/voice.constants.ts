/**
 * @file Shared constants of the persistent voice channels: Firestore path
 * segments, capacity and freshness thresholds, the WebRTC STUN servers and
 * the microphone capture constraints. Opus quality parameters live next to
 * the SDP munger in features/voice/webrtc/sdp-quality.ts.
 */

/** Firestore collection holding the voice-channel documents. */
export const VOICE_CHANNELS_COLLECTION = 'voiceChannels';

/** Subcollection of live participant-session documents per voice channel. */
export const VOICE_PARTICIPANTS_SEGMENT = 'voiceParticipants';

/** Subcollection of transient WebRTC signaling documents per voice channel. */
export const VOICE_SIGNALS_SEGMENT = 'signals';

/** Maximum length of a voice-channel name (mirrored in firestore.rules). */
export const VOICE_NAME_MAX = 40;

/** Interval of the lastSeen heartbeat while connected to a voice channel. */
export const VOICE_HEARTBEAT_MS = 30000;

/** Age beyond which a participant document counts as stale (orphaned). */
export const VOICE_STALE_MS = 90000;

/** Re-evaluation interval of the client-side staleness filter. */
export const VOICE_STALE_SWEEP_MS = 15000;

/** Hard client-enforced participant cap of the full-mesh audio topology. */
export const MAX_VOICE_PARTICIPANTS = 5;

/** Grace period before a failed/disconnected peer connection is dropped. */
export const DISCONNECT_GRACE_MS = 5000;

/** Ideal capture width of a shared screen in pixels. */
export const SCREEN_IDEAL_WIDTH = 1920;

/** Ideal capture height of a shared screen in pixels. */
export const SCREEN_IDEAL_HEIGHT = 1080;

/** Ideal capture frame rate of a shared screen in frames per second. */
export const SCREEN_IDEAL_FPS = 30;

/** Upper video bitrate per screen-share leg in bit/s (crisp text focus). */
export const SCREEN_MAX_BITRATE = 2_000_000;

/** Public STUN servers used for NAT traversal (primary plus one fallback). */
export const STUN_SERVERS: readonly RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Microphone capture constraints for high-quality stereo voice. */
export const VOICE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 2 },
  sampleRate: 48000,
};
