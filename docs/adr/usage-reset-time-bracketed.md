---
id: usage-reset-time-bracketed
type: decision
status: accepted
date: 2026-10-12
summary: Each masthead usage readout shows its reset as (HH:MM) when it falls today and (HH:MM Ddd) otherwise, with the full date and time on hover.
features: [usage]
tags: [ux, user-decision]
files: [web/src/sessions/format.ts, web/src/render/masthead.ts]
tests: []
refs: [plan:masthead-indicators, https://github.com/Zalaras/muster/issues/80, kb:fact/rate-limits-wire-shape]
supersedes: []
---
**Context.** The readouts showed `resets HH:MM` for a same-day reset and only a weekday otherwise, so the seven-day and model-week bars never gave a time (#80).

**Options.** (A) Keep the wording and add the time to other days. (B) Drop the wording: `(HH:MM)` today, `(HH:MM Ddd)` otherwise. (C) A countdown.

**Decision.** B, the developer's choice. 24-hour, local time; a reset a week ahead on today's weekday carries the weekday, so it cannot be read as today.

**Consequences.** The suffix's `title` carries the full date and time. The reset still comes from `resetsAt` already on the wire; nothing in the protocol changes.
