# Render Tests: Restart Latest Claude

**Plan**: restart-latest-claude
**Verdict**: pass
**Pack**: kb: pack 20746 words (budget 30000)

## Summary

Tests created: 17 | Passing: 17 | Failing: 0 (review cycle 1 added 3; full `make render-test`: 444 passed)

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `restart.spec.ts` | the readout is a button reading claude 2.1.316→318 with a neutral dot | R1, REQ-7 | text, opacity 1, 6px dot in `--fg-muted` at top-right | pass |
| `restart.spec.ts` | the readout keeps one fixed width in the plain, notice and queued shapes at every width | R1, REQ-11 | `#claude-version` width equals `three-states` at 1024/1280/1440/1920 | pass |
| `restart.spec.ts` | the panel shows the head, the counts, Ignore, Restart… and the queued list | R2, REQ-7, REQ-9 | head, now 2, when-free 3, queued heading `· 1` + session, no cancel | pass |
| `restart.spec.ts` | the panel closes on Escape and on an outside click, and Restart… closes it for the dialog | R2, REQ-7 | panel dismissal | pass |
| `restart.spec.ts` | the dialog lists both sections open, rows with reasons, and the mixed confirm label | R3, REQ-8, REQ-13 | open sections, reasons, excluded rows, `Restart 2, queue 3` | pass |
| `restart.spec.ts` | the dialog is 520px wide and its list box scrolls inside a 280px ceiling | R3, REQ-8 | computed width, max-height, overflow-y | pass |
| `restart.spec.ts` | with 14 behind sessions the dialog box scrolls and both summaries stay reachable | R3, REQ-8, edge 29 | `claude-restart-many`: scrollHeight > clientHeight, height <= 280, scrollTop > 0 after scrolling, both summaries inside the box (now's scrolls out at the bottom), Cancel and confirm stay visible | pass |
| `restart.spec.ts` | clicking a section's summary collapses and expands it independently | R4, REQ-8 | `details.open` per section | pass |
| `restart.spec.ts` | Escape closes the dialog and the focus returns to the readout button | R3, REQ-8 | focus return | pass |
| `restart.spec.ts` | only pending sessions read claude ↻2 queued and the panel lists both with no controls | R5, REQ-9 | label, list, no Ignore/Restart…/cancel | pass |
| `restart.spec.ts` | with the daemon down the readout button is disabled and an open panel closes | R6, REQ-12 | disabled + panel closed | pass |
| `restart.spec.ts` | with the daemon down a click on the readout opens no panel | R6, REQ-12 | forced click opens nothing | pass |
| `restart.spec.ts` | no notice surface uses amber outside its one key button, nor rose or violet | R7, REQ-11 | computed colours vs live tokens on readout, panel, dialog | pass |
| `restart.spec.ts` | the queued readout and its panel use neutral tokens only | R7, REQ-11 | same, queued; no visible `.btn.key` | pass |
| `restart.spec.ts` | the warning glyph in the notice shape clears Settings and the readout keeps one width and right edge in all four shapes (R1, REQ-11) | R1 | at 1280x900: plain, plain+warning, notice, notice+warning readout width 137.28 and one right edge; glyph box right of Settings; `elementFromPoint` on Settings' right edge returns Settings | pass (red pre-fix: glyph x 1093.31 < Settings right 1096.72) |
| `restart.spec.ts` | Ignore with no notice left puts focus on the Settings button, not the body (R2, REQ-10) | R2 | `claude-restart-many`: after Ignore `#settings-button` focused, still so after a settle | pass (red pre-fix: focus inactive) |
| `restart.spec.ts` | Ignore with a pending session left keeps focus on the notice button (R2, REQ-9, REQ-10) | R2 | `claude-restart`: queued notice `↻1 queued` stays and is focused after a settle | pass (green pre-fix too: guards kept behaviour) |

## Fixtures used

- `claude-restart`: installed 2.1.318; 7 alive sessions (idle, failed, working, idle+2 tasks, needs_input, planning pending, idle current) + 1 ended.
- `claude-restart-queued`: two working sessions, both pending.
- `claude-restart-many`: 14 behind sessions, 7 idle (Restart now · 7) and 7 working (Restart when free · 7); makes the list box overflow.
- `claude-version-above` (cycle 1): only its `claudeCode` frame is sent via `dashboard.send` on `three-states` and `claude-restart` to show the warning glyph.
- `claude-restart-down`: identical to `claude-restart` (opens connected); the tests fire `close` on the page's `/ws` socket (`helpers/restart.ts` `recordSockets`/`dropDaemon`) to reach the down state.

## Implementation Bugs

None.

## Handoff

None. (The earlier needs-scenario for `claude-restart-many` was answered by daemon-impl in 8ad1695d; fixtures are committed.)

## Notes

None. R3's 280px ceiling is now measured as a real scroll against `claude-restart-many`.

## Test Run Output

```
make render-test (committed fixtures): 440 passed, 1 failed (my first draft of the new test, since fixed);
restart.spec.ts re-run: 14 passed
```

## Review cycle 1

Red proof ran in a throwaway copy (scratchpad `prefix/`) with the two fixes reverted (`margin: 0 4px 0 0` and no font-size on the glyph; `closePanel(true)` in `ignore()`): the glyph test failed `Expected >= 1096.71875, Received 1093.3125`; the no-notice focus test failed with `#settings-button` `inactive` for 15 s; the pending-session focus test stays green by design. Full gate on the fixed tree: 444 passed. Handoff: None.
