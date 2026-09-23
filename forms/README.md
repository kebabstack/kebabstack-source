# kebab-stack forms

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

App roles are managed exclusively in [Hub → Permissions](../docs/APP-PERMISSIONS.md). Active Hub owners/admins and per-app Admins can see and manage all app content. Employees retain their own and explicitly shared content; Watch requires an explicit Viewer/Admin grant by default.


Forms in, decisions out.

A form builder with anonymous public links, and a review pipeline for what
comes in — the two halves that usually live in two SaaS products.

- **Build**: sections, short and long text, multiple choice, checkboxes, dropdown, linear scale, date; required flags; go-to-section branching from a choice. Autosave. Preview the real fill flow at any time, drafts included. Duplicate forms and questions.
- **Collect**: every form gets a random public link — anyone with it can submit while the form is open, no account needed. Optional name/e-mail fields (self-declared), optional respondent editing through a private edit link, a response deadline and a submission limit that close the form on their own. Public writes are rate-limited (600 per five minutes across all forms) and growth-capped.
- **Review**: received → in review → accepted / declined, one rating per reviewer, an assignee (picked from the hub directory), internal notes. Response charts under Insights, spreadsheet-safe CSV export.
- **Share**: the owner gives colleagues editor (build + review) or viewer (read-only) access; the dashboard shows your own forms and the ones shared with you — nothing else.
- **Import**: Google Forms API JSON or a plain text outline (`[choice] [scale 1-5] [required]`), with a report of what was mapped before a draft is created; the dialog carries a prompt that turns a PDF or screenshot into that outline with your AI assistant.
- **Trash**: deleting a form parks it for 90 days, restorable exactly as it was; then it is removed for good.
- **From the hub**: sign-in by hub ticket, roles from the hub (app Admins manage every form and settings), the shared topbar, notifications to the form's owner and editors on every new submission (title and link only — content stays here), and `hub_ownedObjects`/`hub_reassign` so offboarding can hand forms over.

Install through the **Kitchen** in your hub (recipe `forms`), or by hand per `INSTALL.md`.

## Person context in Desk

Agents can open permission-checked summaries of related employee records in Desk.
See [employee context and directory follow-up](../docs/LIFECYCLE.md) for the workflow,
data boundaries and rollout. App roles remain managed in Hub.
