/**
 * @file E-mail verification screen shown after registration, after a
 * sign-in with an unverified account and as the landing target of the
 * mail's continue link: explains the sent e-mail, offers a
 * cooldown-guarded resend, auto-runs the confirmation on load and — once
 * the token claim is proven — enters the app via a FULL-PAGE load, never a
 * router navigation (see {@link VerifyEmailComponent.enterApp}). Talks
 * only to Firebase Auth — no Firestore access here.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AccountSecurityService } from '../../../services/account-security.service';
import { AuthDiagnosticsService } from '../../../services/auth-diagnostics.service';
import { AuthService } from '../../../services/auth.service';
import { PendingInviteService } from '../../../services/pending-invite.service';
import { ToastService } from '../../../services/toast.service';
import { AuthDebugPanelComponent } from '../../../shared/auth-debug-panel/auth-debug-panel.component';

const RESEND_COOLDOWN_S = 60;

const APP_ENTRY_FRAGMENT = '#/app';

const INVITE_ENTRY_FRAGMENT_PREFIX = '#/invite/';

const COOLDOWN_TICK_MS = 1000;

const SEND_ICON = 'app-icons/send-white.svg';

const SENT_TOAST_MESSAGE = 'E-Mail gesendet';

const NOT_VERIFIED_MESSAGE =
  'Deine E-Mail-Adresse ist noch nicht bestätigt. Öffne den Link in der E-Mail und versuche es dann erneut.';

const TOO_MANY_REQUESTS_MESSAGE = 'Zu viele Versuche. Bitte warte einen Moment.';

const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';

/**
 * Verification gate of the auth area. The primary action re-checks the
 * account (reload plus forced token refresh, so the security rules see the
 * verified state) and proceeds; resending is limited by a visible cooldown.
 */
