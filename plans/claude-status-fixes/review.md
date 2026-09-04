# Review: claude-status-fixes

**Plan**: claude-status-fixes
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `StateInput.FromSubagent` derived in `internal/claudecode` only | Yes — `interpret.go:50-57` (field), `:74` turn-activity, `:83` `PermissionRequest`; every other case leaves the zero value | Yes — `TestInterpret_FromSubagentMarker`, 9 subtests (D6) | pass |
| REQ-2 closed prompt + marker ⇒ ACTIVE, prompt not reopened/adopted | Yes — `machine.go:20-38`; `closed && !FromSubagent` returns, adoption gated on `!closed` | Yes — `TestApplyInput_TurnActivity_ClosedPromptSubagentMarked`, cross-state table `closed_prompt_marked_activity` ×7; E8 live | pass |
| REQ-3 closed prompt + marker ⇒ `needs_input`, reason `permission` | Yes — `machine.go:40-53` | Yes — `TestApplyInput_NeedsInputPermission_ClosedPromptSubagentMarked`, table `closed_prompt_marked_permission` ×7; E2 live | pass |
| REQ-4 every transitioning turn-activity clears `Attention` **and** `Failure` | Yes — `machine.go:32-37`, outside the closed-prompt branch so it covers both doors | Yes — table `open_prompt_activity` / `closed_prompt_marked_activity` ×7 each; E2, E4, E7 live | pass |
| REQ-5 unmarked events keep today's guard bit-for-bit | Yes — guard unchanged when `!FromSubagent`; `latchPermissionMode` still runs first | Yes — table `closed_prompt_unmarked_*` ×21; D11 test and `sessions.spec.ts` straggler unedited and green | pass |
| REQ-6 active-segment click does not cancel; commits; no view prefs request | Yes — `main.ts:894-905`, both `mousedown` and `click` guarded | Yes — `rename.spec.ts` E5; verified by hand (see Manual Verification) | pass |
| REQ-7 non-primary `mousedown` never cancels | Yes — `e.button === 0` conjunct | Yes — `rename.spec.ts` E6; verified by hand | pass |
| REQ-8 invariants asserted from every reachable source state, incl. #20's shape | n/a (tests) | Yes — `TestApplyInput_CrossStateInvariants` 7 states × 6 inputs = 42 subtests, plus `TestApplyInput_TurnActivity_REQ20Shape` | pass |

Named invariants: INV-A, INV-F, INV-G and INV-P are each asserted per table cell.
I traced every remaining `setState` in `internal/session/machine.go` (`KindTurnClosed`,
`KindTurnFailed`, `applyBind`) and INV-A/INV-F now hold on all of them, so the file's
own §5.3 comment block is true as written for the first time (D8).

## Build & Tests

E2E tests: **pass (248/248)** — full suite, run by me as a regression sweep, exit 0
Daemon tests: **pass** — `make test` green across all 13 packages; `TestApplyInput*` alone is 105 passing subtests
Web tests: **pass (746/746, 26 files)**
Daemon build: **pass**
Web build: **pass**
Lint: **pass** (golangci-lint, 0 issues)

No failures to tag. No spec file outside this plan's two moved, and none needed to.

## Acceptance Checks

Run via `.claude/skills/orchestrate/scripts/gates.sh claude-status-fixes --checks-only`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n -e "agent_id\|agent_type" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| E1 | `make e2e` | pass |

