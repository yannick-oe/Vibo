# DABubble

> A Slack-inspired, real-time team chat application — Developer Akademie diploma project.

DABubble is a responsive, accessible chat workspace built with Angular 21 and
Firebase. It supports channels, direct messages, threaded replies, emoji
reactions, mentions and global search, with real-time updates across clients.

## Live demo

- **Firebase Hosting:** https://dabubble-b918d.web.app
- **Developer Akademie:** https://yannick-oetelshoven.developerakademie.net/da-bubble/browser/

> Try it without an account via the **Guest login** on the sign-in screen.

## Features

- **Authentication** — email/password sign-up with avatar selection, login,
  Google sign-in, guest access, and password reset.
- **Channels** — create, browse, edit, and leave channels; add members;
  case-insensitive duplicate-name protection.
- **Direct messages** — one-to-one conversations with deterministic IDs.
- **Threads** — reply to any message; thread previews with reply count and last
  reply time.
- **Reactions** — emoji reactions with a picker, quick reactions, and a
  "who reacted" tooltip (Emojitwo artwork).
- **Mentions** — `@user` and `#channel` autocomplete in the composer.
- **Search** — global search across accessible channels and conversations.
- **Message management** — edit your own messages (15-minute window), delete for
  yourself or for everyone.
- **Responsive** — works down to 320px; mobile bottom-sheets, full-screen mobile
  search, and long-press actions on touch devices.
- **Accessible** — semantic HTML, labelled inputs, keyboard operable, visible
  focus, reduced-motion support (WCAG 2.1 AA target).

## Tech stack

- **Framework:** Angular 21 (standalone components, Signals, `@if`/`@for` control
  flow, OnPush change detection)
- **Language:** TypeScript (strict)
- **Styling:** SCSS (7-1 architecture, BEM, design-token maps)
- **Backend:** Firebase — Authentication, Cloud Firestore, Hosting
- **Routing:** hash-based (`withHashLocation`) for static/subfolder hosting

## Getting started

### Prerequisites

- **Node.js** 20.19+ (or 22.12+) and npm
- A **Firebase project** with Authentication (Email/Password + Google) and
  Cloud Firestore enabled

### Setup

```bash
# 1. Clone
git clone <repository-url>
cd DABubble

# 2. Install dependencies
#    (.npmrc sets legacy-peer-deps=true so the @angular/fire RC installs cleanly)
npm install

# 3. Configure Firebase
#    Copy the templates and fill in your Firebase web config:
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.development.example.ts src/environments/environment.development.ts
#    Then edit both files with the config from
#    Firebase console → Project settings → General → Your apps.

# 4. Run the dev server
npm start            # → http://localhost:4200
```

### Build & deploy

```bash
# Production build
npm run build        # output: dist/da-bubble/browser

# Deploy to Firebase Hosting (root path)
firebase deploy --only hosting

# Deploy Firestore security rules
firebase deploy --only firestore:rules
```

> For a subfolder host, build with a matching base href, e.g.
> `ng build --configuration production --base-href /da-bubble/browser/`.

## Project structure

```
src/
  app/
    features/      # auth, chat, legal, profile, search
    services/      # Firestore/Auth data access (auth, channel, message, …)
    guards/        # route guards (auth, registration-form)
    models/        # typed data models
    shared/        # reusable presentational components
    app.config.ts  # providers (router, Firebase)
    app.routes.ts  # route definitions
  environments/    # Firebase config (gitignored; see *.example.ts)
  styles/          # SCSS 7-1 architecture + design tokens
public/            # static assets (icons, logos, avatars, emojis, fonts)
firestore.rules    # Firestore security rules
```

## Credits

- Built as a diploma project at the **[Developer Akademie](https://developerakademie.com/)**.
- Icons: **[Material Symbols](https://fonts.google.com/icons)** (Google Fonts).
- Emoji artwork: **[Emojitwo](https://emojitwo.github.io/)**, licensed under
  [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Avatar illustrations provided by the Developer Akademie.

## Authors

- **Yannick Oetelshoven**
- **Jan-Oliver Kämmerer**

## License

Released under the [MIT License](LICENSE).
