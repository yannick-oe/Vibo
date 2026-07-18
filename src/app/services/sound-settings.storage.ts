/**
 * @file localStorage persistence helpers of the sound settings (master
 * toggle, volume, sidebar-sound opt-in). Storage failures (private mode,
 * blocked storage) never surface: reads fall back to the given default and
 * writes are silently skipped — the settings simply live for the session.
 */

/**
 * Reads a persisted boolean setting; malformed or missing values (or
 * unavailable storage) fall back to the default.
 * @param key localStorage key.
 * @param fallback Default when nothing valid is stored.
 */
export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}


/**
 * Reads the persisted volume; malformed or missing values (or unavailable
 * storage) fall back to the default, valid values are clamped to 0–1.
 * @param key localStorage key.
 * @param fallback Default when nothing valid is stored.
 */
export function readStoredVolume(key: string, fallback: number): number {
  try {
    const parsed = Number(localStorage.getItem(key));
    if (localStorage.getItem(key) === null || Number.isNaN(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return fallback;
  }
}


/**
 * Persists a setting value; storage errors are ignored because the
 * settings work without persistence.
 * @param key localStorage key.
 * @param value Serialized setting value.
 */
export function storeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}
