/**
 * @file Channel settings dialog: per-field editing of name and
 * description, creator display and leaving the channel.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Channel } from '../../../models/channel.model';
import { UserDoc } from '../../../models/user.model';
import { AuthService } from '../../../services/auth.service';
import { ChannelService } from '../../../services/channel.service';
import { LayoutService } from '../../../services/layout.service';
import { PresenceService } from '../../../services/presence.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { AvatarFallbackDirective } from '../../../shared/avatar/avatar-fallback.directive';
import { DEFAULT_CHANNEL_CREATED_BY } from '../../../shared/channels.constants';
import {
  DialogAnchor,
  DialogShellComponent,
} from '../../../shared/dialog-shell/dialog-shell.component';

const NAME_REQUIRED_ERROR = 'Bitte gib einen Channel-Namen ein.';
const NAME_DUPLICATE_ERROR = 'Ein Channel mit diesem Namen existiert bereits.';
const SAVE_ERROR = 'Die Änderung konnte nicht gespeichert werden.';
const LEAVE_ERROR = 'Der Channel konnte nicht verlassen werden.';
const UNKNOWN_CREATOR = 'Unbekannt';
const SYSTEM_CREATOR_NAME = 'Vibo-Team';
const SELF_SUFFIX = ' (Du)';

/** Resolved member row of the mobile members section. */
interface MemberRow {
  readonly uid: string;
  readonly name: string;
  readonly avatar: string;
}

/**
 * "Channel Edition" dialog per the Figma frame: name and description each
 * switch individually into edit mode via their "Bearbeiten" link, the
 * creator is shown by display name and "Channel verlassen" removes the
 * user (deleting the channel entirely when they were the last member).
 * Every member may edit; name changes run the global duplicate check.
 */
@Component({
  selector: 'app-channel-settings-dialog',
  imports: [AvatarFallbackDirective, DialogShellComponent],
  templateUrl: './channel-settings-dialog.component.html',
  styleUrl: './channel-settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelSettingsDialogComponent {
  readonly channel = input.required<Channel>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  readonly memberSelected = output<string>();

  readonly addMembersRequested = output<void>();

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  protected readonly presenceService = inject(PresenceService);

  private readonly layoutService = inject(LayoutService);

  private readonly toastService = inject(ToastService);

  private readonly router = inject(Router);

  protected readonly isEditingName = signal(false);

  protected readonly isEditingDescription = signal(false);

  protected readonly nameDraft = signal('');

  protected readonly descriptionDraft = signal('');

  protected readonly nameError = signal('');

  protected readonly isPending = signal(false);

  protected readonly isMobile = this.layoutService.isMobile;

  protected readonly hasCreator = computed(() => Boolean(this.channel().createdBy));

  protected readonly members = computed(() => this.resolveMembers());

  protected readonly creatorName = computed(() => {
    const createdBy = this.channel().createdBy;
    if (createdBy === DEFAULT_CHANNEL_CREATED_BY) return SYSTEM_CREATOR_NAME;
    return this.userService.users().find(user => user.uid === createdBy)?.name ?? UNKNOWN_CREATOR;
  });


  /**
   * Switches the name field into edit mode.
   */
  protected startNameEdit(): void {
    this.nameDraft.set(this.channel().name);
    this.nameError.set('');
    this.isEditingName.set(true);
  }


  /**
   * Switches the description field into edit mode.
   */
  protected startDescriptionEdit(): void {
    this.descriptionDraft.set(this.channel().description);
    this.isEditingDescription.set(true);
  }


  /**
   * Syncs a draft signal with its input element.
   * @param target Draft signal to update.
   * @param event Input event of the field.
   */
  protected syncDraft(target: 'name' | 'description', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (target === 'name') this.nameDraft.set(value);
    else this.descriptionDraft.set(value);
  }


  /**
   * Validates and saves the new channel name; duplicates and empty names
   * surface as a specific inline error.
   */
  protected async saveName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (!name) return this.nameError.set(NAME_REQUIRED_ERROR);
    this.isPending.set(true);
    if (await this.channelService.isNameTaken(name, this.channel().id)) {
      this.isPending.set(false);
      return this.nameError.set(NAME_DUPLICATE_ERROR);
    }
    await this.persist(() => this.channelService.renameChannel(this.channel().id, name));
    this.isEditingName.set(false);
  }


  /**
   * Saves the description; empty descriptions are allowed.
   */
  protected async saveDescription(): Promise<void> {
    this.isPending.set(true);
    await this.persist(() =>
      this.channelService.updateDescription(this.channel().id, this.descriptionDraft()),
    );
    this.isEditingDescription.set(false);
  }


  /**
   * Removes the user from the channel (deleting it when they were the
   * last member) and returns to the default channel route.
   */
  protected async leave(): Promise<void> {
    this.isPending.set(true);
    try {
      await this.channelService.leaveChannel(this.channel());
      this.closed.emit();
      await this.router.navigate(['/app']);
    } catch {
      this.toastService.show(LEAVE_ERROR);
      this.isPending.set(false);
    }
  }


  /**
   * Resolves the member rows of the mobile members section, self first
   * with the "(Du)" suffix (the frame composes members into the sheet).
   */
  private resolveMembers(): MemberRow[] {
    const selfUid = this.authService.currentUser()?.uid;
    const users = this.userService.users();
    const rows = this.channel()
      .memberIds.map(uid => users.find(user => user.uid === uid))
      .filter((user): user is UserDoc => user !== undefined)
      .map(user => ({
        uid: user.uid,
        name: user.uid === selfUid ? `${user.name}${SELF_SUFFIX}` : user.name,
        avatar: resolveAvatarPath(user.avatarPath),
      }));
    return rows.sort((a, b) => Number(b.uid === selfUid) - Number(a.uid === selfUid));
  }


  /**
   * Runs a save operation; failures surface as an inline-safe toast.
   * @param operation Asynchronous channel update.
   */
  private async persist(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      this.toastService.show(SAVE_ERROR);
    }
    this.isPending.set(false);
  }
}
