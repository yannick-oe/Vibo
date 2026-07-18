/**
 * @file Local-only speaking detection: one AnalyserNode per monitored
 * stream (the own microphone plus every remote peer), polled on a shared
 * interval. A session counts as speaking while its RMS level exceeds the
 * threshold, with a hold hysteresis so natural speech pauses do not
 * flicker the indicator. Zero Firestore writes — detection runs on every
 * client independently from the audio it already has.
 */

const SPEAKING_THRESHOLD = 0.04;

const SPEAKING_HOLD_MS = 400;

const SPEAKING_POLL_MS = 120;

const ANALYSER_FFT_SIZE = 1024;

/** Analyser state of one monitored session. */
interface MonitorEntry {
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly buffer: Float32Array<ArrayBuffer>;
  lastAboveMs: number;
}

/**
 * Watches the audio levels of all sessions in the connected voice channel
 * and reports the set of currently speaking session ids whenever it
 * changes. Disposed together with the voice connection; removing a peer
 * tears its analyser down with it.
 */
export class SpeakingMonitor {
  private readonly entries = new Map<string, MonitorEntry>();

  private readonly onChange: (speaking: ReadonlySet<string>) => void;

  private context: AudioContext | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;

  private lastEmitted: ReadonlySet<string> = new Set();


  /**
   * Creates the monitor with the change callback it reports into.
   * @param onChange Receives the new set of speaking session ids.
   */
  constructor(onChange: (speaking: ReadonlySet<string>) => void) {
    this.onChange = onChange;
  }


  /**
   * Starts analysing a session's stream; the shared context and poll loop
   * are created lazily with the first stream.
   * @param sessionId Session the stream belongs to.
   * @param stream Audio stream to analyse.
   */
  add(sessionId: string, stream: MediaStream): void {
    const context = this.ensureContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = new AnalyserNode(context, { fftSize: ANALYSER_FFT_SIZE });
    source.connect(analyser);
    this.entries.set(sessionId, {
      source,
      analyser,
      buffer: new Float32Array(ANALYSER_FFT_SIZE),
      lastAboveMs: 0,
    });
  }


  /**
   * Stops analysing a session (peer dropped) and clears its indicator.
   * @param sessionId Session to remove.
   */
  remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.source.disconnect();
    this.entries.delete(sessionId);
    this.emit(this.collectSpeaking());
  }


  /**
   * Tears the whole monitor down: all analysers, the poll loop and the
   * audio context; the indicator set is cleared. Idempotent.
   */
  dispose(): void {
    for (const entry of this.entries.values()) entry.source.disconnect();
    this.entries.clear();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.emit(new Set());
  }


  /**
   * Lazily creates the shared AudioContext and the poll loop; resumes a
   * suspended context (the join click is the activating gesture).
   */
  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext();
    void this.context.resume().catch(() => undefined);
    this.timer = setInterval(() => this.emit(this.collectSpeaking()), SPEAKING_POLL_MS);
    return this.context;
  }


  /**
   * Evaluates every analyser: a session speaks while its last
   * above-threshold sample is within the hold window.
   */
  private collectSpeaking(): ReadonlySet<string> {
    const now = performance.now();
    const speaking = new Set<string>();
    for (const [sessionId, entry] of this.entries) {
      if (rmsOf(entry) >= SPEAKING_THRESHOLD) entry.lastAboveMs = now;
      if (now - entry.lastAboveMs <= SPEAKING_HOLD_MS && entry.lastAboveMs > 0) {
        speaking.add(sessionId);
      }
    }
    return speaking;
  }


  /**
   * Reports the set to the callback only when it actually changed.
   * @param speaking Newly evaluated speaking set.
   */
  private emit(speaking: ReadonlySet<string>): void {
    if (setsEqual(speaking, this.lastEmitted)) return;
    this.lastEmitted = speaking;
    this.onChange(speaking);
  }
}


/**
 * Computes the RMS level of an analyser's current time-domain window.
 * @param entry Monitored session entry.
 */
function rmsOf(entry: MonitorEntry): number {
  entry.analyser.getFloatTimeDomainData(entry.buffer);
  let sum = 0;
  for (const sample of entry.buffer) sum += sample * sample;
  return Math.sqrt(sum / entry.buffer.length);
}


/**
 * Compares two session sets for equality.
 * @param a First set.
 * @param b Second set.
 */
function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
