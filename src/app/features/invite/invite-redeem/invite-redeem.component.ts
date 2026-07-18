/**
 * @file Public invite redeem page (/invite/:token): waits for the restored
 * session, resolves the route parameter — the token lookup always runs
 * FIRST, a one-shot vanity-slug lookup only on a token miss, so a slug can
 * never shadow a token — short-circuits existing members straight into the
 * channel, lets signed-in users join (guests excluded — shared account)
 * and hands signed-out visitors to the login/registration flow via the
 * consume-once pending-invite handover.
 */
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, User, authState } from '@angular/fire/auth';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { InviteSlugService } from '../../../services/invite-slug.service';
import { InviteService } from '../../../services/invite.service';
import { MessageService } from '../../../services/message.service';
import { PendingInviteService } from '../../../services/pending-invite.service';
import { ToastService } from '../../../services/toast.service';

const JOIN_ERROR = 'Beitreten hat nicht geklappt. Bitte versuche es erneut.';
const GUEST_JOIN_NOTE = 'Als Gast kannst du über Einladungslinks keinen Channels beitreten.';

/** Presentation state of the redeem card. */
type RedeemState = 'checking' | 'signedOut' | 'invalid' | 'ready';

/**
 * Invite landing card under the auth layout. Signed-in visitors see the
 * channel preview with "Beitreten" (accept = membership arrayUnion plus the
 * join system message); members skip the card entirely; signed-out visitors
 * store the token and continue through login or registration.
 */
@Component({
  selector: 'app-invite-redeem',
  imports: [RouterLink],
  templateUrl: './invite-redeem.component.html',
  styleUrl: './invite-redeem.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteRedeemComponent {
  readonly token = input.required<string>();

  private readonly auth = inject(Auth);

  private readonly authService = inject(AuthService);

  private readonly inviteService = inject(InviteService);

  private readonly inviteSlugService = inject(InviteSlugService);

  private readonly channelService = inject(ChannelService);

  private readonly messageService = inject(MessageService);

  private readonly pendingInvite = inject(PendingInviteService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  private readonly authUser = toSignal(authState(this.auth));

  protected readonly state = signal<RedeemState>('checking');

  protected readonly channelName = signal('');

  private readonly channelId = signal<string | null>(null);

  protected readonly isJoining = signal(false);

  protected readonly isGuest = this.authService.isGuest;

  protected readonly guestNote = GUEST_JOIN_NOTE;


  /**
   * Branches once the restored auth state is known.
   */
  constructor() {
    effect(() => this.handleAuthState(this.authUser()));
  }


  /**
   * Waits for the session restore, then resolves for signed-in users or
   * stores the token for the login flow; later state changes are ignored.
   * @param user Restored user, null when signed out, undefined while pending.
   */
  private handleAuthState(user: User | null | undefined): void {
    if (user === undefined || this.state() !== 'checking') return;
    if (!user) return this.handleSignedOut();
    void this.resolve(user.uid);
  }


  /**
   * Remembers the token for after login/registration and shows the
   * sign-in prompt.
   */
  private handleSignedOut(): void {
    this.pendingInvite.store(this.token());
    this.state.set('signedOut');
  }


  /**
   * Resolves the route parameter to its channel: members short-circuit
   * into the channel, unresolvable invites show the error state.
   * @param uid Signed-in user's uid.
   */
  private async resolve(uid: string): Promise<void> {
    const channelId = await this.resolveTargetChannelId();
    if (!channelId) return this.state.set('invalid');
    const channel = await this.channelService.getChannelOnce(channelId).catch(() => null);
    if (!channel) return this.state.set('invalid');
    if (channel.memberIds.includes(uid)) return this.enterChannel(channel.id);
    this.channelId.set(channel.id);
    this.channelName.set(channel.name);
    this.state.set('ready');
  }


  /**
   * Resolves the route parameter to a channel id: the token lookup runs
   * first and wins; only a token miss falls back to the one-shot vanity
   * slug lookup, so a slug never shadows a token.
   */
  private async resolveTargetChannelId(): Promise<string | null> {
    const invite = await this.inviteService.resolveInvite(this.token()).catch(() => null);
    if (invite) return invite.channelId;
    return this.inviteSlugService.resolveSlug(this.token()).catch(() => null);
  }


  /**
   * Accepts the invite: joins the channel (arrayUnion on memberIds via the
   * join-yourself rule), announces the join with the system pill and enters
   * the channel. Failures toast and re-enable the button.
   */
  protected async join(): Promise<void> {
    const channelId = this.channelId();
    if (!channelId || this.isJoining() || this.isGuest()) return;
    this.isJoining.set(true);
    try {
      await this.channelService.addMembers(channelId, [this.authService.requireUid()]);
      await this.messageService.sendJoinMessage(channelId);
      this.enterChannel(channelId);
    } catch {
      this.toastService.show(JOIN_ERROR);
      this.isJoining.set(false);
    }
  }


  /**
   * Navigates into the channel, replacing the invite URL in the history.
   * @param channelId Channel to open.
   */
  private enterChannel(channelId: string): void {
    void this.router.navigate(['/app/channel', channelId], { replaceUrl: true });
  }
}
