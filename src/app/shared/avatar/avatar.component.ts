/**
 * @file Reusable avatar renderer: a still base layer (size/shape from the
 * consumer's class) plus a lazy animated overlay that plays on hover/focus for
 * the single large surfaces, while the profile animates continuously. Honours
 * reduced motion and coarse-pointer devices.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import {
  DEFAULT_AVATAR_PATH,
  resolveAvatarPath,
  resolveAvatarStillSrc,
} from '../../services/registration.service';
import { ReducedMotionService } from '../../services/reduced-motion.service';
import { isKnownAvatar, resolveAvatarMedia } from '../avatar-media';

/** Surface that renders the avatar; drives size and the motion behaviour. */
export type AvatarSurface = 'topbar' | 'header' | 'profile' | 'row' | 'sidebar';

const HOVER_PLAY_SURFACES: ReadonlySet<AvatarSurface> = new Set<AvatarSurface>(['header', 'topbar']);

const CONTINUOUS_SURFACES: ReadonlySet<AvatarSurface> = new Set<AvatarSurface>(['profile']);

/**
 * Renders a user avatar. 'profile' animates continuously (still under reduced
 * motion); 'header'/'topbar' stay still and play the 256px animation only while
 * `isActive` (the surrounding control is hovered or keyboard-focused) on
 * hover-capable pointers; every other surface stays a still frame. Avatars
 * without a WebP set render their JPEG. The animated overlay is lazy — its
 * source is requested only on first activation and crossfades in once decoded,
 * so the still never flashes and at most the two large surfaces ever decode an
 * animation.
 */
@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  readonly avatarPath = input.required<string>();

  readonly surface = input.required<AvatarSurface>();

  readonly alt = input('');

  readonly isActive = input(false);

  private readonly motion = inject(ReducedMotionService);

  private readonly media = computed(() => resolveAvatarMedia(this.avatarPath()));

  private readonly hasRequestedAnim = signal(false);

  private readonly isAnimLoaded = signal(false);

  protected readonly canHoverPlay = computed(
    () =>
      HOVER_PLAY_SURFACES.has(this.surface()) &&
      this.media() !== null &&
      !this.motion.prefersReducedMotion() &&
      this.motion.isHoverCapable(),
  );

  protected readonly baseSrc = computed(() => this.resolveBaseSrc());

  protected readonly animSrc = computed(() =>
    this.hasRequestedAnim() ? (this.media()?.small ?? null) : null,
  );

  protected readonly isAnimShown = computed(
    () => this.canHoverPlay() && this.isActive() && this.isAnimLoaded(),
  );


  /**
   * Requests the animated source the first time the avatar becomes active on a
   * hover-play surface; later activations reuse the already-decoded image.
   */
  constructor() {
    effect(() => {
      if (this.canHoverPlay() && this.isActive() && !untracked(this.hasRequestedAnim)) {
        this.hasRequestedAnim.set(true);
      }
    });
  }


  /**
   * Resolves the base layer: the lightest still rendition without an animated
   * set (the derived static WebP where one ships, e.g. the guest placeholder,
   * else the JPEG), the large animation for the continuously animated
   * profile, otherwise the set's still frame.
   */
  private resolveBaseSrc(): string {
    if (!isKnownAvatar(this.avatarPath())) return resolveAvatarStillSrc(DEFAULT_AVATAR_PATH);
    const media = this.media();
    if (!media) return resolveAvatarStillSrc(this.avatarPath());
    if (CONTINUOUS_SURFACES.has(this.surface()) && !this.motion.prefersReducedMotion()) {
      return media.large;
    }
    return media.still;
  }


  /**
   * Reveals the animated overlay once its image has decoded.
   */
  protected onAnimLoad(): void {
    this.isAnimLoaded.set(true);
  }


  /**
   * Falls back to the avatar's JPEG, then the placeholder, when the base image
   * fails to load.
   * @param event Error event of the base avatar image element.
   */
  protected onError(event: Event): void {
    const image = event.target as HTMLImageElement;
    const jpeg = resolveAvatarPath(this.avatarPath());
    if (!image.src.endsWith(jpeg)) {
      image.src = jpeg;
      return;
    }
    if (!image.src.endsWith(DEFAULT_AVATAR_PATH)) image.src = DEFAULT_AVATAR_PATH;
  }
}
