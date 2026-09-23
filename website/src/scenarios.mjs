// Editorial examples of implemented behavior. Never customer records or live metrics.
// Evidence and metric definitions: ../CONTENT.md. One fixture drives both languages.
export const traffic = [
  {
    range: "current",
    start: "2026-09-14",
    visits: [140, 160, 180, 170, 210, 190, 150],
    visitors: [126, 144, 162, 153, 189, 171, 135],
    views: [224, 256, 288, 272, 336, 304, 240],
    bounces: [42, 48, 54, 51, 63, 57, 45],
    funnel: [540, 180, 54],
    channels: [["Organic search",600,24],["AI assistants",240,18],["Paid search",180,8],["Direct / other",180,4]],
  },
  {
    range: "previous",
    start: "2026-09-07",
    visits: [120, 130, 150, 140, 180, 160, 120],
    visitors: [108, 117, 135, 126, 162, 144, 108],
    views: [180, 195, 225, 210, 270, 240, 180],
    bounces: [48, 52, 60, 56, 72, 64, 48],
    funnel: [450, 120, 36],
    channels: [["Organic search",550,18],["AI assistants",150,10],["Paid search",100,5],["Direct / other",200,3]],
  },
];
export const sum = (values) => values.reduce((a, b) => a + b, 0);

