# Proposed backlog — terminal-fixes-cleanup

Follow-up this run found. **Nothing here is filed**: an open `TODO.md` item is the user's to
write (kb:adr/process-backlog-entries-are-the-users-to-file). Each block is ready to paste if
the user wants it, and states whether a change was actually requested.

---

### `make web-lint` never runs inside a wave gate

**Source**: `review.cycle2.md` Minor 2 `[orchestrator]`.
**Change requested**: yes — the reviewer calls it "a plan defect rather than something an agent
can fix", while explicitly not blocking approval on it and saying the choice of remedy "is a
pipeline-doc matter for `/retro`, not something to fix inside this plan".
**Suggested section**: pipeline / tooling (the user chooses).
**Pre-existing**: yes — the gap is in `gates.sh`'s wave cases and the plan template, not in
anything this branch shipped. This plan merely exposed it.

`gates.sh:243-245` states the intended mechanism in its own words: "A wave runs every authored
check except the suites a later wave owns — this is what makes `make web-lint` (and any other
static check the plan authored) part of every wave gate." But the wave cases hard-code only
`build`/`lint`/`test`/`web-build`/`web-test`/`e2e`; every other static gate is expected to reach
a wave *through the plan's authored ```checks block*. This plan authored only `W1 make web-build`
and `W2 make web-test`, so no wave ever ran Biome — and wave 2 shipped a format error under a
wave-2 gate that reported "13 lines, 0 failed". It surfaced only because the wave-3 agent ran
`make web-lint` by hand, and was fixed in `bbad9cf`.

`make web-lint` is a baseline gate of a full `gates.sh` run, so review time was always covered;
the gap is purely mid-run, between waves.

Two ways to close it, per the reviewer:
1. Author `W? make web-lint` in future plans — what the script's own comment assumes.
2. Add `web-lint` to the wave-2 hard-coded case, so no plan can forget it.

---

### Lift the wheel accumulator step into a pure function

**Source**: `review.cycle2.md` Note 2.
**Change requested**: **no** — "No change requested now."
**Suggested section**: web / terminal (the user chooses).
**Pre-existing**: no — this concerns code this branch shipped.

The Vitest coverage for `flushWheelScroll`'s sub-line accumulation *mirrors* the step in a local
`accumulateFrame` helper rather than calling shipped code, because the real accumulator is
private to `TerminalSurface` and DOM-bound. The test is honest about this, but it follows that
reverting `pane.ts` to the pre-fix zeroing would leave those unit tests green. The E2E test in
`shell-scroll.spec.ts` is the binding one, and the reviewer proved it discriminates by
reintroducing the bug.

If the arithmetic changes again, the cheap fix is to lift the step into `shellkeys.ts` as a pure
`(accum, deltaY) => { accum, lines }` and have `pane.ts` call it.

---

### A `prefers-reduced-motion` rule for the activity spinner

**Source**: `review.cycle2.md` Note 3.
**Change requested**: **no** — flagged as "not a compliance defect"; the design system does not
ask for one.
**Suggested section**: theme / accessibility (the user chooses).
**Pre-existing**: no — `shellact-spin` ships with this branch.

`shellact-spin` is the only `animation:` declaration in the entire stylesheet, and there is no
`prefers-reduced-motion` block anywhere in `web/src` or `docs/design`. A 0.7 s infinite spinner
is the app's first sustained motion, so if a reduced-motion rule is ever wanted, this is the
element that needs it.
