# Crumbs 0.6.2 · UX-Audit (2026-10-10)

Auftrag: jeden Screen prüfen, bis ein Nutzer sagt "Endlich. Einfache Software, die mir Arbeit abnimmt."
Grundlage: Code in `crumbs/dist` (index.html, app.js, business.js, access.js, view.js, style.css), laufende Preview
`crumbs/test/preview.mjs` mit Beispieldaten (Rollen admin / viewer / manager, leerer Zustand), gemessene DOM-Werte,
Screenshots bei 960 px und 375 px. Styleguide: `design/STANDARD.md` (Abstände 4/8/12/16/24/32, Karten 16 px Radius,
Controls 8 px, 24 px Panel-Innenabstand, Controls 44 px).

Kontext (angenommen, bitte korrigieren): Crumbs ist die cookielose Web-Analyse für die eigenen Websites.
Nutzer: eine IT-Person (richtet ein, vergibt Zugang) und Marketing/Management (schaut wöchentlich, unter Zeitdruck,
ohne Analytics-Vorwissen). Die fünf häufigsten Aufgaben:
1. "Wie läuft die Website diese Woche?" (Besucher, Quellen, Seiten)
2. Neue Website anlegen und Tracking zum Laufen bringen
3. Hat eine Kampagne/Quelle Anmeldungen gebracht? (Ziel + Herkunft)
4. Einer Kollegin Zugang zu den Berichten geben
5. Einen Bericht teilen oder ein Tool anbinden (Link, API-Key, Looker)

---

## Phase 1 · Inventar

| # | Screen / Zustand | Route | Sichtbar für |
|---|---|---|---|
| 1 | Sign-in (Hub-Ticket, Status "Checking your session…", Fehlerhinweis) | kein Hash | alle |
| 2 | Leerer Zustand Admin "Add your first website" | jede Route ohne Website | Admin |
| 3 | Leerer Zustand Viewer "No websites shared with you yet" + Back to Hub | dito | Viewer |
| 4 | Overview: 5 Kennzahlenkarten, Hinweis-Disclosure, Aktivitätszeile, Chart (Metric-Select, Realtime-Button, Datentabelle-Disclosure), Pages / Sources / Countries / Devices, "More details" mit 14 Dimensionen | `#/overview` | alle |
| 5 | Acquisition: Gruppierungs-Select (9), Export CSV, Tabelle, Google-Search-Console-Panel (Connect & refresh, Checkbox Suchbegriffe, Search terms / Search landing pages Disclosures) | `#/acquisition` | alle |
| 6 | Goals & revenue: Ziele (Add goal, 3 Quick goals, Formular Name / Track a / Depth / Wert), Zielzeilen mit Remove, Conversion funnel (Schritte, Add step, Analyze funnel), Revenue (Attribute-Select, Tabelle, Setup-Disclosure mit Code) | `#/goals` | alle; Bearbeiten ab Manage |
| 7 | Journeys: Übergangsliste | `#/journeys` | alle |
| 8 | History: importierte Plausible-Daten, Import-Anleitung | `#/history` | alle |
| 9 | All websites: Summenkacheln, Liste, Add website | `#/all` | alle; Add nur Admin |
| 10 | Add website: Formular (Name, Domain, Keep events for, Collection enabled, Advanced: Allowed properties, Exclude paths), Create / Cancel | `#/new` | Admin |
| 11 | Settings · General: gleiches Formular + Website-ID + Danger-Disclosure "Delete this website" | `#/settings/general` | Manage, Admin |
| 12 | Settings · Tracking script: Snippet, Copy, "Visits missing?"-Anleitung, "Advanced: collection endpoint" | `#/settings/tracking` | Manage, Admin |
| 13 | Settings · People & access: Mitgliederliste, Suche, Rolle pro Person, Save access | `#/settings/access` | Manage, Admin |
| 14 | Settings · Search Console: 3-Schritt-Anleitung, OAuth client ID, Property, Save / Disconnect | `#/settings/search` | Manage, Admin |
| 15 | API & exports: Links, Key-Formular (Name, Access, Expires), Key-Liste mit Revoke, Export events, Collection health (Admin) | `#/api` | Manage, Admin |
| 16 | Dialog "Discard unsaved changes?" / "Delete X?" / "Revoke X?" / "Remove X?" / "Disconnect Search Console?" | `<dialog id=confirmDialog>` | – |
| 17 | Saved filters: Disclosure mit Select, Save filters, Manage saved, Formular (Name, Include funnel), Liste mit Remove | in der Berichtsleiste | alle; Speichern ab Manage |
| 18 | Custom dates: Formular From / Through / Apply | Period = Custom | alle |
| 19 | Zustände: Laden ("Loading…"), Fehler-Banner `#notice`, "Report exceeds tested capacity", Retention-Hinweis, "Showing the top results", Tabellen leer ("No data…") | – | – |
| 20 | Geteilter Bericht `shared.html` (Kennzahlen, Tageschart, Top pages, Sources, Zugangsprüfung) | separate Seite, Key im Hash | öffentlich mit Link |
| 21 | `api.html`, `integrations.html`, `privacy.html` | separate Seiten | öffentlich |

