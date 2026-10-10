# Assets 0.23.1 · UX-Audit (2026-10-10)

Auftrag: jeden Screen prüfen, bis ein Nutzer sagt "Endlich. Einfache Software, die mir Arbeit abnimmt."
Grundlage: Code in `assets/dist` (index.html, app.js, bulk.js, finance.js, handover.js, labels.js, deal.js),
`assets/backend/main.mo` (MDM-Sync, Gerätedetail), laufende Preview `assets/tools/preview.mjs` mit Beispieldaten
(Rolle admin, finance), Screenshots bei 1280 px und 375 px, Seitentexte aus dem DOM. Vorherige Reviews:
`assets/UX-REVIEW.md` (0.10, Verkaufsprozess) und der Crumbs-Audit vom selben Tag (Format übernommen).
Styleguide: `design/STANDARD.md`.

Kontext (angenommen, bitte korrigieren): Assets ist das Geräteregister. Nutzer: eine IT-Person (registriert,
übergibt, nimmt zurück, pflegt MDM/ABM, bereitet Verkäufe vor), Finance (Zahlungen, Buchwerte) und alle
Mitarbeitenden (eigene Geräte, Angebote). Die fünf häufigsten Aufgaben:
1. "Wer hat welches Gerät, und wie ist es ausgestattet?" (Suche, Gerätedetail, Entscheidung Ersatz/Upgrade/Weitergabe)
2. Neues Gerät registrieren und übergeben
3. Gerät zurücknehmen oder weitergeben (was ist passiert)
4. Gerät verkaufen (Offer → Invoice → Paid → Complete)
5. Bestand in Ordnung halten (MDM-Abweichungen, Apple-Register, Offboarding, fehlende Seriennummern)

Gesetzt vom Eigentümer: Geräte, die Kandji/Iru synchronisiert, müssen Prozessor, RAM, Speicher usw. zeigen; das
Modell allein reicht nicht.

---

## Phase 1 · Inventar

