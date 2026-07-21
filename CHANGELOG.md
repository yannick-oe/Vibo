# Changelog

Alle nennenswerten Änderungen an Vibo, kuratiert nach Feature-Bereichen im Stil von [Keep a Changelog](https://keepachangelog.com/de/) — Details und Begründungen stehen im Entscheidungs-Log [DEVIATIONS.md](DEVIATIONS.md).

## [Unreleased]

## [1.3.0] – 2026-07-21

### Sprachkanäle

- **Mikrofonauswahl im Discord-Stil:** Neuer Bereich „Sprache" in den Einstellungen mit dem Dropdown „Eingabegerät (Mikrofon)" — Systemstandard oder ein konkretes Gerät. Die Wahl gilt pro Gerät (lokal gespeichert, kein Firestore), greift **live mitten im Gespräch** (Trackwechsel ohne Neuverhandlung, die Stummschaltung bleibt erhalten) und fällt sicher auf den Systemstandard zurück, wenn das gespeicherte Mikrofon gerade fehlt — mit einmaligem Hinweis-Toast statt eines stillen Verwerfens der Wahl. Damit folgt Vibo auf dem Mac insbesondere nicht mehr blind einem Continuity-iPhone als Systemmikrofon
- **Hall/Reverb-Härtung:** Das unhörbare Keep-Alive-Audioelement pro Remote-Stream (WebKit-Workaround) ist jetzt beweisbar stumm — `muted` UND Lautstärke 0, erzwungen bei Erzeugung, vor dem Stream-Anhängen und vor jedem Autoplay-Retry. Eine Doppelwiedergabe neben dem WebAudio-Mixer als Hall-Quelle ist damit strukturell ausgeschlossen; Echo-Unterdrückung, Rauschunterdrückung und automatische Pegelung der Aufnahme bleiben bewusst aktiv

### Dokumentation

- README: Screenshot-Platzhalter entfernt (Entscheidung: keine Screenshots im Repo) und die Mikrofonauswahl ergänzt; die Begründung der Aufnahme-Constraints und der Gerätewahl steht datiert in DEVIATIONS.md

## [1.2.0] – 2026-07-20

### Status & Präsenz

- **Manueller Status im Discord-Stil:** Über die Statuszeile im eigenen Profil lassen sich vier Zustände wählen — Online, Abwesend, Beschäftigt („Benachrichtigungstöne sind aus.") und Unsichtbar („Du wirst als offline angezeigt."). Die manuelle Wahl ist sticky: Sie gilt über Sitzungen und Geräte hinweg, bis sie geändert wird; automatische Übergänge überschreiben sie nie
- **Status-Punkte mit Form UND Farbe:** Online = gefüllter Punkt, Abwesend = Mond, Beschäftigt = Querbalken, Offline/Unsichtbar = hohler Ring — überall einheitlich (Seitenleiste, Mitgliederlisten, Chat-Kopf, Topbar, Suche, Freunde), mit deutschen Screenreader-Labels und AA-geprüften Farben in beiden Themes
- **Beschäftigt schaltet die Benachrichtigungstöne stumm** — Glocke, Badge und Listen aktualisieren unverändert weiter
- **Automatisch offline nach 60 Minuten Inaktivität** (ohne manuelle Wahl): Nach 5 Minuten Inaktivität Abwesend, nach 60 Minuten Offline — ohne einen einzigen zusätzlichen Schreibvorgang

### Fixes

- **Registrierungshinweis ohne Layout-Sprung:** Der Benutzernamen-Hinweis ist gekürzt („Nur Buchstaben, Zahlen, Punkt und Unterstrich.") und der reservierte Meldungsbereich unter den Formularfeldern auf den Worst Case von zwei Zeilen bei 320 px dimensioniert — beim Tippen verschiebt sich nichts mehr
- **Auth-Formulare reservieren ihre Fehlerzeilen konsequent:** Die allgemeinen Fehlermeldungen (Login, Passwort vergessen/zurücksetzen, Avatar-Schritt, Verifizierung) erscheinen in fest reservierten Bereichen; auf schmalen Viewports rücken sie auf eine eigene volle Zeile statt neben den Button
- **Temporäres Auth-Diagnose-Panel entfernt:** Nach der Abnahme des Verifizierungs-Flows sind Diagnose-Dienst, Panel und das `vibo:auth-debug`-Flag vollständig ausgebaut — die selbstheilenden Datenströme bleiben unverändert

## [1.1.3] – 2026-07-20

### Konto & Sicherheit

- **Verifizierung jetzt zuverlässig nach dem Mail-Klick:** Nach bestätigter E-Mail wird die App über einen vollständigen Seiten-Neustart betreten — Wächter, Dienste und alle Datenströme starten garantiert auf dem frischen Auth-Token; der eingefrorene Tab (Nutzer „Unbekannt", Nachrichten nicht ladbar) kann strukturell nicht mehr entstehen
- **Robustere Datenströme:** Reißt ein Firestore-Live-Stream ab (z. B. durch ein veraltetes Token), fängt er sich jetzt selbst wieder — beim nächsten Token-Ereignis wird er automatisch neu verbunden, statt bis zum Neuladen dunkel zu bleiben
- **Korrigierter Benutzernamen-Hinweis:** Die Registrierung sagt jetzt „Nur Buchstaben, Zahlen, Punkt und Unterstrich — ohne Leerzeichen." — Großbuchstaben sind für den Anzeigenamen erlaubt, das @-Handle bleibt kleingeschrieben

## [1.1.2] – 2026-07-20

### Konto & Sicherheit

- **Bestätigungslink repariert — endgültig:** Der Link aus der Verifizierungs-E-Mail führt jetzt auf die Bestätigungsseite statt direkt in die App; dort wird die Bestätigung automatisch geprüft („Bestätigung wird geprüft…") und die App erst betreten, wenn das frische Auth-Token nachweislich vorliegt — der eingefrorene Tab (alle Nutzer „Unbekannt", Nachrichten nicht ladbar) ist damit behoben
- **Keine Fehlermeldung mehr bei der Registrierung:** Der irreführende Toast „Benutzer konnten nicht geladen werden." während einer sauberen Konto-Erstellung ist beseitigt — die Nutzerliste startet erst nach bestätigter E-Mail-Adresse
- **Passwort ändern rund gemacht:** Nach erfolgreicher Änderung schließt sich der Dialog von selbst und ein Toast bestätigt „Passwort erfolgreich geändert." — Fehler erscheinen weiterhin direkt im Dialog

## [1.1.1] – 2026-07-19

### Konto & Sicherheit

- **Verifizierungs-Fix nach Mail-Link:** Der Tab aus dem Bestätigungslink lud die App mit einem veralteten Auth-Token (alle Firestore-Reads abgelehnt, Nutzer als „Unbekannt“) — der Auth-Guard prüft jetzt einmal pro Sitzung das Token-Claim `email_verified` und erzwingt bei Bedarf einen Token-Refresh, bevor die App lädt
- **Benutzername behält Schreibweise:** Neue Konten übernehmen den Benutzernamen in der eingegebenen Groß-/Kleinschreibung als Anzeigenamen; das @-Handle und die Eindeutigkeitsprüfung bleiben kleingeschrieben
- **Passwort-Dialog entkoppelt:** „Passwort ändern“ öffnet sich jetzt als eigener Dialog aus einer Konto-Zeile in den Einstellungen — der Einstellungs-Dialog bleibt schlank, Validierung und Fehlermeldungen unverändert
- Die Abmeldung wartet nicht mehr auf den Offline-Status-Schreibvorgang — ausloggen funktioniert damit auch offline sofort

## [1.1.0] – 2026-07-19

### Konto & Sicherheit

- **E-Mail-Verifizierung** für neue Konten: Bestätigungslink per E-Mail, eigene Bestätigungsseite mit Spam-Ordner-Hinweis und erneutem Senden (60-Sekunden-Cooldown) — serverseitig in den Security Rules erzwungen (`email_verified` im Auth-Token, Token-Refresh direkt nach der Bestätigung), der Gastzugang bleibt bewusst ausgenommen; Bestandskonten werden beim nächsten Login sanft auf die Bestätigungsseite geleitet
- **Passwort-Mindestlänge 8 Zeichen**, live gegen die Firebase-Passwort-Policy geprüft (SDK `validatePassword`) — einheitlich bei Registrierung, Passwort-Zurücksetzen und Passwort-Änderung, inklusive Abfangen der serverseitigen Policy-Ablehnung
- Neuer Bereich **„Passwort ändern"** in den Einstellungen: Re-Authentifizierung mit dem aktuellen Passwort, spezifische deutsche Fehlermeldungen (falsches aktuelles Passwort, zu kurzes neues Passwort, abweichende Wiederholung, erneute Anmeldung nötig), Erfolgsbestätigung mit geleerten Feldern — für das Gastkonto und reine Google-Konten ausgeblendet

### Sprachkanäle

- **Pro-Nutzer-Lautstärke (0–200 %)** über ein ⋮-Menü an jeder fremden Teilnehmerzeile: Wiedergabe läuft jetzt durch einen WebAudio-GainNode pro Peer (kurze Rampe gegen Knacksen), dazu **lokales Stummschalten** (Lautstärke bleibt darunter erhalten) und „Zurücksetzen" auf 100 %
- Die Einstellung wird **lokal gespeichert** (localStorage pro Nutzer) und greift automatisch wieder, sobald der Stream des Peers erneut ankommt — null Firestore-Writes

### Chat

- **Emoticon-Auto-Umwandlung** beim Tippen: `:)` `;)` `:D` `:P` `:(` `<3` `xD` `8)` u. a. werden an Wortgrenzen (Leertaste oder Senden) zum Emoji — innerhalb von Wörtern und URLs (`https://…`) passiert nichts, und Backspace direkt nach der Umwandlung stellt das getippte Emoticon wieder her
- **„:kurzname"-Emoji-Vorschläge** im Composer: ab zwei getippten Zeichen öffnet ein Dropdown mit deutschen Emoji-Namen und Twemoji-Grafiken (max. 8 Treffer, Tastatursteuerung wie bei @-Erwähnungen), die Auswahl fügt das Emoji direkt ein — vollständig clientseitig aus dem selbst gehosteten Katalog

## [1.0.0] – 2026-07-19

### Chat & Ergonomie

- Echtzeit-Channels, Direktnachrichten und Threads mit denormalisierten Thread-Vorschauen (Reply-Anzahl und letzte Antwort ohne zusätzliche Reads)
- Nachrichten bearbeiten (15-Minuten-Fenster, auch in den Security Rules erzwungen) und löschen — „Für mich" / „Für alle" mit WhatsApp-artigem Tombstone
- Emoji-Reaktionen mit Picker, Schnellreaktionen und „Wer hat reagiert"-Tooltip plus große Reaktionen mit Fullscreen-Effekten (Konfetti, Herzen, Rakete u. a.)
- Inline-Antworten mit Zitat-Snapshot, @Erwähnungen mit Hervorhebung, Aktivitäts-Benachrichtigungen über Glocke und Toast (senderseitiger Fan-out, ein schmaler Listener pro Nutzer)
- Lesebestätigungen im WhatsApp-Stil samt „Gelesen von"-Liste, Tipp-Indikator, Ungelesen-Badges, „Neu"-Trenner und Entwurfs-Speicherung pro Unterhaltung
- Beitritts-Systemnachrichten mit Winken-Button

### Performance & Windowing

- Gefensterte Nachrichtenströme: ein Live-Listener über die neueste Seite, ältere Historie als One-Shot-Seiten beim Hochscrollen (Sentinel-Pagination)
- Ladeskelette mit Schimmer-Effekt in Chat, Freunde-Ansicht und Benachrichtigungen
- Subsettete, vorab geladene Fonts und priorisiertes Intro-Logo für den LCP
- Statische WebP-Standbilder für Avatare auf Listenflächen, Hover-to-Play nur wo es zählt
- Giphy-Embeds als byte-sparende Fixed-Width-WebP-Renditionen (gemessen bis −91 % pro GIF)
- Lighthouse-Finalwerte: Desktop 99 / 100 / 100 / 100, dokumentierte Trade-offs in DEVIATIONS.md

### Motion & View Transitions

- Zentrale Motion-Tokens (Dauern, Easings, Press-Feedback) für einheitliche Mikro-Interaktionen
- Scoped View Transitions als Cross-Fade bei Routenwechseln
- FLIP-animierte Sidebar-Reorders bei Recency-Sortierung der Direktnachrichten
- Einmalige Eintritts-Animation nur für echt neue Nachrichten (Wall-Clock-Baseline, CLS 0)
- `prefers-reduced-motion` überall respektiert — Effekte entfallen, Funktionen bleiben

### Sound-Design

- Zentrale Web-Audio-Engine: alle UI-Sounds werden zur Laufzeit synthetisiert, kein einziges UI-Sound-Asset im Bundle
- Code-generierter Convolver-Reverb für die melodischen Klänge
- Einstellungs-Dialog mit Master-Toggle, eigenem Lautstärke-Slider samt Vorhören und Opt-in-Seitenleisten-Sound
- Voice-Join- und Voice-Leave-Chimes in derselben Palette

### Social, Einladungen & Vanity-Slugs

- Freundschaftssystem: Anfragen senden/annehmen/ablehnen, Entfreunden und Blockieren (friert die Unterhaltung beidseitig ein, auch in den Rules)
- Freunde-Ansicht im Discord-Stil mit Tabs „Alle"/„Anfragen" und integrierter Nutzersuche
- Eindeutige, unveränderliche Usernames über das atomare Reservierungsmuster
- Ablaufende Channel-Einladungslinks (Token = Zugriffsnachweis) mit Widerruf und Einlöse-Seite
- Vanity-Slugs für Einladungen (…/#/invite/cozy-vibes) — Eindeutigkeit über dasselbe Reservierungsmuster, null Reads beim Tippen

### Navigation & Präsenz

- ⌘K/Strg+K-Befehlspalette (lazy geladen) mit Recency-Ranking der Freunde-DMs
- Globale Suche über zugängliche Channels und eigene Unterhaltungen
- Live-Präsenz online/abwesend/offline mit gemeinsamem Presence-Dot auf allen Flächen
- Scroll-to-Latest-Button in Nachrichtenliste und Thread
- Mobile Navigation mit getrennten Vollbild-Ansichten und Bottom-Sheets mit echter Drag-Physik

### Pins, Markdown & Embeds

- Nachrichten anpinnen mit universellem Optionsmenü und Pin-Dialog im Header; das Pin-Badge zeigt nur ungesehene Pins
- Markdown (fett/kursiv, Listen, Zitate, Links) mit syntaxhervorgehobenen Codeblöcken inkl. Copy-Button
- ||Spoiler||-Runs mit maskierten Vorschauen
- YouTube-Embeds als Click-to-Play-Fassade — vor dem Klick lädt nur das Thumbnail

### PWA

- Installierbar mit Manifest, Icons und Angular Service Worker
- Bereits besuchte Views funktionieren offline (Firestore-Offline-Persistenz, Multi-Tab)
- Update-Flow ohne Zwangs-Reload: Toast „Neue Version verfügbar" mit Aktion „Neu laden"
- Das ~8 MB große Twemoji-Set wird nie vorgeladen, sondern Emoji für Emoji beim Gebrauch gecacht

### Sprachkanäle & Screen-Sharing

- Persistente Voice-Channels im Discord-Stil — Audio strikt Peer-to-Peer (Vollvernetzung bis 5 Teilnehmer, DTLS-SRTP); Firestore transportiert ausschließlich Presence und Signaling, niemals Medien
- Stereo-Opus mit Forward Error Correction und einer VBR-Obergrenze von 384 kbit/s
- Screen-Sharing über Renegotiation auf derselben Mesh (ein Sharer pro Kanal, scharfer Text via `maintain-resolution`), Viewer-Dialog mit Fullscreen
- Mute/Deafen mit Discord-Paritäts-Verhalten, lokale Speaking-Erkennung ohne Firestore-Writes
- Creator-only Umbenennen und Löschen leerer Kanäle

### Soundboard

- Zehn kuratierte, loudness-normalisierte MP3-Presets (u. a. Woah, Drumroll, Evil Laugh) ersetzen die früheren synthetisierten Presets und Custom-Uploads
- Presets werden lazy geladen und pro Session gecacht; ausgelöst wird per kurzlebigem Signal mit Sound-Kennung — Audiodaten fließen nie durch Firestore
- Empfangsseitiges Gate gegen Sound-Spam bleibt aktiv

### GIFs & Favoriten

- Giphy-GIF-Picker mit `rating=pg-13` auf jedem einzelnen Request
- Persistente Kategorie-Chips („Favoriten", „Angesagt", zehn kuratierte Begriffe) über einem großen Masonry-Grid — Öffnen kostet genau einen Giphy-Request, Sentinel-Nachladen in 24er-Seiten bis 96 Ergebnisse
- GIF-Favoriten per Stern: ein Firestore-Dokument pro Nutzer, One-Shot gelesen und pro Session gecacht
- Dauerhaft sichtbare „Powered by GIPHY"-Attribution in jedem Zustand des Pickers
- Versendete GIFs rendern als byte-sparende WebP-Rendition mit reserviertem Seitenverhältnis (CLS 0)

### Recht & Dokumentation

- Österreichisches Impressum und DSGVO-Datenschutzerklärung als eigene Seiten mit vollständiger Datenaufzählung (inkl. YouTube-Fassade, Soundboard und Giphy)
- Portfolio-README auf Deutsch mit Architektur-Highlights und Listener-Inventar
- Laufend gepflegtes Entscheidungs-Log DEVIATIONS.md mit datierten Einträgen
- Markdownlint-Konfiguration über alle getrackten Markdown-Dateien
