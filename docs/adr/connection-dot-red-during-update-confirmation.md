---
id: connection-dot-red-during-update-confirmation
type: decision
status: accepted
date: 2026-10-12
summary: A socket lost while the post-update confirmation banner still shows turns the health dot red; for those few seconds dot and banner disagree.
features: [connection]
tags: [ux, user-decision]
files: [web/src/features/connectionhealth.ts]
tests: []
refs: [plan:masthead-indicators, plans/masthead-indicators/decisions/connection-dot-red-during-update-confirmation/decision.md, kb:adr/connection-health-dot]
supersedes: []
---
**Context.** After an update restart the banner shows a neutral `Updated to v…` confirmation for up to 3 s. If the socket drops inside that window the banner stays neutral, because the confirmation is checked before the connection status.

**Options.** (A) The dot reads down while the confirmation still shows, and the docs name the exception. (B) The update feature drops the confirmation once the status is not connected, so the banner and dot both read down.

**Decision.** A, the developer's choice. The dot reports the socket.

**Consequences.** For at most 3 s a red dot can sit beside a neutral banner. No change to the update feature.