@Component({
  selector: 'app-verify-email',
  imports: [AuthDebugPanelComponent],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailComponent implements AfterViewInit {
  private readonly accountSecurity = inject(AccountSecurityService);

  private readonly diagnostics = inject(AuthDiagnosticsService);

  private readonly authService = inject(AuthService);

  private readonly pendingInvite = inject(PendingInviteService);

  private readonly router = inject(Router);

  private readonly toast = inject(ToastService);

  private readonly destroyRef = inject(DestroyRef);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly email = this.accountSecurity.currentEmail();

  protected readonly isPending = signal(false);

  protected readonly isChecking = signal(false);

  protected readonly cooldownLeft = signal(0);

  protected readonly errorMessage = signal('');

  protected readonly resendLabel = computed(() =>
    this.cooldownLeft() > 0 ? `Erneut senden (${this.cooldownLeft()} s)` : 'E-Mail erneut senden',
  );


  /**
   * Clears the cooldown interval when the screen is left and auto-runs the
   * confirmation for a signed-in, non-guest account — the mail's continue
   * link lands here, so the check must not wait for a click.
   */
  constructor() {
    this.destroyRef.onDestroy(() => this.stopCooldown());
    if (this.accountSecurity.shouldAutoConfirm()) void this.autoConfirm();
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Manual "Ich habe bestätigt" re-check; a proven claim enters the app via
   * the full-page load, an unconfirmed address shows the hint and a claim
   * that never became visible falls to the general error. On success the
   * pending/checking flags deliberately stay set, so the reserved
   * "Bestätigung wird geprüft…" status remains visible until the replace
   * fires (CLS 0).
   */
  protected async confirm(): Promise<void> {
    if (this.isPending()) return;
    this.diagnostics.log('verify', 'manual confirm start');
    this.isPending.set(true);
    this.isChecking.set(true);
    this.errorMessage.set('');
    try {
      const outcome = await this.accountSecurity.confirmVerified();
      this.diagnostics.log('verify', `manual confirm outcome=${outcome}`);
      if (outcome === 'verified') return this.enterApp();
      this.errorMessage.set(outcome === 'unverified' ? NOT_VERIFIED_MESSAGE : GENERAL_ERROR_MESSAGE);
    } catch {
      this.errorMessage.set(GENERAL_ERROR_MESSAGE);
    }
    this.settle();
  }


  /**
   * Auto-continue on load — runs for BOTH remaining confirm paths: the
   * mail's continueUrl tab landing here and the login-redirect of a
   * meanwhile-verified account. A proven claim enters the app via the
   * full-page load, a still-unverified address keeps the screen unchanged
   * and a failed refresh (offline) shows the general error — the app is
   * never entered without a proven claim. On success the flags stay set so
   * the reserved checking status remains visible until the replace fires.
   */
  private async autoConfirm(): Promise<void> {
    this.diagnostics.log('verify', 'auto-confirm start');
    this.isPending.set(true);
    this.isChecking.set(true);
    try {
      const outcome = await this.accountSecurity.confirmVerified();
      this.diagnostics.log('verify', `auto-confirm outcome=${outcome}`);
      if (outcome === 'verified') return this.enterApp();
      if (outcome === 'failed') this.errorMessage.set(GENERAL_ERROR_MESSAGE);
    } catch {
      this.errorMessage.set(GENERAL_ERROR_MESSAGE);
    }
    this.settle();
  }


  /**
   * Clears the pending/checking flags after a NON-verified outcome; a
   * verified outcome deliberately never settles, keeping the reserved
   * checking status visible until the full-page replace fires.
   */
  private settle(): void {
    this.isPending.set(false);
    this.isChecking.set(false);
  }


  /**
   * Enters the app AFTER a proven claim via a full-page load —
   * `location.replace` on the deployment-aware base — never a router
   * navigation. Rationale: the forced refresh persists the fresh token, so
   * a full reload boots guards, services and every Firestore stream on a
   * verified token from the first instruction — no bootstrap ordering (or
   * Auth→Firestore token propagation inside the running SDKs) can regress
   * into streams attaching under the stale claim. `replace` keeps the
   * verify screen out of the history so Back cannot return to it.
   */
  private enterApp(): void {
    this.diagnostics.log('verify', 'entering app via full-page load');
    location.replace(`${document.baseURI}${this.entryFragment()}`);
  }


  /**
   * Resends the verification e-mail and starts the visible cooldown.
   */
  protected async resend(): Promise<void> {
    if (this.isPending() || this.cooldownLeft() > 0) return;
    this.isPending.set(true);
    this.errorMessage.set('');
    try {
      await this.accountSecurity.sendVerificationEmail();
      this.toast.show(SENT_TOAST_MESSAGE, SEND_ICON);
      this.startCooldown();
    } catch (error: unknown) {
      this.handleResendError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Signs the unverified account out and returns to the login page.
   */
  protected async signOut(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/auth/login']);
  }


  /**
   * Hash fragment to continue on after verification: back to a pending
   * channel invite opened while signed out, otherwise into the app.
   */
  private entryFragment(): string {
    const token = this.pendingInvite.consume();
    return token ? `${INVITE_ENTRY_FRAGMENT_PREFIX}${token}` : APP_ENTRY_FRAGMENT;
  }


  /**
   * Maps resend errors to the reserved message slot.
   * @param error Unknown error thrown by the send call.
   */
  private handleResendError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    const tooMany = code === 'auth/too-many-requests';
    this.errorMessage.set(tooMany ? TOO_MANY_REQUESTS_MESSAGE : GENERAL_ERROR_MESSAGE);
  }


  /**
   * Starts the resend cooldown countdown at its full duration.
   */
  private startCooldown(): void {
    this.cooldownLeft.set(RESEND_COOLDOWN_S);
    this.cooldownTimer = setInterval(() => this.tickCooldown(), COOLDOWN_TICK_MS);
  }


  /**
   * Counts the cooldown down by one second and stops the timer at zero.
   */
  private tickCooldown(): void {
    const next = this.cooldownLeft() - 1;
    this.cooldownLeft.set(Math.max(0, next));
    if (next <= 0) this.stopCooldown();
  }


  /**
   * Clears a running cooldown interval.
   */
  private stopCooldown(): void {
    if (this.cooldownTimer !== null) clearInterval(this.cooldownTimer);
    this.cooldownTimer = null;
  }
}
