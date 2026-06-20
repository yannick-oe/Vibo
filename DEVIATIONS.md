# Conventions & intentional deviations

This file records deliberate, reviewed deviations from the checklist / coding
standards, so they are not mistaken for defects in a future audit.

## Profile badges / Abzeichen (2026-06-20)
Additive profile **badges shown next to the name**, an on-brand cosmic/dev enhancement **beyond the
DA Figma** (no Figma design exists). The `users/{uid}` self-update rule is field-permissive, so the
new field needs **no `firestore.rules` change / deploy**.
- **Registry** ([badge-options.ts](src/app/shared/badge-options.ts)): a fixed set of 4 badges, each
  `{ id (English), label/description (German), icon (inline SVG, currentColor), accent (CSS-var
  token) }` — `founder` (Gründer, star), `developer` (Entwickler, `</>`), `pioneer` (Pionier, comet),
  `verified` (Verifiziert, **shield-check** — a cleaner cousin of the suggested "check-seal", reads as
  verified). Unknown ids are dropped so legacy values render nothing. (A `guest` badge existed in an
  earlier iteration and was removed — the guest now shows no badge.)
- **Component** ([badge-list](src/app/shared/badge-list/badge-list.component.ts)): presentational,
  takes `badges: string[]`, renders ~**1rem (18px)** icons in a row. Each badge is a **focusable
  `<button>` tooltip trigger** whose **accessible name is the German description** (`aria-label`); the
  visual tooltip (label + description) is therefore decorative (`aria-hidden`, no element ids → safe
  when the same badge shows in several lists at once). Tooltip shows on **hover and focus** via CSS
  (`:hover` / `:focus-within` + a transparent `::after` bridge so it is **hoverable**), and is
  **dismissible on Escape** (JS sets a `--dismissed` class, cleared on blur) per **WCAG 1.4.13**.
  `cursor: help` (not `pointer`) — the trigger performs no action, it only reveals info.
- **A11y / contrast:** the 4 accent tokens (`--badge-*`, light + dark in
  [_themes.scss](src/styles/_themes.scss)) are **measured**: every accent is **≥ 4.5:1** against the
  white/dark name backgrounds in both themes (icons are graphical objects needing only 3:1, so this
  is a comfortable margin). The injected SVGs are sized via `::ng-deep svg` (the documented way to
  style `[innerHTML]`-injected, non-encapsulated content) and trusted with `bypassSecurityTrustHtml`
  because the icon strings are static internal constants (no user input). `prefers-reduced-motion`
  drops the tooltip fade. No layout shift (tooltip is absolutely positioned).
- **Display spots:** next to the name in exactly **two** places — the **profile card** and the **DM
  header** (not the top bar; an earlier top-bar row was removed). **Not** on per-message author names
  (noise + perf). The badge sits in a flex **name-row with the name** (`gap: space()`), aligned to the
  **name line** (not the name+status block). In the profile card the status is already a separate block
  below, so its identity row needed no change. In the DM header the name+badge are a row with the
  status below, and because the partner area is one click target the trigger is a **transparent
  absolutely-positioned `<button>` overlay** (`.dm__partner-trigger`): the avatar/identity are
  `pointer-events: none` so clicks reach it, while the badge row is raised (`z-index`,
  `pointer-events: auto`) above it so its own focusable triggers are never nested inside the partner
  button (which would be invalid).
- **Data:** `badges?: string[]` on `UserDoc` (default absent). The **guest reset** payload seeds an
  **empty array `[]`** (an explicit empty array overrides the default → the guest shows no badge).
  **Display default** (`displayBadges()`): an explicit array always wins (even empty); a user with no
  `badges` field falls back to `["developer"]` so demo profiles are never bare. Badges are **never
  derived from identity** (email/uid/account/"first user") — the founder badge is granted **only** by
  an explicit `badges` array on the Firestore document. New non-guest docs intentionally store **no**
  `badges` field so the developer default applies; `updateProfile` does not touch `badges`, so it
  survives profile edits.

## Custom status + aurora-animated name + rounded profile card (2026-06-20)
Three additive profile enhancements **beyond the DA Figma** (guest editing stays locked; the
`users/{uid}` self-update rule is field-permissive so **no `firestore.rules` change / deploy**):
- **Free custom status** (`status` on `UserDoc`, default empty): a text field in "Dein Profil
  bearbeiten" capped at a named **`STATUS_MAX_LENGTH` = 60** (the field's `maxlength` hard-enforces
  it), with a live `count/60` counter associated to the input via `aria-describedby`, and an explicit
  **clear** button (German `aria-label`). Shown **near the name** — under it on the profile view card
  and in the **DM header** as a truncated muted line (`.dm__partner-status`, ellipsis, max-width
  const). **Not** on per-message rows. `updateProfile` was refactored from positional args to a
  single `ProfileDraft` object (name/avatarPath/banner/status/animatedName); name + status are
  trimmed on write.
