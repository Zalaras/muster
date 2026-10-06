# Plan: launch-inflight-guard

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: launch.spec.ts daemon (the new test counts every session the daemon holds, a daemon-global state; the file's existing tests already take `daemon`)
**Features**: launch
**Description**: Launch stays disabled from the press until the daemon answers, so a second press during the in-flight request sends nothing.

## Symptom

From `TODO.md` § Issues › Together — a launch request in flight (filed 2026-09-26 by the developer
from `plans/maintainability-regressions/proposed-backlog.md`):

> **Launch can be pressed again while a launch is in flight** — during the ~1 s pre-check a second
> press sends a second launch. Launch should stay disabled until the first one answers.

What the developer sees: a quick double press on Launch (or a slow daemon and an impatient second
press) produces two sessions, two rail cards and two tmux panes for one intended launch.

## Findings

The claim held as written, reproduced 2026-10-06 with a throwaway Playwright spec against a scratch
daemon (per-test `daemon` fixture, the shared stub `claude`): open the dialog, fill a title, press
Launch twice, count `[data-testid="session-card"]`.

```
repro A: a dblclick on Launch
  Locator:  getByTestId('session-card')   Expected: 1   Received: 2   (34 × locator resolved to 2 elements)
repro B: two synchronous click() calls on Launch
  Locator:  getByTestId('session-card')   Expected: 1   Received: 2
```

Cause: nothing in the dialog records that a request is out. The form's `submit` listener
(`web/src/features/launch.ts:674`) calls `submit()` (`:565`), which dispatches to the New tab's
`submitNew()` (`:510`) or the Resume tab's submit and only closes the dialog after the `await`.
Neither path touches `#launch-button`'s disabled flag before awaiting, so every press in that
window is a fresh `POST /api/sessions`, and the daemon honours each one (it has no dedupe, by
design — a second launch into the same directory is legitimate).

Two things the entry does not say:

- The Resume tab shares the gap: its submit runs through the same `submit()` dispatcher.
- `#launch-button.disabled` already has two writers — `renderModelRowState`
  (`web/src/render/launch.ts:224`, on every verdict arrival and model selection change) and
  `refreshDialogFace`'s Resume branch (`web/src/features/launch.ts:375`, from the row selection).
  A verdict landing mid-flight would re-enable a button that was merely set disabled beside them,
  so the in-flight state has to be an input to those recomputes, not a third independent writer.

What did not hold: nothing — the "~1 s pre-check" is the daemon's model-catalog check
(kb:fact/model-catalog-precheck-zero-token) and is only the usual width of the window; the gap
exists for any request latency.

## Requirements

### Must Have

- **REQ-1**: Pressing Launch twice (a double click, or two presses before the daemon answers) on
  the New tab creates exactly one session: one `POST /api/sessions`, one rail card.
- **REQ-2**: `#launch-button` is disabled from the press until the daemon's answer arrives; a
  refusal (`model_unrecognized` or any other error) re-enables it so the developer can correct the
  form and retry; a success closes the dialog as today.
- **REQ-3**: The same guard holds on the Resume tab: a double press resumes exactly one session.
- **REQ-4**: A model verdict arriving, or a selection change, while the request is in flight does
  not re-enable Launch — the disabled state the two existing writers compute is OR-ed with the
  in-flight state, never overwritten by it.

## Affected Files

### Web (web-impl)

- `web/src/features/launch.ts` — REQ-1, REQ-2, REQ-3: an in-flight flag owned by the controller,
  set in the shared `submit()` dispatcher before either tab's request and cleared when it answers,
  with an early return while set; REQ-4: the flag becomes an input to the two existing disabled
  recomputes (the Resume branch of the face refresh and the model-row state) rather than a write
  beside them.
- `web/src/render/launch.ts` — REQ-4 (if the implementer threads the flag through the model-row
  render): the button's disabled write takes the in-flight input into account.
- `web/src/features/launchmodels.ts` — REQ-4 (alternative seat for the same OR, in the pure
  derivation, if the implementer prefers it unit-tested there).

### E2E (e2e-specs)

- `web/e2e/launch.spec.ts` — REQ-1, REQ-2: the Proof test below, added to the launch dialog's
  existing spec file (it already takes the per-test `daemon` fixture every test here needs).

### Existing tests this breaks

- none

## Proof

`web/e2e/launch.spec.ts`, a new test "a second press on Launch while the first is in flight sends
nothing: one session, one card (REQ-1, REQ-2, E1)", written by **e2e-specs**. It opens the dialog
on a fresh daemon, fills a title, presses Launch twice without waiting between the presses (two
synchronous `click()` calls on the button via `locator.evaluate`, which is both deterministic and
exactly what a disabled button must swallow), waits for the dialog to close, and asserts
`page.getByTestId("session-card")` has count 1 and `GET /api/state` lists one session. Red today:

```
expect(locator).toHaveCount(expected) failed — Expected: 1, Received: 2
```

The same test also asserts REQ-2's enabled half: after the dialog closes and is reopened, Launch is
enabled again (the flag cleared with the answer).

## Edge Cases

1. A refused launch re-enables Launch and a corrected retry succeeds → E2 (the existing
   launch-model-check test "an unrecognized custom model … a retry with a recognised model
   succeeds" presses Launch again after the refusal; it goes red if the flag is never cleared on
   error).
2. A double press on the Resume tab → untested: the guard sits in the shared dispatcher before the
   New/Resume branch, so REQ-1's test exercises the same code; R1 checks the placement.
3. A verdict lands or the model selection changes while the request is in flight → untested: the
   stub `claude` has no latency seam to hold a request open; R2 checks that both disabled writers
   take the in-flight input.
4. Cancel or Escape closes the dialog mid-flight → untested: behaviour unchanged — the request
   completes, the flag clears with the answer, and a success still opens the launched session
   (kb:adr/launch-opens-launched-session), as today.

## Acceptance Criteria

### Automated Checks

```checks
E1 cd web && npx playwright test launch.spec.ts -g 'in flight'
W1 make web-lint
W2 make web-test
W3 make web-build
E2 make e2e
```

### Reviewer-Verified

- **R1**: the in-flight guard is set in the shared `submit()` dispatcher before the New/Resume
  branch (both tabs covered) and cleared on every exit path of the request, success and failure
  alike.
- **R2**: neither existing writer of `#launch-button.disabled` (the model-row render on verdict
  arrival, the Resume-selection branch of the face refresh) can re-enable the button while the
  flag is set — the flag is an input to both, not a third writer.

## Doc Delta

The launch spec body sits at 797 of its 800 words, so the addition pays for itself with two cuts
the records already carry.

**launch** — becomes true:
- Launch is disabled from the press until the daemon answers: a refusal re-enables it, a success closes the dialog, and a second press meanwhile sends nothing.
- Every launch remembers its directory as a repo row (kb:adr/launch-hybrid-mru-directory-memory).

**launch** — stops being true:
- Directory memory is hybrid: every launch remembers its directory as a repo row, with promotion reserved for rows that carry per-repo config, which nothing writes yet (kb:adr/launch-hybrid-mru-directory-memory).
- The dialog checks first, so Launch itself pays no subprocess on the common path.

## Out of scope

Nothing.
