# PO-Audit Kebabstack: Desk zuerst, Stack im Zusammenhang (5. Oktober 2026)

Stand: `main` von `kebabstack/kebabstack-source` (Commit `6a403ec`, 1. Oktober 2026). Desk 0.27.0, Assets 0.17.0, Hub 0.37.0.

Faktenbasis: Code gelesen (jede Aussage mit `Datei:Zeile`), Frontend-Tests ausgeführt (Desk 98/98 grün, Assets grün, Dealroom-UI grün), Oberflächen lokal mit Fixture-Backend im Browser angesehen (Assets-Preview aus `assets/tools/preview.mjs`, Hub-Preview aus `hub/tools/preview-ux.mjs`, Desk-Preview aus `desk/test/smoke.mjs` abgeleitet). Nichts wurde geändert, kein produktiver Canister wurde angesprochen. Empfehlungen sind als solche markiert; alles andere ist beobachtet.

---

## 1. Zusammenfassung: die zwölf wichtigsten Befunde

| # | Befund | Wirkung für den "last man standing" | Beleg |
|---|---|---|---|
| 1 | **Offboarding ist nur zu 2 von 6 Schritten verbunden.** Hub → Desk (Fall) und Desk ↔ Assets (Hardware) sind automatisiert. Contracts-Seats, Trust-Geräte, Watch-Watcher, Forms, Slack bekommen weder Aktion noch Hinweis. Die Desk-Checkliste trägt "Revoke licenses & seats" als Freitext ohne Link zu Contracts. | Der zentrale Stack-Zweck ist zur Hälfte Behauptung. IT muss in vier Tools von Hand nachsehen. | `desk/backend/main.mo:3162`, `trust/backend/main.mo:288-292`, `contracts/backend/main.mo:663-670`, `docs/MARKETPLACE-ROADMAP.md:15` |
| 2 | **Onboarding ist gar nicht verbunden.** Der Hub erzeugt Lifecycle-Ereignisse nur für `#deactivated` und `#reactivated`. Ein neuer Mensch löst in Desk, Assets, Trust, Contracts nichts aus. | Jeder Eintritt ist komplette Handarbeit mit Sechs-Punkte-Freitextliste. | `hub/backend/Lifecycle.mo:6`, `desk/backend/main.mo:3161` |
| 3 | **Käufer sehen den Einkaufspreis und die Preisregel der Firma.** `getSale` liefert dem Käufer sein eigenes `SaleView` inklusive `proposal.basis` ("purchase price … linear write-down, floor …"); das Frontend rendert das für die Route `#/sale/<id>`, die auch Mitarbeitenden offensteht. | Informationsleck gegenüber Mitarbeitenden und Ex-Mitarbeitenden. | `assets/backend/main.mo:2538-2542,2459`, `assets/dist/app.js:66,782` |
| 4 | **Zwei Verkaufsflüsse, zwei Oberflächen, zwei PDF-Renderer.** Kollege: Karte im Admin-SPA, Platzhalter statt Labels, zwei Hub-Logins, PDF im Browser des Admins. Extern: eigene `deal.html`, Drei-Schritt-Anzeige, PDF im Canister. Rechnungen derselben Firma unterscheiden sich je nach Käufertyp (Browser-PDF schneidet lange AGB ab und ersetzt Sonderzeichen durch "?"). | Genau die vom Owner beschriebene GUI-Beschwerde, plus rechtliches Risiko bei Rechnungen. | `assets/dist/app.js:889-926`, `assets/dist/deal.js:48-108`, `assets/dist/invoice-pdf.js:18,163`, `assets/backend/lib/InvoicePdf.mo` |
| 5 | **Desk meldet sich bei jedem Netzwerkfehler im 30-Sekunden-Check ab und löscht Antwortentwürfe.** | Agent verliert Text bei WLAN-Wackler. README verspricht das Gegenteil. | `desk/dist/app.js:172,178`, `desk/dist/ticket-view.js:301` |
| 6 | **Kollegen-Annahme/Ablehnung benachrichtigt niemanden.** `acceptOffer`/`declineOffer` schreiben nur ins Log; der Dialog behauptet "IT is told". Sackgasse: nach AGB-Änderung kann ein akzeptierter Kollegenverkauf weder fakturiert noch neu angeboten werden. | IT merkt Annahme nur durch Nachsehen; Vorgang hängt. | `assets/backend/main.mo:2271-2284,2290-2294,2321,2252` |
| 7 | **Jedes App-Backend kopiert dasselbe Hub-Gerüst** (≈1 000 Zeilen in 6 Apps), 7 identische `directory()`-Personensucher, 5 verschiedene Benachrichtigungs-Outboxen mit 5 Timern, Slack in zwei Canistern konfiguriert und Bot-Tokens nach Desk kopiert. | Jede Änderung sechsmal; Fehler sechsmal verschieden. | `*/backend/main.mo`, `desk/backend/main.mo:2710-2730`, `hub/backend/main.mo:5284-5405` |
| 8 | **Desk-Frontend: 9 Backend-Methoden ohne Aufrufer, fünf `esc`-, fünf `opt`-, zehn Datums-Helfer, neun `run`-Wrapper, zwölf Breakpoints, zwei Token-Schichten.** Admin-Settings schlucken Fehler komplett (18 Handler ohne try/catch, Statustext bleibt bei "saving…"). | Wartung teuer, Fehler unsichtbar. | `desk/dist/idl.js` vs `desk/dist/*.js`, `desk/dist/app.js:397-405,417-518` |
| 9 | **Release-Tempo ohne Konsolidierung:** 260 Modul-Releases in vier Wochen (Hub 56, Desk 33, Assets 30), 161 Markdown-Dateien mit 216 000 Wörtern. Desk ging in zwölf Tagen von 0.13 auf 0.27. | Niemand kann das lesen oder prüfen; Doku überholt sich selbst (GAPS.md nennt veraltete Zustände). | `*/CHANGELOG.md`, `docs/GAPS.md` |
| 10 | **Vier "Projekt"-Typen, drei Formular-Builder, drei Status-Vokabulare allein in Desk, sechs Retention-Sweeps (einer konfigurierbar).** | Mensch muss vier Mal dasselbe Konzept lernen. | `desk/backend/Customers.mo:11`, `oncall/Types.mo:7`, `workboard/Types.mo:8`, `reporting/Types.mo:21`; `desk/dist/ticket-view.js:10`, `workboard.js:5`, `oncall-response.js:7` |
| 11 | **Freigabe-Sackgasse für den alleinigen Admin.** Drei der acht Standard-Anfragetypen verlangen Manager-Freigabe; ohne `manager`-Attribut fällt der Freigeber auf `role:admin`; ein Admin darf die eigene Anfrage nicht freigeben. Ergebnis: der einzige IT-Mensch kann seine eigene Hardware-/Software-/Zugriffsanfrage nicht abschließen, ohne sie per `setApprover` umzuleiten. Kein Test deckt das ab. | Genau die Zielperson des Stacks bleibt hängen. | `desk/backend/main.mo:1790,2418,3158-3160` |
| 12 | **Jedes Slack-Kanalmitglied kann ein Desk-Ticket per ✅ lösen oder wieder öffnen.** `slackReaction` prüft nicht, ob der Reagierende Anfragesteller oder Staff ist. Kein Backend-Test für `/slack/events`. | Unbeteiligte schließen Tickets. | `desk/backend/main.mo:2950-2974` |

