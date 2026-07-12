# Design-System — Vibo

> Verbindliche Design-Tokens für das Vibo-Projekt. Beim Bauen werden Farben/Größen **immer über diese Tokens** referenziert (keine Hardcode-Hex, keine Magic Numbers). Ressourcen sind vorgegeben (s. u.) und werden nicht selbst gebaut.
> Quelle: Figma-Farbstile (exakt) + Component-Sheet (Typo-Skala, Button-Zustände ausgelesen).

---

## 1. Farben (exakt aus Figma)

| Figma-Name | Hex | SCSS-Key | Rolle |
|---|---|---|---|
| White | `#FFFFFF` | `white` | Karten-/Flächenhintergrund |
| Bg color | `#ECEEFE` | `bg` | App-Hintergrund, Input-/Hover-Flächen |
| Ligth purple (Lines) | `#ADB0D9` | `lines` | Linien, Rahmen, Trenner |
| Black | `#000000` | `black` | Primärtext, Überschriften |
| Text gray | `#686868` | `text-gray` | Sekundärtext, Placeholder, Disabled |
| Purple 1 | `#444DF2` | `primary` | Primärfarbe: Buttons, aktive Zustände, Akzent |
| Purple 2 | `#797EF3` | `primary-hover` | Heller Akzent / Hover |
| Purple 3 | `#535AF1` | `primary-active` | Aktiv/Pressed-Zustand |
| online green | `#92C83E` | `online` | Online-Status-Indikator |
| Rosa error | `#ED1E79` | `error` | Fehlermeldungen, Validierungsfehler |

```scss
// abstracts/_colors.scss
$colors: (
  white:          #FFFFFF,
  bg:             #ECEEFE,
  lines:          #ADB0D9,
  black:          #000000,
  text-gray:      #686868,
  primary:        #444DF2,
  primary-hover:  #797EF3,
  primary-active: #535AF1,
  online:         #92C83E,
  error:          #ED1E79,
);

@function color($key) {
  @return map-get($colors, $key);
}
```

> Hinweis: Die Zuordnung `primary-hover` / `primary-active` ist aus den Button-Zuständen abgeleitet (heller = Hover). Falls Figma es anders definiert, hier korrigieren – die Hex bleiben dieselben.

---

## 2. Typografie

**Basis: `1rem = 18px`** (nicht 16px!). Damit die rem-Werte zu Figma passen UND die Nutzer-Schriftskalierung respektiert bleibt:

```scss
html { font-size: 112.5%; } // 112.5% von 16px = 18px = 1rem; skaliert mit Browser-Settings
```

**Schrift-Skala (aus dem Component-Sheet ausgelesen):**

