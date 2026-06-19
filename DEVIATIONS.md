# Conventions & intentional deviations

This file records deliberate, reviewed deviations from the checklist / coding
standards, so they are not mistaken for defects in a future audit.

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
