# Plan: sweep-2026-11-06-1

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: notes
**Features**: notes, connection
**Description**: A popped-out note panel draws above the masthead's connection readout while musterd is connected or connecting; the readout (and the banner) stay above it only while the daemon is down.

## Symptom

### e1 — The daemon connection icon in the UI is above the popped out note

> - [ ] **The daemon connection icon in the UI is above the popped out note** ([#116](https://github.com/Zalaras/muster/issues/116)) — The
>   daemon connection icon in the dashboard is drawn above the popped out note, overlapping it.
>   Expected: The popped out note should appear above the daemon connection icon, which should not
>   cover it.
>   Filed 2026-11-04 from musterd 0.28.0 / Claude Code 2.1.318, focus view, session idle.
>   Labels: bug, masthead, documents, ux.

## Findings

Full research: `plans/sweep-2026-11-06/research/e1.md`, `## Answers` included.

**Reproduced** with a scratch render probe on the `notes` fixture (daemon healthy, banner hidden):
a popped panel dragged over `#connection-status` loses the hit at the readout's centre —
`elementFromPoint` returns `SPAN#connection-status`; computed `#connection-status` is
`position: relative; z-index: 46`, `.npanel` is `position: fixed; z-index: 45`.

**Cause.** `web/src/style.css:510-513` raises `#connection-status` to z-index 46 in every
`data-health` state. It was added by b5c45d34 to carry out kb:adr/notes-banner-above-popped-panel,
whose rationale is the outage only. `.banner` (also 46) is `[hidden]` unless musterd is down, so it
causes no healthy-state overlap. `web/src/features/connectionhealth.ts:21-25` sets
`data-health="down"` exactly when the readout says `musterd unreachable — reconnecting…`.

**Developer's answer.** "1a" — the readout draws above a popped panel only while it shows the
outage (`data-health="down"`); the banner stays above the panel; otherwise (ok, pending) the panel
covers the readout. A new ADR supersedes kb:adr/notes-banner-above-popped-panel (written by the
orchestrator on this branch as `docs/adr/notes-readout-above-popped-panel-only-while-down.md`,
`status: proposed`), and the notes spec and design-system sentences are reconciled.

## Requirements

### Must Have

- **REQ-1**: With musterd connected (`#connection-status[data-health="ok"]`), a popped-out note
  panel placed over the masthead's connection readout is the hit target at the readout's centre —
  the panel draws above the readout. The same holds while the readout is `pending`. (e1)
- **REQ-2**: While musterd is down (`data-health="down"`), the readout and the daemon-down banner
  still draw above a popped panel placed under them, and the readout stays the hit target at its
  centre (the existing R5 behaviour is unchanged). (e1)

## Affected Files

### Web (web-impl)

- `web/src/style.css` — REQ-1/REQ-2: the bare `#connection-status` rule loses `z-index: 46`
  (keeps `position: relative`); a new `#connection-status[data-health="down"] { z-index: 46; }`
  rule raises it only while it reports the outage. The comment, if any, cites
  kb:adr/notes-readout-above-popped-panel-only-while-down.

### Existing tests this breaks

- none

## Proof

- **e1** — `web/render/notes-places.spec.ts`, new test `a popped panel placed over the masthead's
  connection readout while musterd is connected is the hit target there (#116)` (render-tests).
  `dashboard.open("notes")`, viewport 1440×900, pop out `notes-long`, drag the panel (the file's
  `dragPanel` helper) so the `#connection-status` box lies inside it, no daemon-down step.
  `expect(page.locator("#connection-status")).toHaveAttribute("data-health", "ok")`, then the
  red-today assertion `expect(await hitIn(page, r.x + r.width / 2, r.y + r.height / 2,
  ".npanel")).toBe(true)` (today the hit is `SPAN#connection-status`). The existing R5 test
  `…leaves the readout the hit target at its centre (R5, REQ-5)` stays green and covers REQ-2.

## Edge Cases

1. Readout `pending` (connecting… before the first hello, or the update restart) → untested: the
   rule keys on `data-health="down"` only, so `pending` takes the same path as `ok`, which R1 pins;
   a render fixture for a pending readout under a popped panel would need a held socket.

## Acceptance Criteria

### Automated Checks

```checks
R1 make web-build && cd web && npx playwright test -c playwright.render.config.ts render/notes-places.spec.ts
D1 make lint
```

### Reviewer-Verified

- The only z-index raise on `#connection-status` is under `[data-health="down"]`.

## Doc Delta

**notes** — becomes true: the popped panel draws below the daemon-down banner, and below the
masthead's connection readout only while that readout shows the outage; while musterd is connected
or connecting the panel draws above the readout
(kb:adr/notes-readout-above-popped-panel-only-while-down). Stops being true: the readout draws above
the popped panel in every state. Same sentence in `docs/design/design-system.md` § Note panel.

## Out of scope

Nothing.