export function renderScenario(id, lang, icon, esc) {
  const de = lang === "de";
  const t = (a, b) => (de ? a : b);
  const pill = (label, tone = "neutral") =>
    `<span class="badge ${tone}">${esc(label)}</span>`;
  const row = (title, detail, status, tone = "neutral") =>
    `<li class="evidence-row"><div><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>${pill(status, tone)}</li>`;
  const callout = (title, text, tone = "") =>
    `<div class="demo-callout ${tone}"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const metric = (n, label) =>
    `<div><strong>${esc(n)}</strong><span>${esc(label)}</span></div>`;
  const labels = {
    hub: t("Ein Ort für den Überblick.", "One place to see what needs you."),
    desk: t(
      "Eine Sperre. Ein klarer nächster Schritt.",
      "One deactivation. A clear next step.",
    ),
    assets: t(
      "Austritt bestätigt. Hardware bleibt im Blick.",
      "Departure confirmed. Hardware accounted for.",
    ),
    trust: t(
      "Ein Gerät. Nachvollziehbare Prüfungen.",
      "One device. Evidence for every check.",
    ),
    contracts: t(
      "Vor der Verlängerung entscheiden.",
      "Decide before the renewal.",
    ),
    forms: t(
      "Workshop-Vorschläge gemeinsam prüfen.",
      "Review workshop proposals together.",
    ),
    watch: t(
      "Ein DNS-Eintrag braucht Aufmerksamkeit.",
      "A DNS record needs attention.",
    ),
    crumbs: t(
      "Was passiert zwischen Besuch und Anfrage?",
      "What happens between visit and enquiry?",
    ),
    phone: t(
      "Ein Blick auf die geplante Begleit-App.",
      "A look at the planned companion.",
    ),
  };
  let body = "";
  if (id === "hub")
    body = `
    <div class="demo-metrics">${metric("12", t("Offene interne Tickets", "Open internal tickets"))}${metric("48", t("Inventarisierte Geräte", "Inventory devices"))}${metric("3", t("Anstehende Vertragsentscheidungen", "Upcoming contract decisions"))}</div>
    <p class="demo-label">Operations · ${t("Nächste Schritte", "Where to focus")}</p>
    <ul class="evidence-list">${row("Desk", t("3 interne Tickets ohne Zuständigkeit", "3 internal tickets without an assignee"), t("Zuweisen", "Assign"), "warning")}${row("Trust", t("2 von 40 erfassten Geräten mit aktuellen Fehlern", "2 of 40 enrolled devices have current failures"), t("Prüfen", "Review"), "warning")}${row("Contracts", t("Nächste Entscheidungsfrist: 12. Oktober 2026", "Next decision deadline: 12 October 2026"), t("Öffnen", "Review"))}</ul>
    ${callout(t("Übersicht hier. Bearbeitung in der App.", "Overview here. Work in the source app."), t("Nur freigegebene Quellen tragen Daten bei. Rollen werden zentral im Hub vergeben.", "Only authorized sources contribute. App roles are managed centrally in Hub."))}`;
  if (id === "desk") {
    const steps = [
      {
        label: t("Erkannt", "Detected"),
        title: t(
          "Account review · Alex Beispiel",
          "Account review · Alex Example",
        ),
        state: t("Prüfung offen", "Needs review"),
        content: `<ol class="event-trail"><li><span>01</span><div><strong>${t("Okta deaktiviert das Konto", "Okta deactivates the account")}</strong><p>${t("Hub empfängt die Änderung für die bekannte Person.", "Hub receives the change for the known person.")}</p></div></li><li><span>02</span><div><strong>${t("Desk legt den internen Prüffall an", "Desk creates the internal review")}</strong><p>${t("Ein vorhandener offener Fall wird wiederverwendet.", "An existing open case is reused.")}</p></div></li></ol>${callout(t("Ist dies wirklich ein Austritt?", "Is this actually a departure?"), t("IT bestätigt den Austritt oder dokumentiert einen anderen Grund für die Sperre. Eine Sperre allein löst keine Rückgabe aus.", "IT confirms the departure or records another reason for the deactivation. A deactivation alone does not trigger a return."), "warning")}`,
      },
      {
        label: t("Kontext", "Context"),
        title: t("Person & zugehörige Arbeit", "Person & related work"),
        state: t("Rechte geprüft", "Permissions checked"),
        content: `<ul class="evidence-list">${row("Assets", t("Notebook, Display und Dock zugewiesen", "Notebook, display and dock assigned"), t("3 Geräte", "3 devices"))}${row("Contracts", t("Eine Vertragsverantwortung, zwei Lizenzzuordnungen", "One contract responsibility, two license allocations"), t("Prüfen", "Review"))}${row("Forms", t("Ein Formular gehört dieser Person", "One form owned by this person"), t("Übertragen", "Reassign"))}${row("Trust", t("Ein zugeordnetes Notebook mit aktuellem Bericht", "One assigned notebook with a current report"), t("Aktuell", "Current"), "success")}</ul>${callout(t("Zusammengeführt, nach bestehenden Rechten.", "Connected, within existing permissions."), t("Desk zeigt nur den Kontext, den der Agent auch im jeweiligen Tool sehen darf. Details bleiben in der zuständigen App.", "Desk shows only context the agent is allowed to see in each tool. Details remain in the owning app."))}`,
      },
      {
        label: t("Weiterarbeiten", "Follow through"),
        title: t("Offboarding · Alex Beispiel", "Offboarding · Alex Example"),
        state: t("Austritt bestätigt", "Departure confirmed"),
        content: `<div class="demo-metrics two">${metric("1 / 3", t("Hardwarepositionen abgeschlossen", "Hardware items completed"))}${metric("2", t("Positionen bleiben offen", "Items still open"))}</div><ul class="evidence-list">${row(t("Notebook", "Notebook"), t("Verkauf geplant · Übergabe steht aus", "Sale planned · handover outstanding"), t("Offen", "Open"), "warning")}${row(t("Display", "Display"), t("Bei IT · Aufbereitung läuft", "With IT · preparation in progress"), t("Offen", "Open"), "warning")}${row("Dock", t("Rückgabe und Aufbereitung bestätigt", "Return and preparation confirmed"), t("Erledigt", "Complete"), "success")}</ul>${callout(t("Der Abschluss folgt dem tatsächlichen Ergebnis.", "Completion follows the actual result."), t("Desk liest den Fortschritt aus Assets. Offene Positionen oder eine nicht erreichbare Quelle verhindern den Abschluss.", "Desk reads progress from Assets. Outstanding items or an unavailable source prevent completion."))}`,
      },
    ];
    body = `<div class="demo-control" data-demo-controls hidden><span>${t("Beispiel erkunden", "Explore the example")}</span><div class="step-buttons">${steps.map((s, i) => `<button type="button" data-scene="desk-${i}" aria-controls="desk-${i}" aria-pressed="${i === 0}">${i + 1}. ${s.label}</button>`).join("")}</div></div>${steps.map((s, i) => `<section class="demo-scene" id="desk-${i}"><div class="scene-heading"><h5>${s.title}</h5>${pill(s.state, i === 0 ? "warning" : "neutral")}</div>${s.content}</section>`).join("")}`;
  }
  if (id === "assets")
    body = `
    <div class="record-heading">${icon("laptop")}<div><strong>Notebook · 14″</strong><span>${t("Bisherige Zuordnung: Alex Beispiel", "Current holder: Alex Example")}</span></div>${pill(t("Verkauf offen", "Sale open"), "warning")}</div>
    <ol class="sale-steps">${[t("Angebot", "Offer"), t("Rechnung", "Invoice"), t("Bezahlt", "Paid"), t("Übergabe", "Handover")].map((x, i) => `<li class="${i < 3 ? "done" : ""}"><span>0${i + 1}</span>${x}</li>`).join("")}</ol>
    <ul class="evidence-list">${row(t("Privater Dealroom", "Private dealroom"), t("Externer Käufer · Angebot angenommen", "Outside buyer · offer accepted"), t("Angenommen", "Accepted"), "success")}${row(t("Daten & Geräteverwaltung", "Data & device management"), t("Löschen, Setup testen und Verwaltung freigeben", "Wipe, test setup and release device management"), t("IT prüft", "IT checks"), "warning")}${row(t("Physische Übergabe", "Physical handover"), t("Wird nach Vorbereitung erfasst", "Recorded after preparation"), t("Ausstehend", "Pending"))}</ul>
    ${callout(t("Bezahlt bedeutet noch nicht übergeben.", "Paid does not mean handed over."), t("Ein ehemaliger Mitarbeiter kann über einen privaten Dealroom kaufen. Das Unternehmenskonto bleibt deaktiviert.", "A former employee can buy through a private dealroom. Their company account stays deactivated."))}`;
  if (id === "trust")
    body = `
    <div class="record-heading">${icon("laptop")}<div><strong>Notebook · 14″</strong><span>${t("Zugeordnet über Assets", "Assignment from Assets")}</span></div>${pill(t("Handlungsbedarf", "Needs attention"), "warning")}</div>
    <p class="demo-label">${t("Beispielbericht", "Example report")} · 22 Sep 2026 · 09:40 UTC</p>
    <ul class="evidence-list">${row(t("Festplattenverschlüsselung", "Disk encryption"), "FileVault", t("Bestanden", "Passing"), "success")}${row(t("Firewall", "Firewall"), t("Aktueller Agent-Bericht: ausgeschaltet", "Current agent report: disabled"), t("Fehlgeschlagen", "Failing"), "danger")}${row(t("Bildschirmsperre", "Screen lock"), t("Kein aktuelles Prüfergebnis", "No current check result"), t("Nicht verifiziert", "Not verified"), "warning")}</ul>
    ${callout(t("Gezielt beheben. Frisch nachprüfen.", "Fix the issue. Verify a fresh report."), t("Firewall im Management-Tool korrigieren. Fehlende Ergebnisse gesondert prüfen. Ein alter Bericht wird nicht als bestanden gewertet.", "Correct the firewall in your management tool. Check missing evidence separately. An old report is not treated as a pass."))}`;
  if (id === "contracts")
    body = `
    <div class="record-heading">${icon("document")}<div><strong>${t("Design-Software", "Design software")}</strong><span>${t("Verantwortlich: Design-Team", "Owner: Design team")}</span></div>${pill(t("Entscheidung offen", "Decision due"), "warning")}</div>
    <div class="demo-metrics two">${metric("12 Oct 2026", t("Interne Entscheidungsfrist", "Internal decision deadline"))}${metric("31 Oct 2026", t("Kündigungsfrist", "Cancellation deadline"))}</div>
    <dl class="facts"><div><dt>${t("Verlängerung", "Renewal")}</dt><dd>01 Dec 2026</dd></div><div><dt>${t("Erfasste Kosten", "Recorded cost")}</dt><dd>EUR 400 / ${t("Monat", "month")}</dd></div><div><dt>${t("Lizenzzuordnung", "License allocation")}</dt><dd>17 / 20</dd></div></dl>
    ${callout(t("Drei Lizenzen ohne Zuordnung. Bedarf prüfen.", "Three unassigned licenses. Review the need."), t("Zuordnungen sind keine Nutzungsdaten. Konditionen und Bedarf prüfen, bevor ihr beim Anbieter verlängert oder kündigt.", "Allocations are not usage data. Review terms and requirements before renewing or cancelling with the vendor."))}`;
  if (id === "forms")
    body = `
    <div class="demo-metrics four">${metric("8", t("Eingegangen", "Received"))}${metric("3", t("In Prüfung", "In review"))}${metric("2", t("Angenommen", "Accepted"))}${metric("1", t("Abgelehnt", "Declined"))}</div>
    <div class="record-heading">${icon("form")}<div><strong>${t("Workshop: Automatisierung im IT-Alltag", "Workshop: everyday IT automation")}</strong><span>${t("Zuständig: Sam Muster", "Assignee: Sam Example")}</span></div></div>
    <dl class="facts"><div><dt>${t("Status", "Status")}</dt><dd>${pill(t("In Prüfung", "In review"), "info")}</dd></div><div><dt>${t("Interne Notiz", "Internal note")}</dt><dd>${t("Agenda konkretisieren, dann gemeinsam bewerten.", "Clarify the agenda, then review together.")}</dd></div></dl>
    ${callout(t("Einreichung und Entscheidung bleiben zusammen.", "Submission and decision stay together."), t("Ein öffentlicher Formularlink sammelt Vorschläge. Nur berechtigte Kolleginnen und Kollegen sehen Review und Notizen.", "A public form link collects proposals. Only authorized colleagues see reviews and notes."))}`;
  if (id === "watch")
    body = `
    <div class="record-heading">${icon("globe")}<div><strong>docs.example.com</strong><span>CNAME → retired.example.net</span></div>${pill(t("Ziel fehlt", "Target missing"), "danger")}</div>
    <p class="demo-label">${t("Beispielprüfung", "Example check")} · 22 Sep 2026 · 09:30 UTC</p>
    <ul class="evidence-list">${row("Cloudflare DNS", "retired.example.net", "NXDOMAIN", "danger")}${row("Google DNS", "retired.example.net", "NXDOMAIN", "danger")}</ul>
    ${callout(t("DNS beim Anbieter korrigieren, dann erneut prüfen.", "Correct DNS at the provider, then check again."), t("Das fehlende Ziel lässt sich nicht als gesund akzeptieren. Der Befund belegt einen DNS-Fehler, keine bestätigte Übernahme oder HTTP-Ausfallzeit.", "The missing target cannot be accepted as healthy. This is evidence of a DNS problem, not a confirmed takeover or HTTP downtime."), "warning")}`;
  if (id === "crumbs")
    body = `
    <div class="demo-control" data-demo-controls hidden><span>product.example.com · UTC</span><div class="step-buttons">${traffic.map((p, i) => `<button type="button" data-scene="traffic-${p.range}" aria-controls="traffic-${p.range}" aria-pressed="${i === 0}">${i === 0 ? "14–20" : "07–13"} Sep</button>`).join("")}</div></div>
    ${traffic.map((p) => `<section class="demo-scene" id="traffic-${p.range}"><h5>${p.range === "current" ? "14–20" : "07–13"} Sep 2026 · UTC</h5><div class="demo-metrics">${metric(sum(p.visits).toLocaleString(de ? "de-CH" : "en-GB"), t("Besuche", "Visits"))}${metric(sum(p.views).toLocaleString(de ? "de-CH" : "en-GB"), t("Seitenaufrufe", "Pageviews"))}${metric(`${Math.round((100 * sum(p.bounces)) / sum(p.visits))}%`, t("Absprungrate", "Bounce rate"))}</div><div class="traffic-chart" role="img" aria-label="${esc(t("Besuche pro Tag: ", "Daily visits: ") + p.visits.join(", "))}">${p.visits.map((n, i) => `<div><span>${n}</span><svg viewBox="0 0 48 220" preserveAspectRatio="none" aria-hidden="true"><rect x="4" y="${220 - n}" width="40" height="${n}" rx="4"/></svg><small>${Number(p.start.slice(-2)) + i}</small></div>`).join("")}</div><ul class="evidence-list">${p.channels.map(([name,visits,goals])=>row(name,`${visits} ${t("Besuche", "visits")}`,`${goals} ${t("Anfragen", "enquiries")}`)).join("")}</ul><div class="funnel-heading"><strong>${t("Funnel: Demo-Anfrage", "Funnel: demo enquiry")}</strong><span>${((p.funnel[2] / p.funnel[0]) * 100).toFixed(0)}% ${t("Abschluss", "completion")}</span></div><ol class="funnel">${p.funnel.map((n, i) => `<li><span>${i + 1}. ${[t("Produktseite", "Product page"), t("Formular geöffnet", "Form opened"), t("Anfrage gesendet", "Enquiry sent")][i]}</span><strong>${n}</strong></li>`).join("")}</ol><p class="chart-note">${t("Konfigurierte Ereignisse in derselben Sitzung; Besucher-Schätzwerte je Funnel-Stufe. Diese Beispieldaten sind keine Messung von kebabstack.dev.", "Configured events within the same session; estimated visitors at each funnel step. These examples are not measurements of kebabstack.dev.")}</p></section>`).join("")}`;
  if (id === "phone")
    body = `${callout(t("Geplant, noch nicht verfügbar.", "Planned, not available yet."), t("Stack-Zugang, Incident-Übernahme und ein Alarmbereitschafts-Check für iOS und Android. Für die Umsetzung werden native Apps, Zustellinfrastruktur und Plattformfreigaben benötigt.", "Stack access, incident acknowledgement and an alarm-readiness check for iOS and Android. Delivery requires native apps, delivery infrastructure and platform permissions."))}<ul class="evidence-list">${row(t("Mobiler Stack-Zugang", "Mobile stack access"), t("Eigene Umgebung verbinden", "Connect your own environment"), t("Geplant", "Planned"))}${row(t("Incident-Alarmierung", "Incident alerts"), t("Mit Testalarm und Übernahme", "With a test alert and acknowledgement"), t("Geplant", "Planned"))}</ul>`;
  return `<div class="scenario" data-scenario="${id}"><div class="scenario-header"><span>${icon(id === "hub" ? "people" : { desk: "ticket", assets: "laptop", trust: "shield", contracts: "document", forms: "form", watch: "globe", crumbs: "chart", phone: "phone" }[id])}${id === "hub" ? "Hub" : id[0].toUpperCase() + id.slice(1)}</span>${pill(id === "phone" ? t("Konzept", "Concept") : t("Beispieldaten", "Sample data"))}</div><div class="scenario-body"><h4>${labels[id]}</h4>${body}</div></div>`;
}