---

## 2. Desk

### 2.1 Frontend: Bugs (nach Wirkung)

| ID | Befund | Beleg |
|---|---|---|
| D-F1 | Session-Check alle 30 s: Exception in `refreshMe()` fällt in `signOut()`, der `ticketView.reset()` aufruft und `drafts.clear()` ausführt. Smoke-Test setzt `setInterval = () => 0`, deckt den Pfad also nie ab. | `app.js:172,178`, `ticket-view.js:301`, `test/smoke.mjs:68` |
| D-F2 | `showSettings` wartet die Loader nicht ab; `route()`-Fehlerbehandlung sieht Fehler von `getSettings`/`slackStatus`/`adminLogRows` nie. 18 Admin-Handler (sgSave, ctSave, ctDefaults, aiSave, skAddBtn, …) ohne try/catch. | `app.js:397-405,417,457,467,482,518` |
| D-F3 | Abgelehnte Status-/Zuweisungs-/Prioritätsänderung bleibt im Dropdown stehen: Controls werden bei Eingabe als `dirty` markiert, Repaint überspringt `dirty`, Fehlerfall löscht `dirty` nicht. | `ticket-view.js:35,226,288` |
| D-F4 | Canonical-Redirect kennt nur `me|new|queue|agent-new|docs|t/<id>|settings(...)|reporting|oncall(...)`; Deep-Links auf Workboard, Customers, Service-Status, Settings/Assignment, Offboarding gehen verloren. Keine Testfälle dafür. | `canonical-url.js:7`, `test/canonical-url.test.mjs` |
| D-F5 | "Requested by"-Karte (Titel, Abteilung, Standort, Manager) wird gebaut und unbedingt versteckt: `toggle('tRequesterCard', false)`. | `ticket-view.js:104,118`, `index.html:159` |
| D-F6 | Seitennavigation wird alle 30 s komplett neu gerendert (`$("nav").innerHTML = …`), Fokus geht verloren; `profilePictures.load()` feuert jedes Mal. | `app.js:122,130-138` |
| D-F7 | Unbekannte Personen-IDs werden pauschal als "Former colleague" beschriftet. | `ticket-view.js:33` |
| D-F8 | Team-Filter nur aus bereits geladenen Zeilen; Team-Datalist nur aus eigenen Gruppen des Users. | `app.js:204-207,320-321` |
| D-F9 | Interne Queue aktualisiert sich nie automatisch (kein `setInterval` auf `loadQueue`), Ticket 7 s, Alerts 10 s, Workboard 30 s, Status 60 s. | `ticket-view.js:299`, `oncall-alerts.js:37`, `oncall-response.js:45` |
| D-F10 | Kundentickets laden zwei Agentenlisten, erste wird verworfen. `#tBack` hat zwei Besitzer. Hilfe-Überschrift "8 · SLA" steht über dem Bulk-Text. | `ticket-view.js:190-197,202-206`, `app.js:109`, `index.html:350-351` |

Kein XSS-Fund: alle Nutzerstrings laufen durch `esc`/`escapeHtml`, Links durch `safeUrl`/`workLink`.

### 2.2 Frontend: UX und Informationsarchitektur