- **Optional aurora-animated name** (`animatedName: boolean`, default false): a `role="switch"`
  toggle "Namen animieren" in the edit card. A reusable `AuroraNameComponent` fills the name with a
  flowing aurora gradient via **`background-clip: text`** (animated `background-position`); applied
  only in the **prominent** name spots — the profile card, the DM header, and the **top-bar own
  name** (and the profile menu) — **not** on message-row author names (noise + perf). **A11y:** the
  gradient stops are **dedicated, measured AA tokens** (`--aurora-name-a/b/c`, light/dark) — every
  stop is ≥ **5.7:1** in light and ≥ **6.2:1** in dark against the white/dark name backgrounds, so the
  text stays legible across the whole gradient. **`prefers-reduced-motion`** ⇒ the flow animation is
  dropped (the gradient renders **static**, still legible); the gradient text is solid (no
  translucency) so `prefers-reduced-transparency` does not apply. The edit switch's slide is also
  reduced-motion-gated.
- **Rounded profile card** (CHANGE 3): the profile dialog now keeps **all four corners at
  `$radius-xl`** even when anchored to its trigger — previously the anchored variant squared the top
  corner toward the trigger (the speech-bubble attachment). Scoped to `--profile` only (the menu and
  other anchored dialogs still square their corner); the modal-opened profile was already fully
  rounded. This reads as a clean glass panel in both themes.
- **Guest** is seeded a demo `status` + `animatedName: true` so the showcase account demonstrates
  both features; editing stays **locked** (the edit card is unreachable for the guest).

## Animated cosmic canvas profile banner — Profil + Status, Teil 1 (2026-06-20)
An **enhancement beyond the DA Figma**: a Discord-style animated **cosmic banner** behind the
profile picture. This **replaces the dropped "avatar aura" ring idea** (that earlier uncommitted
work was reverted entirely — no `aura` field/overlay anywhere). The banner **plumbing** (the
`banner` field, the picker in "Dein Profil bearbeiten", profile-card-only display, guest lock, no
rules change) is kept; the **rendering was upgraded from tame CSS gradients to a single animated
`<canvas>` cosmic scene** for a real "wow" hero. CSS/SVG/canvas only — **no GIF/video assets**.
- **One engine, mood presets** (`shared/banner-options.ts`): the presets are **param variants**
  (`CosmicParams`: starDensity / auroraIntensity / nebulaIntensity) of the **same** canvas engine, so
  effort concentrates on engine quality. Ids **English** (all-identifiers-in-English rule), labels
  **German**: `none` (Keine — off, no canvas), `aurora` (Polarlicht — aurora-forward), `starfield`
  (Sternenfeld — denser stars), `nebula` (Nebula — colored nebula clouds + stars).
- **Canvas engine, split across small files** (`shared/profile-banner/cosmic/`): `cosmic-starfield`
  (2–3 parallax depth layers, hundreds of twinkling stars, capped by a named const), `cosmic-aurora`
  (sine-distorted gradient ribbons drawn with **`screen` (additive) compositing** so they bloom in
  the indigo/magenta token palette), `cosmic-nebula` (drifting additive blobs for the nebula preset),
  `cosmic-shooting-star` (a rare streak on a randomized cooldown), and `cosmic-scene` (palette resolve
  + seed + per-frame orchestration). All counts/speeds/sizes are **named consts**; the scene is
  DPR-scaled and GPU-friendly.
- **Intrinsically dark in both themes** (a night-sky window): two new tokens `--banner-space` /
  `--banner-star` are defined once in `:root` (same value in light and dark) so the scene is dark
  regardless of theme; the aurora reads the live `--color-primary` / `--color-accent`. The banner
  does **not** lighten in light mode by design; the avatar (opaque, with explicit `z-index`) and the
  surrounding card chrome stay legible in both.
- **RAF only while open**: the loop starts on mount (`afterNextRender`) and stops on destroy
  (`DestroyRef`), and the component is only mounted while the profile card is open → **zero
  background cost**. A `ResizeObserver` re-fits the scene (e.g. down to 320px).
  **`prefers-reduced-motion`** ⇒ **one rich static frame** (full starfield + aurora, no loop, no
  shooting star). **`prefers-reduced-transparency`** ⇒ additive glow dropped to `source-over` and the
  layer opacities cut. Only the card preview renders a banner, so at most **one RAF loop** runs.
