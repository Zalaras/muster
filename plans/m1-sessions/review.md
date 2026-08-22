# Review: m1-sessions — cycle 3 (re-review after fix cycle 2)

**Plan**: m1-sessions
**Verdict**: approved

Cycle 1's findings are archived in `review-cycle-1.md`, cycle 2's in `review-cycle-2.md`.

Every cycle-2 finding is resolved or explicitly and acceptably settled. The two that
mattered are fixed at the level they were broken:

- **Critical 1 is now completely fixed**, and I re-ran cycle 2's own reproduction to prove
  it. `SessionStart(source:"resume")` with an unchanged `claude_session_id` — the plain
  `KindBind` door that cycle 1's fix left open — now lands on `started` with `attention`
  and `failure` both `null`, while `compactions` and `lastActivity` **survive** (a plain
  re-bind is not a fresh conversation). Both halves are asserted, not just the first.
- **Major 1 (WAL sidecars)** and **Major 2 (loopback host)** are fixed in code *and*
  pinned by non-vacuous regression tests.
- **Major 3** produced four genuinely good E2E tests (real `git init`, a real
  mid-listing directory removal, the daemon's real 404 text), plus the pre-emptive
  locator loosening it asked for.

One adjudication went **against** the previous cycle: **cycle-2 Minor 2 was my own
misread and is withdrawn** — see below. The impl agent was right to defend the record
instead of editing a true log line.

Full suite green from a clean run of my own: 39/39 E2E across all 7 spec files, 159
top-level Go tests (272 with subtests, `-race` clean), 186 Vitest, all six acceptance
checks, hard-rule checklist clean.

## Cycle-2 Finding Disposition

| Cycle-2 finding | Disposition | Evidence |
|---|---|---|
| **Critical 1** — plain re-bind strands `attention`/`failure` | **fixed** | `machine.go:102-121` — reset hoisted out of the `KindClearRebind` branch; clear-only resets still gated. Live browser probe below |
| Critical 1's §7.3 resume-row (`alive := true` → `idle`) | **settled as scoped-out** | `plan.md:29-32` now states the deferral explicitly, incl. why D10's reachable-row list omits resume. This is exactly the remedy cycle 2 asked for ("written into the plan rather than left silent") |
| **Major 1** — `-wal`/`-shm` world-readable | **fixed** | `store.go:56-61` chmods all three, tolerating `IsNotExist`; `store_test.go:52-69` asserts all three modes and `require`s the sidecars to exist, so it can't go vacuous |
| **Major 2** — `isMusterEntry` ignores host | **fixed** | `settings.go:60`, `isLoopbackHost` at `:77-85` (`localhost` + `net.IP.IsLoopback`, so `127.0.0.1` and `[::1]`); `settings_test.go:177-205` proves a foreign hook at `https://example.com/ingest/othertok/hook` **survives** despite a matching path shape |
| **Major 3** — 7 fix-wave behaviours untested | **fixed** | 4 new tests at `launch.spec.ts:204/245/274/300`, all passing live; pre-existing `exact: true` locator at `:75` loosened to `^name( \(git\))?$` |
| Minor 1 (`launch_failed` stderr is required) | resolved / recorded | unchanged, correctly |
| **Minor 2** (stripe log line inaccurate) | **withdrawn — my error** | `style.css:230-236` *does* declare `background: var(--dim)`; see adjudication below |
| Minor 3 (`NoteKind` discarded at DOM) | **fixed** | `sessions.ts:55` `note.dataset.noteKind = vm.noteKind`; all five variants unit-tested (`card.test.ts:147-282`) |
| Minor 4 (⌘N `preventDefault` before guard) | **fixed** | guard now inside the handler, `launch.ts:223` (one nit below) |
| Minor 5 (claude-code-pin drift) | **correctly routed to Damian** | a version bump is gated by `make canary` per CLAUDE.md — not an agent's call |
| Minors 6, 7 | recorded decisions, unchanged | as expected |

### Adjudication: cycle-2 Minor 2 (requested)

**The impl agent is right and I was wrong.** `web/src/style.css` lines 230-236:

```css
.card .stripe {
  width: 3px;
  flex: none;
  /* Inert default, not the Idle state colour (design-system §3: ...) */
  background: var(--dim);
}
```

The declaration is on line **235**. Cycle 2 cited "`style.css:230-234` has no `background`
declaration at all" — I read the rule to line 234 and stopped inside the two-line comment,
one line short of the declaration. `git diff` confirms the whole block is new in this
plan's diff with `background: var(--dim)` present, so nothing was added to make the log
line true after the fact. `daemon-implementation.md`'s Fix Attempt 2 was accurate as
written.

The right call was made twice over: the agent didn't edit a truthful record to satisfy a
reviewer, and it documented the evidence in `## Decisions` so the disagreement could be
adjudicated rather than silently absorbed. That is the behaviour this pipeline wants.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 launch into tmux, 201 + `started` | Yes | Yes | pass |
| REQ-2 row + broadcast before any hook | Yes | Yes | pass |
| REQ-3 repo upsert on launch | Yes | Yes | pass |
| REQ-4 idempotent settings merge preserving unowned keys | Yes | Yes (+ non-loopback case) | pass |
| REQ-5 `GET /api/repos` MRU + defaults | Yes | Yes | pass |
| REQ-6 `GET /api/browse` | Yes | Yes | pass |
| REQ-7 envelope binding / no cwd guessing | Yes | Yes | pass |
| REQ-8 §7 state machine + §7.4 guards | **Yes (fixed)** | **Yes (fixed)** | **pass** (resume-row `alive := true` explicitly M4 per `plan.md:29-32`) |
| REQ-9 permission_mode latches forward | Yes | Yes | pass |
| REQ-10 `/clear` rebind | Yes | Yes | pass |
| REQ-11 ~5 s liveness poll, state untouched | Yes | Yes | pass |
| REQ-12 whole-object `sessionUpsert` + snapshot | Yes | Yes | pass |
| REQ-13 status posts route but mutate nothing | Yes | Yes | pass |
| REQ-14 launch modal | Yes | **Yes (E2E added)** | pass |
| REQ-15 Focus-view rail cards | Yes | Yes | pass |
| REQ-16 pure client-side sort | Yes | Yes | pass |
| REQ-17 first-launch honesty | Yes | Yes | pass |
| REQ-18 degraded states | Yes | Yes | pass |
| REQ-19 `-claude-bin` / `-tmux-socket` | Yes | Yes | pass |
| REQ-20 `LANG`/`LC_ALL` (should) | Yes | Indirect | pass |
| REQ-21 PreCompact counter (should) | Yes | Unit only (M2 per plan-work) | pass |
| REQ-22 ⌘N opens modal (nice) | Yes | **Yes (E2E added)** | pass |

## Build & Tests

All re-run fresh by me, not taken from the orchestrator's report.

E2E tests: **pass** (39/39, all 7 spec files, 15.3 s)
Daemon tests: **pass** (159 top-level / 272 incl. subtests, 0 fail; `go test -race ./...` exit 0)
Web tests: **pass** (186/186 across 10 files)
Daemon build: **pass** (`go build ./...`, `go vet ./...` clean)
Web build: **pass**
Lint: **pass** (golangci-lint via `make check`, exit 0)

## Acceptance Checks

Every line of the plan's ```checks block (`plan.md:568-575`), run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `go build ./...` | pass (exit 0) |
| D2 | `make check` | pass (exit 0) |
| D3 | `! rg -n "hook_event_name\|notification_type\|last_assistant_message\|stop_hook_active" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (rg exit 1 — no matches) |
| W1 | `make web-build` | pass (exit 0) |
| W2 | `make web-test` | pass (186/186) |
| E1 | `make e2e` | pass (39/39) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D3a | `internal/session` carries no Claude Code vocabulary | pass | Narrowed grep: the only `permission_mode` hits outside `internal/claudecode/` are SQL column names (`store/repo.go`, `store/session.go`, `0002_sessions.sql`) and one explanatory comment (`machine.go:126`). Zero raw JSON-key indexing or `json.Unmarshal` in `internal/session` or `internal/store` |
| D5 (WS half) | `sessionUpsert` reaches clients | pass | Live probe: cards transitioned on every synthesized hook POST without reload |
| D7 | idempotent merge preserving unowned keys | pass | Confirmed cycle 2 end-to-end; now additionally hardened by the loopback test |
| D9 | unrouted event logged, no payload | pass | `ingest.go:145-152` logs `kind` + `muster_session` only |
| D17 | status posts mutate nothing | pass | `interpret.go` → `KindInert`; `sessions.spec.ts:359` green |
| D18 | no ingest payload ever logged | pass | Re-read all 10 log calls in `ingest.go`: every one takes only `kind` (neutral enum), a count, an id, or an error |
| D20 | branch read at request time | pass | `repos.go` calls `gitutil.Branch` inside the request loop |
| W3 | no `any` in new web code | pass | `rg ':\s*any\b|<any>|as any' web/src/` — no matches |
| W5 | MRU click prefills model + start-in | pass | `launch.spec.ts:102` green |
| W8 | state colour only via tokens; never colour alone | **pass (was partial)** | The cycle-2 caveat is gone: the resume path now renders stripe `rgb(138,144,163)` (`--muted`, the `started` grey) with the note hidden. Each state token still maps to exactly one state class (`style.css:334-373`); badge word + sort position always accompany it |
| W12 | banner over stale rail; snapshot replaces wholesale | pass | `resilience.spec.ts` + `sessions.spec.ts:407` green |
| W13 | empty view-switcher slot sized for M2 | pass | Confirmed cycle 2; unchanged |
| — | Design-system conformance (§§1-3, 5-6) | pass | No raw hex anywhere in `web/src/*.ts`, `render/*.ts`, `sessions/*.ts` (tokens only; hex confined to the `:root` block in `style.css`); no `@font-face`/`@import`/Google Fonts; no `innerHTML`; `.card .stripe` default is the inert `--dim`, not a state colour |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — D3 grep clean; narrowed sweep found only SQL column names and comments; `interpret.go` remains the sole payload-key reader |
| 2 | No terminal-output state parsing | pass — zero `capture-pane` in any `.go`/`.ts` file |
| 3 | Non-blocking hook handler, timeouts ≤ 2 s | pass — `handleIngest` enqueues and returns 200; `hookTimeoutSeconds = 2` (`settings.go:16`) on both the HTTP and command entries |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — zero `resize-pane` in any source file; sizing goes through `pty.Setsize` + `resize-window` |
| 5 | Never log hook payloads | **pass (cycle-2 caveat cleared)** | all three DB files are now 0600, so the WAL no longer exposes the newest prompt text; no log call takes a payload |
| 6 | No empty-gauge dishonesty | pass — `shell.spec.ts:30` asserts both usage readouts render the literal word *unknown*, never an empty gauge |
| 7 | Session identity on the tmux target, not `session_id` | pass — `session.tmux_target` is the key; the resume/clear paths rebind `claudeSessionId` while `id`/`tmuxTarget` hold (confirmed in both probes) |
| 8 | No settings trespass | pass — grep for `CLAUDE_CONFIG_DIR` / `~/.claude/settings.json` returns nothing; only `<dir>/.claude/settings.local.json` |
| 9 | No real `claude` outside canary/probes | pass — E2E uses the `-claude-bin` stub; every `claude-haiku-4-5-20251001` occurrence is a fixture model-id string, not an invocation |

## Manual Verification

I re-ran cycle 2's own reproduction of Critical 1 in real headless Chromium (temporary
probe spec against a real daemon, real `POST /api/sessions`, real tmux on a private
socket; probe file deleted afterwards and `git status` re-confirmed clean — no
`zz-review-probe` entry remains).

**PROBE-A — resume from `needs_input`** (the exact case cycle 2 reproduced as broken).
Drove the session to `needs_input` *and* first accumulated a compaction and a
`lastActivity`, so the probe could check the fix didn't overshoot:

- before: `{"state":"needs_input","attention":{"reason":"permission",…},"failure":null,`
  `"context":{…,"compactions":1},"lastActivity":"hi"}`
- after one `SessionStart(source:"resume")` with the **same** `claude_session_id`:
  `{"state":"started","attention":null,"failure":null,`
  `"context":{…,"compactions":1},"lastActivity":"hi"}`

Both halves correct: the honesty invariant is restored, and `compactions` / `lastActivity`
**survived** — the reset did not silently acquire `/clear` semantics.

DOM: stripe `rgb(138, 144, 163)` (`--muted`), **not** the `rgb(242,163,60)` amber cycle 2
measured; note element not visible; `data-note-kind="none"`.

**PROBE-B — resume from `failed`**: `{"state":"failed","failure":{"error":"server_error",…}}`
→ `{"state":"started","failure":null}`. Stripe grey, note hidden. Cycle 2's second
symptom is gone.

**Contract cross-check**: `docs/protocol.md:278-279` specifies `attention` non-null
**iff** `state == "needs_input"` and `failure` non-null **iff** `state == "failed"`. The
unconditional reset is therefore what the contract requires, not merely what the review
asked for. `setState` (`session.go:114-120`) still returns early when the state is
unchanged, so Edge Case 3's "duplicate delivery is a no-op transition / `stateSince` only
moves on a real change" guarantee is intact.

The four new E2E tests were verified live rather than by reading: `launch.spec.ts:245`
does a real `git init` and asserts `git-subdir (git)` **and** that `plain-subdir` has no
marker; `:204` removes a directory between listing and click and asserts the daemon's
real 404 text (`"directory does not exist or is not a directory"`) inline with the dialog
and stale listing still up; `:274` asserts `.dir-path` equals the full absolute path;
`:300` presses `Meta+n` and asserts the dialog opens. Zero console/page errors.

Could not verify: real `claude` behaviour (correctly out of scope — hard rule 9) and
M3-gated surfaces (context gauges, usage bars), `null` by design in M1.

## E2E Suite (regression sweep)

`make e2e` over **all 7 spec files, 39 tests — 39 passed** (15.3 s), including the four
M0 files this plan did not author (`auth`, `ingest`, `resilience`, `shell`, 11 tests).
No regressions from either fix wave.

**Repairs table verified.** `test-specs.md`'s `## Repairs` table still lists only cycle
1's `envelopedSessionStart` `model` fixture change (object → plain string), which I
confirmed sound in cycle 2 and which is unchanged. Cycle 2's fix wave logged no new
repairs, and I confirmed no assertion was weakened to accommodate it:

- Zero `test.skip` / `test.fixme` / `.skip(` / `.fixme(` / `test.only` anywhere in
  `web/e2e` or `web/src`.
- The locator loosening is **additive-tolerant, not weakened**: `launch.spec.ts:75` went
  from `{ name: dirName, exact: true }` to `^${dirName}( \(git\))?$` — still anchored at
  both ends, so it cannot match a different directory. Critically, `exact: true` was
  **retained** at `:220` and `:268`, where it is load-bearing (`:268` asserts a plain
  subdirectory has *no* `(git)` marker — loosening that one would have made the assertion
  vacuous). The right locators were loosened and the right ones were left alone.
- New assertions are specific throughout: exact daemon error text, exact `(git)` name,
  exact absolute path — no container-level `toBeVisible()` standing in for a value.
- The new Go tests are non-vacuous by construction: `store_test.go:61` forces a write
  past the migrations so the sidecars must exist, then `require`s the `os.Stat` before
  asserting each mode — the `IsNotExist` tolerance in the fix can't make the test pass by
  accident.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The ⌘N guard fix moved `if (elements.dialog.open) return;` *above*
   `event.preventDefault()` (`launch.ts:223-224`), so when the dialog is already open,
   Cmd+N now falls through to the browser's own new-window shortcut instead of being
   swallowed as it was before. Microscopic (the user must press ⌘N with the modal already
   up) and arguably either way, but it is a real behaviour change from a fix whose stated
   goal was purely to relocate a guard for readability. Swapping the two lines keeps the
   readability win and the old swallowing behaviour.
2. **[plan-work]** Recorded, not actionable this cycle: `§7.3`'s
   `SessionStart(source:"resume")` row is now explicitly M4 (`plan.md:29-32`), which
   means a bind from `needs_input`/`failed` lands on `started` rather than `idle`. That is
   the plan's specified M1 behaviour and the fix makes the resulting object
   self-consistent, so nothing is wrong today — but M4's reconcile should revisit both
   halves of that row together (`alive := true` **and** → `idle`), since implementing one
   without the other would reintroduce an inconsistency.
3. **[daemon-impl]** Recorded as sound, not a request: `store.go`'s chmod runs at `Open`
   time, and SQLite recreates `-wal`/`-shm` on checkpoint/reopen. This is safe because
   SQLite deliberately derives sidecar permissions from the main database file (now
   0600), and `Open` re-chmods all three on every start — noting it so a future reader
   doesn't mistake the `IsNotExist` tolerance for a gap.
4. **[plan-work]** Carried forward from cycle 2's Minor 5, correctly routed to Damian and
   **not** expected of any agent: `spikes/canary-fields.md` records probes against
   2.1.240 while `docs/claude-code-pin.md` pins 2.1.233. A version bump is gated by
   `make canary` per CLAUDE.md, so this is his decision; it belongs in the completion
   report / `TODO.md`, which is where it went.
5. **[e2e-specs]** / **[web-tests]** Carried forward as recorded decisions, unchanged and
   correct: REQ-21's `⟳n` counter has no E2E assertion (not in the Testable UI Elements
   table — a plan gap deferred to M2), and `renderSessions`'s non-empty DOM branch has no
   unit test by design (covered by `sessions.spec.ts` + `card.test.ts`).
6. **[e2e-specs]** Housekeeping only, no verdict impact: the harness leaves its per-run
   tmux socket **files** behind — 80 `muster-e2e-*` entries have accumulated under
   `/private/tmp/tmux-*/`. I checked for the thing that would actually matter and it is
   clean: `pgrep tmux` and `pgrep musterd` both return **0**, so teardown does kill every
   server and no process, port or subscription is leaking. These are inert filesystem
   entries the OS reclaims. Worth an `rm` of the socket path in the daemon helper's
   teardown whenever that file is next touched.