Vollständigkeit: Routen und `index.html` sind vollständig erfasst (alle `#/`-Pfade in `route()`, alle `.view`-Sektionen,
der einzige Dialog). Nicht gerendert gesehen: Seite 20 und 21 (die Preview liefert sie als Rohtext aus, also nur im
Markup geprüft), die echte Google-OAuth-Sequenz, Realtime mit echten Daten, die Hub-Topbar-Menüs (geteilte Komponente).

---

## Phase 2 · Prozesse

Zählung: Screens / Klicks / Pflichtfelder / Entscheidungen / Kontextwechsel / Merken-müssen.

**1. Wochenblick.** Ist: 1 Screen, 2 Klicks (Period → "Last 7 days"), 0 Felder, 1 Entscheidung, 0 Kontextwechsel,
1 Merken (die Einstellung geht beim nächsten Öffnen verloren, `setPeriod(30)` beim Start). Tagesgrenzen sind UTC,
nicht Schweizer Zeit: der Montag im Chart ist nicht der Montag im Kalender. Minimalweg: 0 Klicks. Die App merkt sich
Zeitraum und Website pro Person; Tage laufen in der Firmen-Zeitzone; die Kennzahlen zeigen Pfeile statt "0.0 %".

**2. Website anlegen.** Ist: 4 Screens (All websites → Add website → Tracking script → Overview), 9 Klicks, 2 Pflichtfelder
(Name, Domain), 4 Entscheidungen (Name, Retention, Collection enabled, Advanced), 1 Kontextwechsel (Snippet in die Website
einbauen), 1 Merken (Advanced-Einstellungen, Website-ID). Danach Zugang unter People & access separat. Minimalweg: 1 Feld
(Domain). Name = Domain, Retention = Standard, Sammeln = an. Nach "Create" direkt das Snippet und eine Live-Anzeige
"Warten auf den ersten Seitenaufruf …", die grün wird, sobald Daten kommen; "Visits missing?" nur, wenn nach dem Einbau
nichts kommt.

**3. Kampagne → Anmeldungen.** Ist: 3 Screens (Goals → Add goal → Save; Acquisition; zurück zu Goals mit Filter), 8 Klicks,
2 Pflichtfelder (Name, Wert), 3 Entscheidungen (Track a / Wert / Group by), 0 Kontextwechsel, 2 Merken (die Quelle als
Filter setzen, dann die Zielzahl im anderen Tab lesen). Grund: die Acquisition-Tabelle zeigt Scroll und Revenue, aber keine
Zielabschlüsse; Zielzahlen pro Quelle gibt es nur über den Umweg Filter. Minimalweg: Quick goal "Form submissions" ist ein
Klick (heute: Klick + Formular + Save); Acquisition hat eine Spalte pro Ziel (Conversions).

