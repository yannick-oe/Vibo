/**
 * @file The provided avatar set shared by registration and profile editing.
 */

/** Selectable avatar asset with a human-readable label. */
export interface AvatarOption {
  readonly path: string;
  readonly label: string;
}

export const AVATAR_OPTIONS: readonly AvatarOption[] = [
  { path: 'avatars/astronaut.jpeg', label: 'Astronaut' },
  { path: 'avatars/alien.jpeg', label: 'Alien' },
  { path: 'avatars/dragon.jpeg', label: 'Drache' },
  { path: 'avatars/fox.jpeg', label: 'Fuchs' },
  { path: 'avatars/raccoon.jpeg', label: 'Waschbär' },
  { path: 'avatars/girl.jpeg', label: 'Mädchen' },
  { path: 'avatars/gamer-girl.jpeg', label: 'Gamerin' },
  { path: 'avatars/headphones.jpeg', label: 'Kopfhörer' },
  { path: 'avatars/sphere.jpeg', label: 'Kugel' },
  { path: 'avatars/sprout.jpeg', label: 'Setzling' },
];
