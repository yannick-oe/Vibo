/**
 * @file "Neue Nachricht" view: address a channel or user, then send the
 * first message which routes to the target conversation.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { DirectMessageService } from '../../../services/direct-message.service';
import { Channel } from '../../../models/channel.model';
import { ChannelService } from '../../../services/channel.service';
import { MessageService } from '../../../services/message.service';
import { resolveAvatarStillSrc } from '../../../services/registration.service';
import { ChannelHit, UserHit } from '../../../services/search.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import {
  Suggestion,
  SuggestionDropdownComponent,
} from '../../../shared/suggestion-dropdown/suggestion-dropdown.component';
import { MessageInputComponent } from '../message-input/message-input.component';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';

const ADDRESS_ERROR = 'Kein Channel oder Mitglied gefunden.';
const SEND_ERROR = 'Die Nachricht konnte nicht gesendet werden.';
const CHANNEL_PREFIX = 'channel:';
const USER_PREFIX = 'user:';

/** Router history state when navigating in from the global search. */
interface NewMessageNavState {
  recipientHit?: ChannelHit | UserHit;
}

/** Locked recipient of the new message. */
interface Recipient {
  readonly kind: 'channel' | 'user';
  readonly id: string;
  readonly label: string;
  readonly avatar?: string;
}

/**
 * "Neue Nachricht" view per the Figma frame: the address field resolves
 * "#" to ALL existing channels (checklist US4), "@" to workspace members
 * and plain text to channel names, user names and e-mail addresses.
 * Exactly one recipient locks as a removable chip; sending routes the
 * message to the target — joining the sender to non-member channels —
 * and navigates there (behavioral convention — Figma defines no
 * post-send flow).
 */