**4. Zugang geben.** Ist: 2 Screens, 5 Klicks, 1 Feld (Suche, mind. 2 Zeichen), 1 Entscheidung (Read/Manage), 0–1
Kontextwechsel (wenn die Person in Hub noch keinen Crumbs-Zugang hat: "enable Crumbs in Hub first", ohne Link).
Minimalweg: gleich; der Hub-Link fehlt, und "Read" sollte vorausgewählt sein statt "Choose access…".

**5. Bericht teilen / Tool anbinden.** Ist: 1 Screen (API & exports), 5 Klicks, 2 Pflichtfelder (Name, Expires after days),
1 Entscheidung (Access: Read reports / Manage website content / Share a read-only dashboard), 1 Merken (das Ablaufdatum;
nach 30 Tagen bricht die Looker-Anbindung ohne Vorwarnung). Minimalweg: "Share report" als Aktion im Berichtskopf mit
vorbelegtem Namen und Ablauf; API-Keys bleiben unter API; ein Ablauf-Hinweis 7 Tage vorher als Hub-Benachrichtigung.

Wichtigster Befund: Die App zeigt gute Zahlen, aber jede wiederkehrende Aufgabe verlangt dieselben Vorentscheidungen
(Zeitraum, Website, Tab) neu, und die Frage "hat es gebracht?" (Quelle × Ziel) ist nicht direkt beantwortbar.

---

## Phase 3 / 4 · Befunde pro Screen

Schwere: **B** = Blocker, **T** = stört täglich, **S** = Schönheitsfehler.

### Kopf, Navigation, Berichtsleiste (alle Screens)

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| H1 "Website analytics" + Select "Website" | Die Seite heißt wie die App, die Website steht im Dropdown; bei Handy-Breite ist der Name abgeschnitten ("Example website · exa…") | Man sieht nicht auf einen Blick, welche Website man anschaut | H1 = Website-Name (Domain als Untertitel), Wechsel über ein Menü; "All websites" als Eintrag im selben Menü | T |
| Tabs (7) inkl. "History", "API & exports" | "History" ist für alle ohne Plausible-Import leer; mobile zeigen die Tabs nur 3 von 7, der Rest ist nur per unsichtbarem Horizontalscroll erreichbar (gemessen: "Settings" bei x = 565 px in 375 px Breite) | Leerer Tab täglich im Weg; am Handy sind Settings und API nicht auffindbar | "History" nur zeigen, wenn Importe existieren, sonst unter Settings → Import; mobile Tabs umbrechen oder als Select | T |
| Period-Select | Zeitraum und Website werden nicht gemerkt; Standard 30 Tage | Wöchentliche Nutzer stellen jedes Mal um | Letzte Wahl pro Person speichern (localStorage), Standard "Last 7 days" | T |
| "UTC"-Marke | Tage sind UTC-Tage; die Website-Zeitzone ist fest UTC (`timezone:'UTC'` im Site-Objekt) | Tageswerte stimmen nicht mit dem Kalender des Nutzers überein, Vergleiche mit anderen Tools gehen schief | Zeitzone pro Website (Standard: Firmen-Zeitzone aus dem Hub); Tages-Buckets im Backend danach bilden; Marke zeigt "Europe/Zurich" | B |
| "Saved filters" Disclosure mit Select + "Save filters" + "Manage saved" | Drei Controls für eine seltene Funktion, Select-Platzhalter wiederholt den Summary-Text | Lenkt ab, bringt nichts her | Ein Menü "Saved views" mit Liste, "Save current" und "Manage" als Zeilen; nur zeigen, wenn Filter aktiv oder Gespeichertes existiert | S |
| Filterchips (`#filters`) | Chip-Text "Source: Google" ok; kein Hinweis, dass Tabellenzeilen filtern | Nutzer entdecken das Filtern nicht | Hover-Text und ein kleines Filter-Icon an klickbaren Zeilen | S |