- **Bigger hero** (CHANGE 2): the strip grew from 110px to **190px** (150px ≤ `respond-sm`). The
  avatar sits **deep** in the strip — its top ~**three-quarters overlaps** (`--on-banner` negative
  margin driven by the named `$banner-avatar-overlap` = 0.75) so only the bottom quarter protrudes
  below, which shifts everything beneath up and keeps the dialog shorter; explicit `z-index: 1` so it
  paints above the canvas. Spacing below the avatar stays the dialog's token `space('lg')` gap. The
  canvas has a fixed CSS box → **CLS 0**.
- **Picker** (profile edit): a real `role="radiogroup"` of compact **text chips/pills** (Keine /
  Polarlicht / Sternenfeld / Nebula — **no per-option preview thumbnails**; they didn't read well at
  that size and bloated the dialog) with **roving tabindex** + arrow keys, a **primary-toned selected
  state** (`aria-checked`, token border/tint + high-contrast label) and German `aria-label`s; the
  **big card banner is the live preview** — selecting a chip updates it. Staged with the name/avatar
  draft and persisted on **Speichern** (Abbrechen reverts) via `updateProfile`.
- **Shown on the profile card only** — the edit-dialog preview and the profile view card (own and
  others). **Deliberately NOT** in the topbar, DM header, DM list, or message rows.
- **Data**: `banner?: string` on `UserDoc`, resolved to `none` at read so existing users get no
  banner; new docs seeded `none`, guest reset seeded `nebula` (editing stays **locked**).
- **No Firestore rules change / no `firestore:rules` deploy**: the `users/{uid}` self-update rule
  is field-permissive, so writing `banner` is already allowed.

## Soft-delete tombstone refresh + delete pop animation (2026-06-19)
Deletion was **already a soft delete** before this change — `deleteForAll` sets
`deletedAt`/`deletedBy` and clears `text: ''` + `reactions: {}` in one update, and `firestore.rules`
already permits exactly that (`setsTombstone` → `affectedKeys().hasOnly(['deletedAt','deletedBy',
'text','reactions'])`). So **no rules change was needed** (no `firestore:rules` deploy). This change
only reworks the tombstone's presentation and adds a pop animation:
- **Tombstone is now a plain muted line, not a bubble.** "Für alle löschen" renders the message
  position as `.message__tombstone` — a muted-italic **"Nachricht gelöscht"** with no bubble
  background/border/radius, no reactions, no hover action bar, no edit/delete. This **deviates from
  the earlier DA tombstone** ("Diese Nachricht wurde gelöscht", italic `text-gray` inside a muted
  `bg` bubble): the wording is terser and the bubble chrome is dropped for a cleaner placeholder.
  A deleted **thread root** still shows the tombstone at the top with replies intact (thread link
  survives while `replyCount > 0`).
- **AA both themes via a dedicated token.** The tombstone text uses `--msg-deleted-text` (light
  `#54546e`, dark `text-gray`) — measured **6.35:1** on the `bg`/hover row and **7.32:1** on white
  in light, **7.35–8.05:1** in dark (all ≥ 4.5). `text-gray` on the light `bg` is only 4.84:1, so a
  darker token gives comfortable headroom on every row state.
- **"Für mich löschen" semantics unchanged** (per-user `hiddenFor` hide; counters/other users
  unaffected) — it just gains a collapse-out pop before the list drops the row.
- **Pop animation (no Figma design).** On a genuine not-deleted → deleted transition (detected by a
  per-row `effect`, so messages that load already-deleted from history do **not** pop), the
  tombstone scale/fades in (`tombstone-pop`); "Für mich" plays a collapse-out (`message-hide`) then
  writes the hide — and **reverts the collapse if the write fails** (`runAction` now returns success;
  `isHiding` is reset on failure) so a failed/offline hide never strands a blank full-height row.
  One named duration (`$message-delete-duration` / `DELETE_POP_MS` = 220ms; the SCSS and TS constants
  must stay in sync). Transform/opacity only → **CLS 0**; the keyframes are gated under
  `@media (prefers-reduced-motion: no-preference)` and the "Für mich" delay is skipped under reduced
  motion, so reduced-motion ⇒ **instant** tombstone / removal, reaction-free. The optional sparkle
  was **not** added (the existing effects canvas is full-viewport; a localized per-message sparkle is
  out of scope and would risk a non-tasteful full-screen flash).
