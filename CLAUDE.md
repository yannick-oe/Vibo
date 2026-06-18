# CLAUDE.md — DABubble

Guidance for Claude Code when working in this repository. **Follow strictly.**
If a rule conflicts with a request, **flag it explicitly** instead of silently working around it. Prefer correctness over agreement.

## Project
DABubble — a Slack-style chat app (Developer Akademie diploma project). Public repo / portfolio piece.

## Stack
- Angular 21 (standalone components, no NgModules)
- TypeScript (strict), SCSS (7-1 architecture, BEM)
- Backend: Firebase (Auth + Firestore) — **confirm before implementing** data/auth
- Resources (do not rebuild): Material Symbols icons (Google Fonts), Emojitwo emoji set (iconduck), 6 provided avatars + placeholder

## Commands
- `npm start` / `ng serve` — dev server
- `npm run build` / `ng build` — production build (run **after any structural refactor**)
- `ng test` — unit tests
- No linter is configured (no `lint` target, no ESLint setup) — do **not** install one unless explicitly asked.

## Hard code rules (non-negotiable)
- Each function **≤ 14 LOC**, single responsibility.
- Each file **≤ 400 LOC**.
- **TSDoc** on every function and every `.ts` file. **No inline comments.**
- 1–2 blank lines between functions.
- Naming: `camelCase` (vars/functions, lowercase first), `PascalCase` (classes/types/interfaces/components), `UPPER_SNAKE_CASE` (constants). Descriptive; no reserved-word conflicts.
- All code and identifiers in **English**.
- Strict TS; **never `any`** (use `unknown` + narrowing); explicit return types on public APIs.
- `const` by default; no `var`. No magic numbers/strings → named constants/tokens.
- Guard clauses over deep nesting.

## Architecture & folders
- Folders: `components/`, `img/`, `shared/`, optionally `pipes/`. Smart vs. presentational components; data access in services, components stay thin.
- State via Angular **Signals** (`signal`, `computed`, `effect`); `inject()` over constructor injection; `OnPush` change detection.
- Templates: new control flow `@if` / `@for (… ; track …)` / `@switch`. No logic in templates. Clean up subscriptions (`takeUntilDestroyed`, `toSignal`, or `async` pipe).

## Styling & design tokens
**[design-system.md](design-system.md) is the single canonical source** for all design tokens — colors, type scale, fonts, spacing, buttons, inputs, radii, status colors. Do **not** duplicate token values here or anywhere else; if a value is wrong, fix it in design-system.md.
- Tokens are implemented as SCSS maps + accessor functions in [src/styles/_variables.scss](src/styles/_variables.scss): `color('key')`, `font-size('key')`. **Never hardcode hex or magic sizes** — always reference a token.
- SCSS: 7-1 architecture, BEM, `@use` for partials, mixins/maps to avoid duplication; do not nest deeply.

## Accessibility (WCAG 2.1 AA / BaFG)
- Semantic HTML first; ARIA only when needed and correct (no redundant roles).
- **Every input has a `<label>`** (visible or visually-hidden). Errors via `aria-describedby` + `aria-invalid`.
- Keyboard operable; visible focus (`:focus-visible`); contrast ≥ 4.5:1 text / 3:1 UI; meaningful `alt`; respect `prefers-reduced-motion`.

## Forms & validation
- Reactive forms. **Specific inline error messages below the field — NO HTML5 validation, NO alerts.** Error text in `error` color.
- Handle empty inputs; button states enabled/disabled/hover. Auto-focus input on channel/DM switch.

## Definition of Done (every change)
Works · all links/buttons work · no console errors · incognito-safe · matches Figma (colors, fonts, consistent spacing) · responsive to 320px, no scrollbar · `cursor:pointer` · no default borders · favicon present · functions ≤14 LOC · files ≤400 LOC · TSDoc present · a11y met.

