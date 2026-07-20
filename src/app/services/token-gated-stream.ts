/**
 * @file Self-healing bridge between the Firebase token lifecycle and the
 * app's persistent auth-gated Firestore streams. The outer chain follows
 * the raw per-emission ID-token observable ({@link AuthService.tokenChanges})
 * instead of the deduplicating user signal, whose reference-equal User
 * object suppresses token-refresh emissions entirely. A healthy inner query
 * survives token refreshes untouched (its gate key is unchanged, the
 * emission is deduplicated away — no listener churn), but once the inner
 * Firestore stream errors — Firestore listeners die terminally, e.g. when
 * they attached under a stale `email_verified` claim — the error is caught
 * INSIDE the projection: the safe empty value is emitted, the error is
 * reported once, and the next ID-token emission re-subscribes the query.
 * The outer auth-driven chain itself can therefore never die, and at most
 * one inner Firestore subscription exists per stream at any time — the
 * listener inventory is unchanged.
 */
import { User } from '@angular/fire/auth';
import { Observable, catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { AuthDiagnosticsService } from './auth-diagnostics.service';

/** Configuration of one self-healing, token-gated Firestore stream. */
export interface TokenGatedStreamConfig<T> {
  /** Stable stream label for the diagnostic panel. */
  readonly label: string;
  /** Raw ID-token lifecycle source ({@link AuthService.tokenChanges}). */
  readonly source: Observable<User | null>;
  /** Maps a signed-in user to a stable gate key, or null to stay empty. */
  readonly gate: (current: User) => string | null;
  /** Safe value emitted while gated off and after an inner error. */
  readonly empty: T;
  /** Builds the inner Firestore stream for a passing gate. */
  readonly build: (current: User) => Observable<T>;
  /** Diagnostics sink recording stream (re)starts and first errors. */
  readonly diagnostics: AuthDiagnosticsService;
  /** Reports one inner death via the existing error path (e.g. a toast). */
  readonly onError?: (error: unknown) => void;
  /** Runs at every (re)projection, e.g. to reset a loaded flag. */
  readonly reset?: () => void;
}

/** Gate evaluation of one token emission. */
interface GateState {
  readonly current: User | null;
  readonly key: string | null;
}

/** Mutable death marker shared between projection and recovery. */
interface StreamHealth {
  deadKey: string | null;
}


/**
 * Builds the self-healing stream: gate emissions are deduplicated by key
 * while the inner stream is healthy (token refreshes cause no listener
 * churn) and deliberately NOT deduplicated after an inner death, so the
 * next token emission re-projects and revives the query.
 * @param config Stream configuration.
 */
export function tokenGatedStream<T>(config: TokenGatedStreamConfig<T>): Observable<T> {
  const health: StreamHealth = { deadKey: null };
  return config.source.pipe(
    map(current => evaluateGate(current, config.gate)),
    distinctUntilChanged((a, b) => a.key === b.key && health.deadKey === null),
    switchMap(state => projectGate(config, state, health)),
  );
}


/**
 * Evaluates the gate for one token emission; signed-out maps to a null key.
 * @param current Emitted user, or null while signed out.
 * @param gate Gate function of the stream.
 */
function evaluateGate(current: User | null, gate: (current: User) => string | null): GateState {
  return { current, key: current ? gate(current) : null };
}


/**
 * Projects one gate state: a closed gate emits the safe empty value, an
 * open gate (re)subscribes the inner Firestore stream with the error
 * recovery attached inside the projection.
 * @param config Stream configuration.
 * @param state Evaluated gate state of the emission.
 * @param health Shared death marker.
 */
function projectGate<T>(
  config: TokenGatedStreamConfig<T>,
  state: GateState,
  health: StreamHealth,
): Observable<T> {
  health.deadKey = null;
  config.reset?.();
  const key = state.key;
  if (!state.current || key === null) return of(config.empty);
  config.diagnostics.streamStarted(config.label);
  return config.build(state.current).pipe(
    catchError(error => recoverFromDeath(config, key, health, error)),
  );
}


/**
 * Handles one inner death: marks the stream dead (arming the retry on the
 * next token emission), reports the error once and degrades to the safe
 * empty value so the outer chain keeps running.
 * @param config Stream configuration.
 * @param key Gate key the dead subscription ran under.
 * @param health Shared death marker.
 * @param error Error the inner stream died with.
 */
function recoverFromDeath<T>(
  config: TokenGatedStreamConfig<T>,
  key: string,
  health: StreamHealth,
  error: unknown,
): Observable<T> {
  health.deadKey = key;
  config.diagnostics.streamError(config.label, error);
  config.onError?.(error);
  return of(config.empty);
}