- **Navigation mischt Zielgruppen:** 9 Einträge für Admins (Internal support, Workboard, Customer projects, On-call, Service status, Time & compensation, My requests, New request, Settings). "My requests" und "New request" stehen neben Staff-Werkzeugen. Service status ist dreifach erreichbar. Zwei Einträge teilen ein Icon. `app.js:112-121`
- **Drei überlappende Statusfilter in der Queue:** Stat-Karten ("Need an owner", "Past their target"), Segmentleiste (Active/Assigned to me/Unassigned/Waiting/Overdue/Completed/All) und Status-Select (Received/In progress/Waiting/Resolved/Closed) steuern dasselbe `qView`. `app.js:314-318`, `index.html:95,98`
- **Marketing-Texte auf Arbeitsflächen:** "Good work starts with great support." (Hero, 270 px hoch), "Let's move work forward.", "YOU'RE IN GOOD HANDS", "No surprises on payday.", "Keep what you need. Delete the rest." Neun Stellen. `index.html:57-58,91,158`, `compensation.js:31`, `customer-privacy.js:16`
- **Ein Bildschirm, vier Namen:** "Internal support" (Nav), "Back to workspace" (Link), "refresh the workspace" (Fehler), "All requests" (HTML), "the queue" (Doku). `app.js:88,112,348`, `index.html:127`
- **Settings fragt Dinge ab, die der Hub schon besitzt:** AI-Tab mit Provider/Model/Endpoint/API-Key plus vier Buttons, obwohl der Hub-Schlüssel gewinnt; "Gateway domain (advanced)"; "Seed demo data" in Produktions-Settings; General postet weiter `agentGroup: "", adminGroup: ""`. `index.html:191-195,238-246,277`, `app.js:417`
- **Katalog-Feldeditor eng und unbeschriftet:** Grid `1fr 1.3fr 100px 1fr 58px 58px 32px; gap:6px`, Platzhalter `key / Label / a|b|c`. `desk.css` Zeile 7, `index.html:224-228`
- **Rohsyntax für Menschen:** Label "Email address or group:Name"; "Related links" verlangt Freitext `Link type` + `Address or reference`. `ticket-view.js:167`, `index.html:161-163`
- **Datumsformate je Modul anders** (Locale, hart `en-GB`, nacktes `toLocaleString()`). `ticket-view.js:8`, `oncall.js:11-12`, `service-status.js:4`
- **Kundenprojekte weiter auf 500 Zeilen gedeckelt**, obwohl 0.27.0 das Limit für die interne Queue entfernt hat. `customer-projects.js:41`

### 2.3 Frontend: unnötige Komplexität und toter Code

- Fünf `esc`-Implementierungen neben einem exportierten `escapeHtml`, das 17 Dateien importieren. Fünf `opt`-Helfer, einer davon mit umgekehrter Bedeutung (baut ein Opt statt es auszupacken). Zehn ns→ms-Helfer. Neun `run`/`action`-Wrapper, 16 `field()`-HTML-Builder, sechs `key()`-Zufallsgeneratoren, sechs BigInt-JSON-Replacer. `app.js:24-29`, `workboard.js:6`, `oncall*.js`, `reporting.js`
- Zwei CSS-Token-Schichten (`--desk-*` als Alias von `--ks-*`), `.card{}` in fünf Dateien, zwölf verschiedene Breakpoints, `#nav` bei 700 px und 760 px doppelt gestylt. `desk.css` Zeilen 1,13,75
- Runtime-Feature-Detection gegen eine statische IDL (`if (backend.autoAssignmentHealth)`), immer wahr. `app.js:329,338`
- **Neun Backend-Methoden ohne einen einzigen Aufrufer:** `addAdminEmail, setAdminEmails, claimAdmin, listTickets, publicServiceStatus, requestOncallCover, saveWorkTask, setReportingPolicy, syncLifecycle` (grep über `desk/dist/*.js`: 0 Treffer je Methode). `whoami.needsClaim` wird nie gelesen. 187 IDL-Methoden, 166 referenziert.
- Bulk-Zuweisung sendet Personen-ID, Einzelzuweisung sendet E-Mail. `queue-bulk.js:44,58` vs `ticket-view.js:275-276`
- 15 CSS-Klassen ohne Vorkommen in HTML/JS (u. a. `.avi`, `.dz`, `.mainnav`, `.subnav`, `.stars`).

### 2.4 Backend: Bugs und Risiken

