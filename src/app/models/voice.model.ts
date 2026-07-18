/**
 * @file Typed shapes of the voice-channel Firestore documents: the channel
 * itself, the live participant-session documents and the transient signaling
 * envelopes (WebRTC negotiation plus soundboard broadcasts). Audio and video
 * never touch Firestore — these documents carry only presence and connection
 * metadata.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/** Firestore document stored at voiceChannels/{channelId}. */
export interface VoiceChannelDoc {
  /** Trimmed channel name (max VOICE_NAME_MAX characters). */
  name: string;
  /** Uid of the user who created the voice channel. */
  createdBy: string;
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
}

/** Voice-channel document paired with its Firestore document id. */
export interface VoiceChannel extends VoiceChannelDoc {
  /** Firestore document id of the voice channel. */
  readonly id: string;
}

/**
 * Firestore document at voiceChannels/{id}/voiceParticipants/{sessionId}.
 * Keyed by the client session (not the uid) so several windows of the shared
 * guest account appear as separate participants; refreshed via a lastSeen
 * heartbeat only while actively connected.
 */
export interface VoiceParticipantDoc {
  /** Uid of the connected user (shared across guest sessions). */
  uid: string;
  /** Client-session id; duplicates the document id for rule checks. */
  sessionId: string;
  /** Join time; serverTimestamp() sentinel on write, Timestamp on read. */
  joinedAt: Timestamp | FieldValue;
  /** Whether the participant muted their own microphone. */
  muted: boolean;
  /** Whether the participant deafened all incoming audio (implies muted). */
  deafened: boolean;
  /** Whether the participant currently shares their screen. */
  sharing: boolean;
  /** Last heartbeat; participants with a stale value are filtered out. */
  lastSeen: Timestamp | FieldValue;
}

/**
 * Participant read from the collection-group stream, enriched with the id
 * of the voice channel the document lives under.
 */
export interface VoiceParticipant extends VoiceParticipantDoc {
  /** Firestore id of the voice channel this participant is connected to. */
  readonly channelId: string;
}

/** Kind of one signaling envelope (WebRTC negotiation or soundboard). */
export type VoiceSignalKind = 'offer' | 'answer' | 'candidate' | 'sound';

/** Payload of a soundboard broadcast envelope. */
export interface SoundSignalPayload {
  /** Id of the soundboard sound to play (unknown ids are ignored). */
  soundId: string;
}

/** Session description, ICE candidate or soundboard payload of an envelope. */
export type VoiceSignalPayload =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | SoundSignalPayload;

/**
 * Firestore document at voiceChannels/{id}/signals/{autoId}: one directed
 * signaling envelope between two client sessions, deleted by the addressee
 * immediately after it is applied (self-cleaning mailbox).
 */
export interface VoiceSignalDoc {
  /** Client session that sent the envelope. */
  fromSession: string;
  /** Uid of the sender (rule-pinned to the authenticated user). */
  fromUid: string;
  /** Client session the envelope is addressed to. */
  toSession: string;
  /** Uid of the addressee (scopes the read/delete rules). */
  toUid: string;
  /** Envelope kind: SDP offer, SDP answer or ICE candidate. */
  kind: VoiceSignalKind;
  /** Session description or ICE candidate payload. */
  payload: VoiceSignalPayload;
  /** Send time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
}

/** Signaling envelope paired with its Firestore document id. */
export interface VoiceSignal extends VoiceSignalDoc {
  /** Firestore document id of the envelope (needed for the delete). */
  readonly id: string;
}
