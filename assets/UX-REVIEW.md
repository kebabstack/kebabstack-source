# Assets 0.10 — UX-Review und Umsetzung

Historische UX-Entscheidungen vom 17. September 2026. Den aktuellen Stand und
betriebliche Grenzen beschreiben [README](README.md) und [Installationsanleitung](INSTALL.md).

## Leitentscheidung

Das Register beantwortet «Was haben wir?», Sales beantwortet «Was ist als Nächstes zu tun?».
Die Gestaltung übernimmt die warme, ruhige Sprache des Dealrooms: helle Flächen,
dunkelgrüne Akzente, klare Typografie und wenige hervorgehobene Aktionen.
Technische Details bleiben erreichbar, bestimmen aber nicht mehr jede Ansicht.
Die Produktsprache bleibt wie bisher Englisch.

## Review der Bereiche

| Bereich | Beobachtung | Umgesetzt |
| --- | --- | --- |
| Navigation | Erfassung, Betrieb und Administration waren gleich stark gewichtet. Der erste Bildschirm war auf Erfassung ausgerichtet. | Einstieg über Devices. Danach Scan & update, Sales und Apple inventory. Settings, Import / export und Help sind nachgeordnet; Rollenrechte bleiben erhalten. |
| Devices | Viele gleichwertige Metadaten erschwerten das Überfliegen. | Ruhige Statusübersicht und kompakte Zeilen. Normale MDM-Zuordnung und Fotoanzahl entfallen in der Liste; eine abweichende MDM-Zuordnung bleibt als handlungsrelevanter Hinweis sichtbar. |
| Gerätedetail | Hersteller/Modell wurden wiederholt, Kaufdaten und Verkauf konkurrierten mit dem Geräteverlauf. | Wiederholungen reduziert, MDM-/ABM-Details und Kaufdaten aufklappbar, eigener Verkaufsbereich. Kritische Abgleichhinweise öffnen sich direkt. «Registered» bezeichnet nun korrekt das Erstellungsdatum. Historische Verkaufserfassung ist sprachlich von einem Verkauf mit Rechnung getrennt. |
| Scan & update | Viel Erklärung vor dem eigentlichen Schritt. Technische AI-Einstellungen lenkten ab. | Kürzerer Einstieg mit klarer Erfassungsaktion; manuelle Eingabe bleibt sichtbar. Bei ausgeschalteter AI gibt es eine knappe Erklärung und einen Settings-Link. |
| Sales-Übersicht | «Open / issued / paid» überlappten. Bezahlt bedeutete nicht zwingend übergeben. Keine Mengen pro Prozessphase; E-Mail-Adressen in jeder Zeile. | Vier Prozessphasen mit Mengen: Offer → Invoice → Paid → Complete. Cancelled steht als eigener Abschluss daneben. Open umfasst alle noch nicht abgeschlossenen Vorgänge. Zeilen zeigen Gerät, Käufername, Betrag und nächste Aufgabe; Adresse und E-Mail bleiben im Detail. Suche und Pagination ersetzen die bisher begrenzte Übersicht. |
| Verkaufsdetail | Rechnungsdaten, Dealroom-Ereignisse, Vorbereitungschecks und Aktionen hatten zu wenig Hierarchie. | Prozessanzeige und konkrete nächste Aufgabe zuerst. Aktive Arbeit links, Dokumente und Referenzdaten rechts; auf kleinen Screens untereinander. Adresse, Dokumenthash, Konditionen und sekundäre Aktionen sind aufklappbar. |
| Apple inventory | Technische Erklärung beanspruchte viel Aufmerksamkeit. | Klarer Zweck und kürzere Überschrift; zugängliche Filterbuttons. Abgleich, Übernahme ins Register und Warnungen für verkaufte Geräte bleiben erhalten. |
| Settings | Ein langer Bildschirm mischte tägliche Einstellungen mit Integrationen und Wartung. | Fünf Gruppen: General, Connections, Sales, Data & privacy und Maintenance. Verbindungen sind aufklappbar. |
| Import / export und Help | Seltene Aufgaben und ausführliche Erklärungen wirkten wie primäre Arbeit. | In der Navigation nachgeordnet. Hilfe nach Themen aufklappbar. Finanzexport bleibt direkt in Sales erreichbar. |
| Dealroom | Bereits die gestalterische Referenz. | Käuferfluss und vorhandene Dokumente bleiben erhalten; Regressionstests decken Annahme und Ablehnung ab. |

## Der Verkaufsprozess

