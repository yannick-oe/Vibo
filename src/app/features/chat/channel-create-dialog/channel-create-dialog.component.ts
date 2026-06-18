/**
 * @file Two-step modal dialog for creating a channel (Figma "Channel
 * erstellen" and "Leute hinzufügen" frames).
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AsyncValidatorFn,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, timer } from 'rxjs';

import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { WORKSPACE_NAME } from '../../../shared/app.constants';

const NAME_REQUIRED_ERROR = 'Bitte gib einen Channel-Namen ein.';
const NAME_DUPLICATE_ERROR = 'Ein Channel mit diesem Namen existiert bereits.';
const CREATE_ERROR = 'Der Channel konnte nicht erstellt werden.';
const DUPLICATE_CHECK_DEBOUNCE_MS = 300;
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled])';

type DialogStep = 'details' | 'members';

type MemberMode = 'all' | 'selected';

/**
 * Modal flow creating a channel: step one collects a unique name and an
 * optional description, step two picks the members (everyone or specific
 * people). On create the channel is persisted and opened. The dialog traps
 * focus, closes on Escape or the close button and returns focus to the
 * element that opened it.
 */
@Component({
  selector: 'app-channel-create-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './channel-create-dialog.component.html',
  styleUrl: './channel-create-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelCreateDialogComponent implements AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  protected readonly workspaceName = WORKSPACE_NAME;

  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly firstRadio = viewChild<ElementRef<HTMLInputElement>>('firstRadio');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly closed = output<void>();

  protected readonly step = signal<DialogStep>('details');

  protected readonly isPending = signal(false);

  protected readonly selectedUsers = signal<UserDoc[]>([]);

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [this.requiredNameValidator()],
    asyncValidators: [this.duplicateNameValidator()],
  });

  protected readonly descriptionControl = new FormControl('', { nonNullable: true });

  protected readonly modeControl = new FormControl<MemberMode | null>(null);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly detailsForm = new FormGroup({
    name: this.nameControl,
    description: this.descriptionControl,
  });

  protected readonly membersForm = new FormGroup({
    mode: this.modeControl,
    search: this.searchControl,
  });

  protected readonly memberMode = toSignal(this.modeControl.valueChanges, { initialValue: null });

  private readonly searchTerm = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  protected readonly candidates = computed(() => this.filterCandidates());

  protected readonly canCreate = computed(
    () =>
      this.memberMode() === 'all' ||
      (this.memberMode() === 'selected' && this.selectedUsers().length > 0),
  );


  /**
   * Focuses the channel-name input once the dialog is rendered.
   */
  ngAfterViewInit(): void {
    this.nameInput()?.nativeElement.focus();
  }


  /**
   * Returns focus to the element that opened the dialog.
   */
  ngOnDestroy(): void {
    this.previouslyFocused?.focus();
  }


  /**
   * Closes the dialog without creating a channel.
   */
  protected close(): void {
    this.closed.emit();
  }


  /**
   * Closes the dialog when the click lands on the scrim itself.
   * @param event Click event on the overlay.
   */
  protected onOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) this.close();
  }


  /**
   * Advances to the member step when the channel name is validated.
   */
  protected goToMembers(): void {
    if (this.nameControl.invalid || this.nameControl.pending) return;
    this.step.set('members');
    setTimeout(() => this.firstRadio()?.nativeElement.focus());
  }


  /**
   * Resolves the inline error message for the channel-name field; empty
   * while the field is untouched or valid.
   */
  protected nameError(): string {
    if (this.nameControl.pristine) return '';
    if (this.nameControl.hasError('required')) return NAME_REQUIRED_ERROR;
    if (this.nameControl.hasError('duplicate')) return NAME_DUPLICATE_ERROR;
    return '';
  }


  /**
   * Reports whether the channel-name field currently shows an error.
   */
  protected nameInvalid(): boolean {
    return this.nameError() !== '';
  }


  /**
   * Adds a user to the selection and resets the search for the next entry.
   * @param user User picked from the filtered candidate list.
   */
  protected selectUser(user: UserDoc): void {
    this.selectedUsers.update(users => [...users, user]);
    this.searchControl.setValue('');
    this.searchInput()?.nativeElement.focus();
  }


  /**
   * Removes a user from the selection.
   * @param uid Uid of the chip being removed.
   */
  protected removeUser(uid: string): void {
    this.selectedUsers.update(users => users.filter(user => user.uid !== uid));
  }


  /**
   * Maps a user document's avatar path to an absolute asset URL; external
   * URLs fall back to the placeholder because avatars are local-path based.
   * @param path Avatar path stored on the user document.
   */
  protected avatarSrc(path: string): string {
    return resolveAvatarPath(path);
  }


  /**
   * Creates the channel, navigates to it and closes the dialog.
   */
  protected async create(): Promise<void> {
    if (!this.canCreate() || this.isPending()) return;
    this.isPending.set(true);
    const channelId = await this.persistChannel();
    if (channelId === null) return;
    await this.router.navigate(['/app/channel', channelId]);
    this.closed.emit();
  }


  /**
   * Keeps Tab and Shift+Tab cycling inside the dialog.
   * @param event Keydown event of the Tab key.
   */
  protected trapFocus(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const focusables = this.focusableElements();
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }


  /**
   * Lists the currently visible focusable elements inside the dialog.
   */
  private focusableElements(): HTMLElement[] {
    const root = this.dialog()?.nativeElement;
    if (!root) return [];
    const elements = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    return [...elements].filter(element => element.offsetParent !== null);
  }


  /**
   * Validates that the channel name is non-empty after trimming.
   */
  private requiredNameValidator(): ValidatorFn {
    return control => (String(control.value ?? '').trim() ? null : { required: true });
  }


  /**
   * Validates the channel name against the whole channels collection
   * (case-insensitive, debounced); lookup failures do not block the form —
   * creating still fails visibly via the error toast.
   */
  private duplicateNameValidator(): AsyncValidatorFn {
    return control =>
      timer(DUPLICATE_CHECK_DEBOUNCE_MS).pipe(
        switchMap(() => this.channelService.isNameTaken(String(control.value ?? ''))),
        map(taken => (taken ? { duplicate: true } : null)),
        catchError(() => of(null)),
      );
  }


  /**
   * Filters selectable users by the search term; the signed-in user and
   * already selected users are excluded.
   */
  private filterCandidates(): UserDoc[] {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [];
    const selfUid = this.authService.currentUser()?.uid;
    const selectedIds = new Set(this.selectedUsers().map(user => user.uid));
    return this.userService
      .users()
      .filter(user => user.uid !== selfUid && !selectedIds.has(user.uid))
      .filter(user => user.name.toLowerCase().includes(term));
  }


  /**
   * Persists the channel document; on failure a toast is shown and the
   * dialog stays open for another attempt.
   */
  private async persistChannel(): Promise<string | null> {
    try {
      const name = this.nameControl.value.trim();
      const description = this.descriptionControl.value.trim();
      return await this.channelService.createChannel(name, description, this.memberIds());
    } catch {
      this.toastService.show(CREATE_ERROR);
      this.isPending.set(false);
      return null;
    }
  }


  /**
   * Resolves the member uids for the chosen mode: every user or the
   * specifically selected people (the creator is added by the service).
   */
  private memberIds(): string[] {
    if (this.memberMode() === 'all') return this.userService.users().map(user => user.uid);
    return this.selectedUsers().map(user => user.uid);
  }
}