### Overview

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Kennzahlenkarten | "0.0% vs previous period" als Text; in "Bounce rate" bricht "0.0 pp vs previous period" auf zwei Zeilen, Karten laufen auseinander (gemessen 137 px Höhe, Textbaseline versetzt) | Vergleich ist nicht auf einen Blick lesbar; Karten sehen unsauber aus | Delta als "▲ 12 %" in einer Zeile, Farbe nach Richtung (Bounce invers); kurze Form "vs prev." | T |
| Aktivitätszeile "612 custom events · 74% average scroll depth · CHF 2,450.00 revenue" | 12 px Fließtext unter einer Disclosure; die Umsatzzahl ist die geschäftlich wichtigste Zahl des Screens | Wird überlesen | Drei weitere Karten (Events, Scroll, Revenue) oder Revenue als erste Karte, wenn Umsatz erfasst wird | T |
| "What do these numbers mean?" Disclosure | Steht zwischen Karten und Chart | Zerreißt den Screen | Hinter ein "i" an den Kartenlabels | S |
| Chart | Keine Datumsachse (nur Von/Bis in der Caption), 10 px Achsenbeschriftung, kein Hover-Wert | Man sieht nicht, an welchem Tag der Ausschlag war | X-Achse mit Wochentag/Datum, Hover-Tooltip, Vergleichslinie Vorperiode | T |
| Button "4,286 visitors in the last 5 minutes" | Als Link unterstrichen, schaltet aber den Zeitraum auf Realtime um; Zahl wirkt wie eine weitere Kennzahl | Überraschender Kontextwechsel | Kleiner Live-Badge "● 12 online" mit Tooltip; Realtime bleibt im Period-Select | S |
| Pages / Sources / Countries / Devices | Zeilen sind Filter-Buttons mit Balken, aber ohne Affordanz; Countries zeigt ISO-Codes ("CH, DE") | Ländercodes sind Datenbanksprache | Ländernamen (Intl.DisplayNames) mit Flagge; Zeilen mit Hover-Zustand | T |
| Zwei Benennungen für dasselbe | Overview: "Direct / none" (`view.js`), Acquisition/Revenue: "Direct / unknown" (`business.js`) | Gleicher Begriff, zwei Namen | Ein Begriff überall: "Direct / unknown" | S |
| "More details" Select (14 Dimensionen, Standard Channels) | Doppelt mit Acquisition; Control rechts im Panelkopf, während der Metric-Select im Chartkopf links inline steht | Zwei Platzierungen für dieselbe Control-Art | Panelkopf-Controls einheitlich rechts; Standard "Entry pages" (nicht in Acquisition) | S |

### Acquisition

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Tabelle (Visitors, Visits, Pageviews, Events, Scroll, Revenue) | Keine Zielabschlüsse pro Quelle; "Scroll" pro Kanal ist gleichförmig und ohne Aussage | Die Kernfrage "welche Quelle bringt Anmeldungen" ist nicht beantwortbar | Spalten: Visitors, Visits, Conversions (gewähltes Ziel), Rate, Revenue; Scroll in "More details" | B |
| Zeilenlabels unterstrichen | Sehen aus wie Links, setzen aber einen Filter und reduzieren die Tabelle auf eine Zeile | Nutzer erwartet eine Detailseite | Gleiche Zeilenoptik wie Overview (Balken), Filter-Icon | S |
| Google-Search-Console-Panel | Vor der Einrichtung ist "Connect Google & refresh" der größte Primärbutton des Screens; zwei Absätze Warnungen; Klick führt zur Fehlermeldung "Connect … under Settings" | Setup-Mechanik auf einem Berichtsscreen | Nicht verbunden: eine Zeile "Search Console not connected · Set up (Settings)"; verbunden: Kennzahlen + "Refresh" sekundär | T |
| "Export report" | Exportiert nur diese Tabelle als CSV, Dateiname `<site>-acquisition.csv` | Ok | – | – |

