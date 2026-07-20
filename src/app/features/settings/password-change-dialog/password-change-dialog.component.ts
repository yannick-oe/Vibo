/**
 * @file "Passwort ändern" dialog: hosts the password-change form in its own
 * modal, opened from the account row in the settings dialog. The shared
 * dialog shell provides scrim, focus trap, Escape handling and the focus
 * restore to the opening row; this wrapper only adds the header chrome and
 * the initial focus into the first form field.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  output,
  viewChild,
} from '@angular/core';

import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { PasswordChangeComponent } from '../password-change/password-change.component';

/**
 * Modal wrapper around the password-change form. All validation, error
 * mapping, success behavior and the guest/Google hiding stay in the
 * embedded form component and the settings dialog respectively.
 */
@Component({
  selector: 'app-password-change-dialog',
  imports: [DialogShellComponent, PasswordChangeComponent],
  templateUrl: './password-change-dialog.component.html',
  styleUrl: './password-change-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordChangeDialogComponent implements AfterViewInit {
  readonly closed = output<void>();

  private readonly passwordChange = viewChild.required(PasswordChangeComponent);


  /**
   * Focuses the first password field once the dialog is rendered (after the
   * shell's default first-focusable focus), mirroring the channel-create
   * dialog convention for form dialogs.
   */
  ngAfterViewInit(): void {
    this.passwordChange().focusFirstField();
  }
}
