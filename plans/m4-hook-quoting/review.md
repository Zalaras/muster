# Review: M4 — Hook-command path quoting

**Plan**: m4-hook-quoting
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `MergeSettings` writes both command fields single-quoted, nothing else changes | Yes — `internal/claudecode/settings.go:180,184` | Yes — `TestMergeSettings_CommandFieldsAreShellQuotedForSpaceBearingPath`, plus timeout/no-timeout re-asserted in the updated fresh-file test | pass |
| REQ-2 `SettingsConfig` keeps raw paths; quoting lives in one unexported function | Yes — `settings.go:44-46`; `internal/server/sessions.go:182-187` passes `WriteWrapperScripts`' returns unchanged | Yes — D7 grep exits 1 | pass |
| REQ-3 `isMusterEntry` matches quoted **or** bare, for **both** paths | Yes — `settings.go:78-90` | Yes — `TestIsMusterEntry_RecognizesBothFormsForBothConfiguredPaths` (4 subtests) + `TestMergeSettings_ReplacesLegacyBareCommandEntriesWithQuoted` | pass |
| REQ-4 Second `MergeSettings` byte-identical | Yes (unchanged mechanism) | Yes — `TestMergeSettings_QuotedExistingEntriesAreByteIdentical`, `…ShellQuoteEscapesSingleQuoteAndStaysIdempotent`, existing `…CalledTwiceProducesByteIdenticalOutput` | pass |
| REQ-5 Both wrapper scripts run verbatim through `sh -c` from a space-bearing data dir and deliver | Yes | Yes — `internal/server/settings_shell_test.go` `TestWrapperScriptsShellRoundTrip`; independently reproduced by hand (see Manual Verification) | pass |
| REQ-6 Every E2E spec runs against a space-bearing data dir | Yes — `web/e2e/helpers/daemon.ts:130` | Yes — full suite 71/71 green under the new prefix | pass |
| REQ-7 `docs/protocol.md` §4.2 records the rule | Yes — §4.2 paragraph + §9 changelog line | n/a | pass |
| REQ-8 Canary `TestCommandHookPathQuoting` | Yes — `test/canary/canary_test.go:152-172` | Skipped with `needsHarness` as specified | pass |
| REQ-9 (Should) Manual verification of M3 surfaces on real data | Substituted, see Manual Verification | n/a | see note |

**REQ-9 note**: the plan scopes REQ-9 to the *real default* data dir with a *real haiku*
session, and states it "gates the plan's `completed` status, not the review verdict". I
did not launch a real `claude`. I did drive the identical chain — real `musterd`, real
space-bearing data dir, real generated `settings.local.json`, the command strings pulled
verbatim and executed through `sh -c` — and confirmed every M3 surface in the browser
(below). The real-binary run remains outstanding for `completed`.

## Build & Tests

E2E tests: **pass** (71/71, `make e2e` after `make build web-build`, 19.8s)
Daemon tests: **pass** (`go test -count=1 ./...`, all packages, uncached)
Web tests: n/a (no web track in this plan; no `web/src` file changed)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`npm run build`, built in 240ms)
Lint: **pass** (`golangci-lint run` → `0 issues.`)

## Acceptance Checks