### Goals & revenue

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Quick goals (Downloads, Outbound clicks, Form submissions) | Befüllen nur das Formular; es braucht trotzdem "Save goal" | Zwei Schritte für eine Ein-Klick-Sache | Quick goal legt das Ziel direkt an (mit Undo im Toast) | T |
| Formular "Track a" (Page visit / Custom event / Scroll depth) + "Page path"/"Event name" | Ok, aber Wert-Platzhalter "/thank-you" ist das einzige Beispiel; keine Vorschläge aus den echten Seiten/Events | Nutzer tippt Pfade aus dem Kopf | Autovervollständigung aus den letzten 30 Tagen (Pfade, Eventnamen) | T |
| Zielzeile "246 visitors · 290 completions · 5.7%" | Drei Zahlen in einer Zeile ohne Spaltenstruktur | Schwer zu vergleichen bei mehreren Zielen | Tabelle mit Spalten Visitors / Completions / Rate / Trend | S |
| Conversion funnel | Ergebnis nur nach "Analyze funnel"; Speichern nur über "Saved filters → Include current funnel steps" | Versteckte Kopplung; jedes Öffnen beginnt leer | Funnel speichern direkt im Panel ("Save funnel"), gespeicherte Funnels als Liste; Analyse automatisch bei vollständigen Schritten | T |
| Revenue-Panel | "Attribute revenue to"-Select links, Summe rechts, Setup-Code in Disclosure | Ok; Setup gehört zu Settings/Tracking | Setup-Disclosure nach Settings → Tracking verschieben | S |

### Journeys, History

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| "(entry) → /" | Interne Notation | Unverständlich | "Entry → Home (/)", Pfadtitel aus Pageview-Titeln, falls erfasst | S |
| Journeys ohne Startseite-Wahl | Man kann keinen Startpunkt wählen | Für Trichteranalysen nutzlos | "Starting from" (Pfad) + Tiefe 2–3 | T |
| History für alle sichtbar | Leer ohne Import | Toter Tab | siehe Navigation | T |

### All websites, Add website

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Summenkacheln | Label und Zahl inline ohne Abstand ("Site visitor estimates4,286"), andere Kachelstruktur als die Overview-Karten (`<span>`+`<strong>` statt `.subtle`/`.value`-Blöcke) | Sieht kaputt aus | Dieselbe `metricCards`-Komponente wie Overview | S |
| "Add website" nur hier und im Leerzustand | Zweite Website anlegen = erst "All websites" finden | Versteckt | "Add website" ins Website-Menü | T |
| Add-website-Formular | 2 Pflichtfelder, dazu Retention, "Collection enabled", Advanced; "Your access: Administrator" über dem Formular | Fragen, die beim Anlegen niemand beantworten muss | Nur Domain (Name vorbelegt aus Domain, änderbar); Rest unter Settings | T |
| "Keep events for" als Zahlenfeld in Tagen (1–1827) | Freitext für eine Auswahl | Niemand weiß, ob 365 oder 730 richtig ist | Select: 6 Monate / 1 Jahr / 2 Jahre / 5 Jahre | S |
| "Collection enabled" Checkbox zwischen Setup-Feldern | Ein Pausenschalter im Stammdatenformular | Wird für ein Setup-Feld gehalten | Schalter "Collection paused" mit Statuszeile oben in Settings | S |
| Domain-Hinweis "including www if applicable" | Nutzer muss wissen, wie Besucher die Site aufrufen | Rätsel | Eingabe normalisieren und beide Hostnamen (mit/ohne www) akzeptieren, Hinweis entfällt | T |

### Settings · Tracking script, People & access, Search Console

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Tracking: Snippet + "Visits missing?"-Anleitung | Keine Rückmeldung, ob das Snippet schon Daten liefert | Nutzer baut ein, geht zur Overview, sieht nichts, rät | Live-Status "Last pageview received: …" / "Waiting for the first pageview" direkt unter dem Snippet | T |
| "Advanced: collection endpoint" | Ein URL-Feld, das die Snippet-Quelle ändert | Riskant, selten | Nur für Admin, mit Erklärung "Node collector" | S |
| People & access: Rolle "Choose access…" | Nach der Suche muss man pro Person erst die Rolle wählen | Ein Klick mehr pro Person | "Read" vorausgewählt; "Manage" als Umschalter | S |
| "enable Crumbs in Hub first" | Kein Link in den Hub | Kontextwechsel ohne Ziel | Direktlink auf Hub → Apps → Crumbs → Zugang | T |
| Search Console: 3 Schritte + Client ID + Property | IT-Setup auf einer Manager-Seite; "Testing-mode OAuth apps need the account on their test-user list" | Einmalig, aber dicht | Als Assistent mit Prüfschritt "Verbindung testen"; nur Admin | S |

