# Assets dealroom invoice receipt

- Standard: 1.2.0; Assets 0.16.1; reviewed 28 September 2026.
- User/task: an external buyer downloads their invoice and explicitly confirms receipt.
- Obstacle: the button relied on an in-memory download hash. A reload, new browser
  or restored mobile page forgot an already recorded document request. The extra
  checkbox could also leave an actionable error below the visible task.
- Outcome: the saved, sale-scoped download request restores the action. Pressing
  **Confirm invoice received** explicitly confirms receipt; no second checkbox.
- Rules: PURPOSE-02/03/04, STATES-01/02/04/05, ACCESSIBILITY-02/04, PRIVACY-05.
- Status: verified within the scopes below; production delivery is separate.

## Acceptance evidence

| Gate | Result and evidence |
|---|---|
| Primary task | Pass: download enables confirmation; opening, downloading and restoring the page never assert receipt. |
| Recovery | Pass: frontend regressions cover new-browser reopening, reload, back/forward-cache restoration, missing PDF, interrupted/corrupt download, lost confirmation response and revoked link. |
| Permissions and integrity | Pass: local backend regression retains sale/key scope, current invoice/hash validation, expiry/revocation, duplicate-write protection and independent payment/handover. |
| Existing data | Pass: populate the published 0.16.0 backend with an archived invoice and download, upgrade, then verify the original download time, invoice and PDF survive. Committed stable signature remains compatible. |
| Design | Pass: canonical logo, tokens and shared controls preserved; inline progress/error beside the action, accessible description explains its prerequisite. No palette change. |
| Browser and keyboard | Local synthetic browser flow: download, reload and explicit confirmation; 1280 × 800 desktop, 390 × 844 phone and 320 × 640 reflow with no horizontal overflow. Keyboard activation completes receipt. |
| Privacy | Pass: existing capability guard remains; no new persistence, tracking or buyer data. Only the existing download timestamp is added to the private view. |
| Help and release | README, install workflow, version and served changelog updated. Pinned build, generated bindings, frontend smokes and Assets security regressions pass. |

## Boundaries

Signal's native in-app browser was not available for direct testing. Browser
restoration is reproduced with synthetic events and a real page reload, not
claimed as Signal certification. No customer sale or private link was used.
A document request proves neither saving nor opening a file; receipt still needs
the buyer's explicit button press. No payment or physical handover is inferred.

The existing standalone dealroom is light-themed and has no Hub global menu.
Full screen-reader certification, 200% text enlargement and additional mobile
browser engines were not performed in this scoped fix. No measured time-saving
claim is made. Release packaging and production verification are recorded separately.
