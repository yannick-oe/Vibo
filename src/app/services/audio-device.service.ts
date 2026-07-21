/**
 * @file Per-machine microphone input-device preference (Discord pattern):
 * the stored device id lives in localStorage only — a device choice is
 * hardware-bound, so it never touches Firestore — plus the enumeration of
 * the available audio inputs and the capture-constraint resolution. A
 * stored device that is currently absent (e.g. a Continuity iPhone that
 * left the room) falls back to the system default WITHOUT clearing the
 * stored choice; the fallback is announced once per session via toast.
 */
import { Injectable, inject, signal } from '@angular/core';

import { AUDIO_INPUT_DEVICE_KEY, VOICE_CONSTRAINTS } from '../shared/voice.constants';
import { ToastService } from './toast.service';

const DEVICE_FALLBACK_TOAST =
  'Gespeichertes Mikrofon nicht gefunden — Systemstandard wird verwendet.';

const AUDIO_INPUT_KIND = 'audioinput';

/**
 * Owns the microphone input-device selection: the persisted choice as a
 * signal (null = system default), the audioinput enumeration for the
 * settings dropdown and the effective getUserMedia constraints. The
 * stored id is requested via `deviceId: { exact }` ONLY after its
 * presence was confirmed against enumerateDevices(), so a vanished
 * device can never fail the join.
 */
@Injectable({ providedIn: 'root' })
export class AudioDeviceService {
  private readonly toastService = inject(ToastService);

  private readonly selectedDeviceIdState = signal<string | null>(readStoredDeviceId());

  /** Persisted input-device id, or null for the system default. */
  readonly selectedDeviceId = this.selectedDeviceIdState.asReadonly();

  private fallbackNotified = false;


  /**
   * Selects an input device and persists the choice; null (system
   * default) removes the stored key entirely.
   * @param deviceId Device id to store, or null for the system default.
   */
  select(deviceId: string | null): void {
    this.persist(deviceId);
    this.selectedDeviceIdState.set(deviceId);
  }


  /**
   * Enumerates the currently available audio input devices; an
   * unsupported or failing API yields an empty list.
   */
  async listInputs(): Promise<readonly MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === AUDIO_INPUT_KIND);
    } catch {
      return [];
    }
  }


  /**
   * Resolves the audio constraints for the next capture: the base voice
   * constraints, plus the stored device pinned exactly when it is
   * currently present. An absent stored device falls back to the system
   * default without clearing the choice and shows the one-time toast.
   */
  async resolveConstraints(): Promise<MediaTrackConstraints> {
    const stored = this.selectedDeviceIdState();
    if (stored === null) return { ...VOICE_CONSTRAINTS };
    const inputs = await this.listInputs();
    if (inputs.some(device => device.deviceId === stored)) {
      return { ...VOICE_CONSTRAINTS, deviceId: { exact: stored } };
    }
    this.notifyFallback();
    return { ...VOICE_CONSTRAINTS };
  }


  /**
   * Shows the missing-device fallback toast once per app session.
   */
  private notifyFallback(): void {
    if (this.fallbackNotified) return;
    this.fallbackNotified = true;
    this.toastService.show(DEVICE_FALLBACK_TOAST);
  }


  /**
   * Persists or clears the stored device id; storage failures (private
   * mode) are ignored — the choice then simply lives for the session.
   * @param deviceId Device id to store, or null to clear.
   */
  private persist(deviceId: string | null): void {
    try {
      if (deviceId === null) localStorage.removeItem(AUDIO_INPUT_DEVICE_KEY);
      else localStorage.setItem(AUDIO_INPUT_DEVICE_KEY, deviceId);
    } catch {
      return;
    }
  }
}


/**
 * Reads the persisted input-device id; missing values or unavailable
 * storage yield null (system default).
 */
function readStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(AUDIO_INPUT_DEVICE_KEY);
  } catch {
    return null;
  }
}