7 lines, 0 failed.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | source-state × input table asserting INV-A/F/G/P after every cell | pass | `machine_test.go:616-712` — 7 source states × 6 input variants; each straggler cell asserts state, `stateSince`, attention, failure, `currentPromptID` and closedness unchanged; each transitioning cell asserts the invariant that applies |
| D6 | `FromSubagent` true for marked `PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`PermissionRequest`, false unmarked and for `Notification` | pass | `interpret_test.go:255-328`; both `Notification` types covered, plus a defensive `agent_id:null` case |
| D7 | D11 straggler test and `sessions.spec.ts` straggler E2E unchanged and passing | pass | `git diff --numstat` shows `machine_test.go` and `interpret_test.go` at 0 deletions; `sessions.spec.ts` absent from the diff entirely; D11 case at `machine_test.go:414` untouched and green |
| D8 | §5.3 comment block now describes true behaviour | pass | `machine.go:126` claims the iff rules are unconditional; traced all six transitioning paths, all now consistent |
| W3 | each `mousedown` cancels only when `e.button === 0` and target view differs | pass | `main.ts:894-899` — exactly that conjunction, no other condition |
| W4 | no `any` in new web code | pass | grepped every added line under `web/`; the only hits are the English word in two comments |
| E2 | subagent permission after Stop | pass | `subagent-status.spec.ts:55` — asserts idle, then needs_input with `attention.reason` permission, then that the unmarked `Notification` leaves `attention.since` byte-identical, then working with `attention` null |
| E3 | pre-existing straggler E2E passes unedited | pass | unedited (above); green in the 248 |
| E4 | #20's plan→auto path | pass | `subagent-status.spec.ts:118` — asserts working, `attention` null, `permissionMode` `{value:"auto",source:"hook"}` |
| E5 | active-segment click commits, one title PUT, segment stays pressed, both surfaces | pass | `rename.spec.ts:529` — mainhead and tile mirror, `titlePuts` 1 then 2, `aria-pressed` still true, plus the prefs-PUT absence |
| E6 | right-click on Tiles sends one title PUT, view stays Focus | pass | `rename.spec.ts:597` |
| E7 | `StopFailure` → failed, next `UserPromptSubmit` → working with `failure` null | pass | `subagent-status.spec.ts:159` — also asserts the error token is gone from the card |
| E8 | subagent activity after Stop, `stateSince` strictly later | pass | `subagent-status.spec.ts:204` — strict `toBeGreaterThan`, then ordinary fresh-prompt resumption |

## Repairs Audit

Both entries in `test-specs.md`'s `## Repairs` table hold up. Each added a
`waitForNextClockSecond()` before the second hook POST; neither touched an assertion.
E7 still asserts `resumed.failure` is null and that `stateSince` moved; E8 still asserts
`workingSince > idleSince` strictly. The root cause is real and not a masked daemon bug:
`stateSince` is wire-formatted whole-second RFC3339, so two genuine transitions inside
one wall-clock second are indistinguishable on the wire. The wait is bounded by the
remainder of the current second, not a fixed sleep, and reuses a pattern
`launch.spec.ts` already documented for the same reason. The hoist into
`helpers/session.ts` removed `launch.spec.ts`'s private copy and that file's 23 tests
still pass. The E5 change in the same pass *added* the prefs-PUT assertions rather than
weakening anything. No `test.skip`, `test.fixme` or `t.Skip` appears anywhere in the diff.

Fixture honesty: `agent_id` + `agent_type`, the two `background_tasks` entry shapes, and
the marker's absence from `Notification` all match `spikes/canary-fields.md` "Subagent and
background-task fields" key-for-key. No test posts an unmeasured shape.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `agent_id`/`agent_type` appear only in `internal/claudecode/{interpret.go,interpret_test.go}` and `web/e2e/helpers/payloads.ts`; D4's negative grep is clean. `internal/session` drives the machine with `StateInput{FromSubagent: true}` and never sees a payload |
| 2 | No terminal-output state parsing | pass — no `capture-pane` or ANSI reading added |
| 3 | No blocking hook handler | pass — ingest path untouched; the change is inside `applyInput`, downstream of the 200 |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — no tmux call added or changed; my own verification daemon ran on a private `-tmux-socket` |
| 5 | No payload logging | pass — measured, not assumed: after driving 9 hooks carrying `prompt` text through a real daemon, `grep` for the prompt strings in its log returned 0 |
| 6 | No empty-gauge dishonesty | pass — no gauge touched; the live UI rendered "ctx unknown" and usage "unknown" during verification |
| 7 | Session identity on the tmux target | pass — routing untouched; the machine keys on the resolved session and prompt id |
| 8 | No settings trespass | pass — no reference to `settings.json` or `CLAUDE_CONFIG_DIR` in the diff |
| 9 | No real `claude` outside canary/probes | pass — the new specs synthesize payloads and launch through the harness's stub-claude seam; my manual pass used the same stub |

Design-system compliance is not engaged: the diff contains no CSS, no markup, no new
colour literal, font, or numeric display. The only web change is two pairs of event-listener
guards.

## Manual Verification

I drove a real browser (Playwright) against a scratch `musterd` on port 47311 with its own
data dir, a private tmux socket, and the harness's stub-claude binary, so nothing touched
Damian's data dir, default tmux server, or subscription. One session launched through the
UI. Everything below is an observed value, not an inference from a passing test.

**REQ-6, active-segment click.** Opened the mainhead rename, typed `manually verified
alpha`, clicked the already-pressed Focus segment. Field closed; heading and rail card both
read the new title; Focus still `aria-pressed="true"`; exactly one `PUT
/api/sessions/1/title` and **zero** `PUT /api/prefs`.

**REQ-7, right-click.** Reopened the rename, typed `right click commits`, right-clicked the
*inactive* Tiles segment. Committed via blur: one title PUT, no prefs PUT, view still Focus.

**Unchanged regression case.** Reopened the rename, typed `SHOULD BE DISCARDED`, primary-clicked
the inactive Tiles segment. Edit discarded (title stayed `right click commits`), zero title
PUTs, exactly one prefs PUT, view switched to Tiles. So the guard narrowed the cancel without
removing it.

**#14, idle while still working.** `UserPromptSubmit` p1 → badge `working`. `Stop` p1 carrying
a non-empty `background_tasks` → badge `idle` (decision 3 honoured). An **unmarked**
`PostToolUse` for the closed p1 → still `idle`, state timer still counting from the idle
transition (INV-G intact). Then the **marked** `PostToolUse` for the same closed p1 → badge
`working`, `stateSince` moved to a later value. That pair is the fix and its control, observed
back to back on one session.