### API & exports

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Key-Formular (Name Pflicht, Access, Expires 30 Tage) | Teilen eines Berichts ist dieselbe Mechanik wie API-Keys; 30 Tage Ablauf ohne Erinnerung; Name ohne Vorbelegung | Geteilte Links und Looker-Keys brechen still | "Share report" als Kopf-Aktion mit Vorbelegung ("Report for Marketing", 90 Tage); Ablaufhinweis 7 Tage vorher via Hub; API-Keys bleiben hier | T |
| Key-Liste | Zeigt "expires 2026-11-09" ohne Warnfarbe | Ablauf wird übersehen | "expires in 6 days" mit Warnfarbe ab 14 Tagen | S |
| Export events (JSON, 100k) | Ok für IT | – | – | – |

### Zustände

| Zustand | Problem | Vorschlag | Schwere |
|---|---|---|---|
| Laden | "Loading…" als Textzeile, Panels leer | Skeleton-Karten, Panelköpfe bleiben stehen | S |
| Fehler "Report exceeds tested capacity" | Rohtext | "This period has too many events for a live report. Choose a shorter period or export." | S |
| Leer (Admin) | Karte 450 px breit, Rest der Seite leer | Zentriert, mit den drei Schritten (Website anlegen → Snippet → erste Daten) | S |
| Leer (Viewer) | Ok ("Ask a website manager…") | – | – |

### Visuell (gemessen in `style.css` und DOM)

- Abstandsskala weicht vom Standard ab: `.panel{padding:23px}` (Standard 24), `.panel-heading{margin-bottom:19px}`,
  `.metrics{margin:22px 0}`, `.metric{padding:18px 19px}`, `.data-row{padding:10px 9px;margin:3px 0}`; Gaps 5/7/14/18/25 px
  neben 8/12/16. Vorschlag: alles auf 8/12/16/24.
- Radien: Panels 10 px, Karten 9 px, Controls 4/6/7/12 px; Standard: Karten 16, Controls 8.
- Schriftgrößen: 50 Angaben, darunter Einzelwerte 23/25/29/62 px; Standard: kleine Skala.
- Dieselbe Aktion, zwei Optiken: Breakdown-Zeilen in Overview als Balken-Buttons, in Acquisition/Revenue als
  unterstrichene Links.
- Kopf-Controls uneinheitlich: "Metric" inline links im Chartkopf, "More details"/"Group by"/"Attribute revenue to"
  rechts bzw. unter dem Titel.
- Mobile 375 px: Tabs überlaufen ohne Hinweis; Sub-Tabs brechen ("Search Console" allein in zweiter Zeile);
  fünfte Kennzahlenkarte volle Breite unter zwei Zweierreihen.
- Bounce-Rate-Karte: Delta-Text zweizeilig, Karte höher als die Nachbarn.

---

## Phase 5 · Gesamtliste (Häufigkeit × Ärger)

1. **B** Tage in UTC statt Firmen-Zeitzone (jeder Blick, jede Zahl).
2. **B** Acquisition ohne Zielabschlüsse pro Quelle (die Kernfrage bleibt offen).
3. **T** Zeitraum/Website werden nicht gemerkt; Standard 30 Tage.
4. **T** Chart ohne Datumsachse und Hover.
5. **T** Kennzahl-Deltas als Fließtext, Bounce-Karte bricht.
6. **T** "History" und Search-Console-Setup auf Berichtsscreens; mobile Tabs unerreichbar.
7. **T** Website anlegen: 2 Pflichtfelder + 3 Vorentscheidungen statt Domain; kein Live-Check nach dem Snippet.
8. **T** Quick goals brauchen Formular + Save; keine Pfad-/Event-Vorschläge; Funnel nicht direkt speicherbar.
9. **T** Teilen = API-Key-Formular; Ablauf ohne Erinnerung.
10. **T** Ländercodes; "Direct / none" vs "Direct / unknown"; "(entry)".
11. **S** Abstands-/Radius-/Schriftskala außerhalb des Standards; zwei Zeilenoptiken; All-websites-Kacheln inline.
12. **S** Retention als Zahlenfeld; "Collection enabled" im Setup; Hub-Link fehlt bei nicht freigeschalteten Personen.