Every line of the plan's ```checks``` block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D8 | `make test` | pass |
| D11 | `go build ./...` | pass |
| D12 | `make lint` | pass (`0 issues.`) |
| D10 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (exit 0) |
| D13 | `! rg -n '"rate_limits"\|"used_percentage"\|"context_window"\|"session_name"\|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass (exit 0) |
| D7 | `! rg -n "shellQuote\|'\\\\''" cmd/ internal/server/` | pass (exit 0) |
| D9 | `rg -q "func TestCommandHookPathQuoting" test/canary/canary_test.go` | pass |
| E1 | `rg -q 'mkdtemp\(join\(tmpdir\(\), "muster e2e-"\)\)' web/e2e/helpers/daemon.ts` | pass |
| E2 | `make e2e` | pass (71/71) |

Non-`checks` daemon criteria, verified by reading the tests and the code:

| ID | Result | Evidence |
|----|--------|----------|
| D1 | pass | `TestMergeSettings_CommandFieldsAreShellQuotedForSpaceBearingPath` asserts `'<path>'` on both fields for a space-bearing path |
| D2 | pass | `TestMergeSettings_ShellQuoteEscapesSingleQuoteAndStaysIdempotent` asserts `'/Users/damian/Damian'\''s stuff/…'` and byte-identity of the second merge |
| D3 | pass | `TestMergeSettings_ReplacesLegacyBareCommandEntriesWithQuoted` — one group, one entry, quoted, plus a `strings.Count == 1` sweep of the raw bytes for the bare path |
| D4 | pass | `TestMergeSettings_QuotedExistingEntriesAreByteIdentical`; the pre-existing generic idempotency test also still passes |
| D5 | **behaviour pass, coverage gap** | See Major 1 — the committed "foreign command hook survives" test is on `PostToolUse`, not on `SessionStart` alongside the quoted Muster entry. I verified the behaviour by hand-probe (throwaway test, since removed): merge over a foreign `SessionStart` `command` yields `["/Users/x/bin/greet.sh", "'/data/hook-sessionstart.sh'"]` — the foreign entry survives |
| D6/D6a/D6b/D6c | pass | `TestWrapperScriptsShellRoundTrip` pulls both commands verbatim from a real `MergeSettings` output, asserts each contains a space *and* equals `'<script>'`, runs each through `exec.Command("sh","-c",…)`, then asserts `event.session_id == sess.ID` for the SessionStart run and `COUNT(*) FROM usage_sample == 1` plus a routed `status_line` event for the status run |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | `isMusterEntry` compares both forms for *both* paths | pass | `settings.go:78-90` loops `[...]string{cfg.SessionStartCommand, cfg.StatusLineCommand}` and tests `e.Command == p \|\| e.Command == shellQuote(p)` — four comparisons — behind a `p != ""` guard. `TestIsMusterEntry_RecognizesBothFormsForBothConfiguredPaths` drives all four |
| R2 | Wrapper-script *contents* unchanged | pass | `writeEnvelopeScript` lives at `settings.go:243`; the diff's last hunk ends at line ~185. `git diff internal/claudecode/settings.go` touches only the import, the `SettingsConfig` doc comments, the new `shellQuote`, `isMusterEntry`'s command branch, and the two `hookEntry` literals |
| R3 | Audit conclusions still match the code | pass | Launch path still argv (`BuildArgv` → `tmux.NewSession` → `exec.Command`, no shell — no file on that path changed). `MUSTER_SESSION` still `strconv.FormatInt(sess.ID, 10)` at `internal/server/sessions.go:134`. `settings.go:250-251` still interpolates `$MUSTER_SESSION` unquoted into JSON as a number and `$TMUX_PANE` inside JSON string quotes — both unmodified |
| R4 | protocol.md §4.2 + §9; SPEC §11 + TODO ticks | **partial** | protocol.md: **pass** — §4.2 paragraph and §9 changelog line both present and match the plan's approved text. SPEC §11 / TODO.md M4 ticks: **not landed** (see Major 2) — the plan itself defers the TODO ticks to "the orchestrator's completion step" |
| R5 | Manual verification record filled in | **not done** — `completed`-status gate, not a review gate, per the plan | The plan's table is still blank. My own equivalent run is recorded below; the real-`claude` run remains outstanding |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — D10/D13 greps clean. `internal/server/settings_shell_test.go`'s local `settingsDoc` names only `hooks`/`statusLine`/`command`, which the plan settled as settings-file keys, not payload keys (Minor 2) |
| 2 | No terminal-output state parsing | pass — no `capture-pane` or pane-text reading added |
| 3 | No blocking hook handler; hook timeouts ≤ 2s | pass — `hookTimeoutSeconds = 2` unchanged, and the updated fresh-file test now *asserts* it survives the quoting change |
| 4 | tmux always on a dedicated socket; `pty.Setsize` + `resize-window`, never `resize-pane` | pass — no tmux invocation added; the E2E harness still passes `-S <dataDir>/tmux.sock` |
| 5 | Never log hook payloads | pass — no logging added anywhere in the diff (`rg 'log\.\|logger' internal/claudecode/settings.go` → empty) |
| 6 | No empty-gauge dishonesty | pass — no UI change; confirmed live that gauges render real values, and pre-existing `shell.spec.ts` "renders both usage readouts as the word unknown, never an empty gauge" still passes |
| 7 | Session identity keys on the tmux target | pass — untouched |
| 8 | No `~/.claude/settings.json` trespass, no `CLAUDE_CONFIG_DIR` | pass — grep clean; the new test writes into `t.TempDir()`; my manual run wrote only into a `/tmp` scratch repo |
| 9 | No real `claude` outside canary/probes | pass — `TestWrapperScriptsShellRoundTrip` invokes only `sh`/`curl`; the canary test is `t.Skip`'d; E2E uses the stub |

