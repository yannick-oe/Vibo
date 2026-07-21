/**
 * @file WebAudio playback graph of the remote voice streams: one
 * MediaStreamSource → per-peer GainNode (per-user volume 0–2) → shared
 * master GainNode (deafen) → destination. Every gain change runs through a
 * short linear ramp (GAIN_RAMP_S) so slider moves stay free of zipper
 * noise. Each attached stream additionally keeps a muted, autoplaying
 * `<audio>` element alive — the WebKit/Safari workaround: without a media
 * element consuming the MediaStream, its WebAudio source can go silent.
 */
import { GAIN_RAMP_S } from '../../../shared/voice.constants';

/** Hooks the mixer uses to resolve gains and the initial deafen state. */
export interface RemoteAudioMixerDeps {
  /** Shared AudioContext of the voice connection. */
  readonly context: AudioContext;
  /** Current effective gain (0–2) of a remote user. */
  readonly gainForUid: (uid: string) => number;
  /** Deafen state applied to the master gain on creation. */
  readonly isDeafened: () => boolean;
}

/** Playback pipeline of one attached remote stream. */
interface MixerEntry {
  readonly uid: string;
  readonly element: HTMLAudioElement;
  readonly source: MediaStreamAudioSourceNode;
  readonly gain: GainNode;
}

/**
 * Owns the per-peer playback pipelines of one voice connection. Created
 * with the mesh, disposed with it; detaching a session tears only its own
 * pipeline down.
 */
export class RemoteAudioMixer {
  private readonly deps: RemoteAudioMixerDeps;

  private readonly entries = new Map<string, MixerEntry>();

  private readonly masterGain: GainNode;


  /**
   * Creates the shared master gain, pre-set to the current deafen state.
   * @param deps Context, gain lookup and deafen accessor.
   */
  constructor(deps: RemoteAudioMixerDeps) {
    this.deps = deps;
    this.masterGain = deps.context.createGain();
    this.masterGain.gain.value = deps.isDeafened() ? 0 : 1;
    this.masterGain.connect(deps.context.destination);
  }


  /**
   * Routes a remote stream through a fresh per-peer pipeline at the
   * user's stored volume; repeated attaches for a session are ignored.
   * @param sessionId Remote session the stream belongs to.
   * @param uid Uid of the remote user (volume lookup key).
   * @param stream Remote audio stream.
   */
  attach(sessionId: string, uid: string, stream: MediaStream): void {
    if (this.entries.has(sessionId)) return;
    const element = createKeepAliveElement(stream);
    const source = this.deps.context.createMediaStreamSource(stream);
    const gain = this.deps.context.createGain();
    gain.gain.value = this.deps.gainForUid(uid);
    source.connect(gain);
    gain.connect(this.masterGain);
    this.entries.set(sessionId, { uid, element, source, gain });
  }


  /**
   * Tears one session's pipeline down (peer dropped); idempotent.
   * @param sessionId Remote session to detach.
   */
  detach(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.entries.delete(sessionId);
    entry.source.disconnect();
    entry.gain.disconnect();
    releaseKeepAliveElement(entry.element);
  }


  /**
   * Re-applies every attached user's current gain with a ramp; called
   * whenever a volume setting changes.
   */
  applyGains(): void {
    for (const entry of this.entries.values()) {
      rampGain(this.deps.context, entry.gain, this.deps.gainForUid(entry.uid));
    }
  }


  /**
   * Silences or restores all remote audio via the master gain (deafen).
   * @param muted Whether remote audio is silenced.
   */
  setDeafened(muted: boolean): void {
    rampGain(this.deps.context, this.masterGain, muted ? 0 : 1);
  }


  /**
   * Tears every pipeline and the master gain down. Idempotent.
   */
  dispose(): void {
    for (const sessionId of [...this.entries.keys()]) this.detach(sessionId);
    this.masterGain.disconnect();
  }
}


/**
 * Ramps a gain smoothly to its target within GAIN_RAMP_S.
 * @param context Audio context providing the clock.
 * @param gain Gain node to ramp.
 * @param target Target gain value.
 */
function rampGain(context: AudioContext, gain: GainNode, target: number): void {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + GAIN_RAMP_S);
}


/**
 * Creates the muted keep-alive element consuming a remote stream (WebKit
 * workaround); playback audio comes solely from the WebAudio graph. The
 * element is force-silenced before the stream attaches and again before
 * every play() attempt, so no path can ever make it audible next to the
 * mixer (which would double the signal into a reverb). The join click is
 * the autoplay gesture; a still-blocked play retries once on the next
 * pointer gesture.
 * @param stream Remote audio stream to keep alive.
 */
function createKeepAliveElement(stream: MediaStream): HTMLAudioElement {
  const element = new Audio();
  silenceKeepAlive(element);
  element.srcObject = stream;
  element.autoplay = true;
  element.hidden = true;
  document.body.appendChild(element);
  silenceKeepAlive(element);
  void element.play().catch(() => retryPlayOnGesture(element));
  return element;
}


/**
 * Forces a keep-alive element into its provably inaudible state: muted AND
 * zero volume, so even a browser quirk that drops one of the two flags
 * (e.g. around srcObject re-attachment) leaves the element silent.
 * @param element Keep-alive element to silence.
 */
function silenceKeepAlive(element: HTMLAudioElement): void {
  element.muted = true;
  element.volume = 0;
}


/**
 * Retries blocked keep-alive playback once on the next user gesture; the
 * element is re-silenced before the retry and a retry firing after the
 * element was already released is skipped.
 * @param element Audio element whose play() was rejected.
 */
function retryPlayOnGesture(element: HTMLAudioElement): void {
  const resume = (): void => {
    if (!element.isConnected) return;
    silenceKeepAlive(element);
    void element.play().catch(() => undefined);
  };
  document.addEventListener('pointerdown', resume, { once: true });
}


/**
 * Stops and removes a keep-alive element from the document.
 * @param element Audio element to release.
 */
function releaseKeepAliveElement(element: HTMLAudioElement): void {
  element.pause();
  element.srcObject = null;
  element.remove();
}
