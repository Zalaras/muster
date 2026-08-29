# Review: M4 — Hook lifetime: every hook a command wrapper, silent when unmanaged or down

**Plan**: m4-hook-lifetime
**Verdict**: approved
**Cycle**: 2 (supersedes cycle 1, preserved verbatim in the appendix below)

Cycle 1's single Critical — the reordered-hook window in the envelope-authoritative
binding rule — was routed to Damian as a protocol decision, settled as Option B
(monotonic rebind), amended in `docs/protocol.md` §4.2/§7.3, `plan.md` and `SPEC.md`, and
implemented in `internal/session/manager.go`. I verified the guard three ways: it matches
the amended protocol text clause for clause; its regression test genuinely fails when the
guard is removed **and** the forward-rebind tests genuinely fail when the guard is made
unconditional (both mutations run by me, not taken from the log); and the whole
reordered-`/clear` sequence now holds on a real daemon driven through the real generated
`hook.sh`, where cycle 1 reproduced the bug.

Cycle 1's Major 1 (the false "heals on next launch" claim) is corrected in `TODO.md` and
`plan.md`, and the corrected text matches what I measure in the rig — the stale
foreign-data-dir entry does survive the migration, sitting next to the new one. Minor 3
(`httpHookEvents`'s misleading comment) is fixed and now states the real reason. Minor 2's
disposition is honest and unchanged.

Two new Minors, both `[orchestrator]` doc items about Option B's residuals, neither
blocking: nothing here needs a pipeline agent.

## Requirements

Cycle 1 verified REQ-1 through REQ-16; only REQ-9 changed this cycle. Re-verified from
scratch (all gates re-run, migration and wrapper behaviour re-driven live), so the table
is a fresh result, not a carry-forward.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (command entry on all 11 events, timeout 2, quoted path, no http) | Yes | Yes | pass — re-verified live on a migrated file: 11 events, one entry each, `timeout: 2`, single-quoted space-bearing path |
| REQ-2 (never adds `allowedHttpHookUrls`; strips Muster's, keeps foreign, deletes empty key) | Yes | Yes | pass — live: reduced to the one foreign URL |
| REQ-3 (drops legacy http + legacy command entries, exactly one new entry/event, foreign preserved) | Yes | Yes | pass — live: Muster's http entries gone, foreign `https://example.com/hook` survives on `PostToolUse`, `permissions` untouched. Different-data-dir residual is documented (see Major 1's correction, now accurate) |
| REQ-4 (`SettingsConfig{HookCommand, StatusLineCommand, LegacyCommands}`; no URL/token) | Yes | Yes | pass |
| REQ-5 (`hook.sh` + `status-line.sh`, 0700, removes legacy, 4-value return) | Yes | Yes | pass |
| REQ-6 (early exit; unmanaged session makes no network call, no output) | Yes | Yes | pass — live: exit 0, empty stdout/stderr, `event` row count unchanged (9 → 9) |
| REQ-7 (never stdout/stderr, always exit 0, incl. daemon unreachable) | Yes | Yes | pass — live daemon-down: exit 0, silent, 64 ms |
| REQ-8 (byte-identical on second call) | Yes | Yes | pass |
| REQ-9 (envelope-authoritative binding, **monotonic** as amended) | Yes | Yes | **pass** — guard matches §4.2 exactly; mutation-tested in both directions; live repro now holds (details below) |
| REQ-10 (raw posts never bind/rebind) | Yes | Yes | pass — `enveloped := ev.MusterSession != nil` is the only gate, INV-3 6 subtests |
| REQ-11 (status posts never bind/rebind) | Yes | Yes | pass — structural (`processStatus` returns before `Apply`) + INV-4; live: a status post populated the gauge without touching the binding |
| REQ-12 (real shell round trip incl. unset and unreachable cases) | Yes | Yes | pass |
| REQ-13 (protocol.md §4/§4.1/§4.2/§7.3 + SPEC §6 updated) | Yes | n/a | pass — including the monotonic amendment; see Minor 1 for one changelog nit |
| REQ-14 (canary stub, skipped) | Yes | n/a | pass |
| REQ-15 (one argument-less script for all events) | Yes | Yes | pass |
| REQ-16 (startup log names paths only) | Yes | n/a | pass — live log line carries `hook_script`/`status_line_script` only |

## Build & Tests

Every number below is from my own run this cycle, uncached.

E2E tests: **pass** — 97 passed, 0 failed, 0 skipped (`make e2e`, exit 0). Full-suite
regression sweep, not just this plan's specs; this plan authored no spec file
(`E2E Scope: none`), so there is no `test-specs.md` and no `## Repairs` table to audit.
Daemon tests: **pass** — `go test -count=1 ./...`, every package `ok`, exit 0
Web tests: **pass** — 17 files, 411 tests (no `web/` file touched by this plan)
Daemon build: **pass** — `go build ./...`
Web build: **pass** — `npm run build` (Node 24.19.0 via `nvm use`)
Lint: **pass** — `golangci-lint run` → 0 issues

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D19 | `make test` | pass |
| D20 | `go build ./...` | pass |
| D21 | `make lint` | pass (0 issues) |
| D22 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D23 | `! rg -n "shellQuote\|'\\\\''" cmd/ internal/server/ internal/session/` | pass |
| D24 | `! rg -n "hookURL\|statusURL" internal/server/sessions.go` | pass |
| D25 | `rg -q "func TestCommandHooksCarryEnvelopeOnEveryEvent" test/canary/canary_test.go` | pass |
| D30 | `! go list -deps ./internal/claudecode \| rg -q "internal/(usage\|store)"` | pass |
| E1 | `make e2e` | pass (97/97) |

## Reviewer-Verified Criteria

D1–D18 and D26–D29 were mapped test-by-test in cycle 1 and re-run green here; the rows
below carry only what I re-verified *independently* this cycle, plus every row touching
the fix.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D14–D17 | INV-1/2/3/4/7 tables | pass | 28 + 12 + 6 + 6 + 1 subtests green; mutation-tested (below) — INV-1's `enveloped_different_id` row and all 12 INV-2 subtests fail when the guard is made unconditional, so they are pinning real forward-rebind behaviour, not passing vacuously |
| D18 | one persist, one broadcast | pass (as qualified) | broadcast delta asserted directly on the new straggler path too, and the *persisted* row read back via `st.GetSession`; single `UpdateSession` call site re-confirmed by reading `Apply`. Minor 2 of cycle 1 stands as an accepted seam gap |
| REQ-9 / §4.2 | guard matches the amended protocol text | pass | protocol: "`byClaude[session_id]` already points at this session and it is not the current `claudeSessionId` → routed and applied but never rebinds backwards". Code: rebind runs iff `!known \|\| owner != musterSessionID` — the exact complement, no extra condition, no missing one. `internal/session/manager.go:422-446` |
| REQ-9 | the regression test is real | pass | I removed the guard myself and re-ran: both subtests fail with `claude-new → claude-old`, `working → started`, `1 → 0`, `Context` nil — the cycle-1 trace exactly. Restored from backup; `git diff --stat` back to 65/1, `gofmt -l` empty, suite green |
| REQ-9 | the guard does not over-fire | pass | I inverted the guard to *never* rebind and re-ran the package: 7 INV-1 `enveloped_different_id` subtests + all 12 INV-2 subtests fail. Both directions are pinned by tests, so neither behaviour can silently regress |
| REQ-9 | forward cases intact live | pass | live `SessionStart(source:clear)` to a third id still rebinds and resets: `state=started claude=claude-third compactions=0 ctx=NULL` |
| D26 | protocol.md §4/§4.1/§4.2/§7.3 + changelog | pass | read the diff; §4.2 binding rule and both new §7.3 rows carry the monotonic rule and match the code. See Minor 1 |
| D27 | SPEC.md §6 bullet + §11 changelog | pass | §6 daemon-down bullet rewritten; §11 entry records the monotonic decision with both options and why B won |
| D28 | TODO.md ticks the three items + records the decision | pass | all three ticked; the cycle-1 Major 1 sentence is corrected to the measured behaviour ("**not** self-healing … accumulates one dead entry per event per abandoned data dir"), attributed to the review rig |
| Minor 3 (cycle 1) | `httpHookEvents` comment states the real reason | pass | now says it survives because `allHookEvents` is built from it and `settings_test.go` iterates it, and explicitly that `isMusterEntry` strips http entries identically on all eleven events |
| Manual (Damian) | real-haiku migration + silence check | **not done** — correctly reserved for Damian (burns subscription). My stub-based equivalent is below |

## Hard-Rule Checklist

Re-swept. Only `internal/session/manager.go` (guard + doc comment) and
`internal/claudecode/settings.go` (one comment) changed since cycle 1's sweep; the rest is
re-confirmed by the checks above and the live rig.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no CC-format knowledge outside `internal/claudecode/` | pass — D22 clean. The new guard speaks only neutral vocabulary (`claudecode.KindClearRebind`, `claudeSessionID`); `SessionEnd(reason:"clear")` appears in a *comment* explaining the protocol case, never as a parsed field name |
| 2 | No terminal-output state parsing | pass — no tmux/pane code touched; binding is envelope-driven |
| 3 | Non-blocking hook handler, timeouts ≤ 2 s | pass — handler still 200s and enqueues; all eleven live entries carry `timeout: 2` (read off the migrated file) |
| 4 | tmux always on a private socket; `pty.Setsize` + `resize-window` | pass — untouched. My own rig used `-tmux-socket muster-rev2`; the real `muster` socket has no server and was never contacted |
| 5 | No payload logging | pass — the guard logs nothing; `process` still never logs `job.body` |
| 6 | No empty-gauge dishonesty | n/a (no UI change) — and the fix *improves* honesty here: the gauge is no longer nulled by a straggler (live: `ctx_pct=37.5 tokens=75000` survived two stragglers) |
| 7 | Session identity on the tmux target, not `session_id` | pass — identity still keys on the Muster row/tmux target; `claude_session_id` is a mutable attribute, and it is now monotonic within a session's life |
| 8 | No settings trespass | pass — the rig only ever wrote `<launch dir>/.claude/settings.local.json`; no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — canary addition is `t.Skip(needsHarness)`; my rig used a `sleep`-loop stub, no subscription burned |

## Manual Verification

No UI surface (`Work Type: daemon`, no `web/` file changed), so the browser is not the
place to look. I rebuilt the cycle-1 daemon rig and re-drove it, because the whole point
of this cycle is a behaviour that only exists at runtime.

Rig: `go build -o <scratch>/musterd ./cmd/musterd`, real `musterd` on `127.0.0.1:47411`,
`-data-dir '<scratch>/muster data'` (**space-bearing**, so quoting is under test),
`-tmux-socket muster-rev2`, `-claude-bin <scratch>/stub-claude.sh` (a `sleep` loop — no
real `claude`), `-on-exit kill`. Launch directory: a scratch git repo pre-seeded by hand
with the **pre-plan** shape — Muster `type:"http"` entries on `PreToolUse`/`SessionEnd`, a
foreign `https://example.com/hook` on `PostToolUse`, a legacy
`/some/old/data/hook-sessionstart.sh` command entry on `SessionStart`, an
`allowedHttpHookUrls` holding Muster's own URL plus a foreign one, and a `permissions` key
Muster does not own. Every hook below was posted **through the generated `hook.sh`** with
`MUSTER_SESSION=1 TMUX_PANE=%9`, i.e. the real settings → `sh -c` → script → curl → ingest
chain, and every result was read out of `muster.db` with `sqlite3`.

1. **REQ-16.** Startup logs `hook_script`/`status_line_script` paths only — no token, no URL.
2. **Migration (REQ-1/2/3), live.** `POST /api/sessions` rewrote the file to eleven events,
   one `type:"command"` entry each, `"timeout": 2`, path single-quoted. Muster's http
   entries gone; foreign `https://example.com/hook` still on `PostToolUse`;
   `allowedHttpHookUrls` reduced to `["https://someone-elses-tool.example.com/hook"]`;
   `permissions` preserved. I read the whole produced file: it contains **no** ingest
   token and **no** `http://` (INV-6 on a real file). The seeded foreign-data-dir legacy
   entry survives on `SessionStart`, next to the new one — exactly the residual the
   corrected `TODO.md`/Edge Case 12 text now describes, confirming that correction is the
   measured truth.
3. **The cycle-1 Critical, re-driven live.** `SessionStart(startup) claude-old` → bind
   (`started`) → `PreCompact` (`compactions=1`) → `SessionStart(source:clear) claude-new`
   → `UserPromptSubmit` → `PreCompact` → checkpoint `state=working claude=claude-new
   compactions=1`. Then the **reordered `SessionEnd(reason:"clear")` for `claude-old`**:

   ```
   before straggler:  state=working  claude=claude-new  compactions=1
   AFTER straggler:   state=working  claude=claude-new  compactions=1
   ```

   Cycle 1's live trace at this point was `state=started claudeSessionId=managed-xyz`. The
   flip, the reset and the lost compaction count are all gone.
4. **The gauge survives too.** A status post set `ctx_pct=37.5 tokens=75000`; a second
   reordered `SessionEnd(clear)` **and** a reordered `PostToolUse` for `claude-old` both
   left `state=working claude=claude-new compactions=1 ctx_pct=37.5 tokens=75000`. This
   covers the review's broader "any late event naming the previous conversation" language,
   not only the `SessionEnd` example.
5. **Forward rebind still works.** A subsequent `SessionStart(source:clear) claude-third`
   gave `state=started claude=claude-third compactions=0 ctx=NULL` — the guard suppresses
   only backwards moves.
6. **REQ-6 unmanaged.** Same `PreToolUse` command with `MUSTER_SESSION` unset: exit 0,
   empty stdout, empty stderr, `event` rows unchanged (9 → 9).
7. **REQ-7 daemon-down.** `musterd` killed, port closed: exit 0, silent, **64 ms**.
8. **Restart window, checked and dismissed.** `daemon-implementation.md` honestly flags
   that the constructor rebuilds `byClaude` from the DB with only each session's *current*
   id, so the guard's stale-id memory does not survive a restart. I traced whether that is
   reachable: a straggler exists only inside a live `curl --max-time 2` invocation, and a
   post landing while the daemon is down is dropped outright (no queue, no retry, no
   replay). A straggler therefore cannot cross a restart — it is delivered to the running
   process or lost. Not a residual.

Also verified with two throwaway tests in `internal/session` (written, run, deleted — no
permanent test files added by me): resuming *back* to an earlier conversation still
rebinds correctly, because `isBindKind` exempts `KindResumeBind` from the guard
(`ClaudeSessionID` returns to `claude-old`, `byClaude` stays consistent), and the
cross-session collision case behind Minor 2 below.

Cleanup: daemon killed, `tmux -L muster-rev2 kill-server` run and confirmed empty,
`pgrep` for `musterd`/`stub-claude` empty, `tmux -L muster` confirmed to have no server at
all. Damian's real data dir and default tmux server were never touched.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `docs/protocol.md`'s changelog entry for this plan is dated
   2026-08-27 and does not mention the monotonic amendment, even though the §4.2 body and
   both §7.3 rows carry it and `SPEC.md` §11 records the 2026-08-28 decision. A reader
   scanning the changelog for "when did rebinding become monotonic" finds nothing.
   Suggest one clause on that entry (or a second dated entry) — doc upkeep, orchestrator's
   file.

2. **[orchestrator]** Two residuals of the monotonic rule are undocumented. Both measured
   by me, neither reachable by a normal `/clear`, neither worth code:
   - *Resume-back with a lost `SessionStart(source:"resume")`.* If a session returns to an
     earlier conversation and that bind event is dropped, the guard correctly refuses to
     rebind, so `claude_session_id` stays on the newer id while the pane actually runs the
     older one. Events still route and apply (state stayed correct in my throwaway: the
     turn activity moved the session to `working`), and any later bind event fixes the id.
     This is the price of Option B and it is the right price — it just is not written down
     next to Edge Case 6a.
   - *Cross-session id collision.* An enveloped event whose `musterSession` is session A
     but whose `session_id` is currently bound to session B rebinds A onto that id and
     moves `byClaude` with it, leaving B's `ClaudeSessionID` pointing at an id the map no
     longer attributes to B — INV-1's absolute wording ("after any `Apply`") does not hold
     for the bystander. Measured: `A.ClaudeSessionID="conv-X" B.ClaudeSessionID="conv-X"
     byClaude[conv-X]=A`. **Pre-existing, not introduced here** — I confirmed the same
     collateral on the untouched `KindResumeBind` path, which needs no envelope at all —
     and it requires one conversation to be posted under two different `MUSTER_SESSION`
     values (realistically: `--resume`-ing the same conversation from a different managed
     pane). Worth a sentence in §4.2 or an INV-1 caveat rather than a fix wave.

3. **[orchestrator]** Cycle 1's Minor 1 (the plan routed `SPEC.md`/`TODO.md` upkeep to the
   daemon track in Affected Files) is still worth carrying into the completion summary as a
   plan-authoring note, per the orchestrator's stated disposition. No action in the tree.

