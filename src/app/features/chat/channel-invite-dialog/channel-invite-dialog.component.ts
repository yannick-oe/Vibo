/**
 * @file Invite-links dialog of a channel: create a share link, copy it and
 * manage the channel's active invites (revoke own ones). All reads are
 * one-shot — the dialog is a management surface, not a live view.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { Channel } from '../../../models/channel.model';
import { Invite } from '../../../models/invite.model';
import { AuthService } from '../../../services/auth.service';
import { INVITE_TTL_DAYS, InviteService } from '../../../services/invite.service';
import { ToastService } from '../../../services/toast.service';
import {
  DialogAnchor,
  DialogShellComponent,
} from '../../../shared/dialog-shell/dialog-shell.component';

const COPY_CONFIRMATION = 'Einladungslink kopiert';
const COPY_ERROR = 'Kopieren hat nicht geklappt.';
const CREATE_ERROR = 'Der Einladungslink konnte nicht erstellt werden.';
const REVOKE_ERROR = 'Der Einladungslink konnte nicht widerrufen werden.';
const GUEST_NOTE = 'Als Gast kannst du keine Einladungslinks erstellen.';
const EXPIRY_FORMAT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });

/**
 * "Einladungslinks" dialog opened from the channel settings: any member
 * creates links (guests excluded — shared account), the newly created URL
 * is shown with a copy action, and the active-links list shows expiry and
 * a revoke action on the caller's own invites (creator-only per rules).
 */
@Component({
  selector: 'app-channel-invite-dialog',
  imports: [DialogShellComponent],
  templateUrl: './channel-invite-dialog.component.html',
  styleUrl: './channel-invite-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelInviteDialogComponent {
  readonly channel = input.required<Channel>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  private readonly inviteService = inject(InviteService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  protected readonly invites = signal<Invite[]>([]);

  protected readonly createdUrl = signal<string | null>(null);

  protected readonly isPending = signal(false);

  protected readonly isLoading = signal(true);

  protected readonly isGuest = this.authService.isGuest;

  protected readonly guestNote = GUEST_NOTE;

  protected readonly ttlDays = INVITE_TTL_DAYS;

  private readonly selfUid = computed(() => this.authService.currentUser()?.uid ?? null);


  /**
   * Loads the channel's active invites when the dialog opens.
   */
  constructor() {
    effect(() => void this.load(this.channel().id));
  }


  /**
   * Reads the active invites once; a stale response from a channel switch
   * is dropped.
   * @param channelId Channel whose invites to load.
   */
  private async load(channelId: string): Promise<void> {
    this.isLoading.set(true);
    const invites = await this.inviteService.activeInvites(channelId).catch(() => [] as Invite[]);
    if (this.channel().id !== channelId) return;
    this.invites.set(invites);
    this.isLoading.set(false);
  }


  /**
   * Creates a new invite, surfaces its full URL for copying and refreshes
   * the list.
   */
  protected async create(): Promise<void> {
    if (this.isPending() || this.isGuest()) return;
    this.isPending.set(true);
    try {
      const token = await this.inviteService.createInvite(this.channel().id);
      this.createdUrl.set(this.inviteService.inviteUrl(token));
      await this.load(this.channel().id);
    } catch {
      this.toastService.show(CREATE_ERROR);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Copies an invite URL to the clipboard and confirms with a toast.
   * @param url Full invite URL.
   */
  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toastService.show(COPY_CONFIRMATION);
    } catch {
      this.toastService.show(COPY_ERROR);
    }
  }


  /**
   * Revokes an own invite (delete) and refreshes the list.
   * @param invite Invite to revoke.
   */
  protected async revoke(invite: Invite): Promise<void> {
    if (this.isPending()) return;
    this.isPending.set(true);
    try {
      await this.inviteService.revokeInvite(invite.token);
      if (this.createdUrl() === this.inviteUrl(invite)) this.createdUrl.set(null);
      await this.load(this.channel().id);
    } catch {
      this.toastService.show(REVOKE_ERROR);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Full share URL of an invite.
   * @param invite Invite whose URL to build.
   */
  protected inviteUrl(invite: Invite): string {
    return this.inviteService.inviteUrl(invite.token);
  }


  /**
   * German expiry line of an invite ("Gültig bis 20. Juli").
   * @param invite Invite whose expiry to format.
   */
  protected expiryText(invite: Invite): string {
    return `Gültig bis ${EXPIRY_FORMAT.format(invite.expiresAt.toDate())}`;
  }


  /**
   * Whether the signed-in user may revoke the invite (own, non-guest).
   * @param invite Invite of the list row.
   */
  protected canRevoke(invite: Invite): boolean {
    return !this.isGuest() && invite.createdBy === this.selfUid();
  }
}
