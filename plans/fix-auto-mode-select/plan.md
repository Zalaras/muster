# Plan: fix-auto-mode-select

**Created**: 2026-09-03
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: The launcher's "Start in" control offers Claude Code's four tabbed permission modes — manual, accept edits, plan, auto — with the labels Claude Code itself uses, and `auto` can actually be requested (closes #12).

## Overview

Issue #12: picking "auto-accept" in the new-session dialog produces a session in *accept
edits* mode, not Claude Code's *auto* mode. The wire is self-consistent — the radio sends
`acceptEdits`, the daemon emits `--permission-mode acceptEdits` — but the label was coined
when SPEC §4.1 was written and "auto-accept" was the only shorthand for accept-edits. Claude
Code has since grown a distinct mode literally named `auto`, and Muster cannot request it.

Measured 2026-09-03 against Claude Code 2.1.259 (`spikes/canary-fields.md` § Hook payloads,
"Permission-mode probe"): the CLI's `--permission-mode` choices are `acceptEdits | auto |
bypassPermissions | manual | dontAsk | plan`. `default` is unlisted but still accepted, and
`manual`, `default` and no-flag are one mode on the wire — hooks report `permission_mode:
"default"` for all three and the TUI footer reads `⏸ manual mode on`. `--permission-mode auto`
reports `"auto"` on `UserPromptSubmit` and the footer reads `⏵⏵ auto mode on`. Auto is
**model-gated**: on haiku the TUI prints `auto mode unavailable for this model`, drops to
manual, and hooks report `"default"`; sonnet, opus and fable honour it.

The fix is a vocabulary fix plus one new value. The four radios become `manual │ accept
edits │ plan │ auto` (Damian's list, in Shift+Tab cycle order). Wire values: `default` stays
the value behind "manual" (it is what hooks report, so existing `lastPermissionMode` rows and
the seed/latch comparison keep working with no migration); `acceptEdits` and `plan` are
unchanged; `auto` is new end-to-end — request validation, argv, Go constant, TypeScript
unions, protocol doc. `bypassPermissions` and `dontAsk` stay out (TODO ties them to the §4.4
permissions UI and its guardrails; auto's guardrail is Claude Code's own classifier). No
schema change. No new dashboard surface displays the mode word — the only consumer is the
planning-state derivation, which compares against `plan` and is untouched.

## Requirements

### Must Have
- [ ] REQ-1: The "Start in" radiogroup offers exactly four radios, in this order, with these
  accessible names and wire values: `manual` → `default`, `accept edits` → `acceptEdits`,
  `plan` → `plan`, `auto` → `auto`. The string "auto-accept" no longer appears in the
  dashboard's markup, source or E2E suite.
- [ ] REQ-2: `POST /api/sessions` accepts `permissionMode: "auto"` and seeds the session's
  latch with `{ value: "auto", source: "seed" }`; it rejects any value outside the four with
  `400 invalid_request` whose message names all four accepted values.
- [ ] REQ-3: A launch with `permissionMode: "auto"` runs `claude … --permission-mode auto`;
  `default` still emits no `--permission-mode` flag (measured: no-flag, `manual` and `default`
  are the same mode on the wire, and omitting the flag is the only spelling known to work on
  both the 2.1.246 pin and 2.1.259).
- [ ] REQ-4: The per-directory launch default round-trips `auto`: after a launch with
  `auto`, `GET /api/repos` reports `lastPermissionMode: "auto"` for that directory, and
  re-opening the dialog on that directory pre-selects the `auto` radio. Existing stored
  values `default`, `plan`, `acceptEdits` keep pre-selecting `manual`, `plan`, `accept edits`
  respectively.
- [ ] REQ-5: A seeded `auto` is corrected by the first hook that carries `permission_mode`
  exactly like any other seed (protocol §7.2 `modeLatch`): a `UserPromptSubmit` with
  `permission_mode: "default"` (the haiku fallback) leaves the session at
  `{ value: "default", source: "hook" }` and in `working`, not `planning`. This is existing
  latch behaviour; the requirement pins it for the new value.

### Should Have
- [ ] REQ-6: When a directory's stored `lastPermissionMode` is a value the dialog has no radio
  for (e.g. a mode a future Claude Code adds, or `null`), the dialog selects `manual` — so the
  form always shows the value it will send. Today `checkRadio` unchecks every radio on a miss
  while `selectedPermissionMode()` silently sends `default`.

### Nice to Have
- (none — the launcher does not warn about the haiku/auto gate; the honesty rule (ux-flows
  §1.2) already covers it: the seed is corrected on the first prompt.)

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). No new messages or endpoints;
one enum widens in three places and one error message changes.

### HTTP: POST /api/sessions (§3.1) — `permissionMode` enum widens
**Auth**: unchanged (localhost token, SPEC §2.6).
**Request** (only the changed field shown; rest of §3.1 unchanged):
```jsonc
{ "permissionMode": "auto" }   // required: "default" | "plan" | "acceptEdits" | "auto" — seeds the latch (§7.3).
                               // "default" is Claude Code's manual mode (the UI labels it "manual"; measured 2.1.259:
                               // no-flag, `manual` and `default` all report permission_mode "default").
```
**Response 201**: unchanged — the Session object (§5.3) with
`"permissionMode": { "value": "auto", "source": "seed" }` when `auto` was requested.
**Errors** (exact wire shape, §2 envelope):
- 400 — any `permissionMode` outside the four:
```json
{ "error": { "code": "invalid_request", "message": "permissionMode must be one of default, plan, acceptEdits, auto" } }
```

### HTTP: GET /api/repos (§3.2) — `lastPermissionMode` may be `"auto"`
`lastPermissionMode` is the raw value of the last launch here; `"auto"` is now a possible
value alongside `"default" | "plan" | "acceptEdits" | null`. No shape change.

### Session object (§5.3) and §7.2 `modeLatch` — `permissionMode.value` may be `"auto"`
`permissionMode.value` is still an open string (last-known, never authoritative). Document
`"auto"` as an observed value with the 2.1.259 measurement, and note in §7.2 that a seeded
`auto` on a model that cannot run it (haiku, measured) is corrected to `"default"` by the
first `UserPromptSubmit` — the ordinary seed-then-correct path, nothing new to build.

## Schema Changes

No schema changes required. `repos.last_permission_mode` and
`sessions.permission_mode` are already free-text columns; `"auto"` is just a new value.

## UI Specifications

### Views
- New-session dialog, "Start in" fieldset (`web/index.html`, `#launch-form`) — the
  segmented radiogroup gains a fourth segment and three of its labels change. Nothing else
  in the dialog moves.

Before / after (ux-flows §1.2 mockup line, to be updated there on approval):
```
Start in    [ default │ plan │ auto-accept ]          →   Start in    [ manual │ accept edits │ plan │ auto ]
```

Markup at feature level — four native radios in the existing `.seg-track` with
`role="radiogroup" aria-label="Start in"`, in this order:

```html
<label><input type="radio" name="permission-mode" value="default" checked />manual</label>
<label><input type="radio" name="permission-mode" value="acceptEdits" />accept edits</label>
<label><input type="radio" name="permission-mode" value="plan" />plan</label>
<label><input type="radio" name="permission-mode" value="auto" />auto</label>
```

`manual` stays the checked default so an empty dialog (no recents, REQ-6 fallback) launches
in Claude Code's default mode as today. The segmented control already fits five segments
(the Model row has five); no style change is expected, but web-impl verifies the four
labels fit the existing `.seg-track` at the dialog's width without wrapping.

### User Flows
1. Open the dialog (⌘N / "New session"), pick a directory, click `auto`, Launch. The POST
   body carries `permissionMode: "auto"`; the card appears with the session `started`; the
   issue snapshot / any mode readout shows `auto (last known, source seed)`.
2. Re-open the dialog on the same directory: `auto` is pre-selected (per-directory default).
3. Launch `auto` on a model that cannot run it (haiku). Claude Code drops to manual; the
   first prompt's `UserPromptSubmit` reports `default`; the session's mode becomes
   `default / hook`. No dialog-side warning.
4. A user with an existing directory whose last launch was the old "auto-accept" re-opens
   the dialog: `accept edits` is pre-selected (stored value is `acceptEdits`, unchanged).

### States
- No data yet: the dialog is a form, not a data view — no gauge, nothing to render as
  *unknown*. With no recents, `manual` is checked (existing behaviour, REQ-6 makes it explicit).
- Daemon down: unchanged from `new-session-dialog` — the dialog's existing launch-error
  path shows the request failure; no new state introduced here.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Start-in radiogroup | `radiogroup` | `Start in` | existing `aria-label`; unchanged |
| Manual radio | `radio` | `manual` | value `default`; checked by default |
| Accept-edits radio | `radio` | `accept edits` | value `acceptEdits`; was named `auto-accept` |
| Plan radio | `radio` | `plan` | value `plan`; unchanged |
| Auto radio | `radio` | `auto` | value `auto`; new |

Accessible names come from the `<label>` text wrapping each `<input type="radio">` — the same
mechanism the existing `launch.spec.ts` locators (`getByRole("radio", { name })`) already
rely on. Use exact-match locators (`exact: true`) for `auto` so it cannot collide with a
future `auto…`-prefixed label; e2e-specs' call.

### Invariants

- **INV-1 (existing, restated for the new value)**: `permissionMode.source` is `"seed"` until
  the first hook carrying `permission_mode` is applied to the bound session, then `"hook"`
  forever after; the value is always the last one carried. Assert from a session seeded
  `auto` as well as from the three existing seeds — the haiku-fallback correction (REQ-5) is
  the `auto` instance of this invariant.
- **INV-2**: the radio that is checked when the dialog opens always corresponds to the value
  the form would send. Source states: no recents; recents with each of the four stored
  values; recents with `null`; recents with an unrecognised string (REQ-6).

### Carried-over measurements

- `permission_mode` "not universal" split (canary-fields § Hook payloads) — re-checked
  against this plan's decision to add `auto`: still valid; the 2.1.259 probe saw the field on
  `UserPromptSubmit` and `Stop`, absent on `SessionStart`/`SessionEnd`, same as before.
- "`default` needs no flag" (launch.go comment, spike S2) — re-checked: still valid on
  2.1.259 (no-flag session reported `default`, 1/1), and now the safer spelling since
  `default` is unlisted in the CLI's choices while `manual` may not exist on the 2.1.246 pin.
- `plan` → `acceptEdits` flip on ExitPlanMode approval (canary-fields, S3) — not re-measured
  under `auto`; not carried into any requirement here. Whether approving a plan from an
  `auto` session lands in `acceptEdits` or back in `auto` is a §4.1 question, not this plan's.

## Affected Files

### Daemon
- `internal/session/session.go` — add `PermissionAuto PermissionMode = "auto"` beside the
  three existing constants; comment cites the 2.1.259 probe.
- `internal/server/sessions.go` — request validation `switch` gains `"auto"`; the
  `invalidRequest` message becomes `permissionMode must be one of default, plan, acceptEdits, auto`.
- `internal/claudecode/launch.go` — `LaunchParams.PermissionMode` comment lists the four
  values; `BuildArgv`'s switch emits `--permission-mode` for `"auto"` as well as
  `"plan"`/`"acceptEdits"`; `"default"` still emits nothing (REQ-3). This stays the only
  place the flag string lives.

### Web
- `web/index.html` — the four radios per UI Specifications (labels and order; `value`
  attributes `default`/`acceptEdits`/`plan`/`auto`).
- `web/src/api.ts` — `LaunchRequest.permissionMode` union gains `"auto"`.
- `web/src/render/launch.ts` — `selectedPermissionMode()` return type and guard gain
  `"auto"`; `setPermissionMode()` falls back to checking `default` when `checkRadio` reports
  no match (REQ-6). Consider a single exported `PERMISSION_MODES` tuple in `api.ts` so the
  union and the guard share one source (conventions.md — no duplicated literal lists).

### E2E (e2e-specs)
- `web/e2e/launch.spec.ts` — existing locators `getByRole("radio", { name: "default" })`
  and `{ name: "auto-accept" }` (lines ~97, ~180, ~394) must become `manual` / `accept edits`;
  the four-radio visibility loop lists the new names in order.
- `web/e2e/helpers/payloads.ts` — `TurnActivityOpts.permissionMode` union gains `"auto"`.
- `web/e2e/helpers/session.ts` — `permissionMode` option union gains `"auto"`.
- New spec(s) for E1–E4 below.

### Tests (daemon-tests / web-tests)
- `internal/claudecode/launch_test.go` — table gains an `auto` row (and one asserting
  `default` still omits the flag, if not already present).
- `internal/server/sessions_test.go` — accept `auto`; reject an unknown value with the new
  message; a seeded `auto` session's wire object shows `{ "auto", "seed" }`.
- `internal/session/machine_test.go` — REQ-5/INV-1: seed `auto`, apply `UserPromptSubmit`
  with `default`, assert `{ default, hook }` and state `working`.
- `web/src/api.test.ts` — `launchSession` serialises `permissionMode: "auto"`;
  `parseRepo` accepts `lastPermissionMode: "auto"`.
- A `launch.ts` unit test for REQ-6 if the render module's radio logic is unit-testable
  (web-tests' call; otherwise E4 covers it).

## Edge Cases

1. **Auto on a model that cannot run it (haiku).** Measured: Claude Code prints `auto mode
   unavailable for this model`, silently runs in manual, and hooks report `default`. Muster
   seeds `auto`, then the first `UserPromptSubmit` corrects to `default / hook`. No
   dialog-side model×mode validation — the gate is Claude Code's and may change per version;
   the honesty rule already handles it. The `lastPermissionMode` for the directory still
   records `auto` (it records what was *asked*, as today).
2. **Hook loss.** If the first `UserPromptSubmit` is lost, the latch stays `auto / seed` until
   the next event that carries the field (`PreToolUse`, `PostToolUse`, `Stop`) — same as every
   other seed; nothing new.
3. **`/clear` in an `auto` session.** `SessionEnd(reason:"clear")` and `SessionStart(source:
   "clear")` carry no `permission_mode`; the latch is untouched by both (§7.2), in either
   arrival order. The new conversation's first `UserPromptSubmit` carries whatever mode the
   pane is actually in. A late `SessionEnd(clear)` for the old id after the rebind is routed
   as a straggler and never touches the latch. Nothing new for this plan; stated so the
   test agents don't invent a reset.
4. **Daemon restart mid-session.** `permission_mode` / `permission_mode_source` are persisted
   per session; `auto` survives a restart as a plain string. No migration, no special case.
5. **Old stored "auto-accept" launches.** Their `lastPermissionMode` is `acceptEdits` and now
   pre-selects `accept edits` — the same mode, correctly named. Nothing to migrate.
6. **Unrecognised stored mode.** REQ-6: dialog selects `manual`, sends `default`.
7. **Older pinned Claude Code (2.1.246) without `auto`.** Unverified whether 2.1.246 accepts
   `--permission-mode auto`; if it rejects the flag the process exits before any hook and the
   session dies at `started` exactly as any other launch failure does today. Muster never
   emits `manual`, so the pin question is confined to `auto`. Record in the pin doc when the
   next bump runs `make canary`.
8. **Pane death without `SessionEnd`.** Unchanged; the latch is not consulted on death.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `make lint` passes.
- **D3**: `POST /api/sessions` with `permissionMode: "auto"` returns 201 and a Session whose
  `permissionMode` is `{ "value": "auto", "source": "seed" }`.
- **D4**: `POST /api/sessions` with an unknown `permissionMode` returns 400 `invalid_request`
  with the message `permissionMode must be one of default, plan, acceptEdits, auto`.
- **D5**: `BuildArgv` with `PermissionMode: "auto"` yields `… --permission-mode auto`.
- **D6**: `BuildArgv` with `PermissionMode: "default"` yields no `--permission-mode` flag.
- **D7**: after a launch with `auto`, `GET /api/repos` reports `lastPermissionMode: "auto"`
  for that directory.
- **D8**: a session seeded `auto` that receives `UserPromptSubmit{permission_mode:"default"}`
  reports `{ "value": "default", "source": "hook" }` and state `working`.
- **D9**: the string `--permission-mode` appears in no Go package other than `internal/claudecode`.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: the "Start in" radiogroup contains exactly four radios named `manual`, `accept
  edits`, `plan`, `auto`, in that DOM order.
- **W4**: the radios' `value` attributes are `default`, `acceptEdits`, `plan`, `auto` respectively.
- **W5**: the string `auto-accept` appears nowhere under `web/` (markup, source, or E2E).
- **W6**: with no recents the `manual` radio is checked when the dialog opens.
- **W7**: no `any` types in new web code.

### E2E
- **E1**: picking `auto` and launching sends `permissionMode: "auto"` and the resulting
  session's `permissionMode` is `{ value: "auto", source: "seed" }` (daemon API oracle).
- **E2**: re-opening the dialog on that directory shows the `auto` radio checked.
- **E3**: a synthesized `UserPromptSubmit` with `permission_mode: "default"` against that
  session moves its `permissionMode` to `{ value: "default", source: "hook" }` and its card
  badge to `working` (REQ-5, the haiku-fallback shape).
- **E4**: each stored `lastPermissionMode` in `default | acceptEdits | plan | auto` pre-selects
  `manual | accept edits | plan | auto` respectively (INV-2).
- **E5**: the existing `launch.spec.ts` recents/restore tests pass with the renamed radios.
- **E6**: `make e2e` passes.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Write "must not exist" checks so success is exit 0 — prefix the grep with
`!`. IDs match the prose criterion above where one exists; a check with no prose twin (e.g. a build
gate) is fine and shares the same ID namespace. The orchestrator and the review agent run these
verbatim; nothing else in this section is executed automatically.

```checks
D1 make test
D2 make lint
D9 ! rg -n -e "--permission-mode" cmd/ internal/ test/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
W5 ! rg -n -e "auto-accept" web/ --glob '!web/node_modules/**'
E6 make e2e
```

Negative-grep scoping:
- **D9** includes test files (`test/`, `_test.go`) deliberately: the flag string is
  Claude-Code-format knowledge and belongs only in `internal/claudecode/` (CLAUDE.md hard
  rule). Tests elsewhere that need to assert on argv must go through
  `claudecode.BuildArgv` rather than spelling the flag. Tree dry-run 2026-09-03: hits only in
  `internal/claudecode/launch.go` and `launch_test.go` (excluded) — clean. Plan dry-run: this
  document contains the string, but `plans/` is outside the grep's paths.
- **W5** includes `web/e2e/` deliberately: the old label must not survive as a locator or a
  comment. Tree dry-run 2026-09-03: `web/index.html:152` (web-impl), `web/e2e/launch.spec.ts`
  lines 97, 180, 394 (e2e-specs) — all listed under Affected Files against their owners.

### Reviewer-Verified

- **D3**, **D4**, **D5**, **D6**, **D7**, **D8**: covered by unit tests under D1; the reviewer
  confirms each has a test that would fail without the change (not just that D1 is green).
- **W3**, **W4**, **W6**: read `web/index.html` and confirm against the UI Specifications
  markup; E4/E5 exercise them in a browser.
- **W7**: no `any` types in new web code.
- **E1**–**E5**: covered by `make e2e` (E6); the reviewer confirms each has a spec.
- The `.seg-track` still fits four labels on one line at the dialog's width (web-impl
  supplies a screenshot or measured DOM, per CLAUDE.md's "claimed effects need measurement").

## Implementation Notes

- **Evidence**: `spikes/canary-fields.md` § Hook payloads, "Permission-mode probe (2026-09-03,
  against 2.1.259)" and the `spikes/FINDINGS.md` §4 addendum of the same date. Do not
  re-derive from Claude Code's docs.
- **Why `default` stays the wire value for "manual"**: it is what hooks report for that mode
  (measured 3/3), so seed and hook agree without a mapping table; existing repo/session rows
  keep meaning the same thing; and emitting no flag is the only spelling known to work on the
  2.1.246 pin. Only the *label* changes.
- **Why not `manual` as a fifth accepted request value**: it would be an alias with no
  behavioural difference and a second spelling to keep in sync. Rejected at planning.
- **Why no model×mode guard in the dialog**: the gate is Claude Code's and version-dependent;
  the honesty rule already corrects the seed on the first prompt (measured). A guard would
  be Muster asserting something it does not know (design-system §Honesty rule 3).
- **Web pattern**: `render/launch.ts` already centralises radio read/write in `checkRadio` /
  `checkedValue`; extend, don't fork. If a shared `PERMISSION_MODES` tuple is introduced,
  derive the union type from it (`typeof PERMISSION_MODES[number]`) so there is one list.
- **Doc upkeep (orchestrator, not impl agents)**:
  - `docs/protocol.md` §3.1, §3.2, §5.3, §7.2 — merge the Protocol Contract delta on approval.
  - `docs/design/ux-flows.md` §1.2 — the mockup line becomes
    `Start in    [ manual │ accept edits │ plan │ auto ]`; the "Start in" bullet notes that
    "manual" is the wire's `default`.
  - `SPEC.md` changelog — entry noting that §4.1/§4.5's "auto-accept" wording refers to Claude
    Code's *accept edits* mode (`acceptEdits`), that Claude Code now also has a distinct
    `auto` mode which the launcher offers from this plan, and that `bypassPermissions` /
    `dontAsk` remain deliberately unoffered pending §4.4.
  - `TODO.md` — tick the #12 entry on land.
  - `docs/design/mockups/c-terminal.html:255` still shows `(•) auto-accept` — it is a static
    reference render, not a spec; leave it, or update the label if touching the file anyway.
- **Version note**: measured on 2.1.259 while the pin is 2.1.246. This plan does not bump
  the pin; the next `docs/claude-code-pin.md` ritual should confirm `--permission-mode auto`
  and the `"auto"` hook value on whatever version it adopts (canary-fields lists it under
  "Values worth asserting").
