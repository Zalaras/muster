# Review: canary-full-coverage

**Plan**: canary-full-coverage
**Cycle**: 1
**Verdict**: needs-changes

One issue, a Minor: a production doc comment in `internal/claudecode/launch.go` still says
`CLAUDE_CODE_SCROLL_SPEED` "is not yet asserted by `make canary` … the canary assertion is
owed", which this plan's static tier made false and whose TODO sub-item this plan's own doc
upkeep ticked. Everything else — all four authored checks, the full E2E sweep, the daemon and
web suites, the hard-rule sweep, every Reviewer-Verified criterion including the real
`canary-run.log` — is clean.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 run C ×4 permission-mode sweep | Yes — `harness_test.go:78-88` (`unauthRuns`), `runC` at `:370` | Yes — `TestLaunchFlags` 4 subtests + `TestStopFailureReplacesStop` 4 subtests, all PASS in the log | pass |
| REQ-2 run D via `BuildArgv` w/ title + plan mode | Yes — `harness_test.go:407-411` | Yes — `session_title` in `TestLaunchFlags`, `session_name` in `TestStatusLineFields:341`, interactive `plan` in `TestLaunchFlags` | pass |
| REQ-3 idle_prompt wait + inventory | Yes — `harness_test.go:482-485` (90 s bound) | Yes — `TestNotifications` idle subtest; inventory row `canary_test.go:104` | pass |
| REQ-4 run E resume through production argv | Yes — `harness_test.go:499-520` | Yes — `TestLaunchFlags` "resume carries the same session identity" | pass |
| REQ-5 unanswered `ExitPlanMode` dialog | Yes — `harness_test.go:543-562`, no key sent after the prompt | Yes — `TestNotifications` permission subtest, `permission_suggestions` optional per the amendment | pass |
| REQ-6 real `TestPlanModeSequence`, no `needsInteractiveDialog` | Yes — `canary_test.go:180-209`; constant and its skips gone (grep: zero hits) | Yes — steps 1-2 asserted, step 3 `t.Log`ged | pass |
| REQ-7 static tier | Yes — `static_test.go` | Yes — PASS offline and in the real run | pass |
| REQ-8 live tier (3 tests, fail never skip) | Yes — `live_test.go` | Yes — all three PASS in the log | pass |
| REQ-9 Notification/PermissionRequest rows driven | Yes — `canary_test.go:104,110` | Yes — both subtests PASS | pass |
| REQ-10 offline stays zero-token | Yes — `harness(t)` and `live(t)` skip; static tier reads a local file | Yes — D3 check passes; full offline run skips all 14 harness/live tests | pass |
| REQ-11 nothing sensitive printed | Yes | Verified by reading every new assertion/log line (D13) | pass |
| REQ-12 teardown both sessions, no new sleeps | Yes — `teardown` at `:746-763` | Verified: no orphan tmux server, no leftover scratch dir after the run | pass |
| REQ-13 pin doc rewritten | Yes — `docs/claude-code-pin.md` run table, static/live paragraphs, three residuals, R2 closed | n/a (doc) | pass |
| REQ-14 Makefile help + package doc comment | Yes — `Makefile:70`, `canary_test.go:6-7` | n/a (doc) | pass |
| REQ-15 log resumed `session_name` | Yes — `canary_test.go:379-384` | Logged in the run: `session_name = Muster Canary` (title persists across resume) | pass |

## Build & Tests

