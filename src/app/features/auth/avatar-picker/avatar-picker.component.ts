/**
 * @file Avatar selection step: picks a profile image and completes signup.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { MessageService } from '../../../services/message.service';
import { PendingInviteService } from '../../../services/pending-invite.service';
import { RegistrationFormData, RegistrationService } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { AVATAR_OPTIONS } from '../../../shared/avatar-options';
import { DEFAULT_CHANNEL_ID } from '../../../shared/channels.constants';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { AvatarActivatorDirective } from '../../../shared/avatar/avatar-activator.directive';

const SUCCESS_REDIRECT_DELAY_MS = 1500;
const SUCCESS_TOAST_MESSAGE = 'Konto erfolgreich erstellt!';

const PASSWORD_MIN_LENGTH = 6;
const EMAIL_IN_USE_MESSAGE = 'Diese E-Mail-Adresse wird bereits verwendet';
const WEAK_PASSWORD_MESSAGE = `Dein Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`;
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';

/**
 * Second step of the registration flow. Lets the user pick one of the
 * provided avatars (placeholder allowed) and runs the Firebase signup.
 */
@Component({
  selector: 'app-avatar-picker',
  imports: [AvatarComponent, AvatarActivatorDirective],
  templateUrl: './avatar-picker.component.html',
  styleUrl: './avatar-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarPickerComponent implements AfterViewInit {
  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly messageService = inject(MessageService);

  private readonly registration = inject(RegistrationService);

  private readonly pendingInvite = inject(PendingInviteService);

  private readonly router = inject(Router);

  private readonly toast = inject(ToastService);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  protected readonly avatars = AVATAR_OPTIONS;

  protected readonly isPending = signal(false);

  protected readonly isSuccess = signal(false);

  protected readonly generalError = signal('');

  protected readonly previewPath = computed(() => this.registration.avatarPath());

  protected readonly userName = computed(() => this.registration.data()?.username ?? '');


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Marks an avatar as the selected profile image.
   * @param path Public asset path of the avatar.
   */
  protected select(path: string): void {
    this.registration.avatarPath.set(path);
  }


  /**
   * Reports whether the given avatar is currently selected.
   * @param path Public asset path of the avatar.
   */
  protected isSelected(path: string): boolean {
    return this.registration.avatarPath() === path;
  }


  /**
   * Runs the Firebase signup with the collected registration data.
   */
  protected async submit(): Promise<void> {
    const data = this.registration.data();
    if (!data || this.isPending()) return;
    this.isPending.set(true);
    this.generalError.set('');
    try {
      await this.completeSignup(data);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Registers the account, then joins the default channel before showing
   * success so the new user is a member immediately on first login.
   * @param data Validated registration form values.
   */
  private async completeSignup(data: RegistrationFormData): Promise<void> {
    try {
      const uid = await this.authService.register(data, this.registration.avatarPath());
      await this.channelService.ensureDefaultChannelExists();
      await this.channelService.joinDefaultChannel(uid);
      await this.messageService.sendJoinMessage(DEFAULT_CHANNEL_ID);
      this.finishSuccessfully();
    } catch (error: unknown) {
      this.handleSignupError(error);
    }
  }


  /**
   * Shows the success toast, then routes back to a pending channel invite
   * (registration signs the user in, so the redeem page can offer the
   * join directly) or to the login page.
   * TODO: redirect to the main app instead once it exists.
   */
  private finishSuccessfully(): void {
    this.isSuccess.set(true);
    this.toast.show(SUCCESS_TOAST_MESSAGE);
    setTimeout(() => {
      const token = this.pendingInvite.consume();
      this.registration.reset();
      this.router.navigate(token ? ['/invite', token] : ['/auth/login']);
    }, SUCCESS_REDIRECT_DELAY_MS);
  }


  /**
   * Maps Firebase signup errors to field or general messages.
   * @param error Unknown error thrown by the signup call.
   */
  private handleSignupError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'auth/email-already-in-use') {
      this.failBackToForm('email', EMAIL_IN_USE_MESSAGE);
      return;
    }
    if (code === 'auth/weak-password') {
      this.failBackToForm('password', WEAK_PASSWORD_MESSAGE);
      return;
    }
    this.generalError.set(GENERAL_ERROR_MESSAGE);
  }


  /**
   * Transports a field error back to the form step and navigates there.
   * @param field Affected form control key.
   * @param message German error message for the field.
   */
  private failBackToForm(field: 'email' | 'password', message: string): void {
    this.registration.fieldError.set({ field, message });
    this.router.navigate(['/auth/register']);
  }


  /**
   * Returns to the form step; its data stays preserved in the service.
   */
  protected goBack(): void {
    this.router.navigate(['/auth/register']);
  }
}