## Die 10 Änderungen mit dem größten "Endlich"-Effekt

1. Zeitzone pro Website, Standard Firmen-Zeitzone aus dem Hub; Tages-Buckets danach. Begründung: sonst stimmt keine Tageszahl mit dem Kalender.
2. Spalte "Conversions (Ziel)" + Rate in Acquisition, Ziel wählbar; Overview-Quellen zeigen den Abschluss-Anteil. Begründung: beantwortet "hat es gebracht?" ohne Filterumweg.
3. Letzte Website und Zeitraum merken; Standard 7 Tage. Begründung: null Klicks beim Wochenblick.
4. Website anlegen mit Domain allein; danach Snippet mit Live-Status "erster Seitenaufruf empfangen". Begründung: Einrichtung ohne Rätsel und ohne Kontrollgang.
5. Quick goals in einem Klick; Pfad-/Event-Vorschläge im Zielformular; Funnel im Panel speichern. Begründung: Ziele entstehen in Sekunden statt Formularen.
6. "Share report" als Kopf-Aktion mit Vorbelegung und Ablauf-Erinnerung über den Hub. Begründung: Teilen ist die häufigste Nicht-IT-Aufgabe und darf nicht still brechen.
7. Navigation: "History" nur mit Importen, Search Console als Ein-Zeilen-Status, mobile Tabs umbrechen; Website-Name als H1 mit Menü (inkl. "All websites", "Add website"). Begründung: weniger Tabs, klarer Kontext, Handy nutzbar.
8. Chart mit Datumsachse, Hover und Vorperiode; Kennzahl-Deltas als Pfeil + Prozent; Revenue/Events/Scroll als Karten. Begründung: der erste Blick liefert die Antwort.
9. Ländernamen mit Flagge, ein Begriff für "Direct", "Entry → Home". Begründung: Nutzersprache statt Datenbank.
10. Visueller Durchgang auf den Standard (8er-Skala, 16/8 px Radien, eine Zeilenoptik, gleiche Kacheln überall). Begründung: Ruhe im Bild, die Zahlen stehen im Vordergrund.

## Zielzustand der fünf Aufgaben

1. **Wochenblick.** Öffnen, fertig: Crumbs zeigt die zuletzt gewählte Website mit "Last 7 days" in Firmen-Zeitzone, Pfeile an den Kennzahlen, Chart mit Tagen. Kein Klick nötig; ein Klick auf eine Quelle zeigt deren Anteil an den Zielen.
2. **Website anlegen.** Domain eintippen, "Create". Das Snippet liegt kopierbereit da, darunter blinkt "Waiting for the first pageview…" und wird grün, sobald die erste Seite meldet. Zugang vergibt man im selben Schritt oder später.
3. **Kampagne → Anmeldungen.** "Form submissions" einmal anklicken, Ziel existiert. In Acquisition steht pro Kanal die Zahl der Anmeldungen und die Rate; Kampagnenlabels kommen aus den UTM-Parametern, nichts wird getippt.
4. **Zugang geben.** Name tippen, Person erscheint mit "Read" vorausgewählt, Save. Fehlt der Hub-Zugang, führt ein Link direkt dorthin.
5. **Bericht teilen.** "Share" im Kopf, Name und Ablauf sind vorbelegt, der Link ist kopiert. Sieben Tage vor Ablauf kommt eine Slack-Nachricht mit "Verlängern".

Unsicher (brauche Echtdaten oder Bestätigung): ob `country` im Live-Backend ISO-Codes liefert (Fixture: ja); ob die
Realtime-Zahl bei echtem Traffic sinnvoll vom Gesamtwert abweicht; die Google-OAuth-Sequenz und `shared.html` gerendert;
Zahl und Art der tatsächlich produktiv genutzten Websites.
