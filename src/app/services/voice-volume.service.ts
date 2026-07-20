/**
 * @file Per-user remote voice volume (0–200 %) and local mute, persisted in
 * localStorage under "vibo:user-volume:{uid}". Purely local listening
 * preferences — zero Firestore involvement; the voice connection applies
 * the resulting gains to the WebAudio graph whenever they change or a
 * peer's stream (re)attaches. Storage failures never surface: reads fall
 * back to the defaults, writes are silently skipped.
 */
import { Injectable, signal } from '@angular/core';

import {
  USER_VOLUME_DEFAULT_PERCENT,
  USER_VOLUME_KEY_PREFIX,
  USER_VOLUME_MAX_PERCENT,
} from '../shared/voice.constants';
import { storeSetting } from './sound-settings.storage';

/** Stored listening preference for one remote user. */
export interface UserVolumeSetting {
  /** Volume in percent (0–200, 100 = unity gain). */
  readonly percent: number;
  /** Local mute; the percent survives underneath for the restore. */
  readonly muted: boolean;
}

const DEFAULT_SETTING: UserVolumeSetting = {
  percent: USER_VOLUME_DEFAULT_PERCENT,
  muted: false,
};

/**
 * Holds the per-user volume settings as one signal map (uid → setting) so
 * the volume menu and the voice connection react to every change; values
 * not touched this session are read through from localStorage.
 */
@Injectable({ providedIn: 'root' })
export class VoiceVolumeService {
  private readonly settingsState = signal<ReadonlyMap<string, UserVolumeSetting>>(new Map());

  /** Live map of the settings changed or loaded this session. */
  readonly settings = this.settingsState.asReadonly();


  /**
   * The current setting of a user: the session value if present, else the
   * persisted one, else the default (100 %, not muted).
   * @param uid Uid of the remote user.
   */
  settingFor(uid: string): UserVolumeSetting {
    return this.settingsState().get(uid) ?? readStoredSetting(uid);
  }


  /**
   * The effective playback gain of a user (0–2): zero while locally
   * muted, otherwise the stored percentage as a fraction.
   * @param uid Uid of the remote user.
   */
  effectiveGain(uid: string): number {
    const setting = this.settingFor(uid);
    return setting.muted ? 0 : setting.percent / USER_VOLUME_DEFAULT_PERCENT;
  }


  /**
   * Sets a user's volume percentage, clamped to the 0–200 range.
   * @param uid Uid of the remote user.
   * @param percent New volume in percent.
   */
  setPercent(uid: string, percent: number): void {
    const clamped = Math.min(USER_VOLUME_MAX_PERCENT, Math.max(0, Math.round(percent)));
    this.store(uid, { ...this.settingFor(uid), percent: clamped });
  }


  /**
   * Toggles the local mute of a user; the percentage survives underneath
   * and is restored on unmute.
   * @param uid Uid of the remote user.
   */
  toggleMuted(uid: string): void {
    const setting = this.settingFor(uid);
    this.store(uid, { ...setting, muted: !setting.muted });
  }


  /**
   * Resets a user to the default (100 %, not muted) and clears the
   * persisted entry.
   * @param uid Uid of the remote user.
   */
  reset(uid: string): void {
    this.publish(uid, DEFAULT_SETTING);
    try {
      localStorage.removeItem(USER_VOLUME_KEY_PREFIX + uid);
    } catch {
      return;
    }
  }


  /**
   * Publishes a setting into the signal map and persists it.
   * @param uid Uid of the remote user.
   * @param setting New setting value.
   */
  private store(uid: string, setting: UserVolumeSetting): void {
    this.publish(uid, setting);
    storeSetting(USER_VOLUME_KEY_PREFIX + uid, JSON.stringify(setting));
  }


  /**
   * Replaces a user's entry in the immutable signal map.
   * @param uid Uid of the remote user.
   * @param setting New setting value.
   */
  private publish(uid: string, setting: UserVolumeSetting): void {
    const next = new Map(this.settingsState());
    next.set(uid, setting);
    this.settingsState.set(next);
  }
}


/**
 * Reads a persisted setting, tolerating missing storage and malformed
 * values (both fall back to the default).
 * @param uid Uid of the remote user.
 */
function readStoredSetting(uid: string): UserVolumeSetting {
  try {
    const raw = localStorage.getItem(USER_VOLUME_KEY_PREFIX + uid);
    if (!raw) return DEFAULT_SETTING;
    return sanitizeSetting(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTING;
  }
}


/**
 * Narrows a parsed storage value to a valid setting; anything off-shape
 * or out of range falls back to the default.
 * @param parsed Parsed JSON value from storage.
 */
function sanitizeSetting(parsed: unknown): UserVolumeSetting {
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTING;
  const candidate = parsed as { percent?: unknown; muted?: unknown };
  if (typeof candidate.percent !== 'number' || Number.isNaN(candidate.percent)) return DEFAULT_SETTING;
  const percent = Math.min(USER_VOLUME_MAX_PERCENT, Math.max(0, Math.round(candidate.percent)));
  return { percent, muted: candidate.muted === true };
}
