/**
 * @file Pure ordering helper of the signaling inbox: envelopes are applied
 * in creation order so session descriptions land before their trailing ICE
 * candidates. Extracted from the mesh controller, which sorts every inbox
 * batch with {@link byCreation} before applying it.
 */
import { Timestamp } from '@angular/fire/firestore';

import { VoiceSignal } from '../../../models/voice.model';

/**
 * Compares two envelopes by creation time so descriptions are applied
 * before their trailing candidates; unresolved timestamps sort last.
 * @param a First envelope.
 * @param b Second envelope.
 */
export function byCreation(a: VoiceSignal, b: VoiceSignal): number {
  return signalMillis(a) - signalMillis(b);
}


/**
 * Resolves an envelope's creation time in milliseconds; unresolved server
 * timestamps sort last (they cannot occur in the inbox, which only ever
 * carries other clients' server-acknowledged writes).
 * @param signal Envelope from the inbox stream.
 */
function signalMillis(signal: VoiceSignal): number {
  return signal.createdAt instanceof Timestamp
    ? signal.createdAt.toMillis()
    : Number.MAX_SAFE_INTEGER;
}
