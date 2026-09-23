// node --test — the relay's pure logic against the two synthetic fixtures (EN renewal with a text PDF and an
// inline image · DE forwarded price change, HTML only) plus the hand-in protocol against a scripted actor.
// Real mail never lands in this directory; the fixtures are invented (vendors from the app's sample data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PostalMime from "postal-mime";
import { buildIntake, handIn, withRetry, chunks, clipBytes, CAPS } from "../src/intake.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n) => fs.readFileSync(path.join(here, "fixtures", n));
const parse = (n) => PostalMime.parse(fixture(n));
const ENVELOPE = { to: "subscriptions@relay.acme.example", from: "billing@sunrise-cloud.example" };

test("EN renewal: headers, text, files with sha256, pdf text extracted, inline image kept", async () => {
  const parsed = await parse("renewal-en.eml");
  const seen = [];
  const { meta, parts, notes } = await buildIntake(parsed, { ...ENVELOPE, raw: fixture("renewal-en.eml") }, { extractPdf: async (b) => { seen.push(b.length); return "Team plan renews 2027-01-01 at EUR 1,650.00 per year."; } });
  assert.equal(meta.kind, "relay");
  assert.equal(meta.mailbox, "subscriptions@relay.acme.example");
  assert.match(meta.providerId, /^raw:[0-9a-f]{40}$/);
  assert.equal(meta.messageId, "<renewal-2027@sunrise-cloud.example>");
  assert.equal(meta.fromAddr, "billing@sunrise-cloud.example");
  assert.equal(meta.fromName, "Sunrise Cloud Billing");
  assert.deepEqual(meta.to, ["me@acme.example"]);
  assert.deepEqual(meta.cc, ["subscriptions@relay.acme.example"]);
  assert.equal(meta.subject, "Your Team plan renews on 1 January 2027");
  assert.equal(meta.sentAt, "2026-09-01T08:00:00.000Z");
  assert.match(meta.text, /renews automatically on 2027-01-01/);
  assert.match(meta.text, /café ünïcode ✓/, "utf-8 survives");
  assert.match(meta.html, /<b>2027-01-01<\/b>/);
  assert.equal(meta.attachments.length, 2);
  const [pdf, png] = meta.attachments;
  assert.equal(pdf.name, "renewal-notice.pdf"); assert.equal(pdf.mime, "application/pdf");
  assert.match(pdf.sha256, /^[0-9a-f]{64}$/); assert.equal(pdf.size, BigInt(parts[0].bytes.length));
  assert.match(pdf.textExtract, /1,650\.00/); assert.deepEqual(seen, [parts[0].bytes.length], "extractPdf ran once, on the pdf only");
  assert.equal(png.name, "logo.png"); assert.equal(png.mime, "image/png"); assert.equal(png.textExtract, "");
  assert.equal(parts.length, 2); assert.equal(parts[1].index, 1);
  assert.equal(parts[0].bytes[0], 0x25, "pdf bytes start with %PDF");
  assert.deepEqual(notes, []);
});

test("DE forwarded price change: html-only body becomes text, thread headers carried", async () => {
  const parsed = await parse("preiserhoehung-de.eml");
  const { meta, parts } = await buildIntake(parsed, { to: "subscriptions@relay.acme.example", from: "anna.beispiel@acme.example" });
  assert.equal(meta.fromAddr, "anna.beispiel@acme.example");
  assert.equal(meta.subject, "Fwd: Preisanpassung Nimbus Pro ab 1. Januar");
  assert.equal(meta.inReplyTo, "<orig-77@nimbus.example>");
  assert.match(meta.references, /orig-76@nimbus\.example/);
  assert.match(meta.text, /Zur Ablage – der neue Preis gilt ab Januar\./, "quoted-printable decoded, no tags");
  assert.match(meta.text, /---------- Forwarded message ----------/);
  assert.match(meta.text, /EUR 1\.200,00 pro Jahr/);
  assert.match(meta.text, /Kündigungsfrist: 3 Monate/);
  assert.doesNotMatch(meta.text, /<[a-z]+>/);
  assert.equal(meta.providerId, "", "no raw → no provider id");
  assert.equal(parts.length, 0);
});