| ID | Befund | Beleg |
|---|---|---|
| D-B1 | **Freigabe-Sackgasse** (siehe Top-12 Nr. 11). `validateType` prüft nicht, ob ein Freigeber existieren kann. | `main.mo:1686-1705,1790,2418,3158-3160` |
| D-B2 | **Slack-✅ durch beliebige Kanalmitglieder** löst/öffnet Tickets (Nr. 12). | `main.mo:2950-2974,2867-2876` |
| D-B3 | **Ticket-Benachrichtigungen sind fire-and-forget:** `ignore await hub.hub_notify(...)` in einem Timer, kein Ergebnis, kein Retry, kein Eintrag. Die On-call-Pfade machen es richtig (Status, Versuche, Lease, drei Retries). Ein SLA-Nudge oder "Approval needed" kann lautlos verschwinden. | `main.mo:1583-1600,1597` vs `response/Api.mo:234-240`, `oncall/RemindersApi.mo:97-99` |
| D-B4 | **Offboarding kann bei Hub-/Assets-Ausfall nicht abgeschlossen werden:** Abschluss verlangt einen Hub-Sync, der jünger als 60 s ist; der Sync hat 30 s Timeout; Auto-Close überspringt diese Tickets. Keine Einstellung für "Offboarding ohne Assets". | `main.mo:1045-1049,1080,2174,3082` |
| D-B5 | **Hardware-Sweep pollt abgeschlossene Offboardings für immer**, sobald ein Sync einmal "unavailable" war: alle 30 s bis zu zehn Inter-Canister-Calls, kein Backoff, kein Endzustand. | `main.mo:1053,1119,1121,3136` |
| D-B6 | **Listen- und Statistik-Queries sind O(Tickets × Personen):** `row()` wird vor dem Filtern für jedes sichtbare Ticket gebaut; `emailOfPid` ist ein linearer Scan über alle Personen. Betrifft `ticketPage`, `stats`, `myTickets`, `workTickets`, `hub_operations`. | `main.mo:1882-1898,1916-1917,2066-2072`, `sdk/motoko/src/lib.mo:339-341` |
| D-B7 | **Interne Tickets, Events, Dateien, Lifecycle-/Hardware-Nebentabellen, Slack-Maps und Rate-Limit-Maps wachsen für immer.** Es gibt **keine** Methode zum Löschen einer Datei; bei 1 GB Anhängen schlagen Uploads fehl ("ask an admin") und der Admin hat kein Werkzeug. | `main.mo:152,209-267,2464`, `backend.did` (0 Treffer `removeFile|deleteFile`) |
| D-B8 | `updatedAt` dient als Optimistic-Lock-Revision, aber Auto-Close und AI-Triage ändern Tickets ohne Bump: ein Bulk-Status mit alter Revision passiert die Prüfung. | `main.mo:1629-1631,2611,3085` |
| D-B9 | Map wird während Iteration mutiert (`customerKeys`), entgegen der eigenen Regel im selben File. | `main.mo:642` vs `3061` |
| D-B10 | Idempotenz uneinheitlich: Kunden-HTTP verlangt `clientToken`, `createRequest` hat nur ein 10-s-Rate-Limit, `agentCreate` gar nichts (Doppelklick = zwei Tickets, zwei Fan-outs). Workboard/On-call nutzen Request-Keys. | `main.mo:786-796,1834,1855-1869` |
| D-B11 | Slack-Outbox ist LIFO; mehr als sechs Items in 10 s werden in umgekehrter Reihenfolge gepostet. Fan-out kappt still bei 25 Empfängern; jeder Standardtyp hat `queue = ""`, also wird **jede** neue Anfrage an alle Staff gemeldet. | `main.mo:1589,1604,2779-2780,3156-3163` |
| D-B12 | `setApprover` lädt das Ticket nicht, prüft kein `canSee`, akzeptiert beliebigen Text. `hub_usesGroup` ohne Caller-Check verrät Zählwerte. `directory` erlaubt jedem Directory-Mitglied die Enumeration der ganzen Firma. | `main.mo:1463-1486,1551,2441-2454` |
| D-B13 | **AI-Triage ist standardmäßig an** und schickt Betreff, Name und den vollen Freitext-Body jeder internen Anfrage an den konfigurierten Anbieter (nicht-repliziert), sobald ein Hub- oder lokaler Schlüssel existiert. Weder README noch INSTALL sagen das. | `main.mo:150,1814,2547,2562-2582` |

### 2.5 Backend: Prozesskomplexität

- **Zwölf Codepfade schreiben `status`** (createInternal, changeAssignee, addCommentInternal, applyStatus, requesterSetStatus, decideApproval, moveCustomerStep, decideLifecycle, receiveLifecycle, cancelOffboarding, slackReaction, sweep). `main.mo:1786-3086`
- **Acht hart kodierte Guards zwischen Agent und "resolve":** Migration, Kunden-Workflow, Lifecycle-Review (doppelt geprüft in `:2132` und `:2173`), Hardware-Sync < 60 s, storniertes Hardware-Case, Checkliste komplett, Freigabe nicht offen, Waiting-Grund. Nur Freigabe, Checkliste, SLA und Auto-Close sind konfigurierbar.
- **17 verschiedene Zustandskodierungen** in drei Stilen (Text, Variante, "0 = nicht gesetzt"), **5 Timeline-/Audit-Implementierungen**, **3 Checklisten-Implementierungen**, **5 Owner-Felder**. Kunden-Request-Types werden zusätzlich in die interne `types`-Map gespiegelt: zwei Registries für ein Formular. `main.mo:503,539`
- Für jede Directory-Deaktivierung wird ohne Schalter ein "Account review"-Ticket erzeugt; Reaktivierung öffnet abgeschlossene Offboardings wieder. `main.mo:865-883`
- Anfragesteller können nicht selbst lösen, wenn eine Agenten-Checkliste offen ist, sehen diese aber nicht; die Fehlermeldung nennt sie trotzdem. `main.mo:1986,2142`

### 2.6 Backend: API-Oberfläche, toter Code, Tests

- **187 Candid-Methoden (59 Queries).** Nicht vom Frontend genutzt und ohne anderen Aufrufer: `addAdminEmail`, `claimAdmin`, `setAdminEmails` (No-ops, antworten "managed only in the Hub"), `syncLifecycle`, `requestOncallCover` (zweiter Swap-Mechanismus neben `requestOncallInterval`), `saveWorkTask`, `setReportingPolicy` (verweigert, sobald datierte Regeln existieren), `publicServiceStatus` (Daten kommen per HTTP `/status/v1/`). `main.mo:1327-1390`, `oncall/Api.mo:116-157`, `reporting/Api.mo:130`
- `whoami.needsClaim` hängt an `adminClaimed`, das nirgends auf `true` gesetzt wird. 0.6.0-ID-Migration (`migrateIds`, `migrating()`) gated 21 Releases später noch jede Schreiboperation; auf einer befüllten Installation ohne `hubId` werden Writes für immer verweigert. `main.mo:149,1532,3100-3136`
- Lokaler AI-Fallback (`aiProvider/aiUrl/aiKey`, `setAi`, `clearAiKey`, `aiTest`, `refreshAi`) dupliziert die Hub-`ai`-Lane; Schlüssel liegt im Stable Memory. `main.mo:144-147,1394-1412`
- **41 von 187 Methoden haben keinen Test.** Null Backend-Tests für Slack-Events/Signatur/Reaction, Auto-Close-Sweep, AI-Triage, Selbstfreigabe, `hub_usesGroup`.
- `main.mo` (3 332 Zeilen, viele über 300 Zeichen): `customerHttp` ≈127 Zeilen für drei Auth-Modi × fünf Endpunkte; Kunden-HTTP (≈550), Lifecycle/Hardware (≈300), Slack (≈410), AI (≈160) ließen sich wie der On-call-Code in Mixins auslagern, Rest ≈1 900 Zeilen.

