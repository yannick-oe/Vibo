/**
 * @file Invite-links dialog of a channel: create a share link, copy it,
 * manage the channel's active invites (revoke own ones) and — creator-only
 * — maintain the optional vanity slug ("Eigener Link-Name"). All reads are
 * one-shot — the dialog is a management surface, not a live view; slug
 * availability resolves on save via the atomic reservation batch, never
 * while typing.
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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FirebaseError } from 'firebase/app';

import { Channel } from '../../../models/channel.model';
import { Invite } from '../../../models/invite.model';
import { AuthService } from '../../../services/auth.service';
import { InviteSlugService } from '../../../services/invite-slug.service';
import { INVITE_TTL_DAYS, InviteService } from '../../../services/invite.service';
import { ToastService } from '../../../services/toast.service';
import {
  DialogAnchor,
  DialogShellComponent,
} from '../../../shared/dialog-shell/dialog-shell.component';
import {
  INVITE_ROUTE_FRAGMENT,
  INVITE_SLUG_MAX_LENGTH,
  INVITE_SLUG_REGEX,
} from '../../../shared/invite.constants';

const COPY_CONFIRMATION = 'Einladungslink kopiert';
const COPY_ERROR = 'Kopieren hat nicht geklappt.';
const CREATE_ERROR = 'Der Einladungslink konnte nicht erstellt werden.';
const REVOKE_ERROR = 'Der Einladungslink konnte nicht widerrufen werden.';
const GUEST_NOTE = 'Als Gast kannst du keine Einladungslinks erstellen.';
const SLUG_FORMAT_ERROR = 'Nur Kleinbuchstaben, Zahlen und Bindestriche, 3–32 Zeichen.';
const SLUG_TAKEN_ERROR = 'Dieser Name ist bereits vergeben.';
const SLUG_SAVE_ERROR = 'Der Link-Name konnte nicht gespeichert werden.';
const SLUG_REMOVE_ERROR = 'Der Link-Name konnte nicht entfernt werden.';
const SLUG_PREFIX_LABEL = `…/${INVITE_ROUTE_FRAGMENT}`;
const PERMISSION_DENIED_CODE = 'permission-denied';
const EXPIRY_FORMAT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });

/**
 * "Einladungslinks" dialog opened from the channel settings: any member
 * creates links (guests excluded — shared account), the share panel shows
 * the slug URL when a vanity slug exists and the created token URL
 * otherwise, and the active-links list shows expiry and a revoke action on
 * the caller's own invites. The channel creator additionally maintains the
 * optional "Eigener Link-Name" (vanity slug) with save/remove actions.
 */
@Component({
  selector: 'app-channel-invite-dialog',
  imports: [DialogShellComponent, ReactiveFormsModule],
  templateUrl: './channel-invite-dialog.component.html',
  styleUrl: './channel-invite-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelInviteDialogComponent {
  readonly channel = input.required<Channel>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  private readonly inviteService = inject(InviteService);

  private readonly inviteSlugService = inject(InviteSlugService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  protected readonly invites = signal<Invite[]>([]);

  protected readonly createdUrl = signal<string | null>(null);

  protected readonly isPending = signal(false);

  protected readonly isLoading = signal(true);

  protected readonly isGuest = this.authService.isGuest;

  protected readonly guestNote = GUEST_NOTE;

  protected readonly ttlDays = INVITE_TTL_DAYS;

  protected readonly slugMax = INVITE_SLUG_MAX_LENGTH;

  protected readonly slugPrefix = SLUG_PREFIX_LABEL;

  protected readonly slugControl = new FormControl('', { nonNullable: true });

  protected readonly slugForm = new FormGroup({ slug: this.slugControl });

  protected readonly slugError = signal('');

  private readonly slugDraft = toSignal(this.slugControl.valueChanges, { initialValue: '' });

  protected readonly slugLength = computed(() => this.slugDraft().length);

  private readonly selfUid = computed(() => this.authService.currentUser()?.uid ?? null);

  private readonly isCreator = computed(() => this.channel().createdBy === this.selfUid());

  protected readonly canManageSlug = computed(() => this.isCreator() && !this.isGuest());

  protected readonly shareUrl = computed(() => {
    const slug = this.channel().inviteSlug;
    return slug ? this.inviteSlugService.slugUrl(slug) : this.createdUrl();
  });

  private lastSlugSyncKey = '';


  /**
   * Loads the channel's active invites when the dialog opens, keeps the
   * slug field in sync with the channel and lowercases slug input live.
   */
  constructor() {
    effect(() => void this.load(this.channel().id));
    effect(() => this.syncSlugControl(this.channel()));
    this.slugControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(value => this.applySlugLowercase(value));
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


  /**
   * Whether the slug can be saved: non-empty, changed and not mid-write.
   * Format and availability are checked on save, never per keystroke.
   */
  protected canSaveSlug(): boolean {
    const value = this.slugControl.value.trim();
    return !this.isPending() && value !== '' && value !== (this.channel().inviteSlug ?? '');
  }


  /**
   * Claims the entered slug: client-side format pre-validation fills the
   * reserved error slot, then the atomic reservation batch runs — a taken
   * slug rejects the batch and surfaces the collision message.
   */
  protected async saveSlug(): Promise<void> {
    const slug = this.slugControl.value.trim();
    if (!this.canSaveSlug() || !this.canManageSlug()) return;
    if (!INVITE_SLUG_REGEX.test(slug)) return this.slugError.set(SLUG_FORMAT_ERROR);
    this.slugError.set('');
    this.isPending.set(true);
    try {
      await this.inviteSlugService.claimSlug(this.channel(), slug);
    } catch (error) {
      this.reportSlugSaveError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Releases the channel's slug (channel field and reservation doc in one
   * batch); failures toast and keep the slug.
   */
  protected async removeSlug(): Promise<void> {
    if (this.isPending() || !this.channel().inviteSlug) return;
    this.isPending.set(true);
    try {
      await this.inviteSlugService.removeSlug(this.channel());
      this.slugError.set('');
    } catch {
      this.toastService.show(SLUG_REMOVE_ERROR);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Maps a failed slug claim: the rules reject a taken slug as
   * permission-denied (slug docs are never updatable), which is the
   * collision signal; anything else is a generic save failure.
   * @param error Error thrown by the reservation batch.
   */
  private reportSlugSaveError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === PERMISSION_DENIED_CODE) return this.slugError.set(SLUG_TAKEN_ERROR);
    this.toastService.show(SLUG_SAVE_ERROR);
  }


  /**
   * Mirrors the channel's stored slug into the input whenever the channel
   * or its slug actually changes (live-stream re-emissions with an
   * unchanged slug never clobber in-progress typing).
   * @param channel Channel currently bound to the dialog.
   */
  private syncSlugControl(channel: Channel): void {
    const key = `${channel.id}:${channel.inviteSlug ?? ''}`;
    if (key === this.lastSlugSyncKey) return;
    this.lastSlugSyncKey = key;
    this.slugControl.setValue(channel.inviteSlug ?? '');
    this.slugError.set('');
  }


  /**
   * Rewrites slug input to lowercase in place (idempotent, so the
   * re-emitted lowered value passes through without recursion).
   * @param value Current raw input value.
   */
  private applySlugLowercase(value: string): void {
    const lowered = value.toLowerCase();
    if (lowered !== value) this.slugControl.setValue(lowered);
  }
}