1. **Offer:** Preis vereinbaren und Annahme dokumentieren; externe Käufer erhalten den privaten Dealroom.
2. **Invoice:** Rechnung ausstellen und archivieren. Zahlung anhand des Bankeingangs bestätigen.
3. **Paid:** Rechnungsbeleg, gegebenenfalls Empfangsbestätigung des Käufers, Gerätevorbereitung und ABM-Freigabe prüfen. Physische Übergabe dokumentieren.
4. **Complete:** Zahlung und Übergabe sind erfasst. Die Rechnung bleibt erhalten.

**Cancelled ist ein separater Endzustand**, kein regulärer nächster Schritt nach Zahlung.
Eine Zahlung allein schliesst den Vorgang nicht ab. Auch interne Verkäufe erhalten jetzt
eine explizite Übergabe; das Gerät bleibt bis dahin reserviert und wird erst dann als
verkauft markiert. Bestehende Rechnungen werden nicht umgeschrieben.

Die Mengen werden im Backend über alle Verkäufe berechnet, vor Filterung und Pagination.
Eine Seite enthält höchstens 100 Vorgänge. Die Mengen bleiben bei einer Suchanfrage
konstant; die Trefferanzahl beschreibt die aktuelle Auswahl.

### Bestehende Verkäufe

Für alte Verkäufe ohne erfasste Übergabe wird keine Übergabe aus «paid» oder dem
Gerätestatus erfunden. Sie bleiben in Paid sichtbar, bis IT den Abschluss prüft und
dokumentiert. Existiert für das Gerät bereits ein neuerer Verkauf, verhindert das
Backend eine nachträgliche alte Übergabe, die den aktuellen Gerätezustand überschreiben
könnte. Diese historischen Ausnahmefälle müssen vor dem Rollout geprüft werden.
Bereits im Dealroom dokumentierte Übergaben erscheinen unmittelbar als Complete.

## Wipe, Kandji / Iru und Sperrcodes

Die alten Häkchen waren zu ungenau: Ein fehlender MDM-Eintrag beweist weder einen
erfolgreichen Wipe noch freie Aktivierung. Die Oberfläche führt jetzt durch diese Reihenfolge:

1. Solange der MDM-Eintrag erreichbar ist, Sperren prüfen und nötige Codes abrufen.
2. Gerät löschen und den tatsächlichen Abschluss bzw. Setup-Bildschirm am Gerät prüfen.
   Falls nötig, den PIN nach dem Löschbefehl erneut prüfen.
3. Firmenverwaltung freigeben, einschliesslich Apple Business Manager, sofern vorhanden.
   Prüfen, dass Setup keine Firmenregistrierung mehr verlangt; den Kandji-/Iru-Eintrag
   erst nach der Prüfung entfernen.

Die zwei Bestätigungen heissen jetzt **Wiped & setup tested** und **Company management
released**. Sie sind vor der Übergabe erforderlich, nicht schon vor der Rechnungsstellung.
Assets dokumentiert diese Arbeit; es führt keine Lösch-, Entsperr- oder MDM-Entfernungsbefehle aus.

**Implementiert:** Admins können den Device unlock PIN des verknüpften Kandji-/Iru-Geräts
explizit abrufen. Der Backend-Aufruf nutzt `GET /api/v1/devices/{device_id}/secrets/unlockpin`.
Der PIN bleibt aus persistentem Register, Käuferansicht und Audittext heraus und wird
nach 30 Sekunden, beim Verlassen der Ansicht, beim Ausloggen oder Verbergen des Tabs
aus der Anzeige entfernt. Führende Nullen bleiben erhalten. Protokolliert wird nur der
Zugriff. Nach dem externen Aufruf werden Session, Verbindung und Gerätezuordnung erneut geprüft.

Ein leerer oder fehlender PIN ist **kein** Nachweis, dass das Gerät entsperrt ist.
Activation-Lock-Bypasscodes sind ein anderer Mechanismus und werden hier nicht abgerufen.
Die Integration ist lokal mit simulierten API-Antworten getestet; die tatsächlichen
Device-secret-Rechte des produktiven Kandji-/Iru-Tokens sind noch zu prüfen.

## Persönliche Daten: ehrlicher Status und empfohlene nächste Entscheidung

**Es gibt bisher keine automatische Löschung oder Anonymisierung.** Daran ändert dieses
Release nichts. Archivieren blendet ein Gerät aus; Link-Widerruf schliesst den Zugang;
beides löscht nicht die zugrunde liegenden Daten. Diese Information steht jetzt im Tool.

