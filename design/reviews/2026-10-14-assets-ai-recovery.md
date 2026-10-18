# Assets AI response recovery

- Standard: 1.2.0; module: Assets 0.27.2.
- Reviewer/date: Codex, 2026-10-14.
- Scope: single photo intake, bulk photo intake and stored-photo re-reading.
- Status: scoped local verification; real provider OCR accuracy unverified.
- Trigger: a readable Dell label produced a JSON parsing error that blamed photo clarity.
- No provider response from that production incident was retained: token truncation is a plausible cause, not a proven incident diagnosis.

## Findings

| Priority | Observation | Correction |
|---|---|---|
| P1 | 500-token output budget, unbounded code request, invalid numeric JSON example. | Valid numeric example, eight-code limit with Service Tag/serial/inventory priority, 2048-token allowance. |
| P1 | Truncation, malformed/empty responses and wrong structures ended the workflow immediately. | Common backend recovery repeats the original image once with 4096 tokens; validates before returning proposals. No partial JSON repair or invented identifiers. |
| P2 | Only the last Anthropic text block was retained. | Assemble ordered text blocks; also accept text-block arrays for compatible chat responses. |
| P2 | Technical parse failures blamed picture quality. | Separate technical errors, provider refusals and inability to extract codes; never echo raw provider bodies. |
| P2 | Failed re-read hid photo review and left Apply enabled. | Photo review remains accessible, Apply needs selected corrections, count reports successful readings. |

## Acceptance evidence

| Gate | Result and limits |
|---|---|
| Shared workflow | Both intakeRead (single/bulk) and rereadPhoto run the same tested recovery path. |
| Positive/negative permissions | Assets security suite: admin succeeds, member rejected, revoked access cannot initiate recovery. |
| Failure/retry | Both provider envelope formats: truncation, malformed JSON, missing reads, empty reads, split blocks, bounded double failure. Original image bytes verified across attempts. |
| Data integrity | Reads alone do not create/edit inventory; partial codes rejected; no state/API signature change. |
| UI | Admin/member/no-AI smokes and batch tests; failed re-read modal tested at 390×844 with synthetic label. Existing responsive dialog reused. |
| Design/navigation | Canonical runtime unchanged; no new palette, logo or navigation/sticky containment changes. Earlier scrolling evidence remains scoped to unchanged layout. |
| Accessibility | Native dialog/control behavior reused; no new full accessibility certification or 200% text review. |
| Provider boundaries | No provider/model switch. 2048→4096 token recovery can add latency/cost. Existing frontend transient retry plus backend recovery permits up to three calls in the combined case. Refusal and billing/configuration errors are not format retries. |
| Actual incident image | Readable by human inspection; not sent to another provider or committed. Live OCR quality not established by simulated outcalls. |
| Upgrade | Pinned compiler build, committed-baseline stable compatibility, unchanged generated DID/IDL. Existing populated-upgrade test remains in the security suite. |

## Sources

Provider termination signals checked against the [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat) and [Claude stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons). No model migration or credentials changes.

## Delivery

A concrete 0.27.2 candidate. Deployment and real-provider verification are separate from the local tests; this record does not assert production delivery or perfect recognition. The earlier public-source export gate is unrelated to deploying private release artifacts and remains unresolved for public source export.
