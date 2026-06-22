/**
 * @file Profile dialog: own profile with inline edit mode, foreign
 * profiles with the direct-message shortcut.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { DEFAULT_AVATAR_PATH, resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { ProfileDraft, UserService } from '../../../services/user.service';
import { AVATAR_OPTIONS } from '../../../shared/avatar-options';
import { AuroraNameComponent } from '../../../shared/aurora-name/aurora-name.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { BadgeListComponent } from '../../../shared/badge-list/badge-list.component';
import { displayBadges } from '../../../shared/badge-options';
import { BANNER_NONE, BANNER_OPTIONS } from '../../../shared/banner-options';
import { ProfileBannerComponent } from '../../../shared/profile-banner/profile-banner.component';
import { DialogAnchor, DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import {
  NAME_MAX_LENGTH,
  displayNameErrorMessage,
  displayNameErrors,
  displayNameValidator,
  normalizeName,
} from '../../../shared/validators/display-name.validators';

const SAVE_ERROR = 'Das Profil konnte nicht gespeichert werden.';
const UNKNOWN_USER = 'Unbekannt';
const STATUS_ACTIVE = 'Aktiv';
const STATUS_AWAY = 'Abwesend';
const PROFILE_VIEW_TITLE = 'Profil';
const PROFILE_EDIT_TITLE = 'Dein Profil bearbeiten';
const GUEST_PROFILE_TITLE = 'Dein Profil';
const GUEST_NOTE = 'Als Gast kannst du Name und Avatar nicht ändern.';
const GUEST_NOTE_ID = 'profile-guest-note';
const BANNER_KEYS_NEXT = ['ArrowRight', 'ArrowDown'];
const BANNER_KEYS_PREV = ['ArrowLeft', 'ArrowUp'];
const STATUS_MAX_LENGTH = 60;
const STATUS_PLACEHOLDER = 'Was machst du gerade?';

type ProfileMode = 'view' | 'edit';

/**
 * Profile dialog per the Figma frames: the own profile ("Profil") offers
 * the "Bearbeiten" link switching to the edit card with name input and
 * avatar selection from the provided set; foreign profiles offer the
 * "Nachricht" button that opens the direct conversation. Presence stays
 * static (self "Aktiv", others "Abwesend") per the module 3 decision.
 */