test("caps: oversize and surplus attachments are left out with a note; text is cut at the byte cap", async () => {
  const big = new Uint8Array(CAPS.attachmentBytes + 1);
  const atts = [{ filename: "huge.pdf", mimeType: "application/pdf", content: big.buffer }];
  for (let i = 0; i < 11; i++) atts.push({ filename: `f${i}.txt`, mimeType: "text/plain", content: "x" });
  const parsed = { from: { address: "a@b.example", name: "" }, to: [], cc: [], subject: "many", text: "ü".repeat(CAPS.textBytes), attachments: atts };
  const { meta, parts, notes } = await buildIntake(parsed, ENVELOPE);
  assert.equal(meta.attachments.length, CAPS.attachments);
  assert.equal(parts.length, CAPS.attachments);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /huge\.pdf .*over the 1\.5 MB cap/);
  assert.match(notes[1], /f10\.txt left out — more than 10 files/);
  assert.ok(new TextEncoder().encode(meta.text).length <= CAPS.textBytes, "text within the byte cap");
  assert.match(meta.text, /\[relay: text cut\]$/);
  assert.doesNotMatch(meta.text, /�/, "never cut inside a code point");
});

test("extractPdf failures never block the hand-in", async () => {
  const parsed = { from: { address: "a@b.example" }, attachments: [{ filename: "scan.pdf", mimeType: "application/pdf", content: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer }], text: "see attached" };
  const { meta, notes } = await buildIntake(parsed, ENVELOPE, { extractPdf: async () => { throw new Error("no text layer"); } });
  assert.equal(meta.attachments[0].textExtract, "");
  assert.match(notes[0], /scan\.pdf: text could not be read \(no text layer\)/);
  assert.match(meta.text, /\[relay\] scan\.pdf/);
});

test("clipBytes and chunks", () => {
  assert.equal(clipBytes("abc", 10), "abc");
  assert.equal(clipBytes("a".repeat(30), 20, "…"), "a".repeat(17) + "…");
  const b = new Uint8Array(3_200_000);
  const cs = chunks(b);
  assert.equal(cs.length, 3); assert.equal(cs[0].length, 1_500_000); assert.equal(cs[2].length, 200_000);
  assert.equal(chunks(new Uint8Array(0)).length, 1);
});

function fakeActor(script = {}) {
  const calls = [];
  return { calls, actor: {
    intakeBegin: async (tok, meta) => { calls.push(["begin", tok, meta.attachments.length]); return script.begin || { ok: true, id: 5n, detail: "" }; },
    intakeChunk: async (tok, id, i, bytes) => { calls.push(["chunk", id, i, bytes.length]); return script.chunk || { ok: true, detail: "" }; },
    intakeCommit: async (tok, id) => { calls.push(["commit", id]); return script.commit || { ok: true, sourceId: 9n, status: "new — queued for reading", detail: "" }; },
  } };
}

test("hand-in: begin → one chunk per ≤1.5 MB piece, in order → commit", async () => {
  const { actor, calls } = fakeActor();
  const meta = { attachments: [{ name: "a" }, { name: "b" }] };
  const parts = [{ index: 0, bytes: new Uint8Array(10) }, { index: 1, bytes: new Uint8Array(1_600_000) }];
  const r = await handIn(actor, "", meta, parts);
  assert.deepEqual(r, { ok: true, duplicate: false, sourceId: 9, status: "new — queued for reading", detail: "" });
  assert.deepEqual(calls, [["begin", "", 2], ["chunk", 5n, 0n, 10], ["chunk", 5n, 1n, 1_500_000], ["chunk", 5n, 1n, 100_000], ["commit", 5n]]);
});

test("hand-in: a duplicate delivery is refused at begin — no bytes travel, reported as duplicate", async () => {
  const { actor, calls } = fakeActor({ begin: { ok: false, id: 3n, detail: "duplicate: this delivery was already handed in as source #3" } });
  const r = await handIn(actor, "", { attachments: [{ name: "a" }] }, [{ index: 0, bytes: new Uint8Array(5) }]);
  assert.equal(r.ok, false); assert.equal(r.duplicate, true); assert.equal(r.sourceId, 3);
  assert.equal(calls.length, 1);
});

test("hand-in: a refused chunk stops the hand-in with the file name", async () => {
  const { actor, calls } = fakeActor({ chunk: { ok: false, detail: "attachment exceeds the cap" } });
  const r = await handIn(actor, "", { attachments: [{ name: "big.pdf" }] }, [{ index: 0, bytes: new Uint8Array(5) }]);
  assert.equal(r.ok, false); assert.match(r.detail, /^chunk of big\.pdf: attachment exceeds the cap/);
  assert.ok(!calls.some((c) => c[0] === "commit"));
});

test("withRetry: transport errors are retried with backoff, the last error surfaces", async () => {
  let n = 0; const waits = [];
  const r = await withRetry(async () => { if (++n < 3) throw new Error("fetch failed"); return "ok"; }, 3, (i) => 10 * (i + 1), async (ms) => { waits.push(ms); });
  assert.equal(r, "ok"); assert.deepEqual(waits, [10, 20]);
  await assert.rejects(withRetry(async () => { throw new Error("down"); }, 2, () => 0, async () => {}), /down/);
});