E2E tests: pass (281 passed, full sweep, exit 0 — no spec files changed by this plan)
Daemon tests: pass (`make test`, 13 packages)
Web tests: pass (1053 tests, 29 files)
Daemon build: pass (`go build ./...`)
Web build: pass (`npm run build`)
Lint: pass (`make lint`, 0 issues; `make e2e-lint` clean; `gofmt -l` clean)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go vet -tags=canary ./test/canary/...` | pass |
| D3 | `MUSTER_CANARY_OFFLINE=1 go test … -run '^TestInstalledBinaryCarriesInterfaceStrings$' … \| grep -q -- '--- PASS: …'` | pass |
| D14 | `make lint` | pass |
| D16 | `make test` | pass |
| DOC | orchestrator doc upkeep (`861aeae`) | pass — `TODO.md` ticks the coverage item and the `#13` `CLAUDE_CODE_SCROLL_SPEED` sub-item (original text kept below the tick for the record); `SPEC.md` changelog entry dated 2026-09-10; `spikes/canary-fields.md` re-validated against 2.1.267 with the new facts (unauth `auto` → `default`, `idle_prompt` at 60.04 s, optional `permission_suggestions`, resume keeps `session_name`, trust-prompt preselection flip, `prompt_cache` key). `docs/protocol.md` needs nothing — no protocol delta. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D2 | `TestLaunchFlags` asserts the four unauth values, `session_title`, `session_name`, interactive `plan` | pass | Log shows all five permission-mode subtests PASS with `unauth, auto: observed permission_mode = "default"` logged; `session_title` asserted at `canary_test.go:252`; `session_name` asserted at `canary_test.go:341` inside `TestStatusLineFields`, where the plan's own Implementation Notes and Affected Files place it. Both are real `assert.Equal`s; REQ-2 is fully covered. |
| D4 | `TestNotifications` asserts idle_prompt after Stop with the REQ-3 inventory | pass | Subtest PASS, `idle_prompt arrived 60.04s after Stop`; field inventory in `TestHookFields/Notification` (common + `prompt_id` + `notification_type` + `message`, `permission_mode` absent) PASS |
| D5 | ordering, `PermissionRequest` inventory, shared `prompt_id`, step 3 logged | pass | `TestPlanModeSequence` asserts `preIdx < reqIdx` and `permission_mode == "plan"`; `TestNotifications` asserts the shared `prompt_id`; `permission_suggestions present=false (tool_name="ExitPlanMode", permission_mode="plan")` logged and shape-checked only when present, exactly as amended |
| D6 | run E `source == "resume"` with D's `session_id`/`transcript_path`, per-run envelope grouping | pass | `canary_test.go:255-265`; `hookEvents` filters on `ev.MusterSession` only (INV-3), so a late run-D straggler cannot be read as run E |
| D7 | `StopFailure` without `Stop` + `authentication_failed` on all four C runs | pass | Four subtests PASS; `SessionEnd` still deliberately unasserted with the measured rationale in place |
| D8 | static tier: env var from `LaunchEnv()`, chunked overlapping scan, per-string failure with resolved path | pass | `static_test.go:48` iterates `claudecode.LaunchEnv()` (the variable is never spelled in an assertion); 4 MiB chunks with a 64-byte carry against a 24-byte longest needle; `assert.Emptyf` names the resolved path and every miss |
| D9 | Keychain test fails, never skips, on `ErrNoCredentials` | pass | `live_test.go:41` uses `require.NoErrorf` on the production reader; the only skip is the offline gate |
| D10 | `FetchUsage` result + raw body shape, fails on 401/403 | pass | `require.Equalf(http.StatusOK, …)` at `live_test.go:120`; `ModelScoped` window, `limits[]{kind,percent,resets_at}`, RFC3339Nano parse, a `weekly_scoped` row with a string `scope.model.display_name` all asserted; PASS in the log |
| D11 | `ReadThemeFamily(DefaultConfigPath()) != ThemeUnknown` | pass | `live_test.go:129-135`, PASS |
| D12 | full `make canary` log; only `TestInstalledVersionMatchesPin` fails | pass | `canary-run.log` (committed `861aeae`) contains runs A/B, C ×4, D, E, the static tier and all three live tests; the single `--- FAIL` is `TestInstalledVersionMatchesPin` naming 2.1.267 vs 2.1.246 (Decision 4) |
| D13 | no payload map, body bytes, token or prompt string in any assertion message or log | pass | Read every new/changed message. Failure paths carry event-type lists (`hookTypes`), key lists (`keys(…)`), single named scalars (`tool_name`, `permission_mode`, `notification_type`, `source`, elapsed seconds) and file paths. The usage token is never formatted; `rawUsageGET` reports status codes and key names only. The two pre-existing `tail(out)` sites print claude's own stdout on a build failure, unchanged by this plan. |
| D15 | pin doc + Makefile help match REQ-13/14 | pass | Run table is A/B/C×4/D/E with cost and proves columns; static and live tiers described with what they do not prove; "Still manual" is exactly plan-mode step 3, `agent_id` on subagent-originated hooks, and the `fable` alias, with `SubagentStop` called out as not a residual; R2 recorded as closed by run E; rerun-once guidance and the `canary-run.log` convention present. `Makefile:70` and `canary_test.go:6-7` carry the same cost sentence. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no new Claude-Code-format knowledge in production packages. The needles in `static_test.go` and the field tables in `canary_test.go` are the canary's sanctioned inventory-of-record role (plan REQ-7); the one production-following value, the env-var name, is read from `claudecode.LaunchEnv()` rather than spelled. |
| 2 | No terminal-output state parsing | pass — `capture-pane` is used only to detect and answer the trust dialog (`looksLikeTrustPrompt`, `answerTrustPrompt`) and as a wait oracle. No session state is derived from pane text; every assertion reads hook and status-line captures. |
| 3 | No blocking hook handler | pass — the in-test capture server records in memory then returns 200; no production hook path touched. |
| 4 | No bare tmux | pass — all three `tmux` invocations pass `-S <scratch socket>` or `-L <private name>`; sizing is `ResizeWindow`, and `resize-pane` appears nowhere in the tree. |
| 5 | No payload logging | pass — see D13. |
| 6 | No empty-gauge dishonesty | n/a — no UI in this plan. |
| 7 | Session identity on the tmux target | pass — every view groups by the envelope's `musterSession` (`hookEvents`/`statusPosts`); `session_id` is compared only as the resume assertion's subject (INV-3). |
| 8 | No settings trespass | pass — writes go to the scratch repo's `.claude/settings.local.json` under `os.MkdirTemp`; `baseEnv()` strips `CLAUDE_CONFIG_DIR` from every run except run C's deliberately unauthenticated config dir (pre-existing, plan-sanctioned); the live tier reads `~/.claude.json` read-only, never `settings.json`. |
| 9 | Real `claude` only in canary with haiku | pass — every launch passes `--model claude-haiku-4-5-20251001` (`headless` argv and both `BuildArgv` calls); prompts are trivial; both tmux sessions are killed and the socket's server torn down. |

