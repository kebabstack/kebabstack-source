# Security reports

Please report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/kebabstack/kebabstack-source/security/advisories/new).
Do not publish credentials, customer data or an exploit against a running company installation in an issue.

Include the affected module/version, a minimal reproduction on a disposable local
instance, expected and actual access, and the impact you observed. Use synthetic
records and isolated identities. You do not need to prove impact on production.

The current public alpha is the maintained development line. There is no promised
response SLA, long-term support branch or independent security certification.
Fixes receive module changelog entries; operators must review and install them.
Source availability and passing tests do not establish that every deployment is secure.

Controllers, Cloud Engine operators, external identity providers, mail/AI/paging
services and their credentials remain part of an installation's trust boundary.
See [known limits](docs/GAPS.md) and [operations](docs/OPERATIONS.md).