### 2.7 Backend: Retention

Automatisch gelöscht werden Kundentickets (konfigurierbar), Sessions, Admin-Log (2 000 Zeilen), On-call-Incidents, Alert-Signale, Pläne, Reminder, Reporting, Status-Notizen. Die Doku dazu stimmt mit dem Code überein. **Nirgends dokumentiert:** interne Tickets, Events, Anhänge, `nudged`, `lastCreateAt`, Slack-Maps, Lifecycle-Cases, Workboard-`requests`-Keys werden nie gelöscht. `CONCEPT.md` beschreibt `Approval.state` als `pending|approved|rejected`; der Code schreibt auch `cancelled`. `main.mo:254,1106,2148-2149`

---

## 3. Assets: Laptop-Verkauf an Kollegen vs. externer Dealroom

### 3.1 Die Beschwerde des Owners, geprüft

| Aussage | Ergebnis |
|---|---|
| "GUI schlecht, Felder eng, schwer verständlich" | **Bestätigt.** Der Kollegen-"Dealroom" ist keiner. Es ist eine `.card` im Admin-SPA: fünf Adressfelder nur mit Platzhaltern (`Street`, `No.`, `Postal code`, `Town`, `CH`), ein gemeinsames Label, keine `required`-, `autocomplete`- oder `for`-Attribute, drei Felder in einer 12-px-Zeile, Fehler landen in einem 11-px-Mono-Pill, Ablehnen über natives `confirm()`. Im Browser verifiziert (Desktop und 375 px). `assets/dist/app.js:896-923`, `index.html:28,32-33` |
| "Manches unnötig abgefragt oder als Schritt nicht nötig" | **Bestätigt.** Siehe 3.2. |
| "Warum sieht es für extern und intern so anders aus?" | **Weil es zwei komplett getrennte Implementierungen sind:** `deal.html`/`deal.css`/`deal.js` mit eigenem `render()` gegen `#v-offers` in `index.html` mit `loadOffers()` in `app.js`. Sie teilen nur die IDL. Backend ebenfalls doppelt: `acceptOffer` vs `acceptDeal`, zwei `acceptedLine`-Varianten, zwei PDF-Renderer. `deal.js:48-108`, `app.js:889-926`, `INSTALL.md:105-107` |

### 3.2 Beide Flüsse nebeneinander (wie implementiert)

| Schritt | Kollege (Hub-Konto) | Extern (Dealroom) |
|---|---|---|
| IT startet | Gerät → "Sell this device…" → Käufer und Preis vorbelegt → **Start the sale** (Status `draft`) | gleich, plus Name und E-Mail tippen |
| IT bietet an | **Offer to the buyer** (zweiter Klick, Hub-Benachrichtigung) | **Create private link** → **Copy** → selbst per eigenem Kanal verschicken |
| Käufer | Hub-Login 1 → Karte → Adresse (3 Pflichtfelder) → **I accept the terms and buy it**. Keine Checkbox, keine Verkäuferangabe, keine Fälligkeit, kein Netto/MwSt. | Link öffnen → Drei-Schritt-Anzeige → Adresse mit Labels → Checkbox "I am <Name>…" → **Accept & get invoice** |
| Rechnung | **IT klickt "Issue the invoice"**; Nummer wird vergeben und Käufer benachrichtigt, **bevor** das PDF existiert; PDF rendert im Browser des Admins (pdf-lib) und wird hochgeladen | Canister vergibt Nummer **und** rendert/archiviert PDF atomar beim Akzeptieren |
| Käufer holt Rechnung | Hub-Login 2 → Download | Download → **Confirm invoice received** (zusätzlicher Schritt) |
| Zahlung | Finance/IT: Betrag und Datum vorbelegt → **Review payment** → **Record payment** | gleich |
| Vorbereitung | Checkbox "Wiped & setup tested" + Checkbox "Company management released" → **Save checks** | gleich |
| Übergabe | ggf. dritte Checkbox "released in Apple Business Manager" → **Record hand-over** | gleich |

Zählung Happy Path: IT 10 Klicks (Kollege) bzw. 11 (extern) plus manueller Linkversand; Käufer 2 Hub-Logins (Kollege) bzw. 0 (extern); Käufer 2 Klicks (Kollege) bzw. 4 (extern).

**Abgefragt, obwohl bekannt oder ungenutzt oder doppelt:**
- Land ist "CH" vorbelegt, Firma ist CH-only (QR-Rechnung erlaubt nur CH/LI-IBAN). `main.mo:2075`
- Die Käuferadresse kann IT an **drei** Stellen vortippen (Start-Formular "Billing address · optional now", "Edit buyer & price", und der Käufer selbst). `index.html:294,342-345`
- Externe E-Mail ist Pflicht für den Link, aber "no message is sent to it by this flow". `INSTALL.md:131-132`, `main.mo:1909`
- Drei Attestierungen für denselben Sachverhalt "Gerät hat die Firmenverwaltung verlassen" (wiped, MDM released, ABM released). `index.html:337-341`, `main.mo:2030`
- "Start the sale" und "Offer to the buyer" sind zwei Klicks, wo der externe Fluss einen hat. "Issue the invoice" ist manuell, wo der externe Fluss automatisch ist.
- `markPaid` (ein Klick) existiert im Backend und wird vom UI nicht genutzt. `main.mo:2367-2376`

