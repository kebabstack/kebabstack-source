# Install forms next to your hub

**Permission model update:** requires Hub 0.23.0 or later. Before upgrading an existing app, save its policy under Hub → Permissions. After upgrading, check app enforcement there. Missing policies deny protected sign-in. Review [the central permission model and rollout](../docs/APP-PERMISSIONS.md), especially broader Admin content access in Forms and Contracts.


The easy way: Hub → **Kitchen** → install **Forms**. The kitchen deploys both
canisters, patches the placeholders, runs `setHub`, connects the app to the hub
and puts it on the menu. Then continue at step 4.

By hand, the same as the other apps (`../assets/INSTALL.md` has the long form):

## 1 · Deploy (two phases)

```bash
cd forms
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note both canister ids. In `dist/app.js` replace `__BACKEND_CANISTER_ID__` with the
forms **backend** id and `__HUB_URL__` with your hub **frontend** URL, verify
(`grep -c '__BACKEND_CANISTER_ID__\|__HUB_URL__' dist/app.js` prints 0), deploy again.

## 2 · Wire forms to the hub (CLI, once)

```bash
icp canister call backend setHub '("<HUB-BACKEND-CANISTER-ID>")' -e ic
```

## 3 · Register forms in the hub

Hub → **Apps** → 🍢 **Connect an app**: paste the forms **backend** canister id →
the hub reads the manifest (needs identity, notify; would like roles, groups) →
tile URL `https://<forms-frontend>.icp.net/` (App, SSO ticket) → Connect.

## 4 · First run

- forms → Settings (hub owner/admin): company name and **this app's URL** — the URL is what notification links and the public links in the workspace are built from.
- New form → build → set it to **open** → copy the public link. Try the sample form under Settings to see the review pipeline with data.

## Operational notes

- The public fill page (`#/f/<slug>`) is reachable by anyone with the link; drafts and trashed forms answer "not found". Submissions are capped (5 000 per form, 50 000 in total) and rate-limited (600 per five minutes across all forms).
- Respondents' edit links (`?e=<token>`) are the only way to change a submission; the token is kept on the respondent's device and never shown to reviewers.
- Everyone in the hub directory can create forms. There is no per-person quota beyond the caps.
