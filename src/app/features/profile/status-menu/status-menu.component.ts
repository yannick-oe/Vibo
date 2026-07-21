/**
 * @file Manual-status menu of the own profile dialog: the status line acts
 * as a trigger button opening an anchored dropdown with the four
 * Discord-style options; selecting persists the sticky manualStatus field
 * with a single one-field write.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { AuthService } from '../../../services/auth.service';
import { PresenceService } from '../../../services/presence.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { DialogAnchor, anchorBelow } from '../../../shared/dialog-shell/dialog-anchor';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { ManualStatus, PresenceState } from '../../../shared/presence-status';

const SAVE_ERROR = 'Der Status konnte nicht geändert werden.';
const INVISIBLE_LABEL = 'Unsichtbar';
const STATE_LABELS: Record<PresenceState, string> = {
  online: 'Online',
  away: 'Abwesend',
  busy: 'Beschäftigt',
  offline: 'Offline',
};

/** One selectable manual-status option of the dropdown. */
interface StatusOption {
  /** Firestore value the option writes. */
  readonly value: ManualStatus;
  /** Displayed dot shape of the option (invisible renders offline). */
  readonly shape: PresenceState;
  /** German option label. */
  readonly label: string;
  /** Muted explanation line, or null for the self-explanatory options. */
  readonly description: string | null;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: 'online', shape: 'online', label: 'Online', description: null },
  { value: 'away', shape: 'away', label: 'Abwesend', description: null },
  { value: 'busy', shape: 'busy', label: 'Beschäftigt', description: 'Benachrichtigungstöne sind aus.' },
  { value: 'invisible', shape: 'offline', label: 'Unsichtbar', description: 'Du wirst als offline angezeigt.' },
];

const OPTION_KEYS_NEXT = ['ArrowDown', 'ArrowRight'];
const OPTION_KEYS_PREV = ['ArrowUp', 'ArrowLeft'];

/**
 * Status trigger plus anchored dropdown for the own profile: the trigger
 * shows the effective dot and label (the manual choice name while one is
 * sticky), the menu offers the four options as a menuitemradio group with
 * roving arrow-key navigation; Escape, focus trap and focus restore come
 * from the shared dialog shell.
 */
@Component({
  selector: 'app-status-menu',
  imports: [DialogShellComponent],
  templateUrl: './status-menu.component.html',
  styleUrl: './status-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusMenuComponent {
  private readonly authService = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly presenceService = inject(PresenceService);

  private readonly toastService = inject(ToastService);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  private readonly optionButtons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');

  protected readonly options = STATUS_OPTIONS;

  protected readonly menuAnchor = signal<DialogAnchor | null>(null);

  protected readonly isOpen = signal(false);

  private readonly ownUid = computed(() => this.authService.currentUser()?.uid ?? null);

  protected readonly selected = computed(() => this.resolveSelected());

  protected readonly ownShape = computed(() => this.resolveOwnShape());

  protected readonly triggerLabel = computed(() =>
    this.selected() === 'invisible' ? INVISIBLE_LABEL : STATE_LABELS[this.ownShape()],
  );


  /**
   * Resolves the stored manual choice of the own user document; absent
   * means automatic ('online').
   */
  private resolveSelected(): ManualStatus {
    const uid = this.ownUid();
    const user = this.userService.users().find(entry => entry.uid === uid);
    return user?.manualStatus ?? 'online';
  }


  /**
   * Resolves the effective displayed state of the own user via the shared
   * helper (drives the trigger dot, invisible included).
   */
  private resolveOwnShape(): PresenceState {
    const uid = this.ownUid();
    return uid ? this.presenceService.stateFor(uid) : 'offline';
  }


  /**
   * Opens the dropdown anchored below the trigger; small viewports fall
   * back to the dialog shell's centered/sheet presentation.
   */
  protected openMenu(): void {
    this.menuAnchor.set(anchorBelow(this.trigger().nativeElement, 'left'));
    this.isOpen.set(true);
  }


  /**
   * Closes the dropdown (Escape, scrim click or selection).
   */
  protected closeMenu(): void {
    this.isOpen.set(false);
  }


  /**
   * Persists the chosen manual status as the single one-field write and
   * closes the menu; failures surface via the shared toast.
   * @param status Chosen manual status option.
   */
  protected async select(status: ManualStatus): Promise<void> {
    this.closeMenu();
    try {
      await this.userService.setManualStatus(status);
    } catch {
      this.toastService.show(SAVE_ERROR);
    }
  }


  /**
   * Roving menu navigation: arrow keys wrap focus through the options;
   * other keys are left to the browser and the dialog shell.
   * @param event Keydown event on an option button.
   * @param index Index of the focused option.
   */
  protected onOptionKeydown(event: KeyboardEvent, index: number): void {
    const delta = optionKeyDelta(event.key);
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + this.options.length) % this.options.length;
    this.optionButtons()[next]?.nativeElement.focus();
  }
}


/**
 * Maps an arrow key to a roving-navigation step: +1 forward, -1 backward,
 * 0 for keys that are not menu navigation.
 * @param key Pressed key value.
 */
function optionKeyDelta(key: string): number {
  if (OPTION_KEYS_NEXT.includes(key)) return 1;
  if (OPTION_KEYS_PREV.includes(key)) return -1;
  return 0;
}