### 3.3 Bugs und Risiken im Verkaufsfluss

| ID | Befund | Beleg |
|---|---|---|
| A1 | **Käufer sieht Einkaufspreis und Preisregel** (siehe Top-10 Nr. 3). `myOffers` liefert dasselbe `SaleView`. | `main.mo:2459,2538-2542`, `app.js:66,780-782` |
| A2 | **Sackgasse nach AGB-Änderung:** `issueInvoice` verweigert ("offer again"), `offerSale` akzeptiert nur `draft|offered`, UI zeigt "Offer again" nur bei `offered`. | `main.mo:2321,2252`, `app.js:813` |
| A3 | **Jede Billing-Änderung bricht alle offenen externen Links:** `quoteHash` hasht den gesamten `billing`-Record (auch Footer, Zahlungsziel, Abschreibungsregel). | `main.mo:1815-1818,1943,1953` |
| A4 | **Kollegenrechnung: Nummer verbraucht und Käufer benachrichtigt, bevor ein PDF existiert.** Scheitert pdf-lib oder schließt der Tab, bleibt "the PDF is being prepared by IT". Gutschriften gleich. | `main.mo:2326-2337`, `app.js:823-826,867-879,909` |
| A5 | **Browser-PDF schneidet lange AGB nach einer Seite ab** (`if (y < 60*MM) break`) und ersetzt Nicht-WinAnsi-Zeichen (ı, ł, č) durch "?". Canister-PDF paginiert und verweigert bei Überlauf. Gleiche Firma, zwei rechtlich verschiedene Rechnungsdokumente. | `invoice-pdf.js:18,163`, `InvoicePdf.mo:119,138`, `INSTALL.md:109-111` |
| A6 | **Annahme/Ablehnung durch Kollegen benachrichtigt niemanden;** Dialog behauptet "IT is told"; Ablehnungsgrund wird nie übermittelt (`declineOffer(…, "")`). | `main.mo:2281-2282,2293-2294`, `app.js:923` |
| A7 | **Kein Quote-Schutz für Kollegen:** Preisänderung durch IT während der Käufer die Karte offen hat wird ungesehen akzeptiert. Dealroom prüft `quote`. | `main.mo:2276-2277` vs `1953` |
| A8 | **Dealroom-Benachrichtigungen retryen ewig an den Link-Ersteller** (kein Versuchs-Cap, alle 5 Min). Verlässt dieser Admin die Firma: "Notification pending" für immer. | `main.mo:1845-1860,1922` |
| A9 | **Link-Ablauf nach 14 Tagen sperrt den Käufer aus seiner eigenen Rechnung aus;** gleiche Fehlermeldung für abgelaufen, widerrufen, vertippt. | `main.mo:1823,1825,402-405`, `deal.js:29` |
| A10 | Benachrichtigungsfehler als Erfolg gemeldet (`ok=true`, Fehlertext im `detail`). Toter Papier-Pfad `recordWaiver` mit irreführendem Hinweistext. Währungsmischung in der Preisregel (Einkauf in beliebiger Währung, Anzeige hart "CHF"). "Including 0% VAT" bei nicht MwSt-pflichtigen Firmen. | `main.mo:2261,2337`, `app.js:684`, `deal.js:51` |
| A11 | Verkaufsdetail: elf Karten für einen Vorgang; Karten wechseln je Phase die Position (`prepend`/`append`); Checks-Karte sichtbar schon in `draft`, obwohl der Text "after payment" sagt; Stornieren zwei Ebenen tief plus `confirm()`. | `app.js:433-445,786,816-833` |

Duplizierte Helfer in Assets: `esc` ×4, `opt` ×3, Geldformat ×4 (mit **verschiedenen Eingabesyntaxen** für Preis- und Zahlungsfeld), Zeitstempel ×3, Blob-Download ×3, Adresszeilen ×3.

### 3.4 Workboard-Abbildung (Desk)

Mapping stimmt mit `docs/WORKBOARD.md` überein. Lücken: Teilzahlung nicht sichtbar; ausstehende Empfangsbestätigung nicht sichtbar; stornierter Verkauf landet in "Done", während Desk die Hardware-Position als offen führt. `main.mo:2472-2510`, `tests/hardware-offboarding.test.mjs:101`

---

## 4. Der Stack als Ganzes: Informationsfluss

### 4.1 Was tatsächlich zwischen Canistern fließt

- **Einzige direkte App→App-Verbindung im ganzen Stack:** Trust liest alle 15 Minuten `trust_serialOwners` aus Assets. `trust/backend/main.mo:523,539-556,1616`
- Alles andere läuft über den Hub: 30-s-Directory-Pull je App (Backend-Timer), `hub_notify`, Hub-vermittelte Reads (Desk → Hub → Assets für Hardware, Personen-Kontext, Sales).
- Hub pusht `hub_upsert` nur per 15-Minuten-Timer oder beim Speichern von Policies/Lanes, **nicht** bei IdP-Sync. Neue Personen kommen in Apps über den 30-s-Pull an. `hub/backend/main.mo:7303-7310,2789,3071`
- Hub Operations liest Desk, Assets, Trust, Contracts, Watch. Forms und Crumbs fehlen. `sdk/motoko/src/Operations.mo:20-22`
- Crumbs implementiert nur `hub_upsert, hub_ping, hub_permissionStatus, hub_manifest, hub_deactivate`: kein `hub_notify`, kein Personen-Kontext, kein Operations-Beitrag.
- OIDC-Relying-Parties erfahren bei Deaktivierung nichts; Token 1 h gültig, kein `accessOf`-Check im Token-/Userinfo-Pfad. `hub/backend/main.mo:1973,6601`

