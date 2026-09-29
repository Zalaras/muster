# Proposed backlog — resume-and-dangerously-allow

Proposals only; nothing here is filed. `/land` puts each one to the developer.

### Canary coverage for the resume/bypass facts
- **Summary**: the six 2026-09-27 transcript, resume and bypass fact records have no guard test.
- **Source**: plan.md § Out of scope ("proposed as a backlog line, not filed").
- **Change requested**: yes (the plan's own words).
- **Suggested section**: Pre-v1.
- **Pre-existing**: no; the facts were measured for this plan.

### Mainhead actions pushed off-screen by an unbreakable title
- **Summary**: a long title with no break opportunity never ellipsises, pushing End/Resume/Remove past the viewport.
- **Source**: review cycles 2 and 3, browser Notes ("belongs in the backlog").
- **Change requested**: no. The reviewer called it outside this plan.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: yes; this branch did not touch the mainhead layout.

### Stale Resume list after the daemon dies
- **Summary**: with the list showing, a daemon death leaves stale rows and an enabled Resume until the tab is re-entered.
- **Source**: review cycles 1–3, browser Notes.
- **Change requested**: no. The banner shows, so the honesty rule holds.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: no; the Resume tab is new in this branch.

### The pending-resume hold does not survive a daemon restart
- **Summary**: an alive, unbound resumed row loses its hold on its Claude id when musterd restarts.
- **Source**: review cycle 2 and 3, code Notes.
- **Change requested**: no.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: no.

## Decisions (the developer, 2026-09-29)

- **Canary coverage for the resume/bypass facts** — filed: TODO.md § Pre-v1, "Canary coverage for the resume/bypass facts".
- **Mainhead actions pushed off-screen by an unbreakable title** — filed: TODO.md § Issues › On their own, "Mainhead actions pushed off-screen by an unbreakable title".
- **Stale Resume list after the daemon dies** — not doing.
- **The pending-resume hold does not survive a daemon restart** — filed: TODO.md § Issues › On their own, "The pending-resume hold does not survive a daemon restart".
