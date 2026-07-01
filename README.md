# Vibo

![Vibo logo](public/logos/logo.svg)

**A cosmic-themed, real-time team chat — channels, DMs, threads, and a Slack/Discord-style feel, built solo as an Angular 21 portfolio piece.**

🔗 **Live demo:** <LIVE_URL>

👉 **Try it instantly — no signup needed.** Click the **Gäste-Login** button to jump straight into a public shared demo account.

> _The guest profile resets on every login, so sessions never leak into each other._

---

## About

Vibo is a real-time chat app with **channels, direct messages, and threads**, wrapped in a cosmic, glassmorphic design with animated avatars and a dark/light theme. It started as a Developer Akademie diploma project (originally a team effort) and was **rebuilt and extended solo** as a portfolio piece — re-architected on Angular 21 with signals, a strict engineering budget, and a focus on accessibility and performance.

The interesting part isn't the feature list — it's the engineering decisions behind it. See **[Engineering highlights](#engineering-highlights)**.

---

## Features

**Messaging**
- Real-time **channels**, **direct messages**, and **threads** (denormalized reply counts + last-reply previews, so thread previews need zero extra reads)
- **Markdown messages** — bold/italic, lists, blockquotes, links, and **syntax-highlighted code blocks** with a copy button
- **Edit your own messages** (15-minute window) and **delete** ("für mich" / "für alle", WhatsApp-style tombstone)
- **Emoji reactions** with a picker, quick reactions, a "who reacted" tooltip, and on-brand big-reaction effects

**Conversation UX**
- **WhatsApp-style read receipts** (grey → grey → blue) with a "read by" list
- **⌘K / Ctrl+K command palette** — keyboard-first quick-switcher for channels, DMs and actions (lazy-loaded)
- **Giphy GIF picker** — trending + search, PG-13-filtered on every request, lazy-loaded (deferred chunk)
- **Global search** across the channels and conversations you can access

**Identity & presence**
- **Animated cosmic avatars** — hover-to-play WebP loops with a reduced-motion still fallback
- **Live presence**, profile **badges**, and a **profile dialog** with banners
- **Auth:** email/password, Google sign-in, and **instant guest mode**

**Design & platform**
- **Dark / light theme** (persisted), a frosted-aurora glass aesthetic
- **Self-hosted Twemoji** emoji (no hotlinking), em-sized inline in messages
- **Responsive to 320px** — mobile bottom-sheets, long-press actions, no horizontal scroll

---

## Screenshots

> Captures live in **[`docs/screenshots/`](docs/screenshots/)** — both light and dark themes.

| | Light | Dark |
|---|---|---|
| **Channel view** | ![Channel — light](docs/screenshots/channel-light.png) | ![Channel — dark](docs/screenshots/channel-dark.png) |
| **Command palette (⌘K)** | ![Command palette](docs/screenshots/command-palette.png) | ![Direct message](docs/screenshots/dm-dark.png) |
| **GIF picker** | ![GIF picker](docs/screenshots/gif-picker.png) | ![Code block](docs/screenshots/code-block.png) |

---

## Tech stack

| Area | Choice |
|---|---|
| **Framework** | Angular **21.2** — standalone components, **Signals**, new control flow (`@if` / `@for` / `@defer`), `OnPush` |
| **Language** | TypeScript **5.9** (strict, no `any`) |
| **Styling** | SCSS — **7-1 architecture**, BEM, design-token maps (`color()` / `space()` / `font-size()`) |
| **Backend** | **Firebase** — Authentication + Cloud Firestore (`firebase` 12.14, `@angular/fire` 21 RC) |
| **Markdown** | `marked` **18** → **`dompurify` 3.4** (sanitized) → enrichment |
| **Code highlighting** | `highlight.js` **11.11** (deferred, curated language set) |
| **Emoji** | **Twemoji** (jdecked fork), self-hosted SVG |
| **GIFs** | **Giphy** REST API (`rating=pg-13`) |
| **Routing** | hash-based (`withHashLocation`) for static / subfolder hosting |
| **Tooling** | `@angular/cli` 21.2, Prettier 3.8, Vitest 4 |

---

## Engineering highlights

This is the part that matters — every item below is a deliberate, documented decision.

**Performance (production build, Lighthouse)**

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| **Desktop** | **97** | **100** | **100** | **100** |
| **Mobile** | **70** | **100** | **100** | **100** |

- **CLS = 0** everywhere — fixed overlays, reserved aspect-ratios on avatars and GIFs, no-reflow form-error slots.
- **Lazy-loading discipline** — the command palette, GIF picker, and the `highlight.js` + `marked`/DOMPurify Markdown pipeline are all **deferred chunks**, kept out of the initial bundle.
- **Self-hosted fonts** subset to Latin **WOFF2** (Inter 854 → 100 KB, −88%) with `font-display: swap` + a preloaded critical font.
- The remaining mobile gap is an honest, documented **Firebase-SDK floor** (see trade-offs below), not a CLS/blocking issue.

**Accessibility**
- **WCAG 2.1 AA verified in _both_ themes** (contrast measured, not assumed), keyboard-operable throughout, correct combobox/listbox + dialog semantics, `:focus-visible` rings, and `prefers-reduced-motion` / `prefers-reduced-transparency` respected.

**Code quality (a strict, self-imposed budget)**
- **No `any`** (strict TS, `unknown` + narrowing), functions **≤ 14 LOC**, files **≤ 400 LOC**, **tokens only** (no hardcoded colors/sizes), **TSDoc on every file and function**, single-responsibility components (smart vs. presentational).

**Security & safety**
- **Sanitized Markdown pipeline** — `marked` → DOMPurify allow-list → trusted re-enrichment, only then bound via `bypassSecurityTrustHtml`.
- **Least-privilege [Firestore rules](firestore.rules)** — default-deny; field-level update matrices (edit only `text`+`editedAt` in-window; reactions append-only; receipts/tombstones constrained); DM participation proven from the deterministic conversation id.
- **Giphy content safety** — a single shared request builder sends **`rating=pg-13` on every call** (trending and search); no path can omit it.

**Avatar pipeline**
- Source stills are turned into short motion clips with **Kling AI (image-to-video)**, then exported as **seamless-loop WebP** at 256/384 plus a static frame — hover-to-play on capable devices, **still frame under reduced motion**, and explicit dimensions for zero layout shift.

**Deliberate trade-offs** (full rationale in **[DEVIATIONS.md](DEVIATIONS.md)** and **[design-system.md](design-system.md)**):
- **Hash routing** (`withHashLocation`) — the static/FTP host ignores `mod_rewrite`, so hash routing makes deep links and hard refresh work with **no server config**, on both Firebase Hosting and a subfolder deploy.
- **Mobile Performance ≈ 70** — the Firebase Auth + Firestore SDK sits in the initial bundle. Deferring Firestore would mean rewiring the entire auth/registration bootstrap (registration, guest, and Google sign-in all write Firestore on `/auth`) for a modest gain, so it was a **conscious decision to keep it** rather than risk the auth gate. The score is also throttled-mobile (slow-4G + 4× CPU); real Firebase Hosting (HTTP/2 + CDN + compression) scores higher.

---

## Getting started

### Prerequisites
- **Node.js 20.19+** (or 22.12+) and npm
- A **Firebase** project with Authentication (Email/Password + Google) and Cloud Firestore enabled
- A **Giphy** API key (free, from the [Giphy developer dashboard](https://developers.giphy.com/))

### Setup

```bash
git clone <repository-url>
cd vibo
npm install
```

Create your local config from the committed templates, then fill in the values:

```bash
cp src/environments/environment.example.ts             src/environments/environment.ts
cp src/environments/environment.development.example.ts src/environments/environment.development.ts
```

In both files, set your **Firebase web config** (Firebase console → Project settings → General → Your apps) and your **`giphyApiKey`**. Both are **public client identifiers, not server secrets** — Firebase access is enforced by the Firestore rules, and the Giphy key is a rate-limited public beta key. The real environment files are gitignored; the `*.example.ts` templates are committed.

### Run & build

```bash
npm start        # dev server at http://localhost:4200
npm run build    # production build → dist/vibo
```

Deploy the security rules separately:

```bash
firebase deploy --only firestore:rules
```

**Trying it out:** click the **Gäste-Login** button for instant access to the public shared demo account.

---

## Accessibility & performance

Accessibility and performance were treated as first-class requirements, not an afterthought. Every interactive surface is keyboard-operable with a visible focus ring; contrast was **measured to WCAG 2.1 AA in both themes**; motion and transparency respect user preferences; and the layout holds from desktop down to **320px** with **zero cumulative layout shift**. On the production build, Lighthouse reports **Desktop 97 / Mobile 70** with **Accessibility, Best Practices, and SEO all at 100** — and the one number that isn't perfect (mobile performance) is an honestly-documented Firebase-SDK trade-off rather than a hidden regression.

---

## Project structure

```
src/app/features/   # auth, chat, legal, profile, search
src/app/services/   # Firestore + Auth data access
src/app/shared/     # reusable components, directives, constants
src/environments/   # config (real files gitignored; copy from *.example.ts)
src/styles/         # SCSS 7-1 architecture + design tokens
firestore.rules     # least-privilege security rules
```

---

## Credits & attributions

- Originally built as a diploma project at the [Developer Akademie](https://developerakademie.com/) with Jan-Oliver Kämmerer; **rebuilt and extended solo** as this portfolio piece.
- **Emoji:** [Twemoji](https://github.com/jdecked/twemoji) (jdecked fork), licensed [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) — self-hosted as SVG.
- **GIFs:** Powered by [GIPHY](https://giphy.com/).
- **Icons:** [Material Symbols](https://fonts.google.com/icons) (Google Fonts).
- **Avatar motion:** generated with [Kling AI](https://klingai.com/) (image-to-video), exported to self-hosted WebP.

## License

Released under the [MIT License](LICENSE) — © 2026 Yannick Oetelshoven.