### 4.2 Offboarding, Schritt für Schritt

| Bereich | Was passiert | Klasse |
|---|---|---|
| Hub-Zugang | Override auf alle Records, `hub_deactivate` an alle Connectoren | automatisch |
| Desk | 30-s-Poll, offener Offboarding-Fall wird wiederverwendet oder "Account review" erzeugt; Agent bestätigt Abgang | automatisch + manuelle Entscheidung mit Hinweis |
| Desk ↔ Assets Hardware | Sweep alle 30 s, Handover-Plan je Gerät, "Reclaim devices" folgt automatisch, Abschluss blockiert bei offenen Positionen | automatisch + physische Schritte mit Hinweis |
| **Trust** | nur `Hub.deactivate(people)`; Geräte behalten `serialOwner`; kein Unenrol, keine Markierung, kein Desk-Punkt | **nicht abgedeckt, kein Hinweis** |
| **Contracts-Seats** | `holders` nicht in `hub_ownedObjects`; kein Sweep; nur `active=false` im Lizenzdialog | **manuell, kein Reminder, kein Desk-Link** |
| Contracts-Verantwortliche | über Hub "Owned objects" übertragbar | manuell mit Hinweis |
| **Watch** | Person bleibt in `watchers`; Alerts werden still verworfen | **nicht abgedeckt** |
| Forms | Übertragung über Hub, 90-Tage-Papierkorb | manuell mit Hinweis |
| Slack | Hub-DMs stoppen; Desk hält Bot-Token-Kopien | nicht abgedeckt |
| OIDC/Lunch, Mail-Forwarding, SaaS-Konten, outbound SCIM | nichts | nicht abgedeckt (in GAPS.md dokumentiert) |

Netto: Von sechs Checklistenpunkten in Desk sind zwei verbunden, vier sind Freitext.

### 4.3 Onboarding

Kein Lifecycle-Ereignis für Eintritt (`Change = { kind : { #deactivated; #reactivated } }`). Desk "Onboarding" ist ein manuelles Formular mit Checkliste "Create accounts & groups, Order / assign hardware, Licenses & seats, E-mail, chat, calendar, Device enrollment, Day-1 intro & handover" ohne Link zu Assets, Trust oder Contracts. Trust kennt keinen Alarm für "neues, nicht enrolltes Gerät". `hub/backend/Lifecycle.mo:6`, `desk/backend/main.mo:3161`, `trust/backend/main.mo:583-589`

### 4.4 Doppelt gemoppelt (quantifiziert)

| Konzept | Implementierungen | Beleg |
|---|---|---|
| Hub-Connector-Gerüst | 6 Kopien (desk ≈206, assets ≈176, trust ≈155, contracts ≈177, watch ≈124, forms ≈179 Zeilen) + eigene Variante in Crumbs | `*/backend/main.mo`, `crumbs/backend/mixins/Auth.mo` |
| Personensucher `directory(tok,q)` | 7 gleiche Kopien | `desk:1551`, `trust:375`, `assets:624`, `contracts:738`, `forms:340`, `watch:433`, `crumbs/…/Access.mo:26` |
| Benachrichtigungs-Outbox | 5 Formen, 5 Timer (10 s, 20 s, 60 s, 60 s, Hub) | `desk:2671`, `assets:1811,2719`, `trust:1180`, `contracts:2473`, `hub:5159` |
| Slack-Konfiguration | Hub (7 Funktionen) + Desk (8 Funktionen), Secrets in zwei Canistern | `hub:5284-5405`, `desk:2979-3047` |
| Formular-Builder | 3 Modelle ohne gemeinsame Basis (Forms, Desk-Request-Types, Desk-Customer-Intake) | `forms:369-382`, `desk:178-200`, `desk/backend/Customers.mo:9` |
| "Projekt" | 4 Typen in Desk + Contracts `Space` + Crumbs `Site` | s. o. |
| CSV-Import/Export | 4 Parser | `assets:1048-1098`, `contracts:2725-2854`, `hub:5577,6064` |
| Retention-Sweeps | 6, davon 1 konfigurierbar | `desk/backend/Privacy.mo:4-10`, `trust:1562`, `forms:901`, `assets:403`, `contracts:2556`, `hub:4878,5533` |
| AI-Credential-Fetch | 4 Kopien | `desk:2520`, `assets:653-719`, `trust:409-499`, `contracts:2021-2122` |

### 4.5 Betriebsaufwand für eine Person

- ≈110 Backend-Setter über 8 Canister (`func set…|update…|configure…`: hub 42, desk 16, contracts 15, assets 13, forms 9, trust 8, watch 4, crumbs 3).
- ≥6 Rollenoberflächen (Hub Permissions, Hub-Globalrolle, Hub-Gruppen, Desk-Reporting-Grants, Finance-Team, Contracts-Space-Mitglieder, Forms-Shares).
- ≥5 Benachrichtigungskonfigurationen, 1 von 6 Retention-Verhalten konfigurierbar.
- ≥12 Secret-Klassen (SSO, SCIM, Okta, Slack, AI, OIDC, MDM ×3, ABM-Assertion halbjährlich manuell, Relay, Enrol, Kitchen/Vault) ohne Ablauf-Erinnerung.
- Die `ai`-Lane muss für Desk, Trust, Contracts, Assets vom Owner von Hand gewährt werden (`wants` statt `needs`).

