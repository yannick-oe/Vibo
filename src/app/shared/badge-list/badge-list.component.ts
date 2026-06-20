/**
 * @file Presentational row of profile badges. Renders the matching cosmic
 * icons next to a name; each badge is a focusable trigger whose label and
 * description appear in a tooltip on hover and focus (dismissible via Escape,
 * WCAG 1.4.13). The full text is also the trigger's accessible name, so the
 * tooltip itself stays decorative (aria-hidden) and needs no element ids.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { BadgeOption, resolveBadges } from '../badge-options';

/**
 * Renders the badges named by `badges` (unknown ids are dropped). Place it
 * next to — never inside — an interactive name element so its focusable badge
 * triggers do not nest in another control.
 */
@Component({
  selector: 'app-badge-list',
  templateUrl: './badge-list.component.html',
  styleUrl: './badge-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeListComponent {
  readonly badges = input<readonly string[]>([]);

  private readonly sanitizer = inject(DomSanitizer);

  private readonly iconCache = new Map<string, SafeHtml>();

  protected readonly dismissed = signal<string | null>(null);

  protected readonly resolved = computed<BadgeOption[]>(() => resolveBadges(this.badges()));


  /**
   * Returns the trusted inline SVG for a badge, cached because the icons are
   * static, internal constants (no user input ever reaches this).
   * @param badge Badge whose icon markup is requested.
   */
  protected iconHtml(badge: BadgeOption): SafeHtml {
    const cached = this.iconCache.get(badge.id);
    if (cached) return cached;
    const safe = this.sanitizer.bypassSecurityTrustHtml(badge.icon);
    this.iconCache.set(badge.id, safe);
    return safe;
  }


  /**
   * Hides a badge's tooltip on Escape without moving focus (WCAG 1.4.13).
   * @param id Id of the focused badge.
   */
  protected dismiss(id: string): void {
    this.dismissed.set(id);
  }


  /**
   * Clears the dismissal when focus leaves the badge so the tooltip can show
   * again on the next focus or hover.
   * @param id Id of the badge losing focus.
   */
  protected resetDismiss(id: string): void {
    if (this.dismissed() === id) this.dismissed.set(null);
  }
}