- **Height reflow is natural, not layout-animated — a deliberate CLS-0 trade-off.** The task asked
  that "the height change animates smoothly so nothing jumps." The pop is **transform/opacity only**
  (like the existing message-entrance animation), so the bubble→tombstone (and "Für mich" removal)
  **height delta reflows naturally** rather than via an animated layout property. This is chosen to
  preserve the project's hard **CLS = 0** guarantee and stay consistent with the entrance animation;
  animating `height`/`grid-template-rows` would smooth the reflow but trade away that guarantee.
  Net effect: the affected row animates smoothly in place and the small height delta settles in one
  natural step (no multi-jump); for "Für mich" the faded row holds its box for 220ms then the list
  drops it. Revisit only if an animated-height collapse is explicitly wanted over strict CLS-0.
- Two small helpers (`resolveDate`, `prefersReducedMotion`) were moved to `message-item.util.ts`
  to keep `message-item.component.ts` under the 400-LOC cap.

## "Große Reaktionen" picker section + rocket (third big reaction) (2026-06-19)
This reworks the earlier (uncommitted) "pin the big reactions in the action bar" discoverability
attempt — that pin was **reverted**: the hover action bar shows the user's **two last-used
reactions** again (`RecentEmojiService` restored, `record()` back in `message-item`'s `react()`),
exactly as the committed base. A big reaction that happens to surface as a last-used quick slot
still keeps its `reaction-special` highlight + German tooltip (applied conditionally via `isBig`),
but nothing is statically pinned. Discoverability instead lives in the picker:
- **"Große Reaktionen" section at the top of the emoji picker.** In a **reaction context only**
  (`isReactionTrigger()` — not the composer/edit insert picker), the picker leads with a labelled
  group: an `<h3>` heading "Große Reaktionen", a row of the big-reaction buttons (each carrying the
  shared `@mixin reaction-special` aurora-tint + glow-ring highlight, both themes), a decorative
  `<hr>` divider (`aria-hidden`, `lines` token), then the rest of the catalog as the main grid.
  The section is `role="group"` + `aria-labelledby` the heading; all buttons stay real `<button>`s
  in DOM order so native Tab/keyboard traversal is unchanged. German `aria-label` + native `title`
  ("Mit Konfetti/Herzen/Rakete reagieren") on the big buttons.
- **Data-driven from `BIG_REACTIONS`.** The section renders `BIG_REACTION_EMOJIS`
  (`Object.keys(BIG_REACTIONS)`); the grid is `GRID_EMOJI_SET` = the catalog **minus** the big
  reactions, so a big reaction appears **only** in the section, never duplicated in the grid, and a
  future big reaction auto-moves with no further template edits. In the composer (insert) context
  there is no section and the grid is the full `EMOJI_SET`, so every emoji stays insertable as text.
  The picker heading uses `--text-on-aurora` (not `text-gray`, which fails AA on the light glass
  sheen at the top of the popover).
- **Third big reaction: 🚀 rocket, with a cross-screen effect.** `🚀 → 'rocket'` added to
  `BIG_REACTIONS` (German noun "Rakete"), so it appears in the section automatically. A new
  `rocket` `EffectKind` reuses the existing fixed full-viewport canvas / `effects-particles`:
  `ROCKET_COUNT` (3, named const) rockets streak bottom-left → top-right as glowing aurora trails
  (tapering head→transparent gradient + shadow glow), reading the live `--color-primary`/`-accent`
  tokens so light and dark each get their palette. Plays once, auto-cleans within the existing
  `EFFECT_MAX_MS` cap, DPR-scaled, no layout impact (CLS 0); `prefers-reduced-motion` /
  `prefers-reduced-transparency` skip the screen effect entirely (the reaction still registers).

## Reactions: one per user + two big reactions with full-screen effects (2026-06-19)
- **One reaction per user per message (was up to one per emoji).** A user now holds **at most
  one** reaction on a message: reacting with a new emoji **replaces** the previous one, and
  re-selecting the current one **removes** it. Enforced **client-side, atomically** — a single
  `updateDoc` (`message.service.ts` → `setReaction`/`applyReaction`) removes the user's uid from
  any reaction they already hold and adds it to the chosen one (variadic `FieldPath('reactions',
  …)` field updates, so concurrent reactors are not clobbered; the field is deleted via
  `deleteField()` only when the user was its sole reactor). No new write path — still the single
  reaction update. The chip row, display caps (desktop 20 / mobile+thread 7 + "+x weitere") and
  Twemoji rendering are unchanged; reaction keys remain unicode characters (no data migration).
- **Firestore-rules note (not implemented, deliberate).** The one-per-user invariant is enforced
  only on the client. It could later be hardened in `firestore.rules` (the `togglesReactionsOnly`
  matrix already confines edits to the `reactions` map — a two-key switch only changes the
  top-level `reactions` key, so it passes today), shipped via a separate `firebase deploy --only
  firestore:rules`. Out of scope for this prompt; flagged here.
- **Two "big" reactions with on-brand full-screen effects.** 🎉 (confetti) and 💖 (hearts, new
  Twemoji `1f496`) are normal reactions in every respect (become the user's one reaction, show a
  chip, count toward the cap) **and** play a one-shot full-screen effect for the **selecting user
  only** — broadcasting to other participants is an explicit **later** enhancement, intentionally
  not built (`EffectsService` doc-comments this). No Figma design exists for the effects; kept
  strictly on-brand. Confetti uses the **aurora hues** (indigo → violet → magenta, i.e. the live
  `--color-primary` → mix → `--color-accent` theme tokens); hearts are soft glowing hearts (accent
  → accent/white) floating up. Colors are read at runtime from the active theme, so **light and
  dark each get their own palette**.
- **Implementation:** a single app-level `EffectsOverlayComponent` (mounted once in `app.ts`) owns
  **one fixed full-viewport `<canvas>`** above all panels (`z-index: $z-tooltip`,
  `pointer-events: none`, `aria-hidden`, empty until played → **CLS = 0**, no interaction
  blocking). A bounded custom particle system (`effects-particles.ts`; **no library**, so nothing
  to lazy-load; named counts `CONFETTI_COUNT` 110 / `HEARTS_COUNT` 22, hard `EFFECT_MAX_MS` 4000
  cap) plays once per trigger and auto-clears. `prefers-reduced-motion` **and** (conservatively)
  `prefers-reduced-transparency` **skip the effect entirely** — the reaction still registers and
  the chip still appears (the skip happens in the overlay, not the write path).
- **A11y labels.** Reaction triggers are real `<button>`s (keyboard, `:focus-visible`). The two
  big reactions read German effect labels **"Mit Konfetti reagieren" / "Mit Herzen reagieren"**
  (shared `reactionTriggerLabel`, used by the quick-reaction bar and the reaction picker; the
  composer/edit picker stays neutral via the new `isReactionTrigger` flag). The catalog `name`
  stays the literal emoji name ("Party-Tröte" / "Funkelndes Herz") for the image `alt` and the
  who-reacted tooltip. The overlay canvas is decorative (`aria-hidden`).

## Legal pages unified + back-arrow → login (2026-06-19)
- **Both legal pages share one constrained frost card, identical in light AND dark.** A new
  `.legal-card` (in `_layout.scss`: `@include m.glass` + `max-width: $legal-card-width` 660px ≈
  a 60–70ch reading measure + `space-fluid` padding + responsive) is used by Impressum and
  Datenschutz alike. **The Phase-2 dark "bare/full-width" Datenschutz exception is removed** —
  the dark legal pages now get the frost-card treatment too (deliberately authorised). Dark
  contrast on the frost card is comfortable: body **15.8:1**, primary headings **6.0:1**, the
  e-mail link **7.6:1**, the muted note **7.3:1** (all ≥4.5). The long full-width dark lines
  (the readability regression) are gone; light is unchanged in width terms (~64ch).
- **Back arrow goes straight to login.** On Impressum, Datenschutz and Konto-erstellen
  (register), the back arrow is now a real `routerLink="/auth/login"` `<a>` (crawlable `href`,
  keyboard-operable, `:focus-visible`, ≥44px via `.btn.btn-icon`, `aria-label="Zurück zur
  Anmeldung"`) instead of a `history.back()` click handler — so chaining legal pages no longer
  needs repeated presses to reach login. The dead `goBack()`/`Location` were removed.

## Auth top-right declutter + light a11y polish (2026-06-19)
- **Removed the auth-header frost chip** (the Phase-2 `--cta-frost-*` backing, below). The
  "Neu bei {{Vibo}}?" caption + "Konto erstellen" link render as **clean box-free text**,
  kept AA-robust at the aurora's **densest reachable point** via colour: caption =
  `--text-on-aurora` (light `#54546e`, **5.29:1** over a 13% primary lobe; dark = `text-gray`,
  unchanged), link = `--link-on-aurora` (light `#373ecb`, **5.60:1**; dark = `primary`,
  unchanged — `primary` alone was 4.23:1, just under, so a slightly darker on-aurora indigo
  was introduced as the task allowed). The mobile "Konto erstellen" `btn-secondary` CTA gets
  the same `--link-on-aurora` token for its resting text/border (`:not(:hover):not(:active)`,
  so the hover-fill is untouched). The cluster aligns cleanly with the theme toggle
  (`align-items: center`, `space()` gaps). Dark byte-for-byte (the chip tokens were already
  `transparent/none/0` in dark).
- **Global link colour fixed for light.** `a:not(.btn)` was `primary-hover` (**3.45:1 on
  white — FAIL**); now `--link-color` = `primary` in light (**5.85:1**), `primary-hover` in
  dark (unchanged). Fixes the Impressum e-mail link, the register "Datenschutzerklärung"
  link (both on frost cards, 5.85:1) and the footer legal links (4.63:1 in their zone). The
  link hover keeps its border/weight affordance.
- **Disabled primary button softened in light.** Was a heavy dark-grey block
  (`background: text-gray` + white label). Now a muted **ghosted frost** —
  `--btn-disabled-bg` (light `color-mix(lines 25%, white)`) + `--btn-disabled-text` (light
  `text-gray`, label **4.70:1** — legible; disabled controls are exempt from the 4.5 min).
  It recedes and no longer falsely signals a ready primary. **Dark unchanged**
  (`text-gray` fill + white label).

## Light-mode refresh — Phase 2 (2026-06-19, per-page/dialog sweep + 2 fixes)
- **(SUPERSEDED above)** The Phase-2 `--cta-frost-*` chip on the auth caption/CTA was
  removed in the declutter pass; the entry is kept for history.
- **Secondary auth text no longer relies on aurora-corner positioning.** The "Neu bei
  {{Vibo}}?" caption (`text-gray`) and the register CTA (`primary`) both failed AA at the
  aurora's densest point (`text-gray` 4.03:1, `primary` 4.23:1 over a 13% primary lobe).
  They now sit on a **light-only frost chip** (`.header__cta` / `.auth-page__mobile-cta`),
  driven by `--cta-frost-bg/-shadow/-pad` (94%-white fill + crisp inset `--glass-border`
  ring + cool `--glass-shadow`). At the densest aurora point the chip gives **text-gray
  5.48:1 / primary 5.76:1**. The tokens are `transparent / none / 0` in dark, so the dark
  header is byte-for-byte unchanged (no chip).
- **Input sheen constrained.** The `glass` mixin gained a `$sheen` parameter; inputs
  (`.composer`, `.search-bar__input`) pass `--input-sheen` = a faint white top-edge
  highlight in light (no full-surface coloured wash) and `var(--glass-sheen)` in dark
  (unchanged). Non-input panels keep the iridescent panel sheen.
- **(SUPERSEDED below — legal-page unification)** Datenschutz was conformed to the Impressum
  frost card in LIGHT only, leaving the dark page bare/full-width. That dark exception was
  later removed: both legal pages now share one `.legal-card` that is frost in both themes.
- **Emoji picker + @/# mention picker conformed to the frost language in LIGHT only.** The
  original solid card (`background-color white` + `box-shadow shadow-lg`) is kept as the base
  (so **dark is byte-for-byte unchanged**) and the frost is layered on via the same
  `:host-context(html:not([data-theme='dark']))` light override — no dark restore block, so no
  stray border/box geometry in dark. The fullscreen search input border moved off the failing
  `lines` (2.10:1) onto `--field-border` (3.68:1).
- **Lighthouse (desktop, light, production build):** Accessibility **100**, Best Practices
  **100**, SEO **100**, Performance **81** (limited by the eager Firebase bundle + a worst-case
  static server, not by the CSS-only Phase-2 changes). `cumulative-layout-shift = 0`,
  `total-blocking-time = 0 ms`, and the aurora `background-position` drift is **not** flagged
  (`non-composited-animations` scored 1) — so per the perf gate it was left as-is (not moved
  to a transform-based technique).

## Light-mode "frosted-aurora" redesign (2026-06-19, Phase 1 — token/mixin layer)
- **Deliberate departure from the original DABubble light Figma.** Light mode was
  re-authored as a "aurora through frosted glass at dawn" language: pale, low-chroma
  indigo→violet→magenta tints behind white-dominant frost on the cool-white canvas
  (`bg #ECEEFE`), crisp cool edges + soft cool (indigo-hint) shadows instead of the
  dark theme's neon glows. Driven entirely from the shared `:root` light tokens in
  [_themes.scss](src/styles/_themes.scss) + the existing `glass` mixin, so every
  token-inheriting surface (shell, sidebar, search, composer, dialogs, profile
  dropdown, auth card, inputs, bubbles) updates at once. Dark mode is unchanged.
- **AA-safe token swaps (measured WCAG; never silently kept a failing colour):**
  - `--field-border` **#7e82b0** replaces `lines #ADB0D9` for input / checkbox /
    radio edges in light: `lines` on white was **2.10:1** (FAILS 1.4.11 3:1); `#7e82b0`
    is **3.68:1 vs white / 3.19:1 vs bg**. (Dark keeps `lines`; dark filled inputs gain
    a hairline — additive, non-regressive.)
  - **Own message bubble** changed from solid `primary-hover` + white text
    (**3.45:1 — FAILED** AA) to a pale-primary tint (`--bubble-own-bg`) + dark text
    (`--bubble-own-text`), **16.6:1**. Other bubbles get a frost fill + crisp
    `--bubble-other-border`.
  - **Sidebar active item** (light) no longer changes `font-weight` (avoids reflow);
    distinguished by a pale-primary fill (`--glass-tint-active`) + a crisp inset
    primary ring (`--glow-active`), self-contained (no clippable outer bloom).
- **`text-gray` is fragile on the aurora — kept off it.** `text-gray #686868` drops
  below 4.5:1 at just **>4% aurora tint** (4.59:1 @4%, 4.44:1 @6%). All chat / panel /
  form secondary text sits on the opaque white/frost layer (≥5.5:1), never on the
  aurora. The aurora is kept pale and its dense lobes are positioned in the off-screen
  corners. **Phase 2 flag:** the auth header caption ("Neu bei {{Vibo}}?", `text-gray`,
  top-right) and the mobile CTA sit directly on the page aurora with no frost backing —
  Phase 2 should give them a frost layer or a darker secondary-text token. Footer legal
  links inherit a dark colour and are safe.
- **Grain off in light** (`--grain: none`); the SVG-noise texture is dark-only.
- **Aurora animates** via a token-driven, GPU-cheap background-position drift
  (`--aurora-anim`, `$aurora-drift-duration 90s`), set to `none` under
  `prefers-reduced-motion`; under `prefers-reduced-transparency`/`@supports not
  (backdrop-filter)` panels fall back to a solid opaque frost (via the `glass` mixin).

## Project structure
- **Feature-based folders instead of a flat `components/` folder.** Components
  live under `src/app/features/<feature>/<component>/` and `src/app/shared/`
  (smart vs. presentational). This is the standard Angular standalone layout and
  maps to the checklist's `components/` requirement.
- **Assets in `public/` instead of `src/assets/` (or an `img/` folder).** This is
  the Angular 17+ convention; `public/` holds `icons/`, `emojis/`, `avatars/`,
  `logos/`, `fonts/`, `illustrations/`, `sounds/`, `favicon/`. It maps to the
  checklist's images/assets requirement.
- **No `pipes/` folder** because the app defines no custom pipes (the folder is
  only required if pipes exist).

## Design tokens
- **`font-size('display')` (4.667rem / 84px)** was added to the type scale for the
  one-off intro-splash wordmark, which is larger than the H1 scale step. Verify
  against Figma when revisiting the splash.
- **`space('md-lg')` (20px)** was added as an intermediate spacing token (between
  `md` 16px and `lg` 24px) for the workspace section-icon indent, mirroring the
  existing intermediate steps `sm-md` (12px) and `xl-xxl` (40px). Figma-pending:
  confirm 20px is the intended value.
- **`$shadow-strong` (0 4px 12px rgba(black, 0.5))** was added for the floating
  mobile menu-toggle tab; no existing elevation token matches its 0.5 alpha.
- **Workspace-serialization sentinel `'false'`** (app-shell `readStoredWorkspaceOpen`)
  is the string form of `String(false)` and is intentionally left inline; it is
  the literal counterpart of the `String(open)` write, not a magic string.

## Fonts
- Per the design system, **only `<h1>` uses Nunito; everything else uses Inter.**
  Several view titles that previously used Nunito (workspace title/section titles,
  channel name, topbar user name, message bubble text, intro wordmark) were
  switched to Inter. **Flag for Figma review:** if any of these were intentionally
  Nunito for branding, restore them as a documented per-element exception.

## Accessibility
- **One `<h1>` per routed view.** Chat views whose visible title is a toolbar
  button (`channel-view`, `direct-message-view`) carry a visually-hidden
  (`.sr-only`) `<h1>`; `new-message` (a route) uses a visible `<h1>`.
  `thread-panel` (a complementary panel rendered alongside a route) and
  `mobile-search-view` (a `role="dialog"` labelled by its `<h2>`) intentionally
  keep their `<h2>` to avoid a second `<h1>` on the page.
- **Intro reduced-motion** is handled primarily in the component: the splash is
  skipped entirely when `prefers-reduced-motion: reduce` is set
  (`intro.component.ts`), so its transitions never run; a CSS guard is also
  present as defense-in-depth.

## Security / config
- **Shared guest credentials** (`gast@dabubble.dev`) are committed in
  `auth.service.ts` by design: a single low-privilege account with no special
  permissions, public-by-design exactly like the Firebase web `apiKey` in the
  client config. It is not a real secret.

## UI fixes (2026-06-16)
- **Channel intro empty-state built from scratch (no pre-existing component).** The
  brief assumed a desktop empty-state existed and was only missing on mobile; in
  fact **no empty-state intro (component or copy) existed anywhere** — desktop was
  blank too. It is now rendered once in `channel-view` (shared by both layouts) for
  the documented condition *no messages AND `createdBy === current uid`*, so it
  shows on all breakpoints. The intro `#<name>` is **styled text** (`color('primary')`),
  not a functional anchor — it references the channel the user is already in.
- **`@`-mention presence follows the app's binary convention, not real presence.**
  There is no presence service; the member list, DM header and search results all
  render the signed-in user as online and everyone else as offline. The mention
  dropdown reuses that source (`uid === current uid` → `color('online')`, else
  `color('text-gray')`); **`abwesend`/away is not used** (the source is binary). The
  dot is **opt-in** (rendered only when a row provides `online`), so the
  `new-message` address picker is intentionally left unchanged.
- **Mobile splash logo size (no exact Figma mobile spec).** Below `$breakpoint-sm`
  (576px) the splash logo is reduced from 187×184px to **120×118px** (named
  variables `$logo-width-mobile` / `$logo-height-mobile`) and the wordmark to
  `font-size('h2')`, so the centered logo + "Vibo" fits within 320px with no
  horizontal scroll. The handoff scale is measured at runtime, so it adapts
  automatically; reduced motion still skips the splash entirely. Confirm the 120px
  size against Figma when revisiting.

## Auth-area polish + accessibility (2026-06-17)
- **Project-wide minimum font size ≥16px (global, intentional).** The sub-16px type
  tokens `sm` (0.833rem/15px) and `xs` (0.667rem/12px) were **removed** and replaced
  by a single `min` token (`0.889rem` = 16px at the 18px base, kept in `rem` so it
  respects user zoom). Every `font-size('sm')`/`font-size('xs')` usage now resolves
  to `font-size('min')`. Rationale: SEO/readability/accessibility — no body text below
  16px. This is a deliberate deviation from Figma's smaller caption/timestamp sizes.
  Verified at 320px (login, register, forgot-password, imprint, privacy, chat view):
  no horizontal scroll; reaction chips wrap (`flex-wrap`+`max-width:100%`) and message
  bubbles wrap (`overflow-wrap:anywhere`), so the bump introduces no overflow. The
  unused legacy aliases `.text-xs/.text-sm/.text-12/.text-15` now also map to `min`.
- **Accessible error-text color (intentional Figma deviation).** Figma's
  `color('error')` `#ed1e79` fails WCAG AA for normal text (4.15:1 on white, 3.60:1 on
  the `#eceefe` input bg). A new `color('error-text')` `#c4185f` (**5.76:1 on white,
  5.00:1 on `#eceefe`** — both ≥4.5:1 AA) is used for all error **text** (`.text-error`,
  `.form-error`). The original `#ed1e79` is retained for non-text/decorative use
  (invalid-input border, error focus ring).
- **Unified header position across auth + logged-in (single source of truth).** The
  auth-area header (`app-header`: login, register, password-reset, Impressum,
  Datenschutz) now matches the logged-in `topbar` logo position **pixel-for-pixel**
  (verified: desktop left 48 / h 56 / center-y 55; mobile left 16 / h 40 / center-y 40).
  This required matching the topbar's height via new `$header-height` (110px) /
  `$header-height-mobile` (80px) tokens and shrinking the **mobile** auth logo from
  56px to `$btn-height-sm` (40px) to equal the topbar's mobile brand logo. The auth
  header is no longer centered on mobile (left-aligned like the topbar), and the old
  `$header-inset` (75px) magic value was removed. Any separate Figma auth-header frame
  is intentionally overridden in favour of one consistent header.
- **Field-error slots reserve a fixed two-line height (no-reflow requirement).** Because
  validation messages are now `font-size('min')` (16px) and the longest one wraps to two
  lines at 320px, every `.form-field .form-error` permanently reserves
  `$form-error-reserved-height` (`font-size('min') × $line-height-base ×
  $form-error-reserved-lines` = 2.667rem / 48px), top-aligned, whether empty or filled.
  This trades a little extra vertical space under each field for **zero layout shift** when
  an error appears/clears (measured identical at desktop and 320px) — a deliberate
  deviation from Figma's tighter field spacing. Form-level `role="alert"` messages keep
  the original small reserve and are out of scope.

## Known minor deviation (optional later cleanup)
- **~39 boolean fields/signals** use a consistent project convention
  (`pending`, `*Open`, `*Focused`, `editing`, `own`, `deleted`, …) rather than the
  `is/has/should/can` prefix. Left as-is to avoid template-binding regressions
  before submission; a wholesale rename is a safe follow-up.
