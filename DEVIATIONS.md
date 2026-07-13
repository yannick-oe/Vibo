# Conventions & intentional deviations

This file records deliberate, reviewed deviations from the checklist / coding
standards, so they are not mistaken for defects in a future audit.

## Synthesized UI sound design (2026-07-13)
Roadmap V2 Phase 4. No Figma/checklist requirement — additive UX. All sounds are **synthesized at
play time via the Web Audio API** (no audio assets, no licensing; the old `sounds/chat-notification.mp3`
is removed together with its two `new Audio` call sites — the disliked send sound it backed is gone).

- **Central `SoundService`** (`services/sound.service.ts` + the palette in `services/sound-palette.ts`):
  one lazily created AudioContext, unlocked on the first user gesture (document-level
  `pointerdown`/`keydown`, listeners removed once running); a play request before the unlock is
  **dropped silently, never queued** — no autoplay console errors. Chain: oscillator/noise → per-step
  envelope gain (soft attack, exponential decay, linear close to true zero so no step ends with a
  click) → per-sound bus → master gain (volume) → destination. Melodic sounds additionally send at a
  low wet level (`reverbSend`, 0.2) into a **lazily built synthesized reverb**: a `ConvolverNode`
  whose impulse response is generated in code (0.4 s stereo noise burst, exponential decay, 0.12 s
  time constant) — still no audio assets. Per-kind minimum-interval throttles prevent
  machine-gunning. Settings as signals, persisted to localStorage (`vibo:soundEnabled` default on,
  `vibo:soundVolume` default 0.6, `vibo:swipeSoundEnabled` default off).
- **Palette** (low gains, warm/calm; melodic kinds reverb-wet, delete/error dry — same-day fix pack
  redesigned send/reaction from the original blips, which felt like dull plops on device): send = a
  gentle "done" chime, two soft ascending sine notes a perfect fourth apart (G4 392 Hz → C5
  523.25 Hz) with quiet octave partials, 12 ms attacks, ~350 ms total; receive = bell-like sine
  880 Hz with quiet 1760 Hz shimmer falling to 660 Hz; delete = low sine thud gliding 150→70 Hz;
  reaction = one warm kalimba-like pluck (E5 659.25 Hz + fast-decaying E6 partial, ~180 ms, quieter
  than send); error = soft triangle double-tone 311→233 Hz; swipe/swipeClose = band-passed noise
  whoosh sweeping 500→1400 Hz on open and reversed on close (opt-in only).
- **Trigger points** (always the user's own action or the toast — never a snapshot echo): sends play
  optimistically at the start of `MessageService.commitMessage`/`commitReply`/
  `sendChannelMessageAsJoiner` (covers channel/DM/thread/GIF/new-message); the notification toast
  plays `receive` through the service (its existing gating stays); delete-for-me/for-all play
  `delete` post-confirmation; adding a reaction plays `reaction` (own adds only); rejected message
  mutations play `error` inside `MessageService.withErrorSound` — riding the **existing** failure
  handlers (toasts) without new UX. **The sidebar sound is wired to the workspace-column toggle
  button** (same-day fix pack; there is no swipe gesture to attach to): `swipe` rising on open,
  `swipeClose` falling on close, both behind the „Sound der Seitenleiste" opt-in (internal kind
  names keep the `swipe` stem — renaming would ripple through the persisted setting key).
- **Settings UI** in the topbar profile menu (`topbar-sounds.scss`): „Sounds" group with the
  „Soundeffekte" master switch (`role="switch"`), a labelled „Lautstärke" slider and a „Testen"
  preview button playing the send sound at the current volume, and the sidebar-sound opt-in switch.
  The slider is **fully custom-styled for both engines** (same-day fix pack; relying on
  `accent-color` left the track invisible on the frosted menu):
  `::-webkit-slider-runnable-track`/`-thumb` and `::-moz-range-track`/`-progress`/`-thumb`, a
  token-colored track with a filled portion driven by the `--volume-fill` custom property bound
  from the input value, `step="1"` for 1:1 pointer tracking, a short fill transition that only
  eases keyboard steps (`:active` disables it while dragging), volume applied live on `input`,
  sheet-drag-safe via `pointerdown` stop + `touch-action: none`, `aria-valuetext` kept. Dependent
  controls disable while the master toggle is off; touch targets ≥ 44 px; token-only colors AA in
  both themes; reduced motion drops the switch and fill transitions.

## Picker sheet: two detents + anchor-independent placement (2026-07-13)
Roadmap V2 Phase 3, item F. Supersedes the 2026-07-10 „single detent, not two" note — the sheet
physics now carries the detent state that entry deferred. No Figma design (mobile sheets are already
a documented deviation); reduced motion respected; §14 clean.

- **Bug fix — sheet placement no longer follows the trigger.** Root cause: in sheet mode the shell
  still applied the anchor-derived inline styles. `anchoredMaxHeightStyle` capped the card at
  `calc(100dvh − (anchorOffset + inset))`, so the sheet's visible height depended on the trigger's
  viewport position (reaction picker on a low message → sheet almost entirely cut off, only the
  big-reaction row + search visible); the inline `top/left/right` were inert only by cascade
  accident (`position: static` wins by source order). Two gaps compounded: `activeAnchor` was not
  gated on sheet mode, and `anchorAtPoint` (right-click, 2026-07-13) lacks the ≤768 px null guard
  `anchorBelow`/`anchorAbove` have — so cursor anchors flowed into the 769–992 px sheet window.
  Fix: the shell now resolves `activeAnchor` to **null in sheet mode** (and skips `placeVertically`),
  so every sheet — picker, menu, profile — pins to the viewport bottom and its rest position derives
  only from the sheet model, identically for every trigger.
