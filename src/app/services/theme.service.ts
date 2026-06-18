/**
 * @file Theme service: holds the active light/dark theme as a signal, reflects
 * it onto the document element, and persists the choice to localStorage. A tiny
 * inline script in index.html applies the same attribute before first paint to
 * avoid a flash of the wrong theme; this service is the runtime source of truth.
 */
import {
  DOCUMENT,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

/** Supported color themes. */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vibo:theme';
const THEME_ATTRIBUTE = 'data-theme';
const DARK = 'dark';
const LIGHT = 'light';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const WORDMARK_LIGHT = 'logos/logo-text.svg';
const WORDMARK_DARK = 'logos/logo-text-light.svg';

/**
 * Manages the application color theme. Initial value is the stored preference,
 * falling back to the operating-system setting. Changes persist and are mirrored
 * onto `<html data-theme>` so the token layer (`[data-theme="dark"]`) applies.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly documentRef = inject(DOCUMENT);

  private readonly themeSignal = signal<Theme>(this.readInitialTheme());

  readonly theme = this.themeSignal.asReadonly();

  readonly isDark = computed(() => this.themeSignal() === DARK);

  readonly wordmarkSrc = computed(() => (this.isDark() ? WORDMARK_DARK : WORDMARK_LIGHT));

  /**
   * Reflects every theme change onto the document element and persists it.
   */
  constructor() {
    effect(() => this.applyTheme(this.themeSignal()));
  }

  /**
   * Switches between light and dark.
   */
  toggle(): void {
    this.themeSignal.update(current => (current === DARK ? LIGHT : DARK));
  }

  /**
   * Sets an explicit theme.
   * @param theme Theme to activate.
   */
  set(theme: Theme): void {
    this.themeSignal.set(theme);
  }

  /**
   * Resolves the initial theme from storage, falling back to the OS setting.
   * @returns The theme to start with.
   */
  private readInitialTheme(): Theme {
    const stored = this.readStored();
    if (stored === LIGHT || stored === DARK) return stored;
    return this.prefersDark() ? DARK : LIGHT;
  }

  /**
   * Mirrors the theme onto `<html>` and writes it to storage.
   * @param theme Theme to apply.
   */
  private applyTheme(theme: Theme): void {
    const root = this.documentRef.documentElement;
    if (theme === DARK) root.setAttribute(THEME_ATTRIBUTE, DARK);
    else root.removeAttribute(THEME_ATTRIBUTE);
    this.writeStored(theme);
  }

  /**
   * Reads the persisted theme, guarded against blocked storage access.
   * @returns The stored value or null.
   */
  private readStored(): string | null {
    try {
      return this.documentRef.defaultView?.localStorage.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Persists the theme, guarded against blocked storage access.
   * @param theme Theme to store.
   */
  private writeStored(theme: Theme): void {
    try {
      this.documentRef.defaultView?.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      return;
    }
  }

  /**
   * Reads the operating-system dark-mode preference.
   * @returns True when the OS prefers a dark color scheme.
   */
  private prefersDark(): boolean {
    return this.documentRef.defaultView?.matchMedia(DARK_MEDIA_QUERY).matches ?? false;
  }
}
