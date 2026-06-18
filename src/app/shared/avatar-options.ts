/**
 * @file The provided avatar set shared by registration and profile editing.
 */

/** Selectable avatar asset with a human-readable label. */
export interface AvatarOption {
  readonly path: string;
  readonly label: string;
}

export const AVATAR_OPTIONS: readonly AvatarOption[] = [
  { path: 'avatars/Elias-Neumann.png', label: 'Elias Neumann' },
  { path: 'avatars/Elise-Roth.png', label: 'Elise Roth' },
  { path: 'avatars/Frederik-Beck.png', label: 'Frederik Beck' },
  { path: 'avatars/Noah-Braun.png', label: 'Noah Braun' },
  { path: 'avatars/Sofia-Müller.png', label: 'Sofia Müller' },
  { path: 'avatars/Steffen-Hoffmann.png', label: 'Steffen Hoffmann' },
];
