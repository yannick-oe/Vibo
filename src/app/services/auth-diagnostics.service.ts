/**
 * @file TEMPORARY DIAGNOSTIC — remove after verification-flow signoff.
 * On-screen auth/token diagnostics behind the localStorage flag
 * `vibo:auth-debug` = '1': records every ID-token emission (the SDK's
 * emailVerified flag plus the locally atob-decoded `email_verified` token
 * claim), verify-screen step transitions, guard decisions and the
 * lifecycle of every gated Firestore stream (starts and first error per
 * stream). Rendered by the AuthDebugPanelComponent on the verify screen
 * and in the app shell. Entirely dormant without the flag — no listeners,
 * no entries, no cost. Never touches Firestore, never uses the console.
 * See DEVIATIONS.md (2026-07-20).
 */
import { EnvironmentInjector, Injectable, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { Auth, User, getIdToken, user } from '@angular/fire/auth';
import { FirebaseError } from 'firebase/app';

/** localStorage key that enables the diagnostic panel. */
export const AUTH_DEBUG_STORAGE_KEY = 'vibo:auth-debug';

const AUTH_DEBUG_ENABLED_VALUE = '1';

const MAX_LOG_ENTRIES = 150;

const UID_PREVIEW_LENGTH = 6;

const TOKEN_SEGMENT_SEPARATOR = '.';

const TOKEN_PAYLOAD_INDEX = 1;

const BASE64URL_DASH = /-/g;

const BASE64URL_UNDERSCORE = /_/g;

const BASE64_BLOCK_LENGTH = 4;

const TIME_SLICE_START = 11;

const TIME_SLICE_END = 23;

/** One timestamped diagnostic line rendered by the panel. */
export interface AuthDiagnosticEntry {
  readonly at: string;
  readonly source: string;
  readonly detail: string;
}

/**
 * TEMPORARY DIAGNOSTIC — remove after verification-flow signoff.
 * Collects the auth-flow evidence trail while the debug flag is set and
 * exposes it as a capped signal for the on-screen panel.
 */
@Injectable({ providedIn: 'root' })
export class AuthDiagnosticsService {
  private readonly auth = inject(Auth);

  private readonly injector = inject(EnvironmentInjector);

  /** Whether the localStorage debug flag was set when the app booted. */
  readonly enabled = readDebugFlag();

  private readonly entriesState = signal<readonly AuthDiagnosticEntry[]>([]);

  /** Recorded diagnostic lines, oldest first, capped at MAX_LOG_ENTRIES. */
  readonly entries = this.entriesState.asReadonly();

  private readonly dismissedState = signal(false);

  /** Whether the panel should render: flag set and not dismissed. */
  readonly visible = computed(() => this.enabled && !this.dismissedState());

  private readonly erroredStreams = new Set<string>();


  /**
   * Observes the ID-token lifecycle only while the flag is set; without it
   * the service holds no subscription and every method is a no-op.
   */
  constructor() {
    if (this.enabled) user(this.auth).subscribe(current => this.logTokenState(current));
  }


  /**
   * Records one diagnostic line; no-op while the flag is absent.
   * @param source Short origin tag (token, verify, guard, stream).
   * @param detail Human-readable event description.
   */
  log(source: string, detail: string): void {
    if (!this.enabled) return;
    const at = new Date().toISOString().slice(TIME_SLICE_START, TIME_SLICE_END);
    this.entriesState.update(list => [...list, { at, source, detail }].slice(-MAX_LOG_ENTRIES));
  }


  /**
   * Records a gated Firestore stream (re)start.
   * @param label Stable stream label.
   */
  streamStarted(label: string): void {
    this.log('stream', `${label} start`);
  }


  /**
   * Records the FIRST error of a stream with its code; later errors of the
   * same stream are dropped so a flapping stream cannot flood the panel.
   * @param label Stable stream label.
   * @param error Error the stream died with.
   */
  streamError(label: string, error: unknown): void {
    if (!this.enabled || this.erroredStreams.has(label)) return;
    this.erroredStreams.add(label);
    this.log('stream', `${label} error: ${errorCode(error)}`);
  }


  /**
   * Hides the panel for the rest of the session (the flag stays set).
   */
  dismiss(): void {
    this.dismissedState.set(true);
  }


  /**
   * Logs one ID-token emission: the SDK's account flag immediately, the
   * decoded token claim asynchronously once the cached JWT is available.
   * @param current Emitted user, or null while signed out.
   */
  private logTokenState(current: User | null): void {
    if (!current) return this.log('token', 'signed out');
    const uid = current.uid.slice(0, UID_PREVIEW_LENGTH);
    this.log('token', `uid=${uid}… emailVerified=${current.emailVerified}`);
    void this.logDecodedClaim(current);
  }


  /**
   * Reads the cached JWT (no forced refresh) and logs its locally decoded
   * `email_verified` payload claim; decode failures are logged, not thrown.
   * @param current Signed-in user of the emission.
   */
  private async logDecodedClaim(current: User): Promise<void> {
    try {
      const token = await runInInjectionContext(this.injector, () => getIdToken(current));
      this.log('token', `claim email_verified=${decodeVerifiedClaim(token)}`);
    } catch {
      this.log('token', 'claim decode failed');
    }
  }
}


/**
 * Reads the debug flag once; storage access failures (private mode) count
 * as disabled.
 */
function readDebugFlag(): boolean {
  try {
    return localStorage.getItem(AUTH_DEBUG_STORAGE_KEY) === AUTH_DEBUG_ENABLED_VALUE;
  } catch {
    return false;
  }
}


/**
 * Decodes the JWT's payload segment locally (base64url → atob → JSON, no
 * library, no network) and returns its `email_verified` claim as a string.
 * @param token Raw ID-token JWT.
 */
function decodeVerifiedClaim(token: string): string {
  const segment = token.split(TOKEN_SEGMENT_SEPARATOR)[TOKEN_PAYLOAD_INDEX] ?? '';
  const base64 = segment.replace(BASE64URL_DASH, '+').replace(BASE64URL_UNDERSCORE, '/');
  const padLength = (BASE64_BLOCK_LENGTH - (base64.length % BASE64_BLOCK_LENGTH)) % BASE64_BLOCK_LENGTH;
  const claims = JSON.parse(atob(base64 + '='.repeat(padLength))) as Record<string, unknown>;
  return String(claims['email_verified']);
}


/**
 * Extracts a short error code for the panel: the Firebase code when
 * available, otherwise the error message or its string form.
 * @param error Unknown error a stream died with.
 */
function errorCode(error: unknown): string {
  if (error instanceof FirebaseError) return error.code;
  return error instanceof Error ? error.message : String(error);
}
