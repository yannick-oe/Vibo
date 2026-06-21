/**
 * @file Tracks hover and keyboard focus on its host element so a nested
 * component (e.g. an avatar) can play motion only while the control is active.
 */
import { Directive, computed, signal } from '@angular/core';

/**
 * Exposes `isActive` — true while the host is hovered or keyboard-focused
 * (focus-visible). Apply it to the interactive element and read it through the
 * `avatarActivator` template reference. Focus is tracked via the bubbling
 * `focusin`/`focusout` events, so the control may be the host or a descendant.
 */
@Directive({
  selector: '[appAvatarActivator]',
  exportAs: 'avatarActivator',
  host: {
    '(mouseenter)': 'onHover(true)',
    '(mouseleave)': 'onHover(false)',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut()',
  },
})
export class AvatarActivatorDirective {
  private readonly isHovered = signal(false);

  private readonly isFocused = signal(false);

  readonly isActive = computed(() => this.isHovered() || this.isFocused());


  /**
   * Updates the hover state.
   * @param isOver Whether the pointer is over the host.
   */
  protected onHover(isOver: boolean): void {
    this.isHovered.set(isOver);
  }


  /**
   * Marks focus only when it is keyboard focus (focus-visible).
   * @param event Focus event bubbled from the host or a descendant control.
   */
  protected onFocusIn(event: FocusEvent): void {
    this.isFocused.set((event.target as Element).matches(':focus-visible'));
  }


  /**
   * Clears the focus state when focus leaves the host.
   */
  protected onFocusOut(): void {
    this.isFocused.set(false);
  }
}