- **Two-detent model for the three picker sheets** (composer emoji, reaction, edit-mode emoji; all
  other sheets keep single-rest behavior). The picker card is now `$emoji-sheet-tall-height: 85dvh`
  (single token, aligned with `TALL_DETENT_DVH`; the 55/62 dvh split tokens are gone — this also
  supersedes the 2026-07-10 „reaction context gets a taller detent" sizing) and opens **translated
  down to a half detent** that reveals `HALF_DETENT_DVH: 45` of the 85, via
  `detentRestOffset(detent, cardHeight)` — pure px math from the measured card height, viewport-
  bottom-relative, never anchor-derived. Release resolution (`resolveDetentRelease`): upward fling
  (`DETENT_FLING_VELOCITY_PX_PER_MS: 0.5`) → tall; downward fling → dismiss from the half offset
  down, else half; no fling → nearest detent, or dismiss past `halfOffset + (cardHeight −
  halfOffset) · SWIPE_DISMISS_FRACTION`. At half, an upward content drag with the grid at scroll
  top expands to tall (at tall it scrolls the grid — iOS-sheet convention); the scrim stays opaque
  down to the half offset and fades only on the dismiss stretch below it.
- **Entrance lands on the half detent without a jump — the rest position is CSS-owned (third
  iteration, same day).** Root cause of the persistent tall flash, found in the compiled bundle:
  Angular's emulated-encapsulation shim (ShadowCss) renames component-local `@keyframes` but its
  reference rewriting misses `animation`/`animation-name` declarations that **open their rule**
  (`{animation-name:` in compressed output — the `(?:^|\s+|;)` guard skips `{`), so the detent
  card's `animation-name: sheet-slide-up-detent` pointed at a name that no longer existed after
  scoping. The detent entrance keyframe therefore **never ran in the delivered app**, both prior
  keyframe-end guarantees (measured `--sheet-detent-offset`, 40dvh fallback) were dead code, and
  the card's position rested solely on the JS-bound inline transform — every frame painted before
  that binding (delayed up to ~1 s when the cold emoji-metadata fetch and first grid render block
  the main thread) showed `transform: none` = the tall position. Fixed by construction:
  (1) the sheet keyframes are defined **globally** in styles.scss (see the warning comment there —
  never define component-local keyframes referenced from position-sensitive declarations);
  (2) the idle half rest is a **static CSS declaration** on `.dialog-shell__card--detents`:
  `translateY($sheet-detent-half-rest-percent)` — the same `(TALL − HALF)/TALL` ratio as
  `detentRestOffset()` expressed as a percentage of the card's own box, so it is correct from the
  first style resolution, needs no measurement, and covers max-height-capped short viewports with
  the identical expression; a `--detent-tall` class switches the rest to `translateY(0)` (only
  reachable after a drag, when `--dragged` has already removed the entrance fill). The drag
  controller no longer binds an idle inline transform — inline px transforms exist only while
  dragging/settling, and the settle target px equals the CSS percentage of the measured box, so
  the handoff back to the class rest is seamless. The entrance itself is a shell-gated
  `--detent-entering` class added two animation frames after first render (`--detent-pending`
  parks the card at `translateY(100%)` until then — belt-and-braces; correctness no longer depends
  on the gate); its end frame is the same token expression as the idle rest.
  `prefers-reduced-motion` skips gate and animation — the card renders at the CSS rest from the
  first frame. Verified frame-by-frame in headless Chrome against the compiled rules: a card that
  receives no JS at all rests at the half offset from the first sample; no frame renders taller
  than half.
- **Half detent keeps all content reachable** (same-day fix pack). At half the 85 dvh card is
  translated ~40 dvh down, so the picker's bottom 40 dvh sat below the viewport and the grid could
  not scroll to its last rows. The picker now mirrors the current rest offset as its own bottom
  padding (`padding-bottom: var(--sheet-detent-offset, 0px)`, eased in sync with the sheet settle
  via `--sheet-settle-ms`, instant under reduced motion): at half the scroll region ends exactly at
  the visible fold — every emoji row and the scrollbar stay on screen — and at tall the padding
  collapses to zero, so there is no dead scroll space. Because the box shrink and the card
  translation are equal and opposite, detent snaps do not jump the grid.
- **The detent card never scrolls itself** (same-day fix pack). The picker host is the card's flex
  item at the tall-detent height and may shrink (`min-height: 0`) when the card's viewport
  max-height cap bites on short viewports, and the detent card is `overflow: hidden` — previously
  the 85 dvh picker + grabber + card padding could exceed the cap and grow a **card-level**
  scrollbar at the right edge of the picker whose track extended 40 dvh below the viewport (the
  observed "ghost" scrollbar). The projected picker owns the single scroll region.
- **Background scrollbars are suppressed under scrimmed overlays** (same-day fix pack). The
  `ScrollLockService` pins the body but never affected inner scrollers, so the chat's styled
  scrollbar stayed painted behind the frosted sheet. Visible-scrim overlays (all mobile sheets,
  desktop dialogs with scrim) now also stamp `html.scrollbars-suppressed`; the
  `scrollbar-suppressed-under-overlay` mixin paints the underlying scrollers' bars transparent
  (message list, thread panel, workspace column, DM empty state, friends view). Only the paint
  changes — the gutter geometry stays, so locking/unlocking causes zero layout shift. Desktop
  transparent-scrim popovers (action menus, desktop pickers) do not suppress.
- **Drag-controller extraction (pure refactor).** The pointer/drag/settle machine moved out of
  `dialog-shell.component.ts` (399 → 156 LOC) into `sheet-drag.controller.ts` next to
  `sheet-physics.ts`; the shell binds the controller's signals. This created the LOC headroom the
  detent state needed. The settle duration is now velocity-matched in both directions (a fling into
  a detent continues at the release speed; spring-backs keep the fallback speed, as before).

## Loading skeletons + desktop right-click context menu (2026-07-13)
Roadmap V2 Phase 3 final, items D & E. No Figma design for either — both are additive; tokens only, CLS 0, reduced motion respected, §14 clean (no new listeners — the two loaded flags ride existing streams).

- **Loading skeletons with shimmer (no Figma).** A shared presentational
  [skeleton.component](src/app/shared/skeleton/skeleton.component.ts) renders `count` placeholder rows whose
  reserved heights mirror the real rows exactly (avatar sizes / line heights via the same tokens), so the swap
  to real content is CLS 0. The shimmer is a GPU-only sweep (`transform: translateX(-100% → 100%)`, no layout
  writes) via the `skeleton-shimmer` mixin; **reduced motion drops the sweep to a static block**. New
  low-contrast token pair **`--skeleton-base` / `--skeleton-sheen`** in [_themes.scss](src/styles/_themes.scss)
  (both themes). Skeleton blocks are decorative (`aria-hidden`); the container is a busy status region
  (`aria-busy` + a visually-hidden German loading label), so the low contrast raises no WCAG text-contrast
  concern. Applied at four load points: message-window initial load (replaces the former blank state; gated on
  `!window().loaded() && messages().length === 0`, and a fresh window is created per channel/DM switch so it
  shows on every open until the first snapshot), the friends view (until the friendship stream's first
  snapshot), the notification panel (until the feed's first snapshot — a cold-start fallback; the feed listener
  runs from app boot so it is rarely visible after warm-up), and the emoji picker's catalogue-loading state
  (restyled from a text line to a shimmer grid).
- **Desktop right-click opens the message context menu — convention, no Figma gesture.** On hover-capable
  pointers (`LayoutService.isHoverCapable`, `(hover: hover) and (pointer: fine)`), right-clicking a message row
  opens the reaction picker overlay anchored at the cursor via the new
  **`anchorAtPoint(x, y)`** ([dialog-anchor.ts](src/app/shared/dialog-shell/dialog-anchor.ts)) — the same
  transparent-scrim + inflate + Esc/outside-click overlay the action bar opens, flipped near viewport edges
  (vertical via `placeVertically`, horizontal by picking the nearer edge). The native menu is preserved when
  the target owns one (`input, textarea, [contenteditable], a[href]`) so composing and links are untouched.
  The point anchor is cleared on close, so a later open via the action-bar button re-anchors to the bubble.
  **Long-press (touch) and keyboard paths are unchanged**; this is the desktop analogue of the existing
  long-press bar. (The picker sheet's deferred second detent — item F — landed 2026-07-13; see the
  entry above, which supersedes the 2026-07-10 "single detent, not two" note.)

## Feel & Motion completion — recency sort + FLIP, edit-picker migration, edit-in-view (2026-07-12)
Roadmap V2 Phase 3 completion, items A–C. Reduced motion respected throughout; §14 clean.

- **Direct-message list now sorts by recency (decision).** DMs sort by the conversation's denormalized
  `lastMessageAt` (name tiebreak) — a new message bumps the conversation to the top, like Discord/WhatsApp
  — computed from the **existing** `directMessageService.conversations` stream (no new listener, §14). The
  signed-in self entry keeps leading the list. **Channels keep alphabetical order** (stable navigation);
  their rare reorders (rename / new) still animate.
- **FLIP reorder** ([flip-list.directive.ts](src/app/shared/flip-list.directive.ts)): rows carry a
  `data-flip-id`; on each list change the directive batch-measures the rows after re-render, then plays
  each moved row from its previous position to the new one via the **Web Animations API** (compositor
  `transform` only — no layout, auto-cleanup), token duration/easing; genuinely new rows fade + scale in;
  badges ride along on the row transform (no flicker). The **first pass only seeds the baseline** so the
  initial sidebar render is never mass-animated. **Reduced motion ⇒ instant** (store refreshed, no play).
  The bound list value is only a change trigger — order and positions are read back from the DOM.
- **Edit mode stays in view (reported).** Entering edit mode focuses the field with `preventScroll`, then
  scrolls the whole edit container (buttons included) just into view with `block: 'nearest'` (smooth, or
  instant under reduced motion) so a message near the fold reveals its buttons while a fully-visible
  mid-list message never jumps. Works in channel, DM and thread; the native scroll updates
  `stickToBottom`/FAB through the existing scroll handler, so nothing is fought.
- **Edit-picker migration** — see the resolved entry below (the reported inline-picker inconsistency).

## Feel & Motion — micro-interaction tokens + route view transitions (2026-07-12)
Roadmap V2 Phase 3, items A + B. Canonical motion tokens live in
[design-system.md](design-system.md) §10; reduced motion is respected throughout.

- **Motion token foundation (A).** Durations (`$duration-fast/base/slow`) and easings
  (`$ease-standard/decelerate/spring`) are separate tokens in [_variables.scss](src/styles/_variables.scss);
  the shared `$transition-fast/base/slow` shorthands are **recomposed** from them, so the app-wide hover/
  transition easing changed from the bare `ease` keyword to `$ease-standard` (cubic-bezier(0.2, 0, 0, 1)).
  **Migration:** this propagated to **100 `$transition-*` usages across 33 component SCSS files** with no
  per-file edits — they already referenced the tokens. Only **2 hard-coded `transition:` durations remain**
  (the intro splash's `500ms` clip-path/transform reveal) — a one-time decorative reveal, intentionally
  bespoke, not a micro-interaction. Ambient decorative animations (aurora-banner drift, typing dots,
  loading spinner) likewise keep their bespoke timing by design.
- **Press feedback (A).** `press-feedback` mixin ([_mixins.scss](src/styles/_mixins.scss)) — a
  `scale($press-scale)` on `:active`; the element adds `transform $transition-fast` to its own transition
  so background/colour transitions are never clobbered. Applied to `.btn` (all buttons) and `.workspace__item`
  (sidebar rows). **Reduced motion ⇒ no scale, dezente Opacity-Absenkung only.**
- **Component-style budget raised 6 kB → 8 kB (warning), 8 kB → 10 kB (error)** in
  [angular.json](angular.json): the sidebar (`workspace-menu`, the app's largest style component) sat at the
  6 kB boundary, and the shared press treatment tipped it 238 B over. The raise is documented and consistent
  with the earlier initial-bundle raise.
- **Route view transitions (B).** `withViewTransitions` in [app.config.ts](src/app/app.config.ts) — a
  cross-fade on route changes, **feature-detected** (browsers without `document.startViewTransition` keep the
  instant switch, zero errors). **Reduced motion is skipped in the router `onViewTransitionCreated` callback**
  (`transition.skipTransition()`). **Scoped, not whole-page:** only `.shell__chat` is named `chat-content`
  and cross-fades (channel/DM/friends/new-message all render inside it); the persistent sidebar and thread
  stay in `root`, whose animation is disabled so they never flicker; duration/easing tuned to the tokens.
  **No directional refinement** (justified): a direction-aware slide would need nav-direction tracking + custom
  per-element view-transition names, risks jank and scroll disturbance across the heterogeneous routes; the
  scoped cross-fade is clean, fast and leaves scroll positions, open overlays/sheets and the pagination window
  untouched (route changes recreate the window anyway; the transition is a pure visual overlay).

## Message windowing / pagination + typing ellipsis (2026-07-12)
Roadmap V2 Phase 2. No Figma frames; strictly token-based, AA both themes.

- **Windowing architecture (§14 read reduction).** Each open channel/DM main stream now loads through a
  `ConversationWindow`: exactly ONE live listener over the newest `PAGE_SIZE` (50) messages
  (`orderBy createdAt desc, limit`), merged into an id-keyed store and rendered ascending. Older history
  is fetched on demand as one-shot `getDocs` pages (`startAfter` the oldest-loaded snapshot), **never**
  listeners. This replaces the previous unbounded per-conversation listener — a large read reduction on
  open. `MessageService.openWindow` is the factory; the views create one window per conversation via
  `effect(onCleanup)` and destroy the previous. The now-dead `streamMessages` / `streamMessagesWith`
  path was removed. No `firestore.rules` / `firestore.indexes.json` change (single-field
  `orderBy(createdAt)` + `startAfter` needs no composite index).
- **Staleness trade-off (accepted).** Messages that leave the live window — paginated-in older pages, or
  messages that slid out as newer ones arrived — keep their last-known state: edits/deletes/reactions on
  them do **not** live-update until the conversation is reopened. Only the newest-window messages stay
  fully reactive. Attaching listeners to old pages would defeat the read reduction.
- **Newest-edge discontinuity → reset (never a silent gap).** A merge cannot bridge a jump of
  ≥ PAGE_SIZE newer messages arriving in one snapshot delta (an atomic 50+ batch, or an offline/
  backgrounded resync that delivers only the current top-50). When an incoming live page shares **no id**
  with the store, the window **resets** to that page and re-anchors the cursor, so older history stays
  re-fetchable and nothing is silently lost. Rare cost: loaded older history is dropped on such a jump
  (re-fetchable by scrolling up) — acceptable because the trigger is essentially an away/resync where
  showing the latest is the right behaviour.
- **Scroll anchoring (CLS 0).** Paging older history preserves the viewport by anchoring to the previous
  top **row's** viewport position (`getBoundingClientRect().top`), restored before paint — not a
  scroll-height delta — so a foreign message appending below the fold during the fetch cannot over-scroll
  it. A reserved-height edge row shows a spinner (reduced-motion: static; `role="status"` announces the
  „Ältere Nachrichten werden geladen" text) while loading, and a friendly start marker at the true
  beginning („Willkommen in #channel" / „Das ist der Anfang eurer Unterhaltung"). Prepended history is
  **not** entrance-animated (the time-based `MessageEntranceTracker` gates by createdAt > open-time, so
  past-dated rows never animate — verified; no extra gating needed).
- **Focus click-through (quote / notification / search), cap 5.** A target outside the loaded window
  pages older history in until it renders (bounded `MAX_FOCUS_PAGES` = 5), then scrolls to it; beyond the
  cap a **toast** („Diese Nachricht liegt weiter zurück…") explains it and clears the target — a toast,
  not an inline note, because the target row is not present to attach a note to. The predicate checks the
  **rendered** (hiddenFor-filtered) set, and the paginator waits for the window's first snapshot before
  paging, so a fresh cross-conversation open finds a recent target instead of falsely reporting it too
  old.
- **„Neu" divider with windowing.** The divider extends the initial load to include the boundary (bounded
  5 pages); beyond the cap it gracefully rides the top of the loaded window (never vanishes —
  `deriveBoundaryId` returns the oldest-loaded foreign message). **Known minor edge (browser-conditioned,
  documented):** if the user scrolls up *during* this background extension on a 50+-unread conversation, a
  prepend can shift the viewport on browsers without native scroll-anchoring (Safari/iOS); Chrome/Firefox
  mask it. Accepted as a narrow edge — the sentinel-triggered (user-initiated) paging is fully anchored.
- **Empty/loading states.** The window exposes a `loaded` flag (set on the first non-empty cache page or
  the first server snapshot); the channel intro and the DM empty card render only once loaded, so
  switching conversations never flashes a wrong empty/intro state during the load gap (the message list
  shows its own spinner meanwhile).
- **Thread panel left unpaginated** (replies are short; `streamReplies` stays a single live listener) —
  confirmed, unchanged. **Date separators** stay correct across page seams (grouping runs on the whole
  sorted list, extracted to `message-grouping.ts`).
- **Typing indicator:** dropped the literal „…" from all label variants; the animated dots (static under
  reduced-motion, always rendered) are now the sole ellipsis, so the label never ends bare.

## Chat ergonomics v2 — scroll-to-latest FAB, „Neu" divider, drafts, typing (2026-07-10)
Roadmap V2 Phase 1. No Figma frames for any of the four; all strictly token-based, AA in both themes.

- **Scroll-to-latest FAB (net-new).** A circular button floats bottom-right above the composer of the
  channel, DM **and** thread panels (shared `ScrollToLatestFabComponent` + `ScrollFabTracker` plain
  class, mirroring the entrance/big-reaction trackers). It appears once the user has scrolled up past
  **one viewport** (`distance > clientHeight`) *or* a message arrived while they were away, and hides
  at the bottom. A count badge shows arrivals-while-away, capped „99+"; the badge is absolutely
  positioned on the out-of-flow FAB so it reserves geometry (**CLS 0**). „Caught up" is driven by the
  list's existing `stickToBottom` truth, so freshly loaded history never counts as arrivals. Click
  scrolls smoothly (`behavior:'smooth'`, instant under `prefers-reduced-motion`) and **suppresses** the
  button until the scroll settles (a `suppressed` flag lifted on arrival, or on a genuine scroll back up
  detected by rising distance) so it hides at once and never flashes back mid-animation. Entrance/exit
  is opacity+scale via `$transition-*` / `$menu-inflate-ease`; z-order via `$z-sticky`. It never overlaps
  the reply-context bar (which lives inside the composer, below the list). **Behaviour change:** the
  thread panel now respects `stickToBottom` too (previously it always yanked to the newest reply), so
  reading older replies is no longer interrupted — a deliberate alignment with the main list.
- **„Neu" unread divider — adjacency decision (documented).** On entering a conversation with
  unread messages, a subtle divider marks the first message newer than the read marker **and** authored
  by someone else (own messages never count, matching the unread-badge). The boundary is **frozen once
  at open** from the *pre-visit* read marker: the view reads it with a one-shot `getReadMarkerOnce`
  (`getDoc`) and `markRead` is **gated** behind that capture (a `boundaryCapturedFor` signal that is
  re-closed synchronously on every switch — before the async read — so a fast re-entry can't advance the
  marker on a stale capture; it relies on the switch effect flushing before the markRead effect, the
  same effect-order the message-list already relies on). A stale capture from a fast re-switch is dropped
  (path guard); a failed read degrades to „no divider" (never blocks `markRead`). The boundary stays put
  while reading and is gone next visit; first-ever visits (no marker) show **no** divider. **Adjacency
  rule (never two stacked lines):** when the boundary coincides with a date separator (the common
  "returned the next day" case), the **date separator wins** and carries an extra „Neu" chip on the same
  row — so the date label („Heute") is never lost; only when the boundary falls mid-day does a standalone
  „Neu" separator render. The chip is `color('primary')` text+border on `color('white')` (AA both themes,
  the same flip trick as the date pill). The divider inserts asynchronously after the marker resolves; to
  keep **CLS 0**, the list re-pins to the bottom (in a pre-paint rAF) when the divider first appears while
  stuck to the bottom, so the newest messages never shift.
- **Per-conversation drafts (net-new).** Unsent composer text persists per conversation in
  `localStorage` under `vibo:draft:{conversationPath}` (length-capped 5000, best-effort — storage
  failures degrade to „no draft"), restored on reopen and cleared on send. The **reply-context bar is
  NOT persisted** (it resets on leave, matching Discord). Restore is written straight into the textarea
  in a pre-paint `requestAnimationFrame` (the `[value]` binding is unreliable under this app's coalesced
  zoneless change detection — the same reason `submit()` clears imperatively) so switching conversations
  never flashes the previous draft. Scoped to the **channel + DM** composers: the **thread and
  „Neue Nachricht" composers bind no `conversationPath`, so they are skipped** — wiring them would need a
  separate draft key and would entangle the typing writes, out of scope. Drafts pushed
  `message-input.component.ts` over the 400-LOC cap, so the composer's pure mention/suggestion helpers
  were extracted to `composer-mentions.ts` and the draft binding to `composer-draft.ts` (both single-
  responsibility, no behaviour change).
- **Typing indicator — placement + guest keying.** The pre-existing typing feature (co-located `typing`
  subcollection, one listener per open conversation — the isolated-writes design that keeps the
  meta/last-message listeners noise-free, §14-clean) was kept and extended, not rebuilt. Typing markers
  are **re-keyed from `{uid}` to a per-tab client-session id** (`ClientSessionService`, persisted in
  `sessionStorage` so a reload reuses the same doc rather than orphaning it, while each new tab still gets
  its own id), with the writer's `uid` stored **inside** the doc; the reader excludes the viewer's own
  **session** (not uid). This fixes the **shared guest account**: two guest windows share a uid, so the
  old uid-keyed scheme made each window filter the other out as „self" and neither saw the other type —
  now each window is a distinct session. Text is **multi-user aware** and named: „{A} schreibt …",
  „{A} und {B} schreiben …", „{A}, {B} und weitere schreiben …" (distinct names, sorted;
  „schreibt/schreiben" replaces the earlier „tippt"). Sender heartbeat throttled to **4 s**, cleared on
  send/blur and after a **5 s** idle timeout (and never issues a delete for a marker it never wrote —
  avoids a doomed permission-denied on blur-without-typing); reader recency window **8 s** (> heartbeat,
  so a dropped beat doesn't flicker). The reader query is `orderBy updatedAt desc, limit 20` so read cost
  stays bounded regardless of abandoned markers (active typers are always the freshest). **Tech-debt
  (accepted):** a tab closed/crashed while a marker is live leaves one orphan typing doc (no `pagehide`
  delete — `deleteDoc` on unload isn't guaranteed; recency hides it and the `limit` caps its read cost;
  a *reload* reuses the same session doc and never orphans). Analogous to the existing "crash mid-delete
  leaves orphaned subcollection docs" note. **Requires a firestore.rules deploy** (the typing doc shape
  changed) — until deployed, typing writes fail silently (already `.catch`), so the indicator is simply
  absent, never an error.

## Mention visuals: self-mention pill + mention-accent unread badge (2026-07-10)
- **One shared `--mention-accent` token, measured.** A single CSS custom property drives both the
  message-body self-mention pill and the sidebar mention badge (light `#c4185f`, dark `#ff3d9e`);
  the text is the existing flipping `color('white')` (`#fff` light / `#17103a` dark). Measured
  WCAG pairs — pill/badge **text on accent**: light **5.76:1**, dark **5.47:1** (both ≥ 4.5). Pill
  **accent vs bubble surfaces** (so it pops): light own-bubble **4.56:1**, light other-bubble
  **5.00:1**, dark other-bubble **6.00:1**. In dark the pill on the *own* bubble (`#97a2ff`) is only
  **1.39:1** by luminance but a distinct hue (pink vs indigo) and carries AA text — and a
  self-mention inside one's *own* message is rare (you mention others, not yourself); the pill lands
  overwhelmingly on foreign/other bubbles, which are AA. Subtle tints were rejected: on the aurora
  indigo bubbles a light indigo/rosa tint measured ~1.0–1.2:1 against the surface (invisible), so a
  filled accent pill is used instead.
- **Self vs others (interpretation).** Mentions of **me** get the filled pill; mentions of **others**
  keep the existing **primary (indigo) accent text** — a deliberate two-hue system (rosa = concerns
  you, indigo = informational) rather than colouring every foreign mention rosa. The pill adds
  horizontal padding only (no vertical → line metrics unchanged), a `$radius-sm` corner and
  `box-decoration-break: clone` so it wraps cleanly mid-line at 320px; no layout shift, coexists with
  inline emoji/img in the same segment pipeline. Reply-quote and notification previews stay plain
  muted text (untouched — folding a pill into the clamped one-liner was not worth complicating it).
- **Badge variant is glyph-less (reviewed).** The mention unread badge switches to the accent colour
  only — no leading "@" glyph. A single-count badge is a `min-width` circle; prepending "@" would
  grow it into a wider pill, changing the reserved geometry when the variant toggles. Per the brief's
  "otherwise glyph-less accent", the colour-only switch is used → guaranteed **CLS 0** on toggle. The
  status is never colour-only: the aria-label appends **„…, enthält Erwähnung"** (mandatory either
  way). The variant derives from the existing feed (`mentionedConversationKeys`, mention groups) — no
  new query/listener — and reverts automatically via the feed's existing auto-clear when the
  conversation is viewed.

## Reaction-sheet single scroll region + taller reaction detent (2026-07-10)
- **The mobile picker sheet has exactly one vertical scroll region.** The tabs moved out of
  `.picker__scroll` into the fixed header, so the big-reaction row + search pill + **tabs** now form
  a non-scrolling header inside the detent and the **grid is the only scroller** (`flex:1;
  min-height:0`, no magic numbers). Because the grid absorbs all overflow, the picker can never
  exceed its detent height, so the outer sheet can no longer scroll — no nested scrollbars. Tabs are
  a plain flex header now (the `position:sticky` + masking they had inside the scroll is gone).
  Desktop popover behaves the same (tabs at the top, grid scrolls below); the composer sheet is
  unchanged.
- **Reaction context gets a taller detent (reviewed).** The reaction header carries a big-reaction
  row + divider (~70 px) the composer lacks, so at the shared 55 dvh detent its grid would show only
  ~2 rows at 320 px. Per the brief's preference (raise the detent rather than reintroduce outer
  scroll), the reaction context uses **`$emoji-sheet-height-reaction: 62dvh`** (with a `62vh`
  fallback token) via a `.picker--reaction` modifier; the composer keeps `55dvh`. Verified at 320 px
  (headless, conservative viewport): both contexts show a single scroll region, the composer grid ≈
  4 rows and the reaction grid ≈ 3 rows (more on real phones), no horizontal scroll, CLS 0,
  reduced-motion unaffected.

## Emoji-picker sheet half-height detent + aurora containment (2026-07-10)
- **Mobile picker sheet opens at a half-height detent.** The picker sheet (composer *and*
  reaction, incl. the „Große Reaktionen" row) previously opened near full height and felt
  overwhelming. On mobile the picker now has a fixed height token **`$emoji-sheet-height: 55dvh`**
  (with a `55vh` fallback token for engines without `dvh`); search pill + big-reaction row are a
  fixed header, the sticky tabs pin at the top of the scroll area, and only the grid scrolls in the
  remaining space (the inner scroll keeps deferring to the sheet drag as before). Desktop popover
  unchanged; all other sheets (long-press menu, profile, notifications) unchanged. Verified at
  320×568: header fits, grid scrolls, no horizontal scroll, CLS 0, reduced-motion unaffected.
  - **Single detent (reviewed, not two) — SUPERSEDED 2026-07-13.** A second snap point (drag up →
    ~90 dvh, drag down from half → dismiss) was **not** built at the time: the sheet physics
    (`sheet-physics.ts` + the shell) was a single-rest-position model — offset measured from one
    hardcoded rest (the natural content height) with rubber-band-only overdrag upward and no
    detent/snap state, and adding detent state inside the 399-LOC shell was out of scope. The
    two-detent upgrade landed 2026-07-13 after the drag-controller extraction; see „Picker sheet:
    two detents + anchor-independent placement" at the top of this file.
- **Aurora clipped to the banner box (fix).** The curtains tinted the whole profile/edit dialog
  because `.banner__aurora` was `position:absolute; inset:0` while the banner `:host` was
  `position:static` — so the overlay resolved its containing block against a higher positioned
  ancestor (the dialog card), and a static host's `overflow:hidden` cannot clip an abs-pos
  descendant whose containing block is above it; `mix-blend-mode:screen` then tinted the dialog.
  Fixed by making `:host` a containing block: **`position:relative` + `contain:paint`** (keeping the
  existing `overflow:hidden` + `border-radius`), so the curtains resolve `inset:0` against the
  banner, are clipped to its rounded box, and the screen blend is isolated to the starfield behind
  them — the dialog background returns to the normal surface. Shared component ⇒ profile dialog and
  edit preview both fixed; the reduced-motion static frame is clipped identically; text/badges
  (below the banner) stay AA; Keine / Sternenfeld / Nebula untouched.

## Composer picker in the overlay layer, picker width, living aurora (2026-07-10)
- **Composer emoji picker moved into the anchored overlay layer.** Root cause of the hover-through
  bug (a hovered message row's action bar painting over the open composer picker): the picker was
  an **inline panel inside the composer DOM** (`.composer__picker`, `z-index` competing within the
  composer's stacking context), not the top-level overlay. It now opens through the shared
  **dialog-shell** exactly like the reaction picker — `size="menu"`, transparent scrim, inflate,
  `anchorAbove` the smiley button (flips via `placeVertically`), and a **bottom sheet on mobile**.
  Insertion/caret behaviour is unchanged; Escape/outside-click close; focus returns to the composer
  input via a post-teardown `requestAnimationFrame` (the shell restores focus to the opener first).
  The fix is **structural**: the full-screen `pointer-events:auto` shell at `$z-modal` blocks row
  hover entirely and outranks the `$z-raised` action bar, so the bleed-through is impossible.
  - **Edit-box picker — RESOLVED (2026-07-12, Phase 3).** The edit-mode emoji picker now opens through
    the anchored overlay layer exactly like the composer and reaction pickers (desktop popover anchored
    above the edit smile button / mobile bottom sheet, transparent scrim, flip-near-edge). The edit logic
    was extracted into `message-edit.ts` (`MessageEdit` controller) for the LOC headroom the migration
    needed (the item component dropped 399 → 342). Caret insertion and focus-return to the edit field
    are preserved.
- **Picker width token.** Desktop anchored menu caps at a named token **`$emoji-picker-width: 360px`**
  (`_variables.scss`, Discord-like popover); the `auto-fill` grid fills that cap with no sparse
  columns. In the mobile **bottom sheet** the picker spans the **full content width** (`width:100%`,
  no shadow, sheet handles the height) so search pill, tabs, „Große Reaktionen" row and grid all
  share the sheet width and `auto-fill` yields more columns — no more narrow left-hugging column.
- **Living aurora banner („Polarlicht").** New token pair **`--banner-aurora-a` (teal) /
  `--banner-aurora-b` (green)** in `_themes.scss` with distinct light/dark values (deeper in light so
  it doesn't glare against the frosted card, brighter in dark to pop). The `aurora` preset's **canvas
  is now starfield-only** (`auroraStyle:'none'`, `auroraIntensity:0`); the aurora itself is **three
  absolutely-positioned CSS gradient curtains** (teal / green / app-purple via `color-mix` on the
  tokens + `--color-primary`) layered over the starfield with `mix-blend-mode:screen`, drifting via
  **transform + opacity only** (`translate3d`/`scaleY`, staggered 15/19/23 s, no animated filters →
  GPU-friendly, CLS 0). One shared component renders the profile dialog **and** the edit-mode live
  preview identically. `prefers-reduced-motion` (and `isStatic` thumbnails) freeze the curtains at
  their full 0 % keyframe → a polished static aurora frame. No text sits on the banner (avatar
  overlaps, name/badges are below), so contrast is unaffected; the canvas `curtains` engine mode is
  now unused but kept (the `bands`/`starfield` preset still needs the shared aurora-draw path).
  Keine / Sternenfeld / Nebula untouched.

## Emoji-in-message fix, lightning v2, full emoji picker (2026-07-10)
- **In-message emoji render fix (regression).** Making `emojiAsset()` derive a path for *any*
  string (foundation work) broke `message-segments.ts`, which used a non-null asset as the
  "this fragment is an emoji" flag — so plain-text fragments got a derived garbage path and
  rendered as broken `<img>`s (chips were fine: they only ever pass a real reaction key).
  Rewritten to detect emoji with the Unicode **`/\p{RGI_Emoji}/gv`** property-of-strings regex
  (plain, skin-tone, ZWJ, flag and keycap sequences alike) and set an asset **only** on actual
  emoji runs; the derived filename matches the generator's naming (FE0F stripped unless ZWJ),
  and the image **alt is the emoji character** so a missing asset shows the native glyph, never a
  broken icon. Verified against realistic old-message text (plain text → 0 images; catalog and
  full-set emoji resolve to present assets — stored messages unchanged). This also extends
  in-message coverage from the old 28-emoji subset to the whole set. Requires the `v`-flag regex
  (browsers ≥ 2023; the app targets modern engines).
- **Lightning effect v2.** The diagonal glyph/rocket-style streaks read as "rockets from the
  other side", so ⚡ was rebuilt on a dedicated bolt engine (`bolt-particles.ts`): 1–2 **jagged
  bolt paths** struck top-to-bottom, revealed by an animated **line-dash offset**, with a glowing
  trail and a fainter forked branch, then fading — a silhouette clearly distinct from the rocket
  trail. **WCAG 2.3.1:** no luminance pulse and no repetition at all (moving strokes, not a
  full-screen flash — cannot strobe). Reduced-motion ⇒ the chip pop. Broadcast enum + rules
  untouched.
- **Full shared emoji picker.** The reaction quick-grid and the composer mini-grid were replaced
  by one picker consuming `EmojiDataService`: a pill search (German label + keyword), a
  „Zuletzt verwendet" section, category tabs, a **responsive `auto-fill` grid that fills its
  container** (square cells, no sparse stretched columns), a loading state, and — in the reaction
  context only — the „Große Reaktionen" row on top (composer insertion behaviour unchanged).
  Picking records the shared recents **and** the two action-bar quick reactions.
  - **Model deviation (reviewed):** instead of scroll-through-all-sections with
    IntersectionObserver per-section mounting + reserved heights, the picker shows **one category
    at a time** via sticky tabs. This bounds the mounted image count to a single category
    (≤ ~360, plus native `loading="lazy"`) and guarantees **CLS 0** by construction, without a
    fragile observer/reserved-height system — the goals (bounded DOM, sticky category navigation,
    no image storm) are met more robustly. Say the word to switch to the scrolling-sections model.
  - **Retired:** `EMOJI_SET` and `GRID_EMOJI_SET` (superseded — the grid now comes from
    `EmojiDataService`, in-message detection from the RGI regex). **Kept:** the seed `EMOJI_CATALOG`
    + `emojiName`/`reactionTriggerLabel`, because reaction chips, action-bar quick reactions and
    notification toasts render **outside** the picker and need a *synchronous* German name before
    the lazy full catalogue is fetched (unknown names fall back to the emoji character).

## Full emoji set, big-reaction motion rework, big-reaction row (2026-07-10)
- **Full self-hosted emoji set + metadata.** The used-subset asset folder (28 SVGs) was replaced
  by the **full jdecked Twemoji set — 1869 base emojis, ~8.0 MB** (codepoint filenames, drop-in),
  generated by the one-shot `scripts/generate-emoji.mjs` from **@twemoji/svg** (jdecked fork,
  CC-BY 4.0) plus **emojibase-data** de locale (MIT, German names/keywords/categories). Neither
  is a runtime dependency — the script `npm pack`s the artwork and fetches the emojibase JSON, so
  `package.json` is untouched (the RC-pinned `@angular/fire` makes a devDep install eresolve-fail;
  generating from packed sources side-steps it). The ~45 newest Unicode-16 emojis with no Twemoji
  artwork yet are skipped — a **data-driven availability filter, never a hand-curated exclusion
  list.** Skin-tone variants (group 2) are excluded from the picker set. README attribution added
  for both sources. `emojiAsset()` now **derives** the Twemoji filename from an emoji's code points
  (FE0F stripped unless a ZWJ sequence — `emoji-filename.ts`, matching the generator), so any
  reaction/emoji resolves to its SVG without a hand-maintained catalogue. The **German metadata
  (`public/emoji-data.de.json`, ~211 KB) is a static asset fetched lazily on first picker open**
  and cached in `EmojiDataService`, so it never enters the initial JS bundle (verified: initial
  total 682 kB, well under the 800 kB budget) — a one-shot fetch, not a listener (§14).
- **ZWJ / rules cap decision.** The local Firestore emulator could not run (no Java/CLI), so the
  reaction-`emoji` `size() <= 16` rule was assessed analytically: the longest emoji in the shipped
  set is 🏴󠁧󠁢󠁥󠁮󠁧󠁿 (England flag) at **7 code points / ~14 UTF-16 units / 28 bytes**, which fits `<= 16`
  under **code-point and UTF-16-unit** semantics (research indicates Firestore string ops count
  code points). **No rules change ships; full coverage.** Contingency if a live test ever shows
  byte semantics: bump `notificationFieldsValid`'s `emoji.size() <= 16` → `<= 32` (28-byte
  longest) — a one-line change, deploy manually.
- **Big-reaction motion rework** (effects only; broadcast enum + rules untouched). 🔥 fire keeps
  its buoyant rise; 👏 clap changes from a radial burst to the same **hearts-style rise** (float up,
  staggered, varied sizes); 😭 tear becomes a **statelier rain** — fewer/larger drops, slower fall
  under light gravity with a real **sinusoidal sway** (a per-glyph `sway`/`phase` added to the glyph
  engine), longer duration; ⚡ flash becomes a **rocket-class spectacle** — bright diagonal bolts
  streaking across on the glow-trail shape engine. **WCAG 2.3.1 (photosensitivity):** the flash has
  **no luminance pulse and no repetition** at all (a moving streak, not a full-screen flash), so it
  cannot strobe. Reduced-motion ⇒ the single chip pop for all four, as before.
- **„Große Reaktionen" row** is now one full-width row of 8 (`grid-auto-flow: column`,
  `minmax(44px, 1fr)` equal columns, token gaps, ≥44px targets). Below the width where 8 fit it
  becomes a **horizontal scroll-snap row** with an edge-fade mask — never wraps, never clusters
  left (verified headless: fills at desktop, single-row scroll at 320px). CLS 0, both themes.

## Big-reaction expansion, overflow-menu flip, inline profile handle (2026-07-10)
- **Big reactions 4 → 8** (no Figma design). Added 🔥 `fire`, 👏 `clap`, 😭 `tear`, ⚡ `flash`
  alongside 🎉 💖 🚀 😂. The effects reuse the established broadcast + play-once/baseline engine
  and the **glyph** particle engine (real emoji glyphs, OS colour font — no Twemoji asset needed
  for the effect): `clap`/`flash` are radial **bursts** (like the laugh), `fire` is a buoyant
  **rise** and `tear` is a **rain** — the two new motions come from a per-particle `gravity`
  field added to the glyph engine (burst = full gravity arc, rise ≈ 0 buoyancy, rain = gravity
  fall). Reduced-motion ⇒ the single emoji pop, as before. The „Große Reaktionen" row is a fixed
  4-column grid so 8 items wrap **2×4** at 320px with CLS 0. Only the 😭 (`1f62d`) Twemoji SVG
  was missing from the used-subset asset folder and was added (jdecked fork, CC-BY 4.0, same as
  the rest); 🔥 👏 ⚡ assets already existed. **Requires a rules bump** (below): the broadcast
  `lastBigReaction.type` enum was pinned to the original 4, so the 4 new types are rejected until
  deploy — reactions (chips) still register; only the screen-effect broadcast waits for the rule.
- **Overflow menus flip (friend-action).** The friend-action 3-dot overflow menu (friends list +
  friend-profile dialog) was an always-downward `position: absolute` popover that forced scrolling
  at the viewport bottom. Migrated onto the shared anchored dialog-shell (transparent scrim,
  inflate, `placeVertically`): **default below, flips above** only when below-space is short;
  sheets on mobile. Inside the profile dialog it is a **nested overlay** — a second dialog-shell
  above the open profile dialog: both at `$z-modal`, the later-DOM menu paints on top, its scrim
  captures outside clicks, and the reference-counted scroll lock restores the page exactly once.
  **Flip sweep:** the only other always-down anchored *menu* was this one; `new-message` and
  `search-bar` dropdowns are caret/input-driven **autocompletes** (kept inline/instant, like the
  mention dropdown) and the `message-actions`/`badge-list` `top:100%` elements are **tooltips**,
  not menus — all deliberately left as-is.
- **Profile handle inline** (both own- and friend-profile). The `@username` moved from its own
  line to **behind the name and badge** („Yannick ⭐ @yannick", muted token), removing a line so
  the card is shorter. The identity is a `min-width: 0` wrapping flex row: the name ellipsizes
  first, the badge never clips (`flex-shrink: 0`), and the handle wraps to its own line only on
  very narrow widths — verified at 320px (no horizontal overflow).

## Anchored menu layer: transparent-scrim fork, flip placement, message menu/picker (2026-07-09)
Overlay/popup polish built on the dialog-shell.
- **Scrim fork — message-level transparent vs. app-level visible.** dialog-shell gains a
  `scrim` input (`'visible'` default / `'transparent'`). The **message action menu** and the
  **reaction picker** open with a *fully transparent* scrim: visually scrim-less (Discord/Slack/
  Teams render desktop message context menus and reaction pickers without a dim; reacting is a
  high-frequency micro-interaction), yet structurally identical — the overlay element still
  captures outside clicks and Escape to close, and scroll stays locked. Transparency is a
  **class flag** (`background-color: transparent`, no hardcoded rgba). **App-level menus**
  (topbar profile, notification center, channel settings) keep their **visible** scrim, and on
  mobile the transparent variant is overridden back to the visible scrim so the **long-press
  bottom sheet** keeps its dim.
- **Message action menu + reaction picker → dialog-shell**, replacing the row-local
  absolutely-positioned popovers. They open **above the bubble**, aligned to the bubble side
  (own → right, others → left) via a new `anchorAbove` helper, and **flip below** when the space
  above is insufficient (`placeVertically`, measured after render; the inflate masks the flip).
  On mobile they sheet (the anchor helpers return null ≤768px). Because they now render at
  `$z-modal` and **escape the row DOM entirely** (fixed positioning, no transformed ancestor),
  the item-A invariant holds *by construction*: an open picker/menu at `$z-modal` (400) always
  outranks any hovered row's `$z-raised` (10) toolbar, and the pointer-capturing scrim means
  adjacent rows can't even be hovered while one is open. Keyboard/focus (trap + restore) and the
  touch long-press path come from the shell.
- **Action-bar straddle without `transform`.** The hover toolbar anchor previously straddled the
  row's top edge with `transform: translateY(-50%)`. A `transform` makes an element the
  **containing block for `position: fixed` descendants**, which would have re-based the menu's
  fixed dialog-shell onto that tiny box (verified in headless Chrome: fixed child at the
  ancestor's offset, not the viewport). Replaced with a **zero-height flex** straddle
  (`height: 0; display: flex; align-items: center;`) — same visual, no containing block, so the
  overlay resolves against the viewport.
- **`placeVertically` flip** (dialog-anchor) also benefits the existing anchored dialogs, which
  never overflow below their topbar trigger, so it is inert for them (no regression).
- **Centralized "bubble inflate."** The scale+opacity pop is now a shared `menu-inflate` mixin
  (token-based duration/easing, `backwards` fill so no persistent transform/stacking context —
  see the z-order entry below), replacing three duplicated keyframes (dialog-shell, message
  actions, and now friend-action's overflow menu, which previously had none). Applied **only to
  trigger-opened menus**; the composer's **mention suggestion-dropdown is deliberately left
  untouched** (caret-following autocomplete must appear/update instantly while typing).

## Overlay polish: z-order root cause + background scroll lock (2026-07-09)
Continuation of the z-order work in the entry below.
- **Z-order root cause & final fix.** The previous pass raised the *active* message row's
  `z-index` so its overlays escaped adjacent rows, but that left a residual: a row owning an
  open reaction/edit picker (`.message--raised`) and a merely *hovered* neighbor both sat at the
  same `$z-raised` tier, so a later-DOM hovered row painted over the open picker. Root cause
  (proven in headless Chrome): the message **entrance animation** used `animation-fill-mode: both`;
  a *finished* animation with `forwards`/`both` keeps `transform` **in effect** (computed
  `matrix(1,0,0,1,0,0)`, not `none`), so every post-open row stayed a persistent **stacking
  context** that trapped its absolutely-positioned action bar and reaction picker. The entrance
  `to` state (`opacity:1; transform:none`) already equals the row's base style, so `forwards` was
  doing nothing but leaving the transform applied. **Fix:** change the entrance fill from `both`
  to **`backwards`** (keeps the anti-flash first frame, drops the pointless `forwards` that created
  the persistent context) and **remove the per-row `z-index` workaround entirely** (`message--raised`
  binding + the `:hover`/`:focus-within`/`.message--raised` elevation). With no persistent context
  and no per-row `z-index`, the toolbar (`$z-raised`) and picker (`$z-dropdown`) escape to the list
  stacking context and always paint above sibling rows, and same-tier ties are **structurally
  impossible** (there is no per-row `z-index` to tie on). This reconciles with the planned menu-layer
  work: the picker no longer depends on row stacking, so relocating it to a shared overlay layer
  becomes a placement/UX improvement rather than a z-order necessity — the fix is not built twice.
- **Background scroll lock (no Figma spec).** Opening any dialog-shell overlay (dialog, anchored
  menu, mobile sheet) now locks background page scrolling via a reference-counted
  `ScrollLockService` in the dialog-shell folder, released and scroll-position-restored on close.
  It uses the **fixed-body technique** (pin `position: fixed; top: -scrollY`, restore `scrollTo`),
  not `overflow: hidden` — the latter is ignored by iOS Safari, which keeps scrolling/rubber-banding
  behind the overlay. A layout scrollbar's width is **measured** (`innerWidth − clientWidth`) and
  compensated only when it is non-zero, so overlay scrollbars (width 0) add no padding and locking
  never shifts the page horizontally (verified in headless Chrome: pin, 0px shift, exact restore).
  Nested overlays reference-count so the page restores exactly once.

## Inline reply polish: z-order fix, quote alignment/clamp, reply supersede (2026-07-09)
Follow-up fix/polish pass on the committed inline-reply feature below.
- **Action bar / reaction picker z-order (root-caused, not reply-specific).** The hover action
  bar (`$z-raised`) and the "Große Reaktionen" picker (`$z-dropdown`) rendered *beneath* the next
  message rows. Diagnosis (empirically confirmed in headless Chrome): the culprit is the **message
  entrance animation**, not the ReplyQuote / message-item restructure / an overflow rule. A row's
  entrance uses `animation: message-enter … both`, and `MessageEntranceTracker.shouldEnter()` is
  **time-based** (stays true for every message created after the context opened), so `.message--enter`
  is applied permanently. A *finished* `animation-fill-mode: both` keeps `transform` **in effect**
  (computed `matrix(1,0,0,1,0,0)`, not `none`), which makes **every post-open row a persistent
  stacking context** that traps its absolutely-positioned overlays — a later sibling row then paints
  over them. It predates inline reply; the reply feature merely surfaced it (users now hover recent
  messages to click "Antworten" and post replies, clustering adjacent post-open rows). **Fix:** raise
  the *active* row to `$z-raised` (`:host(:hover)`, `:host(:focus-within)`, and a new `message--raised`
  class = action-bar-open ∪ reaction-picker-open ∪ edit-picker-open) so its stacking context — and the
  overlays inside it — sit above adjacent list content. Existing token scale, no magic numbers; applies
  in channel, DM and thread panel (message-item is shared).
- **Quote aligns with its bubble side.** The ReplyQuote now mirrors for own messages: the host is
  `width: fit-content` so it follows the bubble column's `align-items` (own → right, others → left),
  and `:host-context(.message--own)` flips the connector to the right (`flex-direction: row-reverse`,
  accent border left→right, `text-align: right`). No layout shift; max-width stays within the bubble
  column.
- **Quote clamps cleanly.** Presentation-only clamp (the stored 150-char snapshot is unchanged):
  author + preview flow in a `-webkit-box` body clamped to a named `$quote-preview-max-lines: 3` with
  ellipsis on the last line; `overflow-wrap: anywhere` + `word-break: break-word` wrap unbroken strings;
  the author truncates inside the clamped body instead of pushing width; **zero horizontal overflow to
  320px** (verified in headless Chrome). Same treatment on the „Nachricht nicht mehr verfügbar" fallback.
- **Reply supersedes generic unread** (extends the mention-supersede documented below to `reply`;
  hierarchy **mention > reply > generic unread**). `unreadConversations` now excludes conversations
  represented by a pending mention **or reply** group, so a single inline reply produces **one** bell
  entry (the activity row) and **badge +1**, never the previous "activity + Ungelesen" **+2**. The
  generic new-message toast is skipped when the newest main-stream message replies to me
  (`replyTo.authorUid === myUid`) — a synchronous check on the same fetched message (no async race),
  the mirror of the mention check — so the reply toast wins with a single chime. Reply **and** mention
  on the same message still resolves to the mention only (the fan-out already excludes the reply).
  Thread replies are unaffected: they bump the parent message, not the conversation's `lastMessageAt`,
  so they never raise the generic unread indicator in the first place.

## Inline reply ("Antworten"): quoted snapshot + 'reply' notifications (2026-07-09)
Discord-style inline reply, **distinct from threads** — both coexist in the message action
bar (a back-arrow "Antworten" button beside the `comment.svg` "Thread" button). No dedicated
reply glyph exists in the Material Symbols set we self-host, so `back-arrow.svg` doubles as
the reply arrow (action button and the quote's leading icon); the global
`[data-theme='dark'] img[src^='app-icons/']` invert keeps it visible in both themes.
- **Scope:** channel/DM **main streams only** — no inline reply inside thread panels (the
  thread composer/rows never receive `isReplyable`, and `ReplyRef` lives on `MessageDoc`,
  never on thread `ReplyDoc`). Not offered on tombstones (the action bar is already hidden
  for deleted rows). Threads (`Thread`) and inline replies (`Antworten`) are independent.
- **Composer reply bar** („Antwort an {Name}: {preview}", X or Escape cancels; applies to the
  next **text or GIF** send). No Figma design for the bar. It enters with a **transform/opacity
  animation only** (no height/layout animation → the message list is not reflowed mid-anim;
  CLS 0), and `prefers-reduced-motion` renders it instantly.
- **Snapshot semantics (documented deviation):** the sent message stores
  `replyTo {messageId, authorUid, previewText}`. `previewText` is derived from the existing
  `previewOf` with a wider `REPLY_PREVIEW_MAX = 150` cap, newlines collapsed, `"GIF"` for GIF
  originals. It is a **frozen snapshot** — later **edits of the original do not update the
  quote** (deliberate; matches Slack/Discord and avoids reading the original on every render).
  The answered **author name** is resolved live (only the text is a snapshot).
- **`previewOf` contract tightened:** truncation now reserves room for the ellipsis so the
  result is **≤ `max`** (was `max + 1`). Required so `previewText` fits the rules'
  `size() <= 150`; the toast/bell previews (cap 80) are one char shorter and still well
  within their own 120 cap.
- **Rendering:** a compact quoted preview above the bubble (live author + snapshot text, muted
  token styling, single-line ellipsis, both themes, down to 320px). Clicking scrolls to and
  briefly highlights the original via the existing `MessageFocusService`. Fallback
  „Nachricht nicht mehr verfügbar" (non-interactive) when the original is **missing, a
  tombstone (`deletedAt`), or hidden-for-me** — resolved against the list's visible messages.
- **Notifications:** new kind **`reply`** rides the existing sender-side fan-out (§14, no new
  listener). An inline reply to *my* message notifies me („hat auf deine Nachricht
  geantwortet"), **never self**, suppressed while I'm viewing that conversation's main stream
  (`inThread = false`, standard per-context rule). Dedupe hierarchy per send is **mention >
  reply**: a reply that also @mentions the same recipient produces only the mention entry
  (the fan-out passes the mentioned uids as the reply's `exclude`). Grouping, panel counts,
  the bell `eventCount` and the 9+ cap **apply automatically** — the only kind-specific code
  is the German verb string; `reply` reuses the "neue Antworten" count noun.
- **Rules:** `reply` added to the notification `kind` enum; a new `validReplyTo()` validates
  the optional `replyTo` map on message create (exact key set, string fields, id caps 128,
  `previewText` 1..150). Shared by messages and replies — thread replies simply never carry
  it. The edit/tombstone `affectedKeys` matrices already exclude `replyTo`, so it is
  immutable after create. See the deploy-ordering note in the change summary: `replyTo`
  writes pass under the old permissive create rules (unvalidated) and `reply` notifications
  are silently rejected (fire-and-forget) until the rules deploy — sends never break either way.

## Bottom sheets: interactive finger-tracking physics (2026-07-06)
The mobile bottom sheets previously *decided* dismissal from pointer tracking but never
*rendered* the drag: the `sheet-slide-up` entrance animation (`animation-fill-mode: both`)
kept overriding the inline drag transform in the cascade (a filled CSS animation beats
inline styles), and the mid-file `--dragging`/`--settling` overrides lost to the later
`respond-md` sheet rules at equal specificity — so sheets "just vanished" at the threshold.
Reworked in the shared dialog-shell (physics helpers in `sheet-physics.ts`):
- **1:1 finger tracking** (per-move `translateY`, compound `--dragging` selector at file end
  kills animation/transition on the transformed element; measurements cached on drag start,
  no per-frame layout reads; transform/opacity only).
- **Velocity-matched settle**: release duration = remaining distance / smoothed release
  velocity, clamped by `SETTLE_MIN_DURATION_MS`/`SETTLE_MAX_DURATION_MS`; the easing starts
  at slope 1 so the animation continues the finger's motion; a `--dragged` state prevents
  the entrance animation from replaying after a spring-back.
- **Rubber-band overdrag** above rest (dampened, asymptote `OVERDRAG_LIMIT_PX`) instead of a
  hard clamp; **scrim opacity coupled to drag progress** (scrim moved to an overlay
  `::before` so the card is unaffected and scrim clicks still hit the overlay itself).
- Gestures on a **focused** text field are never drag-eligible (text selection); unfocused
  inputs are. Grabber drags may engage upward. A new drag can catch a settling sheet — or
  one still in its entrance animation — at its rendered position (`readTranslateY` on drag
  start). Non-primary pointers are ignored end-to-end (a second finger cannot settle the
  drag), and a flick velocity older than `VELOCITY_STALE_MS` is discarded on release (flick
  → hold → lift springs back instead of dismissing). Kept: dismiss threshold + flick
  constants, Escape/X/scrim close, inner-scroll handoff, pointercancel spring-back,
  reduced motion ⇒ instant states.
The **channel-create dialog** was migrated onto the shared dialog-shell (it re-implemented
scrim/focus-trap/Escape/sheet styling itself, so its sheet had a decorative handle but no
gesture); its desktop balloon-inflate entrance was dropped in favor of the shell's standard
appearance, aligning it with every other dialog.

## Friends view rows: row = profile, icons = quick actions (2026-07-06)
On narrow viewports the "Nachricht senden" text button consumed the row and truncated the
name/@username to single characters. Discord-pattern rework (no Figma frame for this view):
the avatar/name area is one large button (44px min target, visible focus ring) opening the
profile dialog via `ProfileOverlayService` — the dialog carries the full friend-action set;
beside it the shared friend-action renders a **compact** mode ('friends' state only): the
message action as an icon button (`comment.svg`, ≥44px, `aria-label`
"Nachricht an {Name} senden", CSS hover/focus tooltip) next to the existing more-vert
overflow. Desktop gets the same icon treatment for consistency. The quick-action buttons
are *siblings* of the profile button (never nested), so their clicks cannot bubble into
the row action. Other friend-action surfaces (profile dialog, search dropdown,
notification center) keep the text buttons (`compact` defaults to false).
Review-hardened details: the row button's accessible name comes from its **visible
content** plus a visually-hidden ", Profil anzeigen" suffix (an `aria-label` would strip
the unique @handle from AT/voice control — display names are not unique); a **172px
minimum width** on the profile button makes the text-button states (Anfrage senden /
zurückziehen / Annehmen+Ablehnen) wrap below the identity instead of crushing it at
320px; the tooltips render on **hover-capable devices only** (`display: none` on touch —
their invisible nowrap boxes otherwise created horizontal overflow), are right-aligned
under the buttons and are suppressed while the overflow menu is open; the dialog shell
falls back to the view's `h1[tabindex="-1"]` when the opening element left the DOM while
the dialog was open (live Firestore lists).

## Icon assets live under `/app-icons/`, not `/icons/` (2026-06-22)
The `/icons/` path is **reserved by the production host** (a classic Apache autoindex
alias), so requests to `/icons/*` are intercepted by the server and never reach our web
root — every icon 404s on the live host even though the files exist. It is **invisible on
the Angular dev server**, which has no such alias, so it only reproduces in production.
Fix: the asset folder was renamed `public/icons` → **`public/app-icons`** and every
reference updated (`src="app-icons/…"`, the TS icon-path constants, the SCSS bundled
`url(.../public/app-icons/…)` hover icons and the dark-theme `img[src^='app-icons/']`
recolor selector). No central icon-path helper exists, so each occurrence was updated.

## Legal pages: German routes + GIPHY disclosure (2026-06-21)
The public legal pages were **renamed to German routes** and the privacy policy gained a **GIPHY**
disclosure. The pages were already bespoke, **phone-free Austrian-law** texts (§ 5 ECG / § 25
MedienG and DSGVO/DSG, server `europe-west3`), so the original task's eRecht24-boilerplate edits
(remove "Telefon", drop "Anfrage per E-Mail, Telefon oder Telefax", standardise "1170 Wien") were
**already satisfied or moot**; the referenced `docs/legal/datenschutz-source.*` does not exist. Per
the maintainer's choice we **kept the existing content** and added only what was missing.
- **Routes**: `/legal/imprint` → **`/impressum`** ([LegalNoticeComponent](src/app/features/legal/legal-notice/legal-notice.component.ts)),
  `/legal/privacy` → **`/datenschutz`** ([PrivacyPolicyComponent](src/app/features/legal/privacy-policy/privacy-policy.component.ts)).
  The old paths **redirect** (no broken bookmarks/links). Both stay public (under the auth layout,
  no guard) and lazy. Footer, registration consent link and the in-app profile menu point at the
  new routes; menu legal links use `color('black')` (not `text-gray`) because the menu card is
  **frosted glass**, the surface where `text-gray` is known to fail AA.
- **GIPHY section** (new § 5, subsequent sections renumbered): IP transfer to GIPHY, Inc. (USA),
  legal basis Art 6 (1) f, US-transfer note, link to `giphy.com/privacy` (GIPHY's canonical 301 to
  their policy). Completes the service disclosures (Firebase Auth, Google sign-in, Firestore and
  localStorage were already covered).
- **Per-page `<title>` + meta description** via a small [PageMetaService](src/app/shared/page-meta.service.ts)
  that **restores the app default on teardown**, so a legal page's title does not linger after
  navigation (the app otherwise sets no per-route titles).


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
  the Angular 17+ convention; `public/` holds `app-icons/`, `emojis/`, `avatars/`,
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
- **Shared guest credentials** live in the gitignored environment config
  (`environment.ts` / `environment.development.ts`), read via `environment.guestEmail`
  and `environment.guestPassword` — no longer in tracked source. A single
  low-privilege account with no special permissions, reached through the one-click
  Gäste-Login button; the guest profile resets on every login so sessions never
  leak. The password ships in the client bundle (unavoidable for a client-side
  guest login) but is not committed to the repo; it was rotated out of version
  control on 2026-07-01 (old literal removed from `auth.service.ts` and `README.md`).

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

## Lighthouse / performance pass (2026-06-21)
- **Fonts: Latin-subset variable WOFF2, declared in `index.html`, Inter preloaded.**
  The `@font-face` rules previously loaded the raw **variable TTFs** (Inter 854 KiB,
  Nunito 269 KiB — the page's single largest payload). They were re-subset to the
  Google-Fonts **Latin** unicode range and re-encoded to **WOFF2 keeping the full
  `wght 100–900` axis** (Inter → 100 KiB, Nunito → 39 KiB; ~88 %/86 % smaller), so
  semibold/medium/extrabold still render correctly — **no weight flattening**. All
  `@font-face` now live in an inline `<style>` in `index.html` pointing at the
  **non-fingerprinted** `public/fonts/*.woff2` copies (stable URLs), which lets the
  critical Inter font be **preloaded** (`<link rel="preload" as="font" crossorigin>`)
  and keeps `font-display: swap`. Italic is Inter-only and lazy-loaded; Nunito-italic
  was dropped (heading font, never italic). This **supersedes** the CLAUDE.md note that
  fonts are "fingerprinted into media/" — they are now served verbatim from `/fonts/`
  with an immutable cache. **Trade-off:** the Latin subset means user-typed text in
  non-Latin scripts (Cyrillic/CJK/…) falls back to the `Arial, sans-serif` stack; German
  (umlauts, ß) and all UI glyphs are fully covered.
- **`public/robots.txt` added** (`User-agent: * / Allow: /`). Firebase Hosting's SPA
  rewrite (`** → /index.html`) served HTML for `/robots.txt`, which Lighthouse flagged as
  an invalid robots.txt (SEO 92 on the production build); the real file restores SEO 100.
- **Avatar resolver hardens against stale Firestore avatar paths.** Legacy DABubble-style
  portrait paths (e.g. `avatars/Noah-Braun.png`) no longer ship in `public/avatars/`; a
  user document still carrying one made the `<img>` request a missing file (console 404).
  `isKnownAvatar()` now substitutes the guest placeholder for any unknown stem **before**
  render, so the bad URL is never requested (the 404 is the underlying Firestore data,
  which should be corrected at the source).

## Activity notifications: thread replies + reactions (2026-07-09)
No Figma design exists for notifications; the design extends the established
bell/toast pattern and is strictly token-based.
- **Sender-side fan-out instead of listeners.** Thread replies and reactions are not
  observable through the existing per-conversation small-doc streams (they never touch
  `lastMessageAt`/`lastMessageAuthorId`), and broad message listeners are off-budget
  (§14). The **acting** client therefore writes one shape-validated notification doc
  per recipient into `users/{uid}/notifications` (create-only for foreign users,
  strict key/type/length validation in the rules); each user observes **only their own**
  collection through one narrow listener (`orderBy createdAt desc, limit 50`).
- **Recipients**: reactions notify the message/reply author; thread replies notify the
  root author plus everyone recorded in the root's `participantUids` (self-appended
  arrayUnion at reply time, enforced append-self-only in the rules). Own actions never
  notify. **Not backfilled**: threads without new replies since this feature only
  notify their root author.
- **Play-once guards reused**: wall-clock baseline anchored at sign-in + per-doc-id
  dedup (same pattern as the message-toast baseline and the big-reaction tracker), so
  the persisted backlog renders in the bell but never re-toasts.
- **Coalescing**: rapid reactions on the same message stay separate create-only docs
  and collapse client-side into ONE bell entry (newest actor named, distinct actors
  counted: "Anna und 2 weitere Personen haben reagiert") — preferred over granting
  foreign users update rights on notification docs.
- **Viewing counts as reading**: docs whose target is currently in view (the open
  thread for thread events, the open conversation for main-stream reactions) are
  suppressed and auto-deleted, mirroring the conversation read markers; clicking a
  toast/bell entry navigates (thread opens, message scroll+highlight via the existing
  focus service) and the auto-clear then removes the group.
- **Trade-offs, accepted**: preview text is sender-authored (length-capped in rules;
  same trust level as sending a message); docs beyond the 50-doc listener window are
  never read and linger in storage until their group is opened (project scale);
  the shared guest account has a shared feed. Channel-targeted creates require actor
  AND recipient to be current members (one `get` per create); DM targets are proven
  from the deterministic conversation id at no read cost.

## Notification refinement + mentions + GIF replies (2026-07-09)
Follow-up to the activity-notification feature above; same bell/toast pattern,
strictly token-based, no Figma frames for any of it.
- **Per-context thread suppression (bug fix).** Thread-reply notifications were stored
  with `inThread=false` because the fan-out parsed the thread *root* path (no `/replies/`
  segment), so being in the conversation's MAIN view wrongly suppressed AND auto-deleted
  replies arriving in a thread. Fix: thread replies and thread mentions are stored with
  `inThread=true`; a thread is now its own context — its events toast + persist unless
  THAT thread panel is open, while main-stream events are suppressed only while the
  conversation main view is open. The fix also repaired click-through (thread-reply
  entries now open the thread instead of focusing the root in the main stream).
- **@mention notifications (`kind: 'mention'`).** On send (main stream or thread reply)
  the sender resolves @mentions from the composed text by **display name** (the composer
  inserts names, not handles) and fans out one `mention` doc per mentioned, reachable,
  non-self user. Ambiguous display names resolve to **every** matching uid (names are not
  unique; only `username` is) so no mention is silently dropped. Label „hat dich erwähnt";
  a main-stream mention focuses the message (its id is now returned by the send path), a
  thread mention opens the thread. **One action = one entry**: a recipient who is both
  @mentioned and a thread follower gets ONLY the mention (the reply fan-out excludes the
  set the mention fan-out already notified). DM mentions of a non-participant are dropped
  client-side (and would be rejected by the rules). The composer's live mention pill and a
  channel-list mention badge remain out of scope. The **new-message compose flow** does not
  fan out mentions (it navigates to the target instead) — a deliberate boundary.
- **rules**: the only change is adding `'mention'` to the notification `kind` enum; the
  existing `(kind=='reaction') == ('emoji' in data)` invariant already forces mentions to
  carry no emoji, and the actor+recipient membership/participation checks are unchanged.
- **Main-stream mention supersedes the generic unread indicator (resolved 2026-07-09).**
  The earlier open question — a main-stream mention counting twice (unread conversation +
  mention) — is resolved: a pending mention now **supersedes** the generic unread indicator
  of its conversation in both the badge and the toast. Badge: `unreadConversations` excludes
  any conversation that has a pending `mention` group, so the message counts **once** (as
  the mention event, not unread + mention). Toast: the generic new-message notifier reads
  the triggering message and, if it @mentions the signed-in user (resolved from the text the
  same way the sender's fan-out does — deterministic, no async race), **skips** its toast so
  only the „… hat dich erwähnt" toast fires with a single chime. Thread-reply mentions and
  reactions are unaffected (they never bump conversation meta). Trade-off: if the mention
  fan-out write itself fails (e.g. sender offline), the generic toast is still suppressed for
  that message, but the persistent unread indicator remains, so the message is never lost —
  only its transient toast.
- **Bell dismissal (Discord/Slack/Teams blend).** Each „Aktivität" entry has a dismiss X —
  hover/focus-revealed on pointer devices (`@media (hover: hover)`), always visible on
  touch, ≥32px target, keyboard-operable, aria-label „Benachrichtigung entfernen" — a
  **sibling** of the row button (never nested) absolutely positioned in a permanently
  reserved right-padding lane (**CLS 0** whether shown or hidden). Dismissing a grouped
  entry deletes all its coalesced docs; a „Alle löschen" header action clears the feed
  (no confirm dialog, like Discord). Focus is moved to the panel title on dismiss so a
  keyboard user is never dropped onto `<body>` as rows unmount after the async delete.
- **Single attention indicator.** The profile-avatar notification dot was removed; the
  **bell badge is the only attention indicator**. Presence/online dots and unread logic
  are untouched; `attentionCount` now feeds only the bell badge.
- **GIF replies in threads.** The thread composer gained the GIF button (was disabled),
  reusing the shared Giphy picker + `pg-13` rating and the existing reserved-aspect-ratio
  render path (lazy, reduced-motion still-frame, CLS 0). **No rules change**: the reply
  create rule uses `validMessageCreate` (no field allow-list), which already accepts the
  GIF fields exactly as top-level GIF messages do. GIF-reply notifications preview as
  „GIF" (the fan-out passes the reply's gifUrl to `previewOf`).

## Notification badge count + feed panel list/scroll (2026-07-09)
Refinement of the activity-notification bell; no Figma frames, strictly token-based.
- **Bell badge shows real unread count.** The badge previously summed the pre-existing
  unread-conversation count with the number of *coalesced* activity **groups**, so several
  events on one message (e.g. 3 replies) showed „1". It now counts **events**: each unread
  activity feed document counts 1 (`feedService.eventCount`), plus each (non-superseded)
  unread conversation as before. One user action still increments the badge by at most 1
  (mentions supersede the unread indicator, above). The visible badge caps at a named
  „9+" (`BADGE_MAX` = 9); the bell's `aria-label` announces the real number
  („Benachrichtigungen, 5 ungelesen"). The badge reserves a fixed 2-character box
  (`min-width` = `space('md-lg') + space('sm')`) so it never reflows between „1" and „9+"
  (CLS 0).
- **Feed panel lists every group, counted, scrollable.** The panel already rendered all
  groups; the „only one entry" observation was the (kind, message) coalescing working as
  designed (repeated events on one message collapse into one row). Rows with more than one
  unread event now lead with the count in natural German („3 neue Antworten von Gast",
  „2 Erwähnungen von Gast"); reactions keep the actor summary + newest emoji, and the
  preview stays the newest event's. The Aktivität list caps its visible height at a
  token-derived 5 rows (`$activity-row-height` × `$activity-visible-rows`), then scrolls
  with the shared `scrollbar-thin` treatment and `overscroll-behavior: contain`. Inside the
  mobile bottom sheet the existing sheet physics already defer to inner scroll
  (`hasScrolledContent`) while the grabber still drags to dismiss, so the list scrolls
  without fighting the sheet. Per-row dismiss X and „Alle löschen" are unchanged.