Bereits umgesetzt sind weniger Daten in der Sales-Übersicht, ein minimales Backend-
Antwortformat ohne Käuferadresse und E-Mail sowie der nur kurz sichtbare PIN.
Gerätehistorie, Zuordnungen, Fotos, Notizen, Käuferdaten, Annahmen und Rechnungsunterlagen
bleiben weiterhin gespeichert. Bei aktiver Bilderkennung erhält der konfigurierte AI-Anbieter
das Foto einschliesslich darin sichtbarer persönlicher Angaben; auch das wird jetzt klar benannt.
Bereits exportierte Kopien werden vom Tool nicht kontrolliert.

Vor einer automatischen Löschung sollte die Organisation folgende Regelung beschliessen:

| Datenklasse | Vorschlag zur Entscheidung | Noch zu implementieren |
| --- | --- | --- |
| Nicht zustande gekommene Angebote | Kurze, zweckgebundene Frist nach Storno/Ablauf festlegen; offene Streitfälle ausnehmen. | Löschvorschau, Frist und Ausnahmen, berechtigter Löschvorgang. |
| Operative Fotos, Notizen und Zuordnungen | Für jede Klasse festlegen, was nach Abschluss noch gebraucht wird. Freitext möglichst sparsam erfassen. | Referenzprüfung, sichere Löschung/Anonymisierung und Umgang mit Suchdaten, Exporten und Backups. |
| Rechnungen, Gutschriften und erforderliche Nachweise | Finance legt Umfang, Aufbewahrungsfrist und Sperren fest. Die Schweizer allgemeine Buchführungsfrist beträgt zehn Jahre ab Ende des Geschäftsjahres; weitere Pflichten können gelten. | Fristenverwaltung und anschliessender kontrollierter Löschlauf, getrennt von optionalen operativen Daten. |
| Betroffenenanfragen | Verantwortliche Person und prüfbaren Ablauf bestimmen; aufzubewahrende Unterlagen von löschbaren Daten trennen. | Personenbezogene Bestandsübersicht, dokumentierte Entscheidung und kontrollierte Ausführung. |

Diese Vorschläge sind kein bereits aktiver Löschplan und keine Aussage, dass das Tool
damit automatisch datenschutzkonform wäre. Ein sofortiger pauschaler Löschbutton würde
den unterschiedlichen Zwecken und Aufbewahrungspflichten nicht gerecht.

## Prüfung und Review

- Motoko-Prüfung und Build mit dem gepinnten Compiler; stabile Signatur gegen die
  unveränderte, eingecheckte Baseline geprüft.
- Backend-Sicherheitstests für Autorisierung, Rechnung/Übergabe, Dealroom,
  API-PIN-Behandlung und vollständige Sales-Mengen über mehrere Seiten.
- Upgrade-Test mit dem tatsächlich vorhandenen Assets-0.9.0-WASM und befülltem Zustand.
- Frontend-Smokes für Admin, Mitglied, deaktivierte AI, Anmeldung/Routing, Rechnungs-PDF,
  Dealroom, PIN-Anzeige und Übergabe.
- Visuelle Prüfung im Browser auf Desktop und Mobile. Vorschau mit fiktiven Daten;
  weder echte Käuferdaten noch produktive MDM-Befehle werden verwendet.

Lokale Vorschau neu bauen: `node assets/tools/preview.mjs`.
Dann `.assets-preview` mit einem lokalen HTTP-Server ausliefern. Diese Vorschau nutzt
Test-Fixtures; sie ist keine produktive Backend-Verbindung.

Vor einem autorisierten Rollout: historische Paid-Vorgänge prüfen, Token-Rechte für den
PIN-Abruf bestätigen und Backend plus vollständiges Frontend gemeinsam veröffentlichen.
Die Datenschutzregelung ist eine eigenständige fachliche Entscheidung.

## Quellen

- [Kandji / Iru API-Dokumentation](https://api-docs.iru.com/) — Device unlock PIN und separater Activation-Lock-Code.
- [Kandji: Erase a device](https://support.kandji.io/kb/erase-a-device) — Hardwareunterschiede und Löschvoraussetzungen.
- [Kandji: Deleting a device record and uninstalling Kandji](https://support.kandji.io/kb/deleting-a-device-record-and-uninstalling-kandji) — Wirkung der Entfernung eines Geräteeintrags.
- [Kandji: Activation Lock](https://support.kandji.io/kb/activation-lock) — separater Sperrmechanismus.
- [KMU-Portal des Bundes: elektronische Buchführung](https://www.kmu.admin.ch/en/electronic-bookkeeping) — allgemeine Aufbewahrung von Buchführungsunterlagen.
