# kebab-stack für Geschäftsführung und IT

Stand: 5. September 2026 · Alpha, noch vor dem produktiven Einsatz.

kebab-stack bündelt typische interne IT-Aufgaben: Personen und Zugriffsrechte,
Serviceanfragen, Geräteinventar und Domainüberwachung. Der Hub verwaltet die
Identität; Desk, Assets und Watch nutzen sie gemeinsam. Kitchen installiert und
aktualisiert die Anwendungen. Vault erstellt und lädt Sicherungspunkte.

## Warum eine ernsthafte Alternative?

Die MIT-Lizenz verursacht keine kebab-stack-Gebühr pro Person. Gemeinsame Anmeldung
und Benutzerverwaltung können Integrationsarbeit sparen. Motoko hält Daten im
Anwendungszustand; für diese Anwendungen muss kein separater SQL-Datenbankdienst
betrieben werden. Das ist besonders interessant, wenn ein kleines Team heute
mehrere Abonnements und Benutzerverzeichnisse pflegt.

Ob es günstiger wird, entscheidet die Gesamtrechnung: tatsächlich kündbare
Lizenzen minus neue Infrastruktur-, API-, Betriebs- und anteilige Umstellungskosten.
Es gibt bisher keinen belastbaren kebab-stack-Kosten- oder Kapazitätsbenchmark.
Eine selbst gepflegte Alpha kann durch Betreuungsaufwand teurer sein als SaaS.
Der [Kostenleitfaden](POSITIONING.md) enthält eine ausfüllbare Rechenlogik.

## Was bedeutet souverän?

Quellcode und Anwendungskontrolle liegen bei euch; die Engine-Konfiguration legt
Betreiber und Standorte fest. Das ermöglicht Gestaltungsspielraum. Es beweist
weder automatisch einen Schweizer/EU-Datenstandort noch Vertraulichkeit gegenüber
Infrastrukturbetreibern. ICP, Gateways und gegebenenfalls Internet Identity, Okta,
Google, Slack oder ein KI-Anbieter bleiben Abhängigkeiten. Vor der Einführung
müssen Controller, Wiederherstellungsschlüssel und externe Datenflüsse feststehen.

## Was bleibt Aufgabe der IT?

Anforderungen abgleichen, Berechtigungen pflegen, neue Versionen prüfen,
Sicherungen kontrollieren und Wiederherstellung üben. Motokos Typprüfung hilft bei
strukturell verträglichen Upgrades; sie ersetzt keine fachlichen Tests.
Sicherungen gelten je Canister, nicht als atomarer Stand der gesamten Suite.

Die gebündelten Apps akzeptieren Berechtigungen höchstens 60 Sekunden seit Beginn
der letzten erfolgreichen Verzeichnisabfrage. Danach sperren sie ohne neue
Hub-Bestätigung. Das begrenzt veraltete Rechte, macht den Hub aber zugleich zu
einer zentralen Verfügbarkeitsabhängigkeit. Verzögerungen beim Eingang externer
IdP-Änderungen kommen hinzu.

## Sinnvoller Pilot

Mit Testdaten beginnen: fünf Personen aufnehmen, eine Geräteausgabe und einen
Genehmigungsprozess durchspielen, eine Person sperren, den Hub ausfallen lassen
und eine Wiederherstellung durchführen. Zeit, Fehler und verbleibende Fremdsysteme
notieren. Erst daraus eine Einführung entscheiden. Device Trust, ausgehendes SCIM
und eine vollständige externe Sicherung sind noch nicht geliefert.

[Installation](INSTALL.md) · [Betrieb](OPERATIONS.md) · [offene Grenzen](GAPS.md).