## Manual Verification

No UI in this plan, so there is nothing to drive in a browser. What I verified by hand instead:

- **Full E2E sweep** as the regression net: `make e2e` rebuilt the dashboard and binary and ran
  every spec — 281 passed, exit 0. No spec file is touched by this plan and none regressed.
- **Teardown left nothing behind** (plan Edge Case 16, listed as reviewer-verified): after the
  orchestrator's run there is no `muster-canary-*` scratch root under `/var/folders`, no
  process matching `muster-canary`, and `tmux -L muster ls` reports no server. The harness's
  own socket lives inside the removed scratch root.
- **Offline path is offline**: the D3 check runs the static tier alone with no session; the
  full offline run recorded in `daemon-tests.md` skips all 14 harness- and live-backed tests
  with a reason naming `MUSTER_CANARY_OFFLINE`.
- **Tree is clean** after building the daemon, the dashboard and running every suite —
  `git status` empty, `gofmt -l` empty.
- I did **not** run `make canary`; per the plan's Reviewer-Verified section I read
  `plans/canary-full-coverage/canary-run.log` instead. I cannot retroactively verify the
  `md5 -q ~/.claude/settings.json` before/after ritual; reading the harness confirms it never
  opens that path.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** **`ScrollSpeed`'s doc comment is now false about what `make canary`
   asserts.** — `internal/claudecode/launch.go:55-58` still reads "It is not yet asserted by
   `make canary` — until it is, an upstream rename or removal is expected to degrade silently
   … rather than fail loudly, which is precisely why the canary assertion is owed." This
   plan's static tier asserts every `LaunchEnv()` key in the installed bundle, and the plan's
   own doc upkeep ticked exactly this sub-item in `TODO.md` ("`make canary` must assert
   `CLAUDE_CODE_SCROLL_SPEED` ✅ done 2026-09-10"). A maintainer reading `launch.go` is told
   the work is still owed. Fix: replace those four lines with the true statement — the static
   tier asserts the variable's presence in the installed binary since 2026-09-10, which
   catches a rename or removal but not a change in the variable's effect (the 5-lines/notch
   measurement stays in `spikes/S6-scroll-bandwidth.md`). Nothing else in the comment needs
   changing, and the constant itself is untouched.

### Notes

1. **[note]** Two new fixture fields are write-only: `f.interactive.idlePromptAt`
   (`harness_test.go:123`, assigned at `:485`) and `f.interactive.transcriptPath` (`:125`,
   assigned at `:434`). Nothing reads them — the resume cross-check in `TestLaunchFlags` reads
   the two `SessionStart` captures directly, which is the right thing to do, so the second
   field's comment ("cross-checked against E") describes the value rather than the field. This
   matches the struct's pre-existing bookkeeping style (`runAOutput`, `runCOutput` and `stopAt`
   were already write-only before this plan), so I am not asking for a change.
2. **[note]** `answerTrustPrompt` takes the first pane line containing `❯` as the selection
   marker. It is correct on the measured 2.1.267 layout (marker row 13, Yes row 14) and is
   safe by construction — Enter is only ever sent when the marker's row is the Yes row. If a
   future Claude Code build renders another `❯` above the option list, the helper would send
   `Down` each cycle until the 90 s deadline and the run would fail with the existing
   trust-prompt message, which is the honest failure mode. Worth remembering at the next pin
   bump, not worth hardening now.
3. **[note]** Acceptance criterion D2 names `TestLaunchFlags` for the `session_name`
   assertion, while the plan's Affected Files and Implementation Notes both place it in
   `TestStatusLineFields`. daemon-tests followed the more specific instruction and flagged the
   mismatch; I agree with that reading, and REQ-2 is met in full. Recorded so the plan's
   internal inconsistency is visible; nothing to change.
4. **[note]** The run observed a status-line key not previously in the inventory,
   `prompt_cache` (alongside the known `scratchpad_dir`). It is recorded in
   `spikes/canary-fields.md` as a superset with contents not yet inspected, and nothing reads
   it. A candidate for the next `/interface-probe` if the context gauges ever want it.