## Manual Verification

The plan has no UI delta, but it exists precisely because M3's UI had never been fed real
data, so I drove the whole production chain in a browser rather than only reading tests.

Setup: `bin/musterd` started on `-data-dir "/tmp/muster manual review/data"` — a genuinely
space-bearing path, mirroring `~/Library/Application Support/Muster` — with the E2E stub
`claude` and a per-run tmux socket path. Launched one session via `POST /api/sessions`.

1. **Generated `settings.local.json` is quoted.** Read the real file the daemon wrote:
   `"command": "'/tmp/muster manual review/data/hook-sessionstart.sh'"` and
   `"command": "'/tmp/muster manual review/data/status-line.sh'"`. The nine HTTP hook
   entries are untouched.
2. **The commands execute verbatim.** Extracted both strings with `python3 -c json.load`
   (no hand-retyping), ran each as `sh -c "<string>"` with `MUSTER_SESSION=1` and
   `TMUX_PANE=%0` read from the live tmux server, feeding a real `SessionStart` payload
   and a full status-line payload on stdin. Both exited 0. Resulting DB:
   `SessionStart|1|manual-review-claude-1`, `status_line|1|manual-review-claude-1`,
   `usage_sample` count `1`.
3. **Negative control — the fix is not vacuous.** The same script at the *bare* path (what
   M1–M3 wrote) through `sh -c` reproduces the probe's failure exactly:
   `sh: /tmp/muster: No such file or directory`, `rc=127`, and `usage_sample` stays at 1.
4. **Every M3 surface renders real data in the browser** (Playwright, dashboard at the
   token URL). Values checked by hand against the payload I posted, not merely "a number
   appeared":

   | Surface | Rendered | Payload field it must come from |
   |---|---|---|
   | Masthead 5h | `5h 61% · resets Thu` | `rate_limits.five_hour.used_percentage = 61` |
   | Masthead 7d | `7d 23% · resets Thu` | `rate_limits.seven_day.used_percentage = 23` |
   | Masthead model | `Haiku 4.5` | `model.display_name` |
   | Session card context row | `42%` / `84k` | `context_window.used_percentage = 42`, `total_input_tokens = 84000` |
   | Session title | `manual review title` | `session_name` |

   Before the two `sh -c` runs the masthead read `unknown`; after them it read the values
   above. Only console output was a pre-existing `favicon.ico` 404.
5. **Teardown**: daemon killed, tmux server killed (`kill-server` on the scratch socket),
   scratch tree removed, `.playwright-mcp/` artifacts removed. `git status --porcelain`
   confirmed identical before and after — no review artifact left in the tree.

**Not verified**: a real `claude` binary reading the file for itself. That is REQ-9/R5's
job and gates `completed`, not this verdict.