### 4.6 Identität

Personen-ID-Migration ist in Desk, Assets, Trust, Watch, Forms umgesetzt. **Contracts und Crumbs haben kein `migrateIds`**; Crumbs löst keine ehemaligen Namen auf. `forms:378` Kommentar sagt E-Mail, Code speichert PID (veralteter Kommentar).

### 4.7 README/Website vs. Code

1. "connected offboarding" im README deckt nur Hub→Desk→Assets. HARDWARE-OFFBOARDING.md und LIFECYCLE.md sagen das; das README qualifiziert nicht.
2. "Revoking access triggers a push" stimmt; neue Personen werden nicht gepusht.
3. GAPS.md: "nur Assets zeigt verweigerte `hub_notify`"; tatsächlich `ignore`n Desk und Forms weiterhin. `desk:1597`, `forms:749`
4. Roadmap Stufe 2/3 (Seat-Review, SaaS-Abgleich) ist "Planned": genau die fehlenden Verbindungen.

---

## 5. Repo- und Prozesshygiene

- 24 `kebabstack-*`-Ordner unter `~/Documents/ChatGPT/` (Codex-Feature-Clones). `~/Documents/ChatGPT/kebabstack` (Produktions-Arbeitskopie, Branch `codex/desk-oncall-foundation`) hat **45 geänderte und 49 ungetrackte Dateien** seit 18./22. September; der Inhalt (On-call) ist inzwischen in `main` enthalten, die Kopie ist aber nicht aufgeräumt.
- Lokales `main` lag 3 Commits hinter `origin/main` (heute per fast-forward nachgezogen).
- `.claude/`-Verzeichnis fehlt; AGENTS.md ist auf Codex zugeschnitten. Für Claude Code braucht es eine CLAUDE.md mit den Release-Regeln (Versions-Bump, Changelog, `moc --stable-compatible`, `runtime:check`).
- 260 Releases in vier Wochen, keine Konsolidierungsphase; Release-Notes sind der Hauptteil der 216 000 Doku-Wörter.

---

## 6. Empfohlene Reihenfolge der Aufräumarbeiten (Empfehlung, nicht Befund)

1. **Sicherheit und Datenintegrität zuerst:** A1 (Preisregel hinter Finance/Admin-Rolle), D-B2 (Slack-✅ nur für Anfragesteller oder Staff, Test für signierte Events), D-B1 (Standardtypen auf `approval = "none"` oder Freigeber-Validierung, Test für Selbstfreigabe), A2/A3 (Quote-Hash nur auf rechnungsrelevante Felder, "Offer again" auf `accepted` erlauben), A4/A5 (Kollegenrechnung im Canister erzeugen wie `acceptDeal`, Browser-Renderer nur noch für Alt-Archivierung), D-F1 (Logout nur bei eindeutigem "nicht aktiv", nicht bei Exception), D-B3 (Zustellquittungen für Ticket-Benachrichtigungen nach dem On-call-Muster), D-B13 (AI-Triage default aus oder dokumentiert).
2. **Ein Käufer-Erlebnis:** Kollegen-Angebot mit dem `deal.js`-Renderer als gemeinsames Modul im SPA rendern; `loadOffers`-Karte löschen; "Start" + "Offer" zu einem Klick; Empfangsbestätigung als optionale Information statt Schritt 3 von 3; drei Attestierungen zu einer "Vorbereitet (wiped, MDM/ABM released)"; `markPaid` als Ein-Klick anbieten.
3. **Desk-Queue entrümpeln:** ein Statusfilter, ein Name, Hero-Texte raus, "Requested by"-Karte wieder sichtbar, Settings-Fehler sichtbar machen, AI-Tab auf "Hub-Schlüssel wird verwendet" reduzieren, Demo-Seed raus.
4. **Verbindungen schließen, in dieser Reihenfolge:** `#created` als Lifecycle-Ereignis (Desk eröffnet Onboarding-Fall); Contracts meldet inaktive Seat-Holder an Desk-Checkliste analog `hub_syncHardware`; Trust markiert Geräte inaktiver Besitzer und liefert sie an Operations; Watch-Watcher bereinigen.
5. **SDK-Konsolidierung:** Hub-Gerüst + `directory()` als Mixin ins SDK (Crumbs' `mixins/Auth.mo` als Vorlage), eine Outbox mit Backoff und sichtbaren Verweigerungen, eine Retention-Policy, Slack-Events über den Hub statt Token-Kopien in Desk.
6. **Frontend-Hygiene:** `shared.js` für esc/opt/fmt/run/key; neun ungenutzte Backend-Methoden entfernen oder anbinden; Canonical-Regex aus der Router-Liste ableiten; CSS auf `--ks-*` und drei Breakpoints.
7. **Prozess:** Release-Freeze für Konsolidierung; Doku pro Modul auf README + CHANGELOG + ein Operator-Guide; alte Clones archivieren; CLAUDE.md anlegen.

---

## 7. Nicht geprüft

Produktionsdaten und produktive Canister; Hub-`hub_notify`-Verhalten live; Pixel-Rendering jenseits der Fixture-Vorschauen; Trust-, Contracts-, Watch-, Forms-, Crumbs-Oberflächen im Detail (nächste Runde, Tool für Tool); PocketIC-Backend-Tests wurden gelesen, nicht ausgeführt.
