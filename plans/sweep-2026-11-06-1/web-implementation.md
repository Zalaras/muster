# Web Implementation: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Mode**: initial
**Pack**: kb: pack 24761 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/style.css` | edited | `#connection-status` loses `z-index: 46` (keeps `position: relative`); new `#connection-status[data-health="down"] { z-index: 46; }` raises it only while it reports the outage (REQ-1, REQ-2) |

## Decisions

- REQ-1 and REQ-2 both done in the one rule split; `pending` takes the `ok` path (no raise), as the plan's edge case 1 states.
- design: no new module, type or seam; a selector split in the existing readout rule. Precedent: `#connection-status[data-health="..."]::before` rules directly below. No comment added.
- No hidden-attribute, token or colour change; nothing new to sweep.
- doc-delta: none beyond the plan's Doc Delta.
- Observed: render test `…while musterd is connected is the hit target there (#116)` green; R5 readout and banner tests green (15 passed).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean.
**E2E smoke**: no spec authored. Render: `15 passed (9.9s)` for `render/notes-places.spec.ts`.
`make check-kb` fails on 6 problems, none from web: the orchestrator's ADR `docs/adr/notes-readout-above-popped-panel-only-while-down.md` summary is 171 chars (budget 160), and the generated files (`.claude/rules/{connection,notes}.md`, `docs/INDEX.md`, feature INDEX files) are stale pending `make gen-kb`. Both are the orchestrator's.