@Component({
  selector: 'app-profile-dialog',
  imports: [
    ReactiveFormsModule,
    DialogShellComponent,
    ProfileBannerComponent,
    AuroraNameComponent,
    AvatarComponent,
    BadgeListComponent,
  ],
  templateUrl: './profile-dialog.component.html',
  styleUrl: './profile-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileDialogComponent {
  readonly uid = input.required<string>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  protected readonly avatars = AVATAR_OPTIONS;

  protected readonly banners = BANNER_OPTIONS;

  private readonly bannerButtons = viewChildren<ElementRef<HTMLButtonElement>>('bannerOption');

  protected readonly mode = signal<ProfileMode>('view');

  protected readonly nameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [displayNameValidator],
  });

  private readonly nameValue = toSignal(this.nameControl.valueChanges, { initialValue: '' });

  protected readonly nameTouched = signal(false);

  private readonly nameErrors = computed(() => displayNameErrors(this.nameValue()));

  protected readonly nameInvalid = computed(() => this.nameErrors() !== null);

  protected readonly showNameError = computed(() => this.nameTouched() && this.nameInvalid());

  protected readonly nameErrorText = computed(() =>
    this.showNameError() ? displayNameErrorMessage(this.nameErrors()) : '',
  );

  protected readonly nameLength = computed(() => normalizeName(this.nameValue()).length);

  protected readonly nameMax = NAME_MAX_LENGTH;

  protected readonly selectedAvatar = signal(DEFAULT_AVATAR_PATH);

  protected readonly selectedBanner = signal<string>(BANNER_NONE);

  protected readonly statusDraft = signal('');

  protected readonly animatedNameDraft = signal(false);

  protected readonly statusMax = STATUS_MAX_LENGTH;

  protected readonly statusPlaceholder = STATUS_PLACEHOLDER;

  protected readonly isPending = signal(false);

  protected readonly user = computed(() =>
    this.userService.users().find(user => user.uid === this.uid()),
  );

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  protected readonly isGuestSelf = computed(() => this.isSelf() && this.authService.isGuest());

  protected readonly headerTitle = computed(() => this.resolveTitle());

  protected readonly descriptionId = computed(() => (this.isGuestSelf() ? GUEST_NOTE_ID : null));

  protected readonly guestNote = GUEST_NOTE;

  protected readonly guestNoteId = GUEST_NOTE_ID;

  protected readonly displayName = computed(() => this.user()?.name ?? UNKNOWN_USER);

  protected readonly email = computed(() => this.user()?.email ?? null);

  protected readonly statusLabel = computed(() => (this.isSelf() ? STATUS_ACTIVE : STATUS_AWAY));

  protected readonly userBanner = computed(() => this.user()?.banner ?? BANNER_NONE);

  protected readonly cardBanner = computed(() =>
    this.mode() === 'edit' ? this.selectedBanner() : this.userBanner(),
  );

  protected readonly hasCardBanner = computed(() => this.cardBanner() !== BANNER_NONE);

  protected readonly cardAvatarPath = computed(() =>
    this.mode() === 'edit' ? this.selectedAvatar() : (this.user()?.avatarPath ?? DEFAULT_AVATAR_PATH),
  );

  protected readonly userStatus = computed(() => this.user()?.status ?? '');

  protected readonly userAnimatedName = computed(() => this.user()?.animatedName ?? false);

  protected readonly userBadges = computed(() => {
    const profile = this.user();
    return profile ? displayBadges(profile) : [];
  });


  /**
   * Resolves the dialog title: the edit title while editing, "Dein Profil"
   * for the read-only guest profile, otherwise the plain view title.
   */
  private resolveTitle(): string {
    if (this.mode() === 'edit') return PROFILE_EDIT_TITLE;
    return this.isGuestSelf() ? GUEST_PROFILE_TITLE : PROFILE_VIEW_TITLE;
  }


  /**
   * Switches to the edit card with the current profile as draft; the shared
   * guest account cannot edit, so this is a no-op for the guest.
   */
  protected startEdit(): void {
    if (this.authService.isGuest()) return;
    this.nameControl.setValue(this.user()?.name ?? '');
    this.nameTouched.set(false);
    this.selectedAvatar.set(this.user()?.avatarPath ?? DEFAULT_AVATAR_PATH);
    this.selectedBanner.set(this.user()?.banner ?? BANNER_NONE);
    this.statusDraft.set(this.user()?.status ?? '');
    this.animatedNameDraft.set(this.user()?.animatedName ?? false);
    this.mode.set('edit');
  }


  /**
   * Discards the draft and returns to the view card.
   */
  protected cancelEdit(): void {
    this.mode.set('view');
  }


  /**
   * Syncs the status draft with its input; the field's maxlength hard-enforces
   * the character cap so the stored value can never exceed it.
   * @param event Input event of the status field.
   */
  protected onStatusInput(event: Event): void {
    this.statusDraft.set((event.target as HTMLInputElement).value);
  }


  /**
   * Clears the status draft.
   */
  protected clearStatus(): void {
    this.statusDraft.set('');
  }


  /**
   * Toggles the animated-name switch in the draft.
   */
  protected toggleAnimatedName(): void {
    this.animatedNameDraft.update(isOn => !isOn);
  }


  /**
   * Marks an avatar from the provided set as selected.
   * @param path Public asset path of the avatar.
   */
  protected selectAvatar(path: string): void {
    this.selectedAvatar.set(path);
  }


  /**
   * Builds the absolute asset URL of an avatar option.
   * @param path Public asset path of the avatar.
   */
  protected optionSrc(path: string): string {
    return assetUrl(path);
  }


  /**
   * Stages a banner selection; it is persisted with the rest of the draft on
   * save, so the card's live preview updates and "Abbrechen" reverts it.
   * @param id Banner id from the registry.
   */
  protected selectBanner(id: string): void {
    this.selectedBanner.set(id);
  }


  /**
   * Roving radiogroup navigation: arrow keys move to the previous/next banner,
   * selecting and focusing it; other keys are left to the browser.
   * @param event Keydown event on a banner radio.
   * @param index Index of the focused banner option.
   */
  protected onBannerKeydown(event: KeyboardEvent, index: number): void {
    const delta = bannerKeyDelta(event.key);
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + this.banners.length) % this.banners.length;
    this.selectBanner(this.banners[next].id);
    this.bannerButtons()[next]?.nativeElement.focus();
  }


  /**
   * Reports whether the draft is valid and differs from the stored profile;
   * drives the "Speichern" button's enabled state.
   */
  protected canSave(): boolean {
    if (this.nameInvalid() || this.isPending()) return false;
    return this.hasChanges(normalizeName(this.nameValue()));
  }


  /**
   * Reports whether the normalized draft differs from the stored profile.
   * @param name Normalized display name from the draft.
   */
  private hasChanges(name: string): boolean {
    return (
      name !== this.user()?.name ||
      this.selectedAvatar() !== this.user()?.avatarPath ||
      this.selectedBanner() !== (this.user()?.banner ?? BANNER_NONE) ||
      this.statusDraft() !== (this.user()?.status ?? '') ||
      this.animatedNameDraft() !== (this.user()?.animatedName ?? false)
    );
  }


  /**
   * Builds the profile draft sent to the user service on save.
   */
  private buildDraft(): ProfileDraft {
    return {
      name: normalizeName(this.nameValue()),
      avatarPath: this.selectedAvatar(),
      banner: this.selectedBanner(),
      status: this.statusDraft(),
      animatedName: this.animatedNameDraft(),
    };
  }


  /**
   * Validates and saves the profile; the change propagates live through
   * the user stream. No-ops for the shared guest account (defense in depth).
   */
  protected async save(): Promise<void> {
    if (this.authService.isGuest()) return;
    this.nameTouched.set(true);
    if (!this.canSave()) return;
    this.isPending.set(true);
    try {
      await this.userService.updateProfile(this.buildDraft());
      this.mode.set('view');
    } catch {
      this.toastService.show(SAVE_ERROR);
    }
    this.isPending.set(false);
  }


  /**
   * Opens the direct conversation with the shown user and closes.
   */
  protected async message(): Promise<void> {
    this.closed.emit();
    await this.router.navigate(['/app/dm', this.uid()]);
  }
}


/**
 * Maps an avatar path to an absolute asset URL; missing paths and
 * external URLs fall back to the placeholder.
 * @param path Avatar path stored on a user document.
 */
function assetUrl(path: string | undefined): string {
  return resolveAvatarPath(path);
}


/**
 * Maps an arrow key to a roving-navigation step: +1 forward, -1 backward,
 * 0 for keys that are not radiogroup navigation.
 * @param key Pressed key value.
 */
function bannerKeyDelta(key: string): number {
  if (BANNER_KEYS_NEXT.includes(key)) return 1;
  if (BANNER_KEYS_PREV.includes(key)) return -1;
  return 0;
}