**#15, latched attention.** Marked `PermissionRequest` for the closed p1 → badge `needs input`,
`attention.reason` `permission`. Unmarked `Notification permission_prompt` → no change. Marked
`PostToolUse` → badge `working`, `attention` null, latch corrected to `acceptEdits`.

**#20, stale failure note.** `StopFailure` p2 → badge `failed` with `server_error — the API
failed` on the card. `UserPromptSubmit` p3 → badge `working`, `failure` null, and the error
text gone from the card.

Torn down afterwards: tmux server killed, daemon stopped, socket removed, no orphan processes.

## Orchestrator Scope Rulings

Both rulings are sound and I accept the code as shipped.

**Ruling 1 — guarding the `click` → `requestView` listeners.** Correct. REQ-6 states in
its own text that "no prefs request is sent for the view", and the unguarded `click`
listener made that false regardless of what the `mousedown` guard did. A requirement
outranks the plan's Implementation Note telling the agent to leave those listeners alone;
the note was simply wrong about what REQ-6 needed. The behaviour is safe because `view`
only ever changes from a server broadcast (`applyPrefsFromSnapshot`), and `aria-pressed`
renders from that same variable, so a same-view click can never be a needed repair of a
diverged pref. Verified live: no prefs PUT on the active segment, exactly one on a genuine
switch.

**Ruling 2 — clearing `Failure` in `KindNeedsInputIdle` too.** Correct, and it closes a real
pre-existing gap rather than expanding scope for its own sake. The plan states INV-F
unconditionally ("`failure` is non-null **iff** `state == "failed"`"), matching protocol
§5.3, with no input-kind qualifier; the plan's Affected Files note calling that branch
"unchanged" was a narrower reading of the same document. I traced the reachability
independently: `StopFailure` closes p1 and sets `Failure`, then a lost `UserPromptSubmit`
for p2 followed by `Notification idle_prompt` for p2 reaches the branch with an *unseen*
prompt id, so the closed-prompt guard never fires and the old code would have stranded a
failure note on a `needs_input` session. `daemon-tests` pinned exactly that path in a new
test. Leaving it would have shipped a known §5.3 violation.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[e2e-specs]** In `subagent-status.spec.ts`'s E7 test, the variable holding
   `failed.stateSince` is named `lastActivityBefore` — `web/e2e/subagent-status.spec.ts:182`.
   It is compared against `resumed.stateSince` two lines later, and the comment beside it
   talks about `lastActivity`, so a maintainer reads the assertion as being about a field it
   never touches. Rename to `stateSinceBefore`.
2. **[orchestrator]** The plan record now contradicts what shipped, in two places, both
   resolved by your own rulings: Implementation Notes says "Keep the existing `click` →
   `requestView` listeners untouched", and Affected Files says "`KindNeedsInputIdle`
   unchanged". A one-line amendment to each keeps the plan readable as the record of this
   work. Plan defect, not an agent's.
3. **[orchestrator]** `docs/protocol.md` §7.3 spells out the `attention`/`failure` clear only
   on the turn-activity row (`:808`); the shipped code also clears `failure` on both
   `needs_input` doors (`:812` `PermissionRequest`, and the `idle_prompt` path). That is
   required by §5.3's unconditional iff rule, so nothing in the document is false — but a
   reader of §7.3 alone would not expect it. Worth making explicit on those two rows.
4. **[orchestrator]** Standing doc upkeep, not yet done (Completion step owns it): the three
   `TODO.md` entries are still unticked (`TODO.md:702` for #14, `:723` for #15/#20, and the
   rename follow-up under `ui-text-and-focus`), and `SPEC.md` has no changelog entry for this
   plan.

### Notes

1. **[note]** `runningShellTask` in `web/e2e/helpers/payloads.ts:231` is exported but unused.
   The author flagged it deliberately, as documentation of the second measured
   `background_tasks` entry shape. Fine to keep; noting so a future dead-code sweep does not
   read it as an oversight.
2. **[note]** `TurnActivityOpts.agentId` also applies to `rawUserPromptSubmit`, and a marked
   `UserPromptSubmit` is not a shape the 2.1.259 probe observed — the background-completion
   re-invocation is a main-agent prompt with a fresh id and no marker. No test posts that
   combination, so no dishonest payload reaches the daemon, and REQ-1 does ask for
   `UserPromptSubmit` derivation on the daemon side. Recording it so nobody later mistakes the
   fixture option for a measured fact.
3. **[note]** Decision 3's accepted cost is now visible in the product: a `Stop` with running
   background work shows a genuine ~2 s `idle` blip before the first marked subagent hook
   returns the card to `working`. I saw it during manual verification. It is documented in
   `docs/protocol.md` §7.3 and is the deliberate price of never trusting `background_tasks`.
4. **[note]** `make test` passed cleanly here. Worth knowing that it has been intermittently
   flaky via the `internal/tmux` preflight, so a single red run on that package is not
   automatically this plan's.
