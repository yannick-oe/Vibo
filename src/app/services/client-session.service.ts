/**
 * @file Per-tab client-session id. A stable random id that distinguishes browser
 * tabs which share one authenticated identity — in particular the shared guest
 * account, where several windows carry the same uid. Per-session presence (the
 * typing marker) keys by this id, not the uid, so two guest windows see each
 * other type instead of muting themselves. Persisted in sessionStorage: it
 * survives a reload of the same tab (so the reused tab overwrites its own typing
 * marker instead of orphaning it) while each new tab still gets its own id.
 */
import { Injectable } from '@angular/core';

const SESSION_STORAGE_KEY = 'vibo:client-session';

/**
 * Resolves the tab's client-session id: reuses the one stored for this tab, or
 * mints and stores a fresh one. Falls back to a volatile id when sessionStorage
 * is unavailable (private mode), which is still unique per page load.
 */
function resolveSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Exposes the tab's stable client-session id for the app's lifetime.
 */
@Injectable({ providedIn: 'root' })
export class ClientSessionService {
  readonly id: string = resolveSessionId();
}
