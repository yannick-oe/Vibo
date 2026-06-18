/**
 * @file Password input pill with a visibility toggle, usable in reactive
 * forms via ControlValueAccessor or standalone in presentational forms.
 */
import { ChangeDetectionStrategy, Component, forwardRef, input, signal, output } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const SHOW_LABEL = 'Passwort anzeigen';
const HIDE_LABEL = 'Passwort verbergen';
const SHOW_ICON = 'icons/visibility.svg';
const HIDE_ICON = 'icons/visibility-off.svg';

/**
 * Pill-shaped password field with an optional leading icon and a trailing
 * button toggling between hidden and visible text. The visibility state is
 * local and resets whenever the component is created.
 */
@Component({
  selector: 'app-password-input',
  templateUrl: './password-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PasswordInputComponent),
      multi: true,
    },
  ],
})
export class PasswordInputComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();

  readonly placeholder = input('');

  readonly autocomplete = input('current-password');

  readonly leadingIcon = input<string | null>(null);

  readonly describedBy = input<string | null>(null);

  readonly isInvalid = input(false);

  protected readonly isVisible = signal(false);

  protected readonly value = signal('');

  protected readonly isDisabled = signal(false);

  private onChange: (value: string) => void = () => undefined;

  private onTouched: () => void = () => undefined;


  /**
   * Writes a value coming from the forms API into the input.
   * @param value New control value.
   */
  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }


  /**
   * Registers the change callback of the forms API.
   * @param fn Callback receiving the new value.
   */
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }


  /**
   * Registers the touched callback of the forms API.
   * @param fn Callback marking the control as touched.
   */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }


  /**
   * Mirrors the disabled state of the bound control.
   * @param disabled Whether the control is disabled.
   */
  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }


  readonly focus = output<void>();

  readonly blur = output<void>();

  /**
   * Forwards user input to the forms API.
   * @param event Input event of the native field.
   */
  protected handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }


  /**
   * Emits the focus event.
   */
  protected handleFocus(): void {
    this.focus.emit();
  }


  /**
   * Marks the control as touched when the field loses focus and emits blur.
   */
  protected handleBlur(): void {
    this.onTouched();
    this.blur.emit();
  }


  /**
   * Switches between hidden and visible password text.
   */
  protected toggleVisibility(): void {
    this.isVisible.update(visible => !visible);
  }


  /**
   * Keeps focus inside the input while the toggle is clicked.
   * @param event Mousedown event on the toggle button.
   */
  protected keepFocus(event: Event): void {
    event.preventDefault();
  }


  /**
   * Resolves the toggle button label for the current state.
   */
  protected toggleLabel(): string {
    return this.isVisible() ? HIDE_LABEL : SHOW_LABEL;
  }


  /**
   * Resolves the toggle button icon for the current state.
   */
  protected toggleIcon(): string {
    return this.isVisible() ? HIDE_ICON : SHOW_ICON;
  }
}
