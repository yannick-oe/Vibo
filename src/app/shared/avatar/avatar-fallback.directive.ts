/**
 * @file Final-safety-net directive for plain user-avatar `<img>` elements on
 * the list/secondary surfaces that render outside AvatarComponent.
 */
import { Directive, ElementRef, inject } from '@angular/core';

import { DEFAULT_AVATAR_PATH } from '../../services/registration.service';

/**
 * Swaps a failed avatar image for the guest placeholder. The source is
 * already guarded through resolveAvatarPath (so an unknown/stale stem never
 * requests a missing file); this catches only the rare case of a known
 * stem whose shipping file is missing, degrading gracefully instead of
 * leaving a broken image. Guards against a swap loop on the placeholder.
 */
@Directive({
  selector: 'img[appAvatarFallback]',
  host: { '(error)': 'onError()' },
})
export class AvatarFallbackDirective {
  private readonly image = inject<ElementRef<HTMLImageElement>>(ElementRef);


  /**
   * Falls back to the placeholder once when the avatar image fails to load.
   */
  protected onError(): void {
    const element = this.image.nativeElement;
    if (!element.src.endsWith(DEFAULT_AVATAR_PATH)) element.src = DEFAULT_AVATAR_PATH;
  }
}
