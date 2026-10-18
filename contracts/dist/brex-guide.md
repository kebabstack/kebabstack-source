# Brex: collect payments, review software, complete contracts

Available in Contracts 0.21.0. No live Brex account was used to develop
this feature. Local tests use synthetic responses and isolated canisters.

## Set up as a space owner

1. Select the personal space or teamspace that should own the payment evidence.
2. In Brex, an Account/Card Admin creates a dedicated token with **Cards: Read**
   (`cards.readonly`) and **Card transactions: Read** (`transactions.card.readonly`).
   Accept Brex's developer agreement if needed. Do not grant payment/card write scopes.
3. Open Contracts → Settings → Brex payments, enter the token and save it.
4. Choose **Test connection**. This performs card and transaction GET requests;
   it does not initiate an import or send transactions to AI. A failure is not a
   successful connection. Successful reads do not attest the token's entire scope set.
5. Select the IT card(s). Search by name/last four and load further pages if needed.
   Only the cards visible through this token are selectable; verify the intended
   IT card is present. Cards outside that token's access cannot be imported.
6. Enable AI classification only if this space's financial metadata may go to the
   organisation's configured Hub AI provider. Enable daily imports and save.
7. The first scan covers 1 January of last year onwards. Refresh import status
   or Payment review to follow progress. The list is marked partial during import.

## Work through Payment review

Start with **Needs review**, or choose **All payments** to inspect everything.
Open a merchant group to see booked evidence and candidate contracts. Multiple
contracts from a vendor are shown for a human choice. **Attach payments** extends
payment evidence without overwriting terms. **Create draft** creates a minimal
record and opens the guided completion flow. **Ignore** keeps evidence out of the
attention queue; **Reopen** restores it. Automatic attachment is an explicit opt-in
for exact card/merchant/currency/amount matches after a confirmed assignment.

A group collects payments with the same merchant/card/currency. Select individual
payments (up to 50 at once), choose an existing contract and **Attach selected
payments**. Repeat for another plan from the same vendor. You can also create a
new draft for selected pending payments, ignore them or reopen them. Every payment
shows its assignment and retains the last 20 individual decisions. Other payments
and all contract terms stay unchanged. Stale or mixed-group selections are rejected
as a whole; reload and compare rather than repeating a stale decision.

The first individual decision preserves previous group assignments and disables
that group's automatic rule. Future imports in a split group start pending.
Group-wide actions are then disabled to avoid erasing individual assignments.
The Needs review filter includes groups with at least one pending payment; counts
separate pending, assigned and ignored payments. One booked payment still belongs
to at most one contract: splitting its monetary amount is not supported.

In the guided flow, answer the next question or select another field to review.
Use choice buttons for frequency/tax/renewal. Explicit money values use minor
units; with AI interpretation you can type a decimal price and currency naturally.
Every proposed value shows the previous value and needs confirmation. **Replace**
is explicit, and concurrent contract changes require reloading and comparing.
Skip unknown terms; importing a payment cannot establish cancellation rights.

## Recovery and operating cost

- Permission failure: check Brex token validity/scopes, replace if necessary,
  test again, reselect cards. Existing evidence is retained and IDs deduplicate.
- Temporary API/rate-limit failure: the cursor stays on that page, the safe error
  appears and retry is due in 15 minutes. Run due import or wait for the timer.
- Paused/archive/lost owner access: an authorized current space owner reviews the
  configuration and saves the schedule again. Fresh Hub access is required.
- Missing AI lane/key or exhausted budget: payments remain reviewable manually;
  use Ask AI to review after fixing the Hub connection/budget. AI is not required
  to import or assign payments or enter explicit contract values.
- Disconnect: stop imports and remove the current stored token; revoke it in Brex
  when no longer wanted. This does not erase historical payments or backups.

The operator still maintains Cloud Engine hosting, Hub permissions, token rotation,
AI settings/budget and backups. Daily full-range scans trade extra read requests
for straightforward late-post reconciliation. Request volume grows with history,
including upstream nonselected-card transactions; storage retains only selected
cards. No measured savings or maximum-throughput claim is made.

## API and evidence contract

Connection: brexStatus, saveBrexToken, testBrexConnection, moreBrexCards,
configureBrex, disconnectBrex, syncBrex. Review: listBrexReview (bounded pages),
brexReviewDetail (50 evidence rows/page), findBrexContracts (search title/vendor),
analyzeBrexReview, decideBrex and decideBrexPayments. Each group retains its last 100 assignment decisions.
Guided editing: brexGuide, answerBrexGuide, applyBrexGuide.
All require a current personal/teamspace owner session (including inherited app
admins); raw token values never appear in responses. The existing generic MCP
Candid discovery can call these with a person's authorized session; no separate
privileged integration identity or unscoped HTTP route is introduced.

Reference schemas checked on 18 October 2026:
- https://developer.brex.com/_spec/openapi/transactions_api.yaml
- https://developer.brex.com/_spec/openapi/team_api.yaml
- https://developer.brex.com/guides/authentication

The Transactions schema supports posted_at_start, next_cursor and signed minor
amounts. Use overlapping scans and deduplicate transaction IDs. Examples and FAQ
may lag behind this schema. No Brex staging/sandbox account is assumed.
