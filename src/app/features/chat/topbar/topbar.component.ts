/**
 * @file App topbar with brand, static search field, the signed-in user
 * and the profile menu.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { LayoutService } from '../../../services/layout.service';
import { PresenceService } from '../../../services/presence.service';
import { ThreadService } from '../../../services/thread.service';
import { DEFAULT_AVATAR_PATH } from '../../../services/registration.service';
import { UserService } from '../../../services/user.service';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { SearchBarComponent } from '../../search/search-bar/search-bar.component';
import { AuroraNameComponent } from '../../../shared/aurora-name/aurora-name.component';
import { AvatarActivatorDirective } from '../../../shared/avatar/avatar-activator.directive';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import {
  DialogAnchor,
  DialogShellComponent,
  anchorBelow,
} from '../../../shared/dialog-shell/dialog-shell.component';
import { APP_NAME, WORKSPACE_NAME } from '../../../shared/app.constants';
import { ThemeService } from '../../../services/theme.service';

const GUEST_NAME = 'Gast';
const DARK_MODE_LABEL = 'Dark Mode';
const LIGHT_MODE_LABEL = 'Light Mode';

type TopbarState = 'closed' | 'menu';

/**
 * Top bar of the app shell. Shows the brand, the global workspace search
 * and the signed-in user's live identity resolved from the users
 * collection. The profile area opens the anchored profile menu with the
 * profile dialog and the logout action; search results can open any
 * user's profile.
 */
@Component({
  selector: 'app-topbar',
  imports: [
    DialogShellComponent,
    ProfileDialogComponent,
    SearchBarComponent,
    AuroraNameComponent,
    AvatarComponent,
    AvatarActivatorDirective,
    RouterLink,
  ],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarComponent {
  private readonly authService = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly router = inject(Router);

  private readonly layoutService = inject(LayoutService);

  private readonly presenceService = inject(PresenceService);

  private readonly threadService = inject(ThreadService);

  private readonly themeService = inject(ThemeService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly appName = APP_NAME;

  protected readonly wordmarkSrc = this.themeService.wordmarkSrc;

  protected readonly isDark = this.themeService.isDark;

  protected readonly themeLabel = computed(() =>
    this.isDark() ? LIGHT_MODE_LABEL : DARK_MODE_LABEL,
  );

  protected readonly workspaceName = WORKSPACE_NAME;

  protected readonly isMobile = this.layoutService.isMobile;

  protected readonly showBack = computed(
    () => this.isMobile() && (this.threadService.isOpen() || this.currentUrl().startsWith('/app/')),
  );

  protected readonly state = signal<TopbarState>('closed');

  protected readonly profileUid = signal<string | null>(null);

  protected readonly menuAnchor = signal<DialogAnchor | null>(null);

  protected readonly selfUid = computed(() => this.authService.currentUser()?.uid ?? null);

  private readonly userDoc = computed(() =>
    this.userService.users().find(user => user.uid === this.selfUid()),
  );

  protected readonly userName = computed(
    () =>
      this.userDoc()?.name ??
      this.authService.currentUser()?.displayName ??
      GUEST_NAME,
  );

  protected readonly avatarPath = computed(
    () =>
      this.userDoc()?.avatarPath ??
      this.authService.currentUser()?.photoURL ??
      DEFAULT_AVATAR_PATH,
  );

  protected readonly avatarAlt = computed(() => `Avatar von ${this.userName()}`);

  protected readonly userAnimatedName = computed(() => this.userDoc()?.animatedName ?? false);


  /**
   * Opens the profile menu anchored below the trigger, right-aligned.
   * @param event Click event of the profile trigger.
   */
  protected openMenu(event: Event): void {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    this.menuAnchor.set(anchorBelow(trigger, 'right'));
    this.state.set('menu');
  }


  /**
   * Closes any open menu or dialog.
   */
  protected close(): void {
    this.state.set('closed');
  }


  /**
   * Toggles light/dark mode, leaving the menu open so the change is visible.
   */
  protected toggleTheme(): void {
    this.themeService.toggle();
  }


  /**
   * Mobile back navigation: an open thread returns to the chat view,
   * otherwise the chat view returns to the menu view.
   */
  protected back(): void {
    if (this.threadService.isOpen()) return this.threadService.close();
    void this.router.navigate(['/app']);
  }


  /**
   * Switches from the menu to the own-profile dialog.
   */
  protected openProfile(): void {
    this.state.set('closed');
    this.profileUid.set(this.selfUid());
  }


  /**
   * Opens the profile dialog for a user picked in the global search.
   * @param uid Uid of the selected user.
   */
  protected openUserProfile(uid: string): void {
    this.profileUid.set(uid);
  }


  /**
   * Signs out and returns to the login page.
   */
  protected async logout(): Promise<void> {
    this.state.set('closed');
    await this.presenceService.markOffline();
    await this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
