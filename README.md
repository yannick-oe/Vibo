# Vibo

Vibo is a real-time, Slack-inspired team chat application built as a personal showcase project.

## Tech stack

- **Angular 21** — standalone components, Signals, modern control flow (`@if` / `@for`), OnPush change detection
- **TypeScript** (strict)
- **SCSS** — 7-1 architecture, BEM, design-token maps
- **Firebase** — Authentication and Cloud Firestore
- **Routing** — hash-based (`withHashLocation`) for static and subfolder hosting

## Features

- **Channels** — create, browse, edit, join and leave; case-insensitive duplicate-name protection
- **Direct messages** — one-to-one conversations with deterministic IDs
- **Threads** — reply to any message, with reply-count and last-reply previews
- **Reactions** — emoji reactions with a picker, quick reactions and a "who reacted" tooltip
- **Real-time presence** — live online status synced across clients
- **Authentication** — email/password, Google sign-in and one-tap guest login
- **Search** — global search across accessible channels and conversations
- **Responsive** — works down to 320px, with mobile bottom-sheets and long-press actions
- **Accessible** — semantic HTML, labelled inputs, keyboard operable, visible focus and reduced-motion support (WCAG 2.1 AA target)

## Live demo

_Placeholder — live demo URL to be added._

## Screenshots

_Placeholder — screenshots to be added._

## Getting started

### Prerequisites

- Node.js 20.19+ (or 22.12+) and npm
- A Firebase project with Authentication (Email/Password + Google) and Cloud Firestore enabled

### Setup

1. Clone the repository and enter it:

   ```bash
   git clone <repository-url>
   cd vibo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your local Firebase config from the templates, then fill in your web config (Firebase console → Project settings → General → Your apps):

   ```bash
   cp src/environments/environment.example.ts src/environments/environment.ts
   cp src/environments/environment.development.example.ts src/environments/environment.development.ts
   ```

4. Start the dev server:

   ```bash
   npm start
   ```

   The app runs at http://localhost:4200.

### Firestore security rules

The security rules live in `firestore.rules`. Deploy them with:

```bash
firebase deploy --only firestore:rules
```

### Production build

```bash
npm run build
```

## Project structure

- `src/app/features/` — feature areas (auth, chat, legal, profile, search)
- `src/app/services/` — Firestore and Auth data access
- `src/app/shared/` — reusable components and shared constants
- `src/environments/` — Firebase config (real files are gitignored; copy from the `*.example.ts` templates)
- `src/styles/` — SCSS 7-1 architecture and design tokens
- `firestore.rules` — Firestore security rules

## Credits

- Originally built as a diploma project at the [Developer Akademie](https://developerakademie.com/), together with Jan-Oliver Kämmerer.
- Icons: [Material Symbols](https://fonts.google.com/icons) (Google Fonts).
- Emoji artwork: [Twemoji](https://github.com/jdecked/twemoji) (jdecked fork), licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/); self-hosted as SVG, no hotlinking.

## License

Released under the [MIT License](LICENSE).
