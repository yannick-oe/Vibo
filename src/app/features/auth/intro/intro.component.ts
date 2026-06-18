/**
 * @file Intro splash overlay that hands the brand logo off to the page header.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { APP_NAME } from '../../../shared/app.constants';

const INTRO_PLAYED_KEY = 'dabubbleIntroPlayed';
const HOLD_DURATION_MS = 800;
const STEP_DURATION_MS = 500;
const TEXT_SLIDE_DURATION_MS = 1200;
const MOVE_DURATION_MS = 700;
const FADE_DELAY_MS = 200;
const FADE_DURATION_MS = 500;

/**
 * Full-viewport gradient splash showing the centered logo, which then glides
 * onto the header logo position while the overlay fades out. Plays once per
 * session and is skipped entirely when the user prefers reduced motion.
 */
@Component({
  selector: 'app-intro',
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroComponent implements OnInit {
  private readonly documentRef = inject(DOCUMENT);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly logo = viewChild<ElementRef<HTMLDivElement>>('logo');

  protected readonly appName = APP_NAME;

  protected readonly isVisible = signal(false);

  protected readonly isMoving = signal(false);

  protected readonly step = signal(0);

  /**
   * Starts the splash sequence unless it already played this session or the
   * user prefers reduced motion.
   */
  ngOnInit(): void {
    if (this.shouldSkip()) return;
    this.isVisible.set(true);
    
    setTimeout(() => {
      this.step.set(1);
      setTimeout(() => {
        this.step.set(2);
        setTimeout(() => this.startHandoff(), TEXT_SLIDE_DURATION_MS);
      }, STEP_DURATION_MS);
    }, HOLD_DURATION_MS);
  }

  /**
   * Determines whether the splash must be skipped entirely.
   * @returns True when reduced motion is preferred or the splash already ran.
   */
  private shouldSkip(): boolean {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reducedMotion || sessionStorage.getItem(INTRO_PLAYED_KEY) === 'true';
  }

  /**
   * Computes the header target transform and triggers the handoff motion.
   */
  private startHandoff(): void {
    this.applyTargetTransform();
    this.isMoving.set(true);
    const totalMs = Math.max(MOVE_DURATION_MS, FADE_DELAY_MS + FADE_DURATION_MS);
    setTimeout(() => this.finish(), totalMs);
  }

  /**
   * Measures the splash logo and the header logo and stores the resulting
   * translate/scale values as CSS custom properties on the host element.
   */
  private applyTargetTransform(): void {
    const logoElement = this.logo()?.nativeElement;
    const targetElement = this.documentRef.querySelector<HTMLElement>('.header__logo');
    if (!logoElement || !targetElement) return;
    this.setMotionVars(logoElement.getBoundingClientRect(), targetElement.getBoundingClientRect());
  }

  /**
   * Writes the motion custom properties used by the stylesheet transitions.
   * @param from Bounding box of the centered splash logo.
   * @param to Bounding box of the header logo target.
   */
  private setMotionVars(from: DOMRect, to: DOMRect): void {
    const style = this.host.nativeElement.style;
    style.setProperty('--intro-dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    style.setProperty('--intro-dy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    style.setProperty('--intro-scale', `${to.width / from.width}`);
    style.setProperty('--intro-move-ms', `${MOVE_DURATION_MS}ms`);
    style.setProperty('--intro-fade-ms', `${FADE_DURATION_MS}ms`);
    style.setProperty('--intro-fade-delay-ms', `${FADE_DELAY_MS}ms`);
  }

  /**
   * Removes the overlay and remembers that the splash ran this session.
   */
  private finish(): void {
    this.isVisible.set(false);
    sessionStorage.setItem(INTRO_PLAYED_KEY, 'true');
  }
}