---

# Appendix — Review cycle 1 (historical, superseded)

Preserved verbatim. Its Critical 1 was decided as Option B and is fixed; its Major 1 is
corrected; its Minor 2 and Minor 3 are dispositioned above.

**Plan**: m4-hook-lifetime
**Verdict**: needs-changes

One Critical, reproduced twice (unit-level and on a real daemon): the new
envelope-authoritative binding rule has no guard against a *reordered* hook, so a
straggler event naming the previous conversation's `session_id` drags the session's
binding backwards onto the dead id, flips it to `started`, and zeroes its compaction
count. The implementation is faithful to the approved §4.2 rule — the hole is in the rule
itself, which is why the fix needs the orchestrator's decision before an impl agent
touches it.

Everything else about this plan is in good shape: all 30 automated/authored checks pass,
the full 97-test E2E suite is green, and the migration, unmanaged-session silence and
daemon-down silence all hold on a real daemon against a really-instrumented directory.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (command entry on all 11 events, timeout 2, quoted path, no http) | Yes | Yes | pass — verified live: 11 events, each one entry, `timeout: 2`, single-quoted space-bearing path |
| REQ-2 (never adds `allowedHttpHookUrls`; strips Muster's, keeps foreign, deletes empty key) | Yes | Yes | pass — verified live: key reduced to the one foreign URL |
| REQ-3 (drops legacy http + legacy command entries, exactly one new entry/event, foreign preserved) | Yes | Yes | pass for the same-data-dir case; see Major 1 for the different-data-dir case |
| REQ-4 (`SettingsConfig{HookCommand, StatusLineCommand, LegacyCommands}`; no URL/token) | Yes | Yes | pass |
| REQ-5 (`hook.sh` + `status-line.sh`, 0700, removes legacy, 4-value return) | Yes | Yes | pass — verified live `-rwx------` |
| REQ-6 (early exit; unmanaged session makes no network call, no output) | Yes | Yes | pass — verified live: exit 0, empty stdout/stderr, 0 event rows |
| REQ-7 (never stdout/stderr, always exit 0, incl. daemon unreachable) | Yes | Yes | pass — verified live daemon-down: exit 0, silent, 68 ms |
| REQ-8 (byte-identical on second call) | Yes | Yes | pass (fresh + migration fixture) |
| REQ-9 (envelope-authoritative bind / rebind-then-apply, one persist + broadcast) | Yes | Yes | **Critical 1** — implemented as specified, but the rule has no reordering guard |
| REQ-10 (raw posts never bind/rebind) | Yes | Yes | pass (INV-3, 6 subtests) |
| REQ-11 (status posts never bind/rebind) | Yes | Yes | pass — structural (`processStatus` never reaches `Apply`) + INV-4, 6 subtests |
| REQ-12 (real shell round trip incl. unset and unreachable cases) | Yes | Yes | pass — 3 tests shelling out to real `sh`/`curl` |
| REQ-13 (protocol.md §4/§4.1/§4.2/§7.3 + SPEC §6 updated) | Yes | n/a | pass — see Major 1 for one inaccurate residual claim |
| REQ-14 (canary stub, skipped) | Yes | n/a | pass |
| REQ-15 (one argument-less script for all events) | Yes | Yes | pass |
| REQ-16 (startup log names paths only) | Yes | n/a | pass — verified live, no token/URL in the line |

## Build & Tests

E2E tests: **pass** (97 passed, 0 failed, 0 skipped — `make e2e`, exit 0)
Daemon tests: **pass** (`go test -count=1 ./...`, all packages ok, exit 0 — re-run uncached, not trusting the cached run in `daemon-tests.md`)
Web tests: **pass** (17 files, 411 tests — no web files changed by this plan)
Daemon build: **pass**
Web build: **pass**
Lint: **pass** (`golangci-lint run` → 0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D19 | `make test` | pass |
| D20 | `go build ./...` | pass |
| D21 | `make lint` | pass (0 issues) |
| D22 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D23 | `! rg -n "shellQuote\|'\\\\''" cmd/ internal/server/ internal/session/` | pass |
| D24 | `! rg -n "hookURL\|statusURL" internal/server/sessions.go` | pass |
| D25 | `rg -q "func TestCommandHooksCarryEnvelopeOnEveryEvent" test/canary/canary_test.go` | pass |
| D30 | `! go list -deps ./internal/claudecode \| rg -q "internal/(usage\|store)"` | pass |
| E1 | `make e2e` | pass (97/97) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D1 | 11 command entries, timeout 2, quoted path | pass | `TestMergeSettings_FreshFileRegistersCommandEntryOnAllElevenEvents` asserts type/command/timeout per event and `require.Len(allHookEvents, 11)`; confirmed live on the migrated file |
| D2 | no `type:"http"` entry, fresh + fixture | pass | `..._FreshFileHasNoHTTPEntry` + the fixture test's per-entry `isMusterIngestURL` assertion; live file has only the foreign `https://example.com/hook` |
| D3 | exactly one Muster entry/event, no legacy survives | pass | `..._MigrationFixture_ExactlyOneMusterEntryPerEventNoLegacySurvives` counts per event and asserts `Len(sessionStartCommands, 2)` plus a whole-output `NotContains("hook-sessionstart.sh")` — not vacuous |
| D4 | strips Muster URLs, keeps foreign, deletes empty key | pass | two named tests, one per Edge Case 3 variant; confirmed live |
| D5 | never adds the key | pass | `..._NeverAddsAllowedHttpHookUrlsKey` (2 subtests) |
| D6 | foreign http (remote) + foreign SessionStart command survive | pass | `..._ForeignHTTPEntryOnARemoteHostSurvives` asserts the exact surviving URL list; `..._ForeignCommandHookOnSessionStartSurvives` still green |
| D7 | byte-identical second call | pass | `..._CalledTwiceProducesByteIdenticalOutput` + `..._MigrationFixtureIsIdempotentAfterFirstMerge` |
| D8 | no token, no `http(s)://` in output | pass | `..._OutputContainsNoTokenOrURL`, run against space- and quote-bearing paths |
| D9 | `hook.sh`/`status-line.sh` 0700, legacy removed | pass | `TestWriteWrapperScripts` + `..._RemovesPreExistingLegacyScript`; live `ls -l` shows `-rwx------` |
| D10 | early exit is the first non-comment line | pass | `TestWriteEnvelopeScript_EarlyExitIsTheFirstNonCommentLine` asserts on file bytes |
| D11 | generated command through `sh -c` produces a routed row | pass | `TestWrapperScriptsShellRoundTrip` — real `sh`+`curl`, real ingest, asserts `event.session_id` **and** the resulting `ClaudeSessionID` binding |
| D12 | unset `MUSTER_SESSION` → zero requests, zero rows, silent | pass | counted at the HTTP layer via `countingHandler`, not merely inferred from the DB |
| D13 | closed port → exit 0, silent, < 3 s | pass | binds-then-closes a real loopback port; asserts elapsed |
| D14 | INV-1 from every state × every input class | pass | 28 subtests, 7 source rows × 4 classes; `assertBindingConsistent` resolves through the real `byClaude` index |
| D15 | INV-2 rebind resets before its own row | pass | 12 subtests; the trigger's `PermissionMode` is pinned so the expectation is deterministic |
| D16 | INV-3 + INV-4 from every state | pass | 6 + 6 subtests |
| D17 | INV-7 bystander untouched | pass | `..._RebindOnOneSessionLeavesABystanderUntouched` |
| D18 | one persist, one broadcast | partial | broadcast count asserted directly; the persist half is inferred from reading `Apply` (single `UpdateSession` call site outside the branch). I confirmed that reading independently — there is exactly one call site on this path. Acceptable; noted as Minor 2 |
| D26 | protocol.md §4/§4.1/§4.2/§7.3 + changelog | pass | read the diff; matches the plan's Protocol Contract in substance |
| D27 | SPEC.md §6 bullet + §11 changelog | pass | read the diff |
| D28 | TODO.md ticks the three items + records the decision | pass | all three ticked with the measurement and the permanent-by-design decision; see Major 1 on one inaccurate sentence |
| D29 | script never writes to stdout/stderr | pass | read `writeEnvelopeScript`: `--silent --output /dev/null`, no `echo`/`printf`, trailing `exit 0`; also asserted statically and observed live on three paths |
| REQ-16 | startup log names paths only | pass | live log line carries `hook_script`/`status_line_script` only |
| Manual (Damian) | real-haiku migration + silence check | **not done** — correctly reserved for Damian (burns subscription). My equivalent no-subscription verification is below |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no CC-format knowledge outside `internal/claudecode/` | pass — D22 clean; the `hooks`/`statusLine` key names in `internal/server/settings_shell_test.go` are settings-file keys read back out of a file the adapter generated, the pre-existing sanctioned exception documented at that file's line 29 |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only in the display/snapshot path and the tmux client; untouched by this plan |
| 3 | Non-blocking hook handler, timeouts ≤ 2 s | pass — handler still enqueues-and-200s; every one of the eleven entries carries `timeout: 2`, and a test asserts `LessOrEqual(entry.Timeout, 2)` |
| 4 | tmux always on a private socket; `pty.Setsize` + `resize-window` | pass — no tmux code touched; the only bare-looking calls are test helpers passing `-S <private socket>` |
| 5 | No payload logging | pass — no new logging of payloads; the new `main.go` line logs two paths, and the new wrapper writes to no log at all |
| 6 | No empty-gauge dishonesty | n/a — no UI change (the rebind *does* reset the context gauge to `nil`, i.e. back to "unknown", which is the honest value; see Critical 1 for when that reset is wrong) |
| 7 | Session identity on the tmux target, not `session_id` | pass — routing is still envelope/`musterSession`-keyed; `claude_session_id` remains a mutable attribute. Critical 1 is a *conversation-binding* defect, not an identity-keying one, but it is the same family of harm the rule exists to prevent |
| 8 | No settings trespass | pass — writes only `<launch dir>/.claude/settings.local.json`; the only `settings.json`/`CLAUDE_CONFIG_DIR` hits are in `test/rig/newprobe.sh`, scratch-scoped and explicitly not exporting the var (untouched here) |
| 9 | No real `claude` outside canary/probes | pass — the canary addition is a `t.Skip(needsHarness)` stub; no test or fixture invokes the real binary. My own manual run used a stub script |

## Manual Verification

No UI in this plan (`Work Type: daemon`, `E2E Scope: none`, no `web/` file changed), so
there is no browser surface to drive. Instead I ran the daemon-side equivalent, because
running tests is not the same as looking at the feature — and the plan's own
reviewer-verified list leans on a manual check.

Rig: `go build -o <scratch>/musterd ./cmd/musterd`, real `musterd` on
`127.0.0.1:47311`, `-data-dir '<scratch>/muster data'` (a **space-bearing** path, the
Edge Case 6 shape), `-tmux-socket muster-review` (never the `muster` socket, never the
user's default server), `-claude-bin <scratch>/stub-claude.sh` (a `sleep`-loop stub — no
real `claude`, no subscription burned). Launch directory: a scratch git repo whose
`.claude/settings.local.json` was pre-seeded by hand with the **pre-plan** shape — five
Muster `type:"http"` entries, a foreign `https://example.com/hook` on `PostToolUse`, a
legacy `type:"command"` `hook-sessionstart.sh` on `SessionStart`, a legacy quoted
`statusLine`, an `allowedHttpHookUrls` holding Muster's own URL plus a foreign one, and a
`permissions` key Muster does not own.

Confirmed by hand:

1. **REQ-16, live.** Startup logs `hook_script=".../muster data/hook.sh"
   status_line_script=".../muster data/status-line.sh"` — paths only, no token, no URL.
2. **REQ-5/D9, live.** Both scripts exist at `-rwx------` (0700).
3. **REQ-1/2/3, live migration.** `POST /api/sessions` rewrote the file to eleven events,
   each with exactly one `type:"command"` entry, `"timeout": 2`, and the path
   single-quoted (it contains a space). Every Muster `type:"http"` entry is gone; the
   foreign `https://example.com/hook` survives in its own group on `PostToolUse`;
   `allowedHttpHookUrls` now holds only `https://someone-elses-tool.example.com/hook`;
   the unrelated `permissions` key is preserved. I read the whole produced file, not a
   grep of it: it contains no ingest token and no `http://127.0.0.1` anywhere (INV-6
   holding on a real file, not a fixture).
4. **REQ-6, live.** Running the extracted `PreToolUse` command through `sh -c` with
   `MUSTER_SESSION` and `TMUX_PANE` unset: exit 0, empty stdout, empty stderr, and
   **zero** rows added to the `event` table (checked with `sqlite3`). An unmanaged session
   in an instrumented directory really does post nothing.
5. **REQ-9 happy path, live.** The same command with `MUSTER_SESSION=1 TMUX_PANE=%9` and
   a `UserPromptSubmit` payload on a never-bound session: one routed `event` row
   (`session_id=1`, `muster_session=1`, `tmux_pane=%9`) and the session bound to
   `managed-xyz` and moved to `working` — Edge Case 5 (lost initial `SessionStart`)
   working end to end, bind-with-no-transition followed by the event's own row.
6. **REQ-7, live daemon-down.** With `musterd` killed and the port closed: exit 0, empty
   stdout, empty stderr, **68 ms**. This is the whole point of the plan and it holds.
7. **Critical 1, live.** See the issue below — reproduced on this same daemon.

Not verified by me, by design: the real-`claude` acceptance step in the plan's
Reviewer-Verified list. It burns Damian's subscription and is explicitly his. Everything
in it except "a real Claude Code session actually emits these hooks" is now covered by
items 3–6 above with a stub.

Cleanup: daemon killed, `tmux -L muster-review kill-server` run and confirmed empty,
`pgrep -fl 'musterd|stub-claude'` empty. The real `muster` tmux socket and the real data
dir were never touched.

## Issues

### Critical

1. **[orchestrator:decision]** A reordered hook drags the binding backwards onto a dead
   conversation, resetting state and zeroing the compaction count —
   `internal/session/manager.go:414-423` (the new `enveloped && !isBindKind` branch).

   `/clear` emits `SessionEnd(reason:"clear")` for the **old** `session_id` and
   `SessionStart(source:"clear")` with a **new** one. CLAUDE.md's hard rule states hook
   delivery is "best-effort, at-most-once, **unordered**, and carries no timestamps:
   design for loss". The new rule — "any enveloped non-status event whose `session_id`
   differs from the bound one is a `/clear` rebind" — has no ordering guard, so *any*
   late event naming the previous conversation (the `SessionEnd(clear)` of the pair
   itself, or any straggler from the pre-`/clear` turn) is read as a *forward* rebind
   onto an id the session has already left.

   Reproduced two ways.

   Unit-level (a throwaway test in `internal/session`, since removed): bind `claude-old`
   → one `PreCompact` → `SessionStart(clear)` to `claude-new` → the new conversation
   works and compacts once → then the reordered `SessionEnd(reason:"clear")` for
   `claude-old` arrives:

   ```
   claudeSessionID: claude-new  ->  claude-old
   state:           working     ->  started
   compactions:     1           ->  0
   ```

   On the real daemon (the rig in Manual Verification, enveloped POSTs through the
   generated `hook.sh`):

   ```
   after SessionStart(source=clear) with a NEW id:   state=started  claudeSessionId=managed-new
   new conversation productive:                      state=working  claudeSessionId=managed-new
   AFTER the reordered SessionEnd(reason=clear):     state=started  claudeSessionId=managed-xyz
   ```

   Blast radius: `SessionEnd(reason:"clear")` is `KindClearDeathHint`, a deliberate no-op
   in the state machine (`internal/session/machine.go:78`) — before this plan a stray
   straggler for an old id touched nothing. After it, the same event resets the live
   conversation to `started`, nulls the context gauge, and permanently loses the
   compaction count (that counter only ever increments). The next real event rebinds
   forward and resets *again*, so the card flaps and the gauges are wrong until the next
   status post. This is a regression the plan introduced, in exactly the "unordered
   delivery" class the project's own hard rule names.

   The implementation is **faithful** to the approved §4.2/§7.3 text, so this is not a
   `[daemon-impl]` deviation — the hole is in the rule, and nobody changes the protocol
   unilaterally. Two options, for `/decide`:

   - **Option A — accept the window as specified.** Keep §4.2/§7.3 as approved and
     record the reordered-`/clear` window as a known residual next to Edge Case 6. Ships
     now, no protocol change; cost is a real user-visible state flip and a permanently
     lost compaction count on every reordered `/clear`, and it leaves the codebase
     asserting a "design for unordered delivery" rule it no longer honours on this path.
   - **Option B — make the rebind monotonic.** Refine §4.2/§7.3 so an enveloped event
     never rebinds *backwards* onto a claude id this session has already left: the
     manager already holds that knowledge, because a rebind adds the new id to
     `byClaude` without deleting the old one, so the guard is "if `byClaude[incoming id]`
     already points at *this* session and it is not the current `ClaudeSessionID`, route
     and apply the event but do not rebind". Costs one sentence of protocol text, ~4
     lines in `Manager.Apply`, and one regression test (the repro above); keeps every
     forward case in this plan working, including Edge Cases 4, 5 and 7.

### Major

1. **[orchestrator]** The "next launch heals it" claim about stale entries from a
   *different* data dir is measured false — `TODO.md` (the ticked "Muster never removes
   its own hook entries" entry), `plan.md` Edge Case 12 / Implementation Notes.

   `isMusterEntry` matches command entries by **exact path** only — deliberately, so a
   foreign script sharing a basename is never deleted (Implementation Notes, and a test
   guards it). The consequence: `LegacyCommands` carries only the *current* data dir's
   `hook-sessionstart.sh`, so an entry written by a daemon run with any other
   `-data-dir` is unrecognisable and survives every future launch. I hit this by accident
   in the live rig — the seeded `/old/data/hook-sessionstart.sh` entry is still on
   `SessionStart` in the migrated file, next to the new `hook.sh` entry. So after a data
   dir move the directory *accumulates* dead entries (old `hook.sh` on all eleven events
   plus the new one) and Claude Code prints `sh: ... No such file` for each one, on every
   event, forever — not "until the next Muster launch there rewrites the entries".

   Accepting the residual is fine and was Damian's call; the docs claiming it self-heals
   is what needs correcting, in `TODO.md`'s residual sentence and the plan's Edge Case 12.
   No code change implied. Not blocking (`[orchestrator]`-tagged), but it should not sit
   in `TODO.md` as a measured fact when it is measurably wrong.

### Minor

1. **[orchestrator]** Plan defect: `plan.md`'s Affected Files (line 112) assigns
   `SPEC.md` and `TODO.md` to the daemon track, and `daemon-implementation.md` duly
   edited both. Those two files are the orchestrator's (the Doc-Upkeep Backstop and
   Completion steps own them, and this project's review rules say an impl agent may not
   touch `SPEC.md`). The content landed correct and consistent, so nothing needs redoing
   — but future plans should route `SPEC.md`/`TODO.md` upkeep to the orchestrator rather
   than listing them under Daemon.
2. **[daemon-tests]** D18's "single persist" half is asserted only via broadcast count
   (`daemon-tests.md` flags this honestly). `internal/session.Manager` takes a concrete
   `*store.Store`, so there is no seam for a counting fake without editing production
   code — correctly out of scope. I verified the single `UpdateSession` call site by
   reading `Apply`. Worth an interface seam eventually; not worth a fix wave.
3. **[daemon-impl]** `httpHookEvents`'s new doc comment
   (`internal/claudecode/settings.go`) says it is kept because "REQ-2/REQ-3's legacy-http-
   entry stripping only ever applied to these ten". That is not why it survives: the
   stripping goes through `isMusterEntry`, which treats http entries identically on all
   eleven events. It survives because `allHookEvents` is built from it and
   `settings_test.go` iterates it. The comment sends a reader looking for event-scoped
   stripping logic that does not exist.
