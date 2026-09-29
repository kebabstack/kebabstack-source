// Public product illustration, never a Hub client. See CONTENT.md for scope.
// The same synthetic snapshot drives both views; the TV omits work-only fields.
const example = {
  desk: { active: 12, unassigned: 3 },
  trust: { score: 96, assessed: 38, total: 40, attention: 2 },
  assets: { stock: 8, total: 48, preparing: 2, sales: 1 },
  contracts: { due: 3, total: 24 },
  watch: { alerts: 1, enabled: 12 },
};

export function renderOperations(lang, icon, esc) {
  const t = (de, en) => lang === "de" ? de : en;
  const m = example;
  const sources = [
    { id: "desk", name: "Desk", icon: "ticket", value: m.desk.active,
      label: t("Offene Tickets", "Open requests"),
      context: t("Interner Support", "Internal support"),
      note: t(`${m.desk.unassigned} ohne Zuständigkeit`, `${m.desk.unassigned} without an agent`),
      action: t("Zuständigkeit klären", "Assign an agent") },
    { id: "trust", name: "Trust", icon: "shield", value: m.trust.score, unit: "/ 100",
      label: t("Ø verifizierter Score", "Average verified score"),
      context: t(`${m.trust.assessed} von ${m.trust.total} Geräten vollständig geprüft`, `${m.trust.assessed} of ${m.trust.total} devices fully assessed`),
      note: t(`${m.trust.attention} mit fehlgeschlagenen Checks`, `${m.trust.attention} with failing checks`),
      action: t("Prüfergebnisse ansehen", "Review the evidence") },
    { id: "assets", name: "Assets", icon: "laptop", value: m.assets.stock,
      label: t("Geräte auf Lager", "Devices in stock"),
      context: t(`${m.assets.total} Geräte im Inventar`, `${m.assets.total} devices in inventory`),
      note: t(`${m.assets.preparing} weitere in Aufbereitung`, `${m.assets.preparing} more being prepared`),
      action: t("Hardware nachverfolgen", "Follow up on hardware") },
    { id: "contracts", name: "Contracts", icon: "document", value: m.contracts.due,
      label: t("Entscheidungen binnen 30 Tagen", "Decisions within 30 days"),
      context: t(`${m.contracts.total} laufende Verträge`, `${m.contracts.total} active contracts`),
      note: t("Erfasste Entscheidungsfristen", "Recorded decision deadlines"),
      action: t("Verlängerungen prüfen", "Review renewals") },
    { id: "watch", name: "Watch", icon: "globe", value: m.watch.alerts,
      label: t("Domain mit Meldung", "Domain with an alert"),
      context: t(`${m.watch.enabled} Domains überwacht`, `${m.watch.enabled} domains monitored`),
      note: t("DNS-Hinweis prüfen", "Review the DNS finding"),
      action: t("Meldung untersuchen", "Investigate the alert") },
  ];
  const cards = (tv) => `<ul class="operations-cards">${sources.map(s => `<li class="operations-card">
    <h4>${icon(s.icon)}${s.name}</h4>
    <p class="operations-value">${s.value}${s.unit ? `<span>${s.unit}</span>` : ""}</p>
    <p class="operations-label">${esc(s.label)}</p>
    <p class="operations-context">${esc(s.context)}</p>
    <p class="operations-note">${esc(s.note)}</p>
    ${tv ? "" : `<a href="#app-${s.id}" aria-label="${esc(s.action)} · ${s.name} · ${t("Produktbeispiel", "Product example")}">${esc(s.action)} ${icon("arrow")}</a>`}
  </li>`).join("")}</ul>`;
  return `<section class="section shell operations-section" id="operations" aria-labelledby="operations-heading">
    <div class="section-heading"><div><p class="eyebrow">02 / HUB OPERATIONS</p><h2 id="operations-heading">${t("Deine IT auf einen Blick.<br>Der nächste Schritt gleich dabei.", "Your IT at a glance.<br>Your next step in sight.")}</h2></div>
    <p class="section-intro">${t("Tickets, Gerätezustand, Hardware, Vertragsfristen und Domain-Meldungen laufen im Hub zusammen. Du erkennst, wo Arbeit ansteht, und gehst direkt in der zuständigen App weiter.", "Requests, device posture, hardware, contract deadlines and domain alerts come together in Hub. See what needs attention, then continue in the app that owns the work.")}</p></div>
    <figure class="operations-demo" data-scenario="operations" aria-label="${t("Operations-Dashboard mit Beispieldaten", "Operations dashboard with sample data")}">
      <div class="operations-toolbar"><span class="tiny-label">Hub → Operations</span><span class="badge">${t("Beispieldaten", "Sample data")}</span>
        <div class="demo-control" data-demo-controls hidden><div class="step-buttons" role="group" aria-label="${t("Beispielansicht", "Example view")}">
          <button type="button" data-scene="operations-work" aria-controls="operations-work" aria-pressed="true">${t("Am Arbeitsplatz", "At your desk")}</button>
          <button type="button" data-scene="operations-tv" aria-controls="operations-tv" aria-pressed="false">${t("Auf dem Team-TV", "On the team TV")}</button>
        </div></div>
      </div>
      <section class="demo-scene" id="operations-work" aria-labelledby="operations-work-title">
        <div class="operations-canvas">
          <div class="operations-view-heading"><h3 id="operations-work-title">${t("Was braucht deine Aufmerksamkeit?", "What needs your attention?")}</h3><span>${t("Beispiel · 5 von 5 Quellen verfügbar", "Example · 5 of 5 sources available")}</span></div>
          ${cards(false)}
          <div class="operations-followup"><div><span class="tiny-label">ASSETS · ${t("NÄCHSTER SCHRITT", "NEXT STEP")}</span><h4>${t("Bezahlt. Übergabe noch offen.", "Paid. Handover still open.")}</h4><p>${t("Ein Verkauf bleibt bis zur physischen Übergabe offen. Operations macht die Nacharbeit sichtbar; abgeschlossen wird sie in Assets.", "A sale stays open until physical handover. Operations surfaces the follow-up; the work is completed in Assets.")}</p></div><a class="text-link" href="#app-assets">${t("Verkaufsbeispiel ansehen", "Explore the sale example")} ${icon("arrow")}</a></div>
        </div>
        <p class="operations-view-note">${t("Dein Arbeitsbereich: aktuelle Summen und nächste Schritte aus Apps, für die du Admin-Zugriff hast. Die Links in dieser Illustration öffnen die Produktbeispiele.", "Your workspace: current totals and next steps from apps where you have Admin access. Links in this illustration open the product examples.")}</p>
      </section>
      <section class="demo-scene" id="operations-tv" aria-labelledby="operations-tv-title">
        <div class="operations-canvas operations-tv-canvas">
          <div class="operations-view-heading"><div><span class="tiny-label">${t("TEAMRAUM · BEISPIEL", "TEAM ROOM · EXAMPLE")}</span><h3 id="operations-tv-title">${t("Ein Bildschirm. Die gemeinsame Lage.", "One screen. A shared picture.")}</h3></div><span class="badge">${t("Nur Anzeige", "Read only")}</span></div>
          ${cards(true)}
          <p class="operations-tv-footer">${icon("shield")} ${t("Ausgewählte Kennzahlen · keine Namen oder Ticketinhalte", "Selected metrics · no names or ticket content")}</p>
        </div>
        <p class="operations-view-note">${t("Im Hub per Code koppeln, Quellen auswählen und für 1, 7 oder 30 Tage freigeben. Eigener Anzeigezugang statt Admin-Anmeldung am TV. Verkäufe und Austritte bleiben im Arbeitsbereich.", "Pair by code in Hub, choose sources and approve for 1, 7 or 30 days. Separate display access instead of an admin sign-in on the TV. Sales and departures stay in the work view.")}</p>
      </section>
      <figcaption>${t("Produktillustration · Beispieldaten · implementierte Alpha. Hier werden keine Unternehmensdaten geladen.", "Product illustration · sample data · implemented alpha. No company data is loaded here.")}</figcaption>
    </figure>
    <div class="operations-principles">
      <div><h3>${t("Aktuell statt scheinbar gesund.", "Current, not assumed healthy.")}</h3><p>${t("Die echte Übersicht aktualisiert sich jede Minute. Fehlende oder veraltete Quellen sind als nicht verfügbar erkennbar, statt als null zu erscheinen.", "The real overview refreshes every minute. Missing or stale sources are marked unavailable instead of appearing as zero.")}</p></div>
      <div><h3>${t("Ein Überblick. Keine zweite Pflege.", "One overview. No duplicate upkeep.")}</h3><p>${t("Tickets bleiben in Desk, Geräte in Assets. Operations zeigt die zusammengefasste Lage; Änderungen machst du dort, wo der Vorgang geführt wird.", "Tickets stay in Desk, hardware in Assets. Operations combines the picture; changes happen where the work is managed.")}</p></div>
      <div><h3>${t("Nur das teilen, was ins Team gehört.", "Share what belongs in the room.")}</h3><p>${t("Ein Owner bestimmt Quellen und Ablauf des TV-Zugangs und kann ihn widerrufen. Auch kleine Summen können sensibel sein: Die Auswahl richtet sich nach dem Publikum.", "An Owner selects sources and expiry and can revoke TV access. Even small counts can be sensitive: choose what is suitable for the audience.")}</p></div>
    </div>
    <p class="operations-boundary">${t("Aktuelle Momentaufnahmen, keine historischen Trends oder Gesamtbewertung der Firma. Der Trust-Score bezieht sich auf vollständig geprüfte, erfasste Geräte. Nicht jedes Gerät im Inventar muss in Trust erfasst sein.", "Current snapshots, not historical trends or a company-wide health score. Trust scores cover fully assessed enrolled devices. Not every device in inventory is necessarily enrolled in Trust.")} <a href="https://github.com/kebabstack/kebabstack-source/blob/main/docs/HUB-OPERATIONS.md">${t("Funktionsumfang & Zugriffsmodell", "Coverage & access model")} ↗</a></p>
  </section>`;
}
