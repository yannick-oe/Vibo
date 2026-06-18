/**
 * @file Profile dialog: own profile with inline edit mode, foreign
 * profiles with the direct-message shortcut.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { DEFAULT_AVATAR_PATH, resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { AVATAR_OPTIONS } from '../../../shared/avatar-options';
import { DialogAnchor, DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';

const NAME_REQUIRED_ERROR = 'Bitte gib deinen Namen ein.';
const SAVE_ERROR = 'Das Profil konnte nicht gespeichert werden.';
const UNKNOWN_USER = 'Unbekannt';
const STATUS_ACTIVE = 'Aktiv';
const STATUS_AWAY = 'Abwesend';

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
  imports: [DialogShellComponent],
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

  protected readonly mode = signal<ProfileMode>('view');

  protected readonly nameDraft = signal('');

  protected readonly nameError = signal('');

  protected readonly selectedAvatar = signal(DEFAULT_AVATAR_PATH);

  protected readonly isPending = signal(false);

  protected readonly user = computed(() =>
    this.userService.users().find(user => user.uid === this.uid()),
  );

  protected readonly isSelf = computed(
    () => this.uid() === this.authService.currentUser()?.uid,
  );

  protected readonly displayName = computed(() => this.user()?.name ?? UNKNOWN_USER);

  protected readonly email = computed(() => this.user()?.email ?? null);

  protected readonly statusLabel = computed(() => (this.isSelf() ? STATUS_ACTIVE : STATUS_AWAY));

  protected readonly avatarSrc = computed(() => assetUrl(this.user()?.avatarPath));


  /**
   * Switches to the edit card with the current profile as draft.
   */
  protected startEdit(): void {
    this.nameDraft.set(this.user()?.name ?? '');
    this.selectedAvatar.set(this.user()?.avatarPath ?? DEFAULT_AVATAR_PATH);
    this.nameError.set('');
    this.mode.set('edit');
  }


  /**
   * Discards the draft and returns to the view card.
   */
  protected cancelEdit(): void {
    this.mode.set('view');
  }


  /**
   * Syncs the name draft with its input element and surfaces the
   * empty-name error live (the save button is disabled meanwhile).
   * @param event Input event of the name field.
   */
  protected onNameInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.nameDraft.set(value);
    this.nameError.set(value.trim() ? '' : NAME_REQUIRED_ERROR);
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
   * Reports whether the draft is valid and differs from the profile.
   */
  protected canSave(): boolean {
    const name = this.nameDraft().trim();
    if (!name) return false;
    const changed =
      name !== this.user()?.name || this.selectedAvatar() !== this.user()?.avatarPath;
    return changed && !this.isPending();
  }


  /**
   * Validates and saves the profile; the change propagates live through
   * the user stream.
   */
  protected async save(): Promise<void> {
    if (!this.nameDraft().trim()) return this.nameError.set(NAME_REQUIRED_ERROR);
    if (!this.canSave()) return;
    this.isPending.set(true);
    try {
      await this.userService.updateProfile(this.nameDraft(), this.selectedAvatar());
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