| # | Screen / Zustand | Route | Sichtbar für |
|---|---|---|---|
| 1 | Sign-in (Hub-Ticket, Statuszeile) | kein Hash | alle |
| 2 | Devices: 3–6 Statuskacheln (All, assigned, deployed, in stock, loaned, unknown, Offboarding), Suche, Status-Select (10), "Add device", "Print labels (n)", "Scan a device ↗", Checkbox pro Zeile + "Select all", Bulk-Leiste (Deploy at location / Set location only / Back to stock / Print labels / Clear) | `#/devices` | Admin; Mitarbeitende sehen "My devices" |
| 3 | Gerätedetail: Pills (Status, Kind), Label, "What happened?", Key/Value (Tag, Serial, Who has it, Location, Note, Registered), MDM-Disclosure (Device name, OS, Last seen, Logged-in user, Compliance, Synced, Mismatch-Text), ABM-Disclosure (Managed by, Model · Kapazität · Farbe, Ordered, In Apple's register since), Fotos, Zeile Location-Select / Mark deployed here / Edit details / Add photo / Archive, Edit-Karte, Hardware-Offboarding-Panel, "Selling this device" (Kaufdaten, Regelpreis, Sell this device…, Verkaufsformular), "What happened?"-Karte, History | `#/d/:id` | alle mit Sicht; Aktionen Admin |
| 4 | Scan a device: Take a photo / Choose from photos / Find or add manually / Register many from photos; Schritte 1 Foto → 2 Which device → 3 What happened; Karte "New device" (Serial, Tag, Vendor, Model, Kind, Note, To, Location, Deployed); Fertig-Karte mit Label; Recent activity | `#/intake` | Admin |
| 5 | Register many devices: bis 60 Fotos, Tabelle, Defaults, Register n devices | `#/bulk` | Admin |
| 6 | Apple inventory: Filterchips (All / Not in the register / No device management / In the register / Sold — release in ABM), Connection-Select, Tabelle mit "Add", "Add all n to the register" | `#/apple` | Admin |
| 7 | Finance: Payments (Open / Overdue, Export payment history), Hardware values | `#/finance` | Admin, Finance |
| 8 | Sales: Prozessphasen mit Mengen, Needs action / All sales, Suche, Finance export, Start a sale | `#/sales` | Admin, Finance |
| 9 | Verkaufsdetail: Phase, nächste Aufgabe, Dokumente, Checks (Wipe, MDM-Freigabe, Kandji-PIN), Übergabe | `#/sale/:id` | Admin, Finance |
| 10 | My offers (Mitarbeitende) und Dealroom `deal.html` (extern) | `#/offers`, separate Seite | Käufer |
| 11 | Import & export: CSV-Import (9 Spalten), Export CSV | `#/import` | Admin |
| 12 | Settings · General: Notifications-Pill, Hub connection (App address, Company name), Register devices (Locations, Tag prefix, Digits) | `#/settings/general` | Admin |
| 13 | Settings · Connections: Reading photos (Status, Ask the hub again), Disclosures MDM (Tabelle + Formular System/Name/API address/Client id/API token), Apple Business Manager (Formular + .pem-Drop), Device trust (Canister-ID) | `#/settings/connections` | Admin |
| 14 | Settings · Sales & billing: Rechnungs-Stammdaten (14 Felder), Preisregel, Übergabebedingungen | `#/settings/sales` | Admin |
| 15 | Settings · Data & privacy: Erklärtexte, Umgang mit Löschanfragen | `#/settings/privacy` | Admin |
| 16 | Settings · Maintenance: Sample register, Sync people from the hub, Admin log | `#/settings/maintenance` | Admin |
| 17 | Help "How assets works": 10 Disclosures | `#/docs` | alle |
| 18 | Zustände: "loading…", "not found", leere Listen, AI-aus-Banner, Lesefehler mit "Try reading again / Enter details manually", Mismatch-Pill "Review MDM" | – | – |

Vollständigkeit: alle Routen aus `route()` und alle `.view`-Sektionen erfasst. Nicht gerendert gesehen: Mitarbeitenden-
Rolle (die Preview kennt nur admin und finance), Register many (Lesen braucht den Hub-AI-Key), Dealroom und Offers
(eigene Regressionstests vorhanden), echte MDM/ABM-Verbindungen.

---

## Phase 2 · Prozesse

Zählung: Screens / Klicks / Pflichtfelder / Entscheidungen / Kontextwechsel / Merken-müssen.

**1. Wer hat was, wie ausgestattet?** Ist: 2 Screens (Devices → Suche → Gerät), 2 Klicks, 1 Feld, 0 Entscheidungen,
**1 Kontextwechsel**: das Gerätedetail zeigt Tag, Serial, Person, Ort und aus dem MDM nur Gerätename, OS-Version, Last
seen (als Rohdatum `2026-09-04T08:00:00Z`) und den angemeldeten Benutzer. Prozessor, RAM, Speicher, Verschlüsselung
fehlen; dafür muss die IT-Person Kandji öffnen und die Seriennummer dort suchen. Der Sync liest heute nur die Liste
`/api/v1/devices` (`iruPage`), die diese Felder nicht enthält. Minimalweg: 0 Kontextwechsel. Die Hardware steht als
eine Zeile im Gerätedetail und als Kurzform in der Liste ("M1 · 8 GB · 256 GB"), aus dem MDM, ohne Handarbeit.

**2. Neues Gerät registrieren.** Ist: 3 Screens (Scan → Foto gelesen → New device → fertig mit Label), 5 Klicks,
0 Pflichtfelder bei lesbarem Foto (Serial, Vendor, Model vorbefüllt; Tag automatisch), 3 Entscheidungen (Kind, To,
Location), 0 Kontextwechsel, 1 Merken: nach dem Lesen muss man selbst "Not in the list — add a new device" drücken,
auch wenn die Suche keinen Kandidaten fand; der Button steht schon vor jeder Suche unter "nothing searched yet".
"Add device" in Devices simuliert drei Klicks per `setTimeout` (`devAdd` → `handBtn` → `ikNew`), was bei langsamen
Geräten im Zwischenzustand hängen bleibt. Minimalweg: Foto → Formular öffnet sich von selbst, wenn kein Treffer;
"Add device" öffnet das Formular direkt.

**3. Zurücknehmen / weitergeben.** Ist: Scan → Foto → Kandidat wählen → Chip (Standard passt zum Status) → Person →
Save: 2 Screens, 4 Klicks, 1 Feld (Person aus dem Verzeichnis), 1 Entscheidung, 0 Kontextwechsel. Vom Gerätedetail:
"What happened?" → Chip → Person → Save. Gut. Verpasste Chance: bei einer MDM-Abweichung ("the MDM sees Ben Ko") ist
die Antwort bekannt, trotzdem muss man den Namen erneut tippen. Minimalweg: ein Klick "Record hand-over to Ben Ko".

**4. Verkaufen.** Mit 0.10 durchgearbeitet (Phasen, nächste Aufgabe, Checks). Ist: 4 Phasen, je 1–2 Klicks, klare
Blocker-Liste. Keine Änderung nötig. Störend nur: die Karte "Selling this device" mit Kaufdaten und Regelpreis steht
auf jedem Gerätedetail, auch bei Monitoren und Geräten ohne Kaufpreis.

**5. Bestand in Ordnung halten.** Ist: 3 Screens ohne Zusammenhang: "Review MDM"-Pills in der Liste, "Not in the
register" unter Apple inventory, "Offboarding"-Kachel (nur mit offenen Fällen), Geräte ohne Seriennummer nirgends
gesammelt. 4–6 Klicks, 2 Merken (welche Listen es gibt, wo sie liegen). Minimalweg: eine Kachel "Needs attention (n)"
auf Devices mit allen vier Fällen und der jeweiligen Ein-Klick-Lösung.

Wichtigster Befund: Das Register weiß, wer was hat, aber nicht, **was** das Gerät ist (Ausstattung); und die Pflege
des Bestands ist auf drei Orte verteilt.

---

## Phase 3 / 4 · Befunde pro Screen

Schwere: **B** = Blocker, **T** = stört täglich, **S** = Schönheitsfehler.

### Gerätedetail

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| MDM-Disclosure (Device name, OS, Last seen, Logged-in user, Compliance, Synced) | Keine Hardware: Prozessor, Kerne, RAM, Speicher (gesamt/frei), Verschlüsselung, Modell-Identifier fehlen. Kandji/Iru liefert sie unter `GET /api/v1/devices/{device_id}/details` → `hardware_overview` (`model_name`, `model_identifier`, `processor_name`, `processor_speed`, `number_of_processors`, `total_number_of_cores`, `memory`), `volumes[]` (`name`, `capacity`, `available`, `percent_used`, `encrypted`), `filevault.filevault_enabled`, `mdm.supervised`, `general.first_enrollment`. Jamf liefert `hardware.processorType`, `coreCount`, `totalRamMegabytes` in der schon abgerufenen Liste und `storage.disks[].sizeMegabytes` über `section=STORAGE`. Intune liefert `totalStorageSpaceInBytes`/`freeStorageSpaceInBytes` in der Liste und `physicalMemoryInBytes` nur per Einzelabruf mit `$select`. | Für Ersatz, Upgrade, Weitergabe und Verkaufspreis ist die Ausstattung die Entscheidungsgrundlage; heute Kontextwechsel ins MDM | Feld `hardware` in `MdmMeta` (optional, stable-kompatibel). Sync holt Details für Geräte ohne Hardware oder älter als 7 Tage, gedeckelt pro Lauf (z. B. 40 Abrufe, jeder ist ein HTTPS-Outcall); "Refresh from Iru" am Gerät für sofort. Anzeige als Zeile "Hardware" in der Hauptliste des Geräts: "Apple M1 · 8 cores · 8 GB · 228 GB (183 GB free) · FileVault on", nicht in der eingeklappten Disclosure | **B** |
| "Last seen 2026-09-04T08:00:00Z", "Synced just now" | Rohes ISO-Datum neben formatiertem "Registered 10 Oct 2026, 09:37" | Zwei Datumssprachen auf einem Screen | Alle Zeiten über dieselbe Funktion: "4 Sept 2026, 10:00 (5 weeks ago)" | T |
| Disclosure-Titel "Iru · Device management", "Apple Business Manager · Group" | Der Verbindungsname ("Group") sagt nichts; beide Boxen sind zu, obwohl sie die einzigen externen Fakten tragen | Information versteckt, Titel rätselhaft | Eine Box "Managed by Iru (Group) · seen 5 weeks ago" offen, mit Hardware-Zeile; ABM als eine Zeile "Bought via Apple (order 2024-03-12 · 512 GB · Space Gray)" | T |
| Aktionszeile Location-Select · Mark deployed here · Edit details · Add photo · Archive | Fünf gleichwertige Controls, darunter eine seltene Zerstöraktion neben einem Standortfeld | Falschklick-Risiko, keine Hierarchie | Location als Key/Value mit "Change"; Archive in ein "More"-Menü | S |
| "Selling this device" auf jedem Gerät | Kaufdaten, Regelpreis und Verkaufsformular auch bei Monitor/Zubehör und ohne Kaufpreis | Lärm auf dem Screen, der am häufigsten geöffnet wird | Karte nur bei Kaufpreis oder laufendem Verkauf; sonst "Sell this device" als Aktion im Kopf | T |
| Mismatch-Text "The register says Ana Ruiz, the MDM sees Ben Ko. Record the hand-over here if the MDM is right." | Gute Erklärung ohne Aktion | Namen abtippen | Button "Record hand-over to Ben Ko" (Verzeichnis-Treffer) direkt im Text | T |
| Mitarbeitenden-Sicht | Nur sichtbar, was ihnen gehört; Ausstattung fehlt ebenso | Mitarbeitende fragen die IT nach RAM/Speicher | Hardware-Zeile auch in "My devices" | S |

### Devices (Liste)

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Zeile: Name, Tag · Serial, Status, Person · Ort · Zeit, "Review MDM" | Keine Ausstattung, kein Alter; Geräte mit gleichem Modell sind nicht unterscheidbar | "Welches der 14-Zoll-MacBooks hat 32 GB?" ist nicht beantwortbar | Zweite Zeile "M1 Pro · 16 GB · 512 GB · 2023" aus MDM/ABM | **B** |
| Statuskacheln + Status-Select mit 10 Einträgen | Dieselbe Filterung zweimal; das Select enthält Statuswerte, die Kacheln nicht | Zwei Wege, ein Ergebnis | Kacheln als einziger Statusfilter; Select für Kind (laptop/phone/…) | S |
| Pflege verteilt (Review MDM, Apple "Not in the register", Offboarding, ohne Serial) | Keine Sammelstelle | IT geht auf Verdacht durch drei Screens | Kachel "Needs attention (n)" mit Liste und Ein-Klick-Lösungen | T |
| "Select all" sichtbar, Checkboxen in jeder Zeile | Bulk-Werkzeug dauerhaft im Bild | Lärm | Checkboxen erst nach dem ersten Klick auf eine Checkbox oder "Select" | S |
| Kopf: "Print labels (3)" und "Scan a device ↗" rechts, drücken den Titel; mobil übereinander | Zwei Nebenaktionen in Kopfposition | Hierarchie | "Add device" primär im Kopf, Labels in der Bulk-Leiste | S |

### Scan a device, Register many

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Nach dem Lesen: "Which device?" leer + Button "Not in the list — add a new device" | Bei 0 Kandidaten noch ein Klick; Button steht auch vor jeder Suche | Umweg beim häufigsten Fall (neues Gerät) | Keine Treffer → Formular klappt auf, Button verschwindet | T |
| "Add device" in Devices | Drei verkettete Klicks über `setTimeout` | Bricht bei langsamer Seite | Direkter Aufruf `ikReset(); ikStep1(); ikNew` ohne Timer | T |
| New-device-Formular: 9 Felder in 3 Reihen | Kind als Select (Standard "laptop"), Deployed-Checkbox nur sinnvoll ohne Person | Ok, wenn Foto gelesen wurde; ohne Foto 9 Felder | Kind aus Modell ableiten (iPhone → phone, iPad → tablet, Monitor → monitor); Deployed-Checkbox nur zeigen, wenn Location gesetzt und To leer | S |
| Register many | Gut (Defaults, Erkennung vorhandener Geräte) | – | – | – |

### Apple inventory

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| Spalte "Model: MacBook Pro 14" · 512GB · Space Gray" | Die ABM-Kapazität ist nur hier und in der zugeklappten Box sichtbar | Information liegt am falschen Ort | Kapazität/Farbe ins Gerätedetail und in die Liste übernehmen (Fallback, wenn das MDM keine Hardware liefert) | T |
| "Add all n to the register" | Gut | – | – | – |

### Settings

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| General: "App address is missing: Slack and Hub notifications have no link" | Die App kennt ihre Adresse (`location.origin`) | Ein Pflichtfeld, das die Software selbst beantworten kann | Standard = eigene Adresse; Feld nur für Abweichungen | T |
| General: "Automatic tag prefix" (0.20.2 entfernt, 0.21.0 als automatischer Prefix wieder da) | Ok, Hinweistext "next DFN-000123" fehlt in der Preview (nur mit Daten) | – | – | – |
| Connections: MDM-Formular in Disclosure, Hinweis "Saved API credentials cannot be read back" | Gut; nach dem Anlegen fehlt der Hinweis, welche Token-Rechte nötig sind (Device Information; Device secrets nur für PIN) | Einrichtung scheitert still mit 403 | Rechte-Hinweis pro System unter dem Token-Feld; Testlauf meldet fehlende Rechte als Satz | S |
| Sales & billing (14 Felder) | Einmalig, dicht, aber vollständig erklärt | – | – | – |
| Data & privacy | Klar | – | – | – |

### Navigation, Zustände, Mobil

| Element | Problem | Warum stört es | Vorschlag | Schwere |
|---|---|---|---|---|
| 8 Tabs (Devices, Finance, Scan & update, Sales, Apple inventory, Settings, Import / export, Help) | Mobil (375 px) sind 3,5 Tabs sichtbar, der Rest nur per unsichtbarem Horizontalscroll | Settings und Apple inventory sind am Handy nicht auffindbar | Tabs umbrechen oder "More"; Help/Import ins Topbar-Menü | T |
| Gerätedetail mobil | Aktionszeile bricht in drei Zeilen; MDM-Box füllt den ersten Bildschirm | Das Wichtigste (wer, was, Status) rutscht | Hardware + Person oben, MDM-Details darunter | S |
| Pills `.pill.warn` mit festen Farben `#d98a1e / #b8700f` | Außerhalb der Tokens, im Dark Mode zu dunkel | Lesbarkeit | Token `--ks-indicator-amber` | S |
| Inline-Styles im Markup (`style="display:flex…"`, Gerätedetail, Aktionszeile) | Nicht themenfähig, schwer zu pflegen | – | Klassen | S |
| Lesefehler-Pfad ("Try reading again / Enter details manually") | Gut | – | – | – |

---

## Phase 5 · Gesamtliste (Häufigkeit × Ärger)

1. **B** Keine Ausstattung (CPU, Kerne, RAM, Speicher, Verschlüsselung) am Gerät; Kontextwechsel ins MDM.
2. **B** Liste unterscheidet gleiche Modelle nicht (keine Ausstattung, kein Jahr).
3. **T** Bestandspflege auf drei Screens verteilt; Mismatch ohne Ein-Klick-Lösung.
4. **T** Neues Gerät braucht einen Klick zu viel; "Add device" per Timer-Kette.
5. **T** Rohe ISO-Daten, rätselhafte Box-Titel, wichtige Fakten eingeklappt.
6. **T** "Selling this device" auf jedem Gerät.
7. **T** App-Adresse als Pflichtfeld statt Standard.
8. **T** Mobile Tabs unerreichbar.
9. **S** Aktionszeile ohne Hierarchie; Bulk-Controls dauerhaft; Status zweimal filterbar.
10. **S** Farben/Inline-Styles außerhalb der Tokens.

## Die 10 Änderungen mit dem größten "Endlich"-Effekt (Vorschlag Assets 0.24.0)

1. **Hardware aus dem MDM** (gesetzt): Iru-Details, Jamf HARDWARE+STORAGE, Intune Speicher/RAM; Feld `hardware` an der MDM-Notiz; gedeckelter Nachlauf im 6-h-Sync plus "Refresh" am Gerät; Zeile im Gerätedetail, Kurzform in der Liste und in "My devices", Spalten im CSV-Export; ABM-Kapazität/Farbe als Fallback. Begründung: beantwortet "was ist das Gerät?" ohne Kandji zu öffnen.
2. **Needs attention** auf Devices: MDM-Abweichung, nur in ABM, Offboarding offen, ohne Seriennummer; je Zeile die Lösung ("Record hand-over to Ben Ko", "Add to register", "Open follow-up", "Add serial"). Begründung: ein Ort statt drei.
3. **Mismatch mit Antwort**: Button "Record hand-over to <MDM-Benutzer>" im Gerätedetail und in der Liste. Begründung: die Information ist da, nur die Aktion fehlt.
4. **Registrieren ohne Umweg**: kein Treffer → Formular öffnet sich; "Add device" öffnet direkt; Kind aus dem Modell abgeleitet. Begründung: der häufigste Fall wird der kürzeste.
5. **Eine Zeitsprache**: alle Zeiten formatiert mit relativem Zusatz; Box-Titel "Managed by Iru (Group) · seen 5 weeks ago". Begründung: lesbar statt Rohdaten.
6. **Verkaufskarte nur bei Bedarf**; "Sell this device" als Kopfaktion. Begründung: das Gerätedetail wird ruhig.
7. **App-Adresse automatisch** aus der eigenen Adresse; Hinweis nur bei Abweichung. Begründung: ein Setup-Schritt weniger.
8. **Mobile Navigation**: Tabs umbrechen, Help und Import/Export ins Menü. Begründung: alles erreichbar.
9. **Gerätedetail-Kopf**: Hardware und Person oben, Location als Key/Value mit "Change", Archive im "More"-Menü, Bulk-Controls erst bei Auswahl. Begründung: Hierarchie statt Reihe gleicher Knöpfe.
10. **Visueller Durchgang**: Pill-Farben als Tokens, Inline-Styles in Klassen, 8er-Skala. Begründung: Dark Mode und Pflege.

## Zielzustand der fünf Aufgaben

1. **Wer hat was, wie ausgestattet?** Suche "Ana" → Zeile "Apple MacBook Pro 14" · M1 Pro · 16 GB · 512 GB · 2023 · Ana Ruiz". Öffnen: Hardware-Zeile mit freiem Speicher und FileVault, "seen 5 weeks ago in Iru". Kein Kandji-Fenster.
2. **Registrieren.** Foto → kein Treffer → Formular mit Serial/Vendor/Model/Kind vorbefüllt → Person wählen → "Register device & show label". Vier Berührungen.
3. **Zurücknehmen / weitergeben.** Wie heute; bei Abweichung ein Klick auf den vorgeschlagenen Namen.
4. **Verkaufen.** Wie heute; die Karte erscheint erst mit "Sell this device".
5. **Bestand.** Kachel "Needs attention (4)": vier Zeilen, vier Knöpfe, fertig.

## Technische Randbedingungen für Punkt 1 (geprüft)

- Iru/Kandji: Listenendpunkt ohne Hardware; Details pro Gerät unter `/api/v1/devices/{device_id}/details`
  (Token-Recht "Device Information"). Beispielwerte: `processor_name` "Apple M1", `total_number_of_cores` "8",
  `memory` "8 GB", `volumes[0].capacity` "228.27 GB", `available` "182.66 GB", `encrypted` "No"; `processor_speed`
  ist bei Apple Silicon leer. Quelle: Sumo-Logic-Integrationsbeispiel und Unthread-Integrationsdoku; die offizielle
  Referenz `api-docs.iru.com` war per Skript nicht abrufbar (ReadMe-Seite), bitte mit einem echten Token gegenprüfen.
- Jeder Detailabruf ist ein HTTPS-Outcall des Canisters (Cycles, einige Sekunden). Bei 500 Geräten darf der Sync nicht
  500 Abrufe am Stück machen: pro Lauf gedeckelt (Vorschlag 40), Priorität "noch nie geholt", dann "älter als 7 Tage";
  volle Abdeckung nach wenigen Läufen, danach Pflege. "Refresh" am Gerät für den Einzelfall.
- Jamf: `section=STORAGE` zusätzlich in der bestehenden Listenabfrage, keine Extra-Abrufe. Intune: Speicher aus der
  Liste; RAM nur per Einzelabruf (`$select=physicalMemoryInBytes`), gleiche Deckelung; CPU-Name liefert Graph v1.0 nicht.
- Datenmodell: `MdmMeta` bekommt `hardware : ?Hardware` (processor, cores, memoryGb, storageGb, storageFreeGb,
  encrypted, modelId, fetchedAt). Optionales Feld, Upgrade ohne Migration; Stable-Check gegen die Baseline.

Unsicher (brauche Bestätigung): welches MDM produktiv läuft (nur Iru?), wie viele Geräte (Deckelung), ob der Token
"Device Information" hat; ob Mitarbeitende die Ausstattung sehen sollen (Vorschlag: ja); ob der CSV-Export heute
die Location enthält (im Import-Header fehlt sie).
