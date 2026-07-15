/**
 * @file Main app shell: topbar, workspace column, chat area and thread
 * panel — three columns on desktop, separate full-screen views on mobile.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import { ChannelCreateService } from '../../../services/channel-create.service';
import { CommandPaletteService } from '../../../services/command-palette.service';
import { LayoutService } from '../../../services/layout.service';
import { ProfileOverlayService } from '../../../services/profile-overlay.service';
import { SoundService } from '../../../services/sound.service';
import { ThreadService } from '../../../services/thread.service';
import { NotificationToastComponent } from '../../../shared/notification-toast/notification-toast.component';
import { ProfileDialogComponent } from '../../profile/profile-dialog/profile-dialog.component';
import { ChannelCreateDialogComponent } from '../channel-create-dialog/channel-create-dialog.component';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { ReactionDetailsTooltipComponent } from '../reaction-details/reaction-details-tooltip.component';
import { ThreadPanelComponent } from '../thread-panel/thread-panel.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { WorkspaceMenuComponent } from '../workspace-menu/workspace-menu.component';

const OPEN_MENU_LABEL = 'Workspace-Menü öffnen';
const CLOSE_MENU_LABEL = 'Workspace-Menü schließen';
const WORKSPACE_OPEN_STORAGE_KEY = 'vibo:workspaceOpen';
const WORKSPACE_TITLE_ID = 'workspace-title';
const MENU_TOGGLE_OPEN_ICON = 'app-icons/group-left.svg';
const MENU_TOGGLE_CLOSED_ICON = 'app-icons/group-right.svg';

type MobileView = 'menu' | 'chat' | 'thread';

/**
 * Chat layout per the Figma frames: three panels on desktop (collapsible
 * workspace column, chat area with the router outlet, thread panel) and
 * separate full-screen views on mobile — the menu is the mobile root,
 * chat routes replace it and an open thread replaces the chat. Returning
 * to the menu moves focus to the workspace heading. The channel-creation
 * dialog is hosted here at the top level so its overlay is not clipped by
 * the frosted sidebar's containing block.
 */
@Component({
  selector: 'app-shell',
  imports: [
    ChannelCreateDialogComponent,
    CommandPaletteComponent,
    NotificationToastComponent,
    ProfileDialogComponent,
    ReactionDetailsTooltipComponent,
    RouterOutlet,
    ThreadPanelComponent,
    TopbarComponent,
    WorkspaceMenuComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.shell-host--view-menu]': "isMobile() && mobileView() === 'menu'",
    '[class.shell-host--view-chat]': "isMobile() && mobileView() === 'chat'",
    '[class.shell-host--view-thread]': "isMobile() && mobileView() === 'thread'",
    '[class.shell-host--thread-open]': 'isThreadOpen()',
  },
})
export class AppShellComponent implements OnDestroy {
  private readonly threadService = inject(ThreadService);

  protected readonly channelCreate = inject(ChannelCreateService);

  protected readonly palette = inject(CommandPaletteService);

  protected readonly profileOverlay = inject(ProfileOverlayService);

  private readonly layoutService = inject(LayoutService);

  private readonly soundService = inject(SoundService);

  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly isWorkspaceOpen = signal(readStoredWorkspaceOpen());

  protected readonly isThreadOpen = this.threadService.isOpen;

  protected readonly isMobile = this.layoutService.isMobile;

  protected readonly mobileView = computed<MobileView>(() => {
    if (this.threadService.isOpen()) return 'thread';
    return this.currentUrl().startsWith('/app/') ? 'chat' : 'menu';
  });


  /**
   * Moves focus to the workspace heading when the mobile menu view opens.
   */
  constructor() {
    effect(() => this.focusMenuHeading(this.mobileView()));
  }


  /**
   * Closes a leftover thread when the shell is destroyed (e.g. logout) so
   * the next session starts without stale state.
   */
  ngOnDestroy(): void {
    this.threadService.close();
  }


  /**
   * Focuses the workspace heading after navigating back to the menu view.
   * @param view Currently active mobile view.
   */
  private focusMenuHeading(view: MobileView): void {
    if (!this.layoutService.isMobile() || view !== 'menu') return;
    requestAnimationFrame(() => document.getElementById(WORKSPACE_TITLE_ID)?.focus());
  }

  protected readonly toggleLabel = computed(() =>
    this.isWorkspaceOpen() ? CLOSE_MENU_LABEL : OPEN_MENU_LABEL,
  );

  protected readonly toggleIcon = computed(() =>
    this.isWorkspaceOpen() ? MENU_TOGGLE_OPEN_ICON : MENU_TOGGLE_CLOSED_ICON,
  );


  /**
   * Toggles the workspace column, persists the new state and plays the
   * opt-in sidebar sound (rising whoosh on open, falling on close).
   */
  protected toggleWorkspace(): void {
    this.isWorkspaceOpen.update(open => !open);
    storeWorkspaceOpen(this.isWorkspaceOpen());
    this.soundService.play(this.isWorkspaceOpen() ? 'swipe' : 'swipeClose');
  }
}


/**
 * Reads the persisted workspace-column state; defaults to open when nothing
 * is stored or storage is unavailable.
 */
function readStoredWorkspaceOpen(): boolean {
  try {
    return localStorage.getItem(WORKSPACE_OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}


/**
 * Persists the workspace-column state; storage errors are ignored because
 * the toggle works without persistence.
 * @param open Current open state of the workspace column.
 */
function storeWorkspaceOpen(open: boolean): void {
  try {
    localStorage.setItem(WORKSPACE_OPEN_STORAGE_KEY, String(open));
  } catch {
    return;
  }
}
