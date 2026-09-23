# Website access

Crumbs 0.2.0 separates admission to the application from access to a website. People sign in with their existing Hub identity. Grant Crumbs **Analyst** in Hub → Permissions, then select their name/email under Website settings → Who can access this website?

| Role | Scope and actions |
|---|---|
| Read | Reports, goals, funnels, journeys and imported history for assigned websites |
| Manage | Read plus settings, collection pause, goals, annotations, history import, raw export, website members and API/share credentials for assigned websites |
| Hub Owner / Hub Admin | Full access to every website automatically, including future websites |
| Central Crumbs Admin | Full app administration, as explicitly granted in Hub |
| None | No website data or administrative controls |

Only app-wide admins create or permanently delete websites, view global collector health and administer the app-wide configuration. The controller-only collector allowlist is unchanged. Website managers cannot grant app-wide administration, grant access to other websites, or override a disabled person or a Hub **None** policy. API manage keys may update their website's configuration/content, but member management, directory search and key creation/revocation require a signed-in Manager/Admin session.

## Assign people

1. Add a website as an admin. New websites are initially accessible only to admins.
2. Open Website settings and search the Hub directory by name or email. The picker displays at most 100 matches; refine the search when indicated.
3. Choose Read or Manage, then save. A manager can delegate either role on that website, including removing their own access. Hub and Crumbs admins remain automatic and cannot be removed through a website list.
4. A website supports at most 200 named members. A person has one role per website. Duplicate, unknown, inactive and centrally denied assignees are rejected. Concurrent saves use a revision check rather than overwriting each other silently.

Grants store stable Hub person IDs, not email addresses. An email rename keeps the person's assignments; another person reusing the address does not inherit them. Only managers/admins can retrieve the member lists and directory picker. Normal site listings and the collector omit member IDs.

## Revocation and credentials

Every backend read/write checks the current website role. Read, manage **and share** keys stay within one website and depend on their issuer retaining management access. Removing or demoting a website manager deletes that person's keys atomically, including share links; granting the role back does not restore those credentials. Hub changes are applied by push and directory refresh, with a maximum 60-second freshness lease after the Hub learns the change. The UI refreshes access every 30 seconds and clears removed management controls and cached report/key data.

A stale Hub directory denies all protected reports, including shared dashboards. Collection continues independently. This changes 0.1.0, where share links could outlive a Hub outage. Hub reconfiguration clears sessions, keys and all named website grants so IDs from another Hub cannot inherit authority.

The saved policy includes its revision, most recent editor ID and timestamp. A full historical audit log of permission changes is not yet implemented.

## Upgrade from 0.1.0

The migration adds a separate stable access map without rewriting event data or the original Site storage schema. Existing named viewer lists remain in effect. An old empty viewer list keeps its previous “all Crumbs Analysts may read” meaning until a manager/admin reviews that website; the UI displays an explicit legacy notice. Saving named access replaces that legacy rule. An ordinary website configuration edit does not silently change its legacy grants.

For new/updated API clients, leave the deprecated `Site.viewers` input empty and use the site-access endpoints. Nonempty writes to that field are rejected. The dashboard, generated Candid bindings, REST adapter, OpenAPI and typed JS client expose the new policy together. Upgrade the matching collector as well as the canisters.

## API

`GET /api/v1/sites` returns only accessible sites and their effective `accessRole` (`read`, `manage`, `admin`). Managers/Admins using a Hub app session can call:

- `GET /api/v1/sites/{id}/access`: current members, revision and legacy status.
- `GET /api/v1/sites/{id}/people?search=...`: Hub name/email search, eligibility and automatic administration.
- `PUT /api/v1/sites/{id}/access`: `{ "revision": "1", "readers": ["HUB_PERSON_ID"], "managers": [] }`. Use the returned revision; HTTP 409 means reload before saving again.

Native methods are `getSiteAccess`, `accessPeople` and `setSiteAccess`. See [OpenAPI](dist/openapi.json) for exact schemas and [INSTALL](INSTALL.md) for operations.
