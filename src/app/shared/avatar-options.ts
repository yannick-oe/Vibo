/**
 * @file The provided avatar set shared by registration and profile editing.
 */

/** Selectable avatar asset with a human-readable label. */
export interface AvatarOption {
  readonly path: string;
  readonly label: string;
}

export const AVATAR_OPTIONS: readonly AvatarOption[] = [
  { path: 'avatars/avatar-1.jpeg', label: '1' },
  { path: 'avatars/avatar-2.jpeg', label: '2' },
  { path: 'avatars/avatar-3.jpeg', label: '3' },
  { path: 'avatars/avatar-4.jpeg', label: '4' },
  { path: 'avatars/avatar-5.jpeg', label: '5' },
  { path: 'avatars/avatar-6.jpeg', label: '6' },
];
