# Falcon employee and asset assignment in Desk

Standard 1.2.0, Desk 0.38.1, Hub 0.46.1 and Assets 0.31.1. The internal helpdesk agent can identify the employee, see the endpoint and open its inventory record from the alert ticket. Previously the profile panel rendered a synthetic requester as “former person”.

| Scope | Evidence |
|---|---|
| Reporter, current holder and access | The Falcon regression uses separate directory identities for the employee and asset holder. An ordinary employee cannot open the ticket. An agent without access to the other holder’s device receives no device details. |
| Historical tickets and failures | The regression enriches an existing alert with the same provider timestamp. An unmatched endpoint shows explicit missing identity. Identifying the reporter does not grant requester access. |
| Presentation | The existing ticket profile, existing person context and a native Assets deep link use the standard typography and focus rules. The live owner is fetched separately. |
| Limits | Full assistive-technology certification and timing of the operator’s work were not measured. |