## Firestore data model
- `users/{uid}` — `uid`, `name`, `email` (null for guests), `avatarPath` (local asset path, never a URL), `createdAt`.
- `channels/{channelId}` — `name`, `description`, `createdBy` (uid), `memberIds: string[]`, `createdAt`, `nameLower` (trimmed lowercase copy of `name`, written on create → enables the global case-insensitive duplicate-name query without reading the whole collection).
- `channels/{channelId}/messages/{messageId}` — `authorId`, `text`, `createdAt`, `reactions: { [emoji]: uid[] }`, `replyCount`, `lastReplyAt` (null without replies); optional `hiddenFor: uid[]` ("Für mich löschen") and `deletedAt`/`deletedBy` ("Für alle löschen" → tombstone, `text` and `reactions` cleared).
- `channels/{channelId}/messages/{messageId}/replies/{replyId}` — `authorId`, `text`, `createdAt`, `reactions` (same shape, incl. the optional delete fields).
- `directMessages/{conversationId}` — `participantIds: [uidA, uidB]`, `createdAt`; subcollection `messages` like channel messages (incl. `replies` — threads exist in private chats too).

Key decisions:
- **Replies are a subcollection** with denormalized `replyCount`/`lastReplyAt` on the parent message → thread previews ("2 Antworten · Letzte Antwort 14:56") render without reading any replies.
- **Deterministic DM ids**: `conversationId` = both uids sorted, joined with `_` (see `buildConversationId`) → the same pair always maps to one document, no duplicate conversations, direct lookup without a query.