## Repairs table check (`test-specs.md`)

The Repairs table is empty and states "No assertion was deleted, skipped, or weakened."
Verified independently: `git status` shows `web/e2e/helpers/daemon.ts` as the only changed
file under `web/`, no spec file was touched, `rg 'test\.skip|test\.fixme' web/e2e/` returns
nothing, and `--list` still collects the same 71 tests in 9 files. No fixture payload
drifted — `web/e2e/helpers/payloads.ts` is unmodified. The claim holds.

## Issues

### Critical

None.

### Major

1. **[daemon-tests]** D5's exact scenario is not covered by any committed test —
   `internal/claudecode/settings_test.go`. D5 asks for "a foreign `type:"command"`
   **SessionStart** hook with an unrelated command survives the merge alongside the quoted
   Muster entry". The existing test the plan pointed at
   (`TestMergeSettings_ForeignHookOnAMusterOwnedEventSurvives`) puts its foreign command
   hook on `PostToolUse`, an HTTP-owned event — it never exercises a foreign command entry
   coexisting with Muster's *command* entry on the one event where `isMusterEntry`'s
   newly-widened command branch actually runs. That branch now matches four strings
   instead of two, so "does it still let a fifth string through?" is exactly the question
   the change makes worth asking. I confirmed by hand-probe that the behaviour is correct
   (merge yields `["/Users/x/bin/greet.sh", "'/data/hook-sessionstart.sh'"]`), so this is a
   coverage gap, not a defect — but the regression guard the plan asked for is absent. Fix:
   add ~15 lines asserting both entries present on `SessionStart` after the merge, and that
   the foreign one is not duplicated on a re-merge.

2. **[daemon-impl]** R4's doc-upkeep backstop is half-landed — `SPEC.md`, `TODO.md`.
   `docs/protocol.md` §4.2 + §9 are correct and present. Missing: a `SPEC.md` §11 changelog
   entry for the shipped fix (§11 currently ends at the 2026-08-25 *probe* entry, which
   records the finding, not the fix), and the two `TODO.md` M4 entries (lines 242 and 285)
   are still `- [ ]`. The plan's Affected Files explicitly permits these to land at "the
   orchestrator's completion step", so this does not block the verdict — but it must land
   before the plan is marked `completed`, alongside REQ-9/R5's table.

### Minor

1. **[daemon-tests]** `gofmt`'s doc-comment smart-quote pass mangled a comment —
   `internal/claudecode/settings_test.go:505`. The comment reads
   `shellQuote("") == "”" would never equal "" anyway`; the intended text was
   `shellQuote("") == "''"`. Confirmed at byte level (`e2 80 9d`, U+201D). This is the same
   trap both agent logs flagged and worked around elsewhere — one instance slipped through.
   It makes the justification for the `p != ""` guard read as nonsense to the next reader.
   Fix by rewording to prose ("`shellQuote("")` returns a two-character quoted empty word,
   which can never equal the empty string…") as the other three comments already do.

2. **[daemon-tests]** `internal/server/settings_shell_test.go`'s local `settingsDoc` hard-codes
   the Claude Code settings-file key path `hooks.SessionStart[].hooks[].command` /
   `statusLine.command` outside `internal/claudecode`. The plan explicitly sanctioned this
   ("settings-file keys, not payload keys") and the D10/D13 greps stay clean, so it is not a
   hard-rule violation — but if `internal/claudecode` ever grows an exported reader for its
   own generated file, this test should switch to it rather than keep a second decoder for
   the same format on the far side of the boundary. Noted so the next reader does not
   re-litigate it.

3. **[daemon-tests]** `TestWrapperScriptsShellRoundTrip` asserts `usage_sample` count `== 1`
   globally rather than scoped to the seeded session. Correct today because the test server
   starts empty, but a future test-server fixture that seeds a sample would make this fail
   for an unrelated reason. Scoping it to `session_id = ?` would cost one WHERE clause.