@Component({
  selector: 'app-new-message',
  imports: [AvatarFallbackDirective, MessageInputComponent, ReactiveFormsModule, SuggestionDropdownComponent],
  templateUrl: './new-message.component.html',
  styleUrl: './new-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewMessageComponent implements AfterViewInit {
  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly messageService = inject(MessageService);

  private readonly directMessageService = inject(DirectMessageService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  private readonly addressInput = viewChild<ElementRef<HTMLInputElement>>('addressInput');

  protected readonly addressControl = new FormControl('', { nonNullable: true });

  private readonly allChannels = toSignal(this.channelService.streamAllChannels(), {
    initialValue: [] as Channel[],
  });

  private readonly addressTerm = toSignal(this.addressControl.valueChanges, {
    initialValue: '',
  });

  protected readonly recipient = signal<Recipient | null>(null);

  protected readonly addressError = signal('');

  protected readonly activeIndex = signal(0);

  protected readonly suggestions = computed(() => this.buildSuggestions());


  /**
   * Reads pre-selected recipient from router state, if navigated from
   * global search bar.
   */
  constructor() {
    const hit = (inject(Location).getState() as NewMessageNavState).recipientHit;
    if (!hit) return;
    if (hit.kind === 'channel') {
      this.recipient.set({ kind: 'channel', id: hit.id, label: hit.name });
    } else {
      this.recipient.set({ kind: 'user', id: hit.uid, label: hit.name, avatar: avatarUrl(hit.avatarPath) });
    }
  }


  /**
   * Focuses the address field when the view opens.
   */
  ngAfterViewInit(): void {
    this.addressInput()?.nativeElement.focus();
  }


  /**
   * Handles address-field keys: suggestion navigation, Enter resolves the
   * active suggestion or surfaces the unresolvable-input error.
   * @param event Keydown event of the address input.
   */
  protected onAddressKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const count = this.suggestions().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.set((this.activeIndex() + delta + count) % Math.max(count, 1));
      return;
    }
    if (event.key === 'Enter') this.resolveOnEnter(event);
  }


  /**
   * Locks a suggestion as the recipient chip.
   * @param suggestion Picked suggestion row.
   */
  protected pickSuggestion(suggestion: Suggestion): void {
    const kind = suggestion.id.startsWith(CHANNEL_PREFIX) ? 'channel' : 'user';
    const id = suggestion.id.replace(CHANNEL_PREFIX, '').replace(USER_PREFIX, '');
    this.recipient.set({ kind, id, label: suggestion.label, avatar: suggestion.avatar });
    this.addressControl.setValue('');
    this.addressError.set('');
    this.activeIndex.set(0);
  }


  /**
   * Removes the locked recipient and refocuses the address field.
   */
  protected removeRecipient(): void {
    this.recipient.set(null);
    requestAnimationFrame(() => this.addressInput()?.nativeElement.focus());
  }


  /**
   * Sends the first message to the locked recipient and navigates to the
   * target channel or conversation.
   * @param text Trimmed message text from the composer.
   */
  protected async send(text: string): Promise<void> {
    const recipient = this.recipient();
    if (!recipient) return this.addressError.set(ADDRESS_ERROR);
    try {
      await this.deliver(recipient, text);
      const route = recipient.kind === 'channel' ? '/app/channel' : '/app/dm';
      await this.router.navigate([route, recipient.id]);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Routes the message to the channel or direct conversation; the created
   * id is discarded (this compose flow navigates instead of notifying).
   * @param recipient Locked recipient.
   * @param text Trimmed message text.
   */
  private async deliver(recipient: Recipient, text: string): Promise<void> {
    if (recipient.kind === 'channel') {
      await this.messageService.sendChannelMessageAsJoiner(
        recipient.id,
        text,
        !this.isMemberOf(recipient.id),
      );
      return;
    }
    await this.directMessageService.send(recipient.id, text);
  }


  /**
   * Whether the signed-in user is already a member of a channel; first-time
   * senders additionally announce their join with a system message.
   * @param channelId Channel to check.
   */
  private isMemberOf(channelId: string): boolean {
    const uid = this.authService.currentUser()?.uid ?? '';
    const channel = this.allChannels().find(item => item.id === channelId);
    return channel?.memberIds.includes(uid) ?? false;
  }


  /**
   * Picks the active suggestion on Enter; without any match the specific
   * unresolvable-input error appears under the field.
   * @param event Enter keydown event.
   */
  private resolveOnEnter(event: KeyboardEvent): void {
    event.preventDefault();
    const matches = this.suggestions();
    if (matches.length > 0) return this.pickSuggestion(matches[this.activeIndex()]);
    if (this.addressControl.value.trim()) this.addressError.set(ADDRESS_ERROR);
  }


  /**
   * Builds the address suggestions: "#" lists channels, "@" lists members,
   * plain text matches channel names, user names and e-mail addresses.
   */
  private buildSuggestions(): Suggestion[] {
    if (this.recipient()) return [];
    const raw = this.addressTerm().trim();
    if (!raw) return [];
    if (raw.startsWith('#')) return this.channelSuggestions(raw.slice(1));
    if (raw.startsWith('@')) return this.userSuggestions(raw.slice(1), false);
    return [...this.channelSuggestions(raw), ...this.userSuggestions(raw, true)];
  }


  /**
   * Builds channel suggestions filtered by name; per checklist US4 the
   * list covers ALL existing channels, not only member channels.
   * @param query Lowercased-comparable filter term.
   */
  private channelSuggestions(query: string): Suggestion[] {
    const normalized = query.toLowerCase();
    return this.allChannels()
      .filter(channel => channel.name.toLowerCase().includes(normalized))
      .map(channel => ({ id: `${CHANNEL_PREFIX}${channel.id}`, label: channel.name, isHash: true }));
  }


  /**
   * Builds user suggestions filtered by name and optionally e-mail.
   * @param query Lowercased-comparable filter term.
   * @param includeEmail Whether e-mail addresses also match.
   */
  private userSuggestions(query: string, includeEmail: boolean): Suggestion[] {
    const normalized = query.toLowerCase();
    return this.userService
      .users()
      .filter(
        user =>
          user.name.toLowerCase().includes(normalized) ||
          (includeEmail && (user.email ?? '').toLowerCase().includes(normalized)),
      )
      .map(user => ({ id: `${USER_PREFIX}${user.uid}`, label: user.name, avatar: avatarUrl(user.avatarPath) }));
  }
}


/**
 * Maps an avatar path to its lightest still rendition (static WebP when
 * one ships) with placeholder fallback.
 * @param path Avatar path stored on a user document.
 */
function avatarUrl(path: string): string {
  return resolveAvatarStillSrc(path);
}