## Route smoke test (re-verify after EVERY routing change)
> **Routing is hash-based** (`withHashLocation()` in `app.config.ts`, chosen for the FTP host — see [Deployment](#deployment)). Every route below lives under the `#` fragment, e.g. the real URL for `/auth/login` is `…/#/auth/login`. The base path is `/` on Firebase Hosting and `/da-bubble/browser/` on the FTP build; paths below are written without that prefix.
- `/` → redirects to `/auth/login`; login card renders; intro splash plays on a fresh session and lands on the header logo.
- `/auth/login` → login card.
- `/auth/register` → registration form.
- `/auth/register/avatar` → direct deep link redirects back to `/auth/register` (guard).
- `/auth/forgot-password` → e-mail form.
- `/auth/reset-password` (without `oobCode`) → invalid-link state with re-request link, no form.
- `/legal/imprint` → imprint card inside the layout.
- `/legal/privacy` → full-width privacy page inside the layout.
- Unknown URL (e.g. `/foo`) → redirects to `/auth/login`, never an empty shell.
- Header CTA ("Neu bei DABubble?") visible on `/auth/login` only.
- `/app` unauthenticated → redirects to `/auth/login`.
- `/app` authenticated → redirects to the user's alphabetically first channel (`/app/channel/:id`); without any channels it stays on the empty chat card (also after a reload — session persists).
- `/app/channel/:channelId` → channel chat view; composer is auto-focused.
- `/auth/login` authenticated → redirects to `/app`.

## Module plan notes
- Module 3 (channel chat) is implemented: `/app` redirects to the alphabetically first channel; users without channels keep the empty chat card.

## Deviations from Figma (intentional)
- All password fields have a trailing visibility toggle (Material Symbols `visibility` / `visibility_off`) — not in Figma; additive UX/a11y improvement.
- Channel-creation step 2 reads "Alle Mitglieder von **Devspace** hinzufügen" — the Figma frame says "von Entwicklerteam", but referencing an existing channel makes no sense while creating a new one; the workspace name is the correct scope.
- Date separators read "Dienstag, 14. Januar" with the grammatically required period after the day — the Figma frame omits it ("14 Januar"); correct German wins over frame fidelity.
- Message deletion (no Figma design): WhatsApp-style "Für mich löschen" (client-side `hiddenFor` filter; counters and other users unaffected) and "Für alle löschen" (tombstone row "Diese Nachricht wurde gelöscht", italic `text-gray` in a muted bubble; thread access stays alive while `replyCount > 0`). Deletion has no time limit.
- Editing own messages is limited to a **15-minute window** after `createdAt` (client-side only for now); no visible "edited" marker (none in Figma).
- Reaction-tooltip (who reacted) and the emoji picker grid have no Figma design — kept minimal, strictly token-based.
- Reaction UI (picker, quick actions, chips, tooltip) renders the mandated **Emojitwo SVGs** (`public/emojis/`, filenames = unicode codepoints); the Firestore **reaction key stays the unicode character**, so data is rendering-agnostic and legacy/unmapped keys fall back to plain text. Message-text emojis (composer insertion) remain unicode characters. 🥳 is not part of Emojitwo and was replaced by 😉 in the picker set.
- Quick-reaction emojis in the hover bar = the user's two most recently used, persisted in **localStorage** (trade-off: no cross-device sync); defaults ✅/🙌 per Figma.
- **Long-press (~500 ms) opens the message action bar on touch devices** — convention, no gesture defined in Figma (hover does not exist on touch). The bar closes on outside tap or after any action; desktop hover behavior is unchanged.
- Mobile search matches the Figma frames: the "Gehe zu..." field in the menu view opens a **dedicated full-screen search view** (own header + X, dialog-shell `search` variant for focus trap/Escape/restore) reusing the shared search bar with inline full-height results. The header title reads "Gehe zu..." per the frame (confirmed 2026-06-12).
- Mobile dialogs render as **bottom sheets** (drag-handle bar, slide-up animation, instant under `prefers-reduced-motion`) — the Figma mobile frames show centered cards only for some dialogs; the sheet treatment is applied consistently to all of them.

## Deployment
Two live targets, same source. **Firebase Hosting** (root, `/`): `firebase deploy --only hosting` (config in firebase.json; SPA rewrite + cache headers). **Developer Akademie FTP** (subfolder, `https://yannick-oetelshoven.developerakademie.net/da-bubble/browser/`): `ng build --configuration production --base-href /da-bubble/browser/`, upload `dist/vibo/` via FileZilla so `browser/` lands at `/da-bubble/browser/` (enable "Force showing hidden files" so `.htaccess` uploads).

Verified facts about the FTP host (2026-06-15, full headless live verification, 21/22 checks green):
- **Hash-location routing** (`withHashLocation()`): the host **ignores `.htaccess`/`mod_rewrite`** (direct hits to `…/browser/auth/login` returned 404; `.htaccess` is uploaded but inert), so path routing + SPA rewrite is impossible there. Hash routing makes the server only ever serve `…/browser/` — deep links and hard refresh work with no server config. The `public/.htaccess` is kept as a harmless fallback should the host ever enable mod_rewrite.
- **Asset paths are relative** (no leading `/`): `<base href>` does not rewrite absolute URLs, so a subfolder deploy needs relative `icons/…`, `logos/…`, `avatars` (via the `avatarSrc`/`avatarUrl` helpers) and `emojis` paths; CSS-referenced hover icons + `@font-face` fonts are bundled (fingerprinted into `media/`) by pointing their `url()` at `public/` relative to each SCSS file. Works for both root and subfolder builds.
- **Host serves HTTPS** (301-redirects HTTP→HTTPS), so the earlier "HTTP-only" worries do **not** apply.
- **Password reset uses Firebase's default hosted handler** (`dabubble-b918d.firebaseapp.com/__/auth/action`): the Console (Spark) **rejects a custom action URL** (both the HTTP and the HTTPS web.app URL fail with a generic error), so the app's own styled reset page is bypassed in the email flow. `sendPasswordReset` passes `actionCodeSettings.url = document.baseURI` (the deployment-aware app base, an authorized domain) so the request never throws and the post-reset "continue" link returns to the app on either deployment.
- **Google sign-in works** over the (HTTPS) host: `signInWithPopup` opens the real `accounts.google.com` consent page; the `Cross-Origin-Opener-Policy … window.closed` console line is a benign known warning, not a failure. (`yannick-oetelshoven.developerakademie.net` is in Authentication → Authorized domains; any future custom domain must be added there too.)

## Tech debt
- `@angular/fire` is pinned to `21.0.0-rc.0` because the stable release (20.x) does not support Angular 21 yet → swap to `21.0.0` final as soon as it is released.
- `.npmrc` with `legacy-peer-deps=true` exists only to make the RC installable (exact-pinned transitive peer); it disables peer-dependency checks for **all** installs → remove it together with the RC swap and verify `npm install` works without it.
- Initial bundle warning budget raised 500 kB → 800 kB (angular.json) because `provideFirestore` in `app.config.ts` is eager, pulling the Firestore SDK core into the initial chunk → if the bundle grows further, revisit with deferred Firestore loading (e.g. route-level providers).
- ~~TODO Firestore security rules~~ **resolved 2026-06-12**: production rules live in [firestore.rules](firestore.rules) (deploy: `firebase deploy --only firestore:rules`, config in firebase.json/.firebaserc). Model: default deny; everything requires auth. `users/{uid}` read for all signed-in, write owner-only. Channels: read/create for all signed-in (names are workspace-public); members may edit name/nameLower/description, add members and remove **only themselves** (leave); non-members may update only to append their own uid (join-on-send — message create checks membership via `getAfter()` because it lands in the same batch); delete only when `memberIds == [own uid]`. Messages/replies: read/create members only, `createdAt <= request.time` enforced so the **15-minute edit window** (`request.time < createdAt + 15min`) cannot be gamed by future-dating; author may edit `text` in-window (not on tombstones) and set the tombstone (deletedAt/deletedBy/text=''/reactions={}); any member may change **only** `reactions`; `hiddenFor` accepts only appending one's own uid; reply authors may bump exactly `replyCount`+1/`lastReplyAt` on the parent; hard-deletes only for the sole remaining member (channel teardown — the client deletes children before the channel doc, which the rules rely on). DMs validate participation from the deterministic conversation id (`uid_uid` sorted; uids never contain `_`), enabling the lazy existence check; conversation **reads** additionally accept proof via the stored `participantIds`, because the global search's `array-contains` list query is only provable against stored fields, not the id; same message-update matrix; conversation docs are never updated.
- **Global search** fetches the accessible message sources on demand and filters **client-side** (Firestore has no text search); scope: channels the user is a member of plus own DM conversations, thread replies excluded for now. Acceptable at project scale — server-side search would need an external index (e.g. Cloud Functions + Algolia/Typesense).
- Composer **mentions insert plain text** ("@Name " / "#channel ") — no highlight rendering in sent messages (no Figma design; out of scope).
- "Neue Nachricht": after sending, the view **navigates to the target channel/DM** — behavioral convention, Figma defines no post-send flow. The "#" address list shows **all existing channels** (checklist US4); sending to a non-member channel performs **join-on-send** — the sender is added to `memberIds` in the same batch as the message write (idempotent for members).
- When the **last member leaves a channel**, the client deletes the channel doc plus all message/reply documents itself (recursive, chunked batched deletes) because Firestore does not cascade subcollection deletes. Acceptable at project scale; a crash mid-delete can leave orphaned subcollection docs — server-side cleanup would need Cloud Functions.
- ~~Guest-doc churn~~ **resolved 2026-06-11**: guest login uses one fixed account (`gast@dabubble.dev`, credentials as constants in `auth.service.ts`) instead of anonymous auth — no new Auth user / users doc per guest login. Trade-offs, accepted deliberately: credentials are client-visible in the public repo (fine — the Firebase config is public by design and the account has no special privileges); concurrent guests share one account/identity; the guest profile (name, avatar) is reset on every guest sign-in so sessions don't leak into each other. The Anonymous provider in the Firebase console should stay disabled; if the guest account is ever deleted, guest login breaks until it is recreated.

## Git
Small atomic commits with meaningful messages (Conventional Commits). `.gitignore` covers `node_modules`, `dist`, `.env`. **Never commit secrets.** Repo stays public.

## Working style
- Non-trivial task: **short plan → wait for confirmation → implement in small increments → brief explanation.**
- Run the build after structural refactors.
- For Firebase / auth / architecture decisions: surface options + trade-offs and **ask before committing**.
- Learning mode: explain decisions concisely so they can be defended line-by-line.
