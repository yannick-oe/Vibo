/**
 * @file Cmd/Ctrl+K quick switcher: a combobox over the user's
 * accepted-friend DMs (recency order), channels (alphabetical) and a small
 * action set, with a roving-highlight listbox.
 */
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { CommandPaletteService } from '../../../services/command-palette.service';
import { DirectMessageService } from '../../../services/direct-message.service';
import { FriendshipService } from '../../../services/friendship.service';
import { ProfileOverlayService } from '../../../services/profile-overlay.service';
import { ThemeService } from '../../../services/theme.service';
import { UserService } from '../../../services/user.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { PaletteItem, PaletteKind, buildPaletteItems, filterPaletteItems } from './command-palette-items';

const TITLE_ID = 'command-palette-title';
const LISTBOX_ID = 'command-palette-listbox';
const INPUT_ID = 'command-palette-input';
const KIND_ICON: Record<PaletteKind, string> = { channel: '#', dm: '@', action: '›' };

/**
 * Keyboard-first quick switcher rendered in the modal dialog shell. Typing
 * filters the user's channels and DMs (no extra Firestore reads — the
 * already-streamed sidebar data is reused) plus a fixed action set; Arrow
 * keys move a roving highlight, Enter activates, Escape closes. Follows the
 * combobox/listbox pattern with aria-activedescendant.
 */
@Component({
  selector: 'app-command-palette',
  imports: [DialogShellComponent],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteComponent {
  protected readonly titleId = TITLE_ID;

  protected readonly listboxId = LISTBOX_ID;

  protected readonly inputId = INPUT_ID;

  protected readonly kindIcon = KIND_ICON;

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly directMessageService = inject(DirectMessageService);

  private readonly authService = inject(AuthService);

  private readonly themeService = inject(ThemeService);

  private readonly router = inject(Router);

  private readonly profileOverlay = inject(ProfileOverlayService);

  private readonly palette = inject(CommandPaletteService);

  protected readonly query = signal('');

  protected readonly activeIndex = signal(0);

  private readonly selfUid = computed(() => this.authService.currentUser()?.uid ?? null);

  private readonly allItems = computed(() =>
    buildPaletteItems(
      {
        channels: this.channelService.channels(),
        users: this.userService.users(),
        selfUid: this.selfUid(),
        friendUids: this.friendshipService.friendUids(),
        recencyByPartner: this.directMessageService.recencyByPartner(),
      },
      {
        navigate: segments => void this.router.navigate(segments),
        toggleTheme: () => this.themeService.toggle(),
        openProfile: () => this.openProfile(),
        isDark: this.themeService.isDark(),
      },
    ),
  );

  protected readonly filtered = computed(() => filterPaletteItems(this.allItems(), this.query()));

  protected readonly activeId = computed(() => this.filtered()[this.activeIndex()]?.id ?? null);

  protected readonly countLabel = computed(() => {
    const count = this.filtered().length;
    return count === 1 ? '1 Ergebnis' : `${count} Ergebnisse`;
  });


  /**
   * Keeps the highlighted option scrolled into view as it moves.
   */
  constructor() {
    effect(() => {
      const id = this.activeId();
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    });
  }


  /**
   * Updates the query and resets the highlight to the first result.
   * @param event Input event of the search field.
   */
  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }


  /**
   * Routes palette keys: Arrows move the highlight, Home/End jump to the
   * ends, Enter activates the highlighted item.
   * @param event Keydown event of the combobox input.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') return this.move(1, event);
    if (event.key === 'ArrowUp') return this.move(-1, event);
    if (event.key === 'Home') return this.jump(0, event);
    if (event.key === 'End') return this.jump(this.filtered().length - 1, event);
    if (event.key === 'Enter') this.activate(event);
  }


  /**
   * Moves the highlight by delta, wrapping around the result list.
   * @param delta Step direction (+1 down, -1 up).
   * @param event Originating keydown, whose default is suppressed.
   */
  private move(delta: number, event: KeyboardEvent): void {
    event.preventDefault();
    const count = this.filtered().length;
    if (count > 0) this.activeIndex.update(index => (index + delta + count) % count);
  }


  /**
   * Jumps the highlight to an absolute index (Home/End).
   * @param index Target index.
   * @param event Originating keydown, whose default is suppressed.
   */
  private jump(index: number, event: KeyboardEvent): void {
    event.preventDefault();
    if (this.filtered().length > 0) this.activeIndex.set(Math.max(0, index));
  }


  /**
   * Activates the highlighted item.
   * @param event Originating keydown, whose default is suppressed.
   */
  private activate(event: KeyboardEvent): void {
    event.preventDefault();
    const item = this.filtered()[this.activeIndex()];
    if (item) this.run(item);
  }


  /**
   * Runs an item (navigate or action) and closes the palette.
   * @param item Selected palette item.
   */
  protected run(item: PaletteItem): void {
    item.run();
    this.palette.close();
  }


  /**
   * Closes the palette (Escape or backdrop click).
   */
  protected close(): void {
    this.palette.close();
  }


  /**
   * Opens the signed-in user's own profile dialog.
   */
  private openProfile(): void {
    const uid = this.selfUid();
    if (uid) this.profileOverlay.open(uid);
  }
}