| px | rem | empfohlene Rolle |
|---|---|---|
| 46 | 2.556rem | H1 (z. B. „Anmeldung") — **Nunito** |
| 38 | 2.111rem | H2 |
| 32 | 1.778rem | H3 |
| 26 | 1.444rem | H4 |
| 22 | 1.222rem | H5 / große Labels |
| 18 | 1.000rem | Body / Standardtext |
| 15 | 0.833rem | Small / Sekundärtext |
| 12 | 0.667rem | XS / Captions, Zeitstempel |

```scss
$font-sizes: (
  h1: 2.556rem, h2: 2.111rem, h3: 1.778rem, h4: 1.444rem,
  h5: 1.222rem, body: 1rem, sm: 0.833rem, xs: 0.667rem,
);
```

**Font-Familien:**
- **H1 → `Nunito`**
- **Alle anderen Texte (H2–H5, Body, Small, XS, UI/Buttons/Inputs) → `Inter`**

```scss
$font-heading: 'Nunito', sans-serif; // ausschließlich H1
$font-base:    'Inter', sans-serif;  // alles Übrige (Default)

// Default global, H1 überschreibt:
body { font-family: $font-base; }
h1   { font-family: $font-heading; }
```

> Die Rollen-Zuordnung (H1–XS) ist ein sinnvoller Default; die exakte Größe pro Element kommt aus dem jeweiligen Figma-Screen. Schrift-**Familie** ist fix: nur H1 ist Nunito, der Rest Inter.

---

## 3. Buttons (aus Component-Sheet)

Alle Buttons sind **vollständig pill-förmig** (`border-radius` = Höhe/2) mit großzügigem horizontalem Padding; Text fett/semibold; **`cursor: pointer`**; **kein** Standard-Border.

**Primary** (gefüllt, weißer Text)
- Default: `primary` (#444DF2)
- Hover: `primary-hover` (#797EF3)
- Active/Pressed: `primary-active` (#535AF1)
- Disabled: `text-gray` (#686868)

**Secondary** (Outline)
- Default: transparent/weiß, Rand + Text in `primary`
- Hover/Active: gefüllt (`primary-active` / `primary`), weißer Text
- Disabled: Rand + Text in `text-gray`

**Primary mit Icon:** wie Primary, mit führendem Icon (Material Symbol).

**Icon-Buttons:** Icon ohne Fläche; Hover = runde Fläche in `bg` (#ECEEFE) hinter dem Icon.

---

## 4. Inputs & Formulare

- Pill-förmig, Hintergrund `bg` (#ECEEFE), führendes Icon (z. B. Mail/Lock), Placeholder in `text-gray`.
- **Kein** Standard-Border (eigenes Styling).
- **Fehlerzustand:** Fehlermeldung **unter** dem Feld in `error` (#ED1E79); kein HTML5/Alert.
- A11y: jedes Feld mit `<label>` (sichtbar oder visuell versteckt), `aria-describedby` auf die Fehlermeldung, `aria-invalid` im Fehlerfall.
- Button-States enabled/disabled/hover beachten.

---

## 5. Karten, Linien, Radien

- Karten/Modals: Fläche `white`, abgerundete Ecken (groß; exakten Radius pro Screen aus Figma übernehmen).
- Linien/Trenner/Rahmen: `lines` (#ADB0D9).
- App-Hintergrund: `bg` (#ECEEFE).
- Modal-Dialoge: Breiten als Map `$dialog-widths` mit Accessor `dialog-width('key')` — alle aus Figma gemessen (Höhen "hug content"): `default` 872px (Channel erstellen / Leute hinzufügen bei Erstellung / Channel-Einstellungen), `members` 415px, `add-members` 514px, `profile` 500px. Radius `$radius-xl` (32px), Innenabstand `xl-xxl` (40px) bzw. `xl` bei kleinen Dialogen.
- Overlay-Scrim hinter Modals: `$overlay-scrim: rgba(black, 0.3)` (aus Figma verifiziert).
- Dialog-Inputs (abweichend von Auth-Inputs): Fläche `white` mit 1.5px Rahmen in `lines` statt `bg`-Fläche (`.form-input--outlined`).

> Radien und Abstände sind im Sheet nicht bemaßt – exakte Werte pro Screen aus Figma messen.

---

## 6. Status & Indikatoren

- Online: Punkt in `online` (#92C83E).
- Abwesend/Offline: `text-gray` (#686868).

### Chat (Frames 06/09, gemessen)

- Nachrichten-Avatare: `$avatar-message: 70px` (wie Topbar-Avatar, eigener Token wegen eigener Semantik).
- Sprechblasen: Fläche `bg` (fremd) bzw. `primary` mit weißem Text (eigen), Radius `$radius-xl` (32px) mit 0-Ecke zur Avatar-Seite (fremd: oben links, eigen: oben rechts), Innenabstand `md`/`lg`.
- Datums-Trenner: Pill mit 1px-Rahmen in `lines` auf weißem Grund, beidseitige 1px-Linien in `lines`.
- Header-Mitglieder-Avatare: `$avatar-list` (48px) mit 2px weißem Ring, Überlappung `-sm-md` (12px).
- DM-Empty-State (Frame "Direct message"): Avatar `$avatar-hero: 100px` (gemessen ≈98), Name `h4` fett, Hinweistext `body` in `text-gray`, @-Erwähnung in `primary`; DM-Header-Avatar `$avatar-list` (48px) mit Status-Punkt.

---

## 7. Spacing (Default-Skala — pro Screen gegen Figma prüfen)

8px-Basis, als Tokens statt Magic Numbers:

```scss
$space: (
  xs: 4px, sm: 8px, sm-md: 12px, md: 16px,
  lg: 24px, xl: 32px, xl-xxl: 40px, xxl: 48px,
);
```

> `sm-md` (12px) und `xl-xxl` (40px) sind Zwischenschritte, die in aktuellen Figma-Screens vorkommen (App-Shell-Gutter, Input-Icon-Padding, Auth-Card). Sie ergänzen die Default-Skala; bei Bedarf pro Screen gegen Figma prüfen.

> Konsistenz-Regel (DoD): Abstände zwischen Elementen immer gleich groß; Randabstände auf jeder Unterseite gleich.

---

## 8. Vorgegebene Ressourcen (nicht selbst bauen)

- **Icons:** Material Symbols (Google Fonts).
- **Emojis/Reaktionen:** Twemoji Emoji Set (jdecked-Fork, CC-BY 4.0), selbst gehostet als SVG.
- **Avatare:** 6 vorgegebene Illustrationen + neutraler Platzhalter-Avatar; Auswahl bei Registrierung und im Profil.

---

## 9. Reaktions-Limits (aus Checkliste, hier für UI relevant)

- Desktop: max. 20 Reaktionen sichtbar.
- Mobil (+ Desktop-Thread): max. 7 sichtbar + „+ x weitere"-Button.
- Die zwei zuletzt genutzten Emojis direkt in der Aktionsleiste (sonst Standard-Emojis wie in Figma).

---

## 10. Motion (Mikro-Interaktionen)

Tokens in [_variables.scss](src/styles/_variables.scss) (Motion-Block); Reduced-Motion wird
überall respektiert. **Keine Rohwerte** in Komponenten — immer diese Tokens verwenden.

| Token | Wert | Zweck |
|-------|------|-------|
| `$duration-fast` | `150ms` | Hover, Press, kleine State-Wechsel |
| `$duration-base` | `200ms` | Farb-/Layout-Übergänge, Standard |
| `$duration-slow` | `350ms` | Collapse/Expand, größere Flächen |
| `$ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Allgemeine UI-Übergänge (Default) |
| `$ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Eintretende Elemente |
| `$ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Verspielter Pop (Menu-Inflate, `= $menu-inflate-ease`) |
| `$press-scale` | `0.96` | Scale-Ziel des Press-Feedbacks |

- **Transition-Shorthands** `$transition-fast/base/slow` sind aus Dauer + `$ease-standard`
  komponiert → einheitliche Hover-/Übergangs-Kurve app-weit.
- **Press-Feedback:** Mixin `press-feedback` ([_mixins.scss](src/styles/_mixins.scss)) — kurzer
  `scale($press-scale)` auf `:active` (das Element nimmt `transform $transition-fast` in seine
  eigene Transition auf, damit Hintergrund-Übergänge nicht überschrieben werden). Auf `.btn`
  (alle Buttons) und interaktiven Zeilen (`.workspace__item`) aktiv. **Reduced-Motion:** kein
  Scale, nur dezente Opacity-Absenkung.
- Dekorative Ambient-Animationen (Aurora-Banner-Drift, Intro-Splash, Typing-Dots, Lade-Spinner)
  behalten ihre bespoke Dauer — sie sind keine Mikro-Interaktionen und nutzen die Tokens bewusst nicht.
