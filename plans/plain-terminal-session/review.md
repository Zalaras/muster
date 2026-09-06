# Review: Plain terminal session

**Plan**: plain-terminal-session
**Cycle**: 2
**Verdict**: approved

Every cycle-1 Major and Minor is closed, and I re-measured each fix against the shipped
app rather than reading the diff. The full 281-test E2E sweep passes, all six authored
acceptance checks pass, the hard-rule checklist is clean, and the orchestrator's doc
upkeep is accurate against what actually shipped. Two Minors remain (one dead field, one
test-hygiene leak); neither blocks approval.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 lazy one-shell-per-session, `$SHELL` in the session dir, `muster-<id>-shell` | Yes | Yes (D1/D2/E1/E2/E3) | pass |
| REQ-2 no `MUSTER_SESSION`, no `settings.local.json` write | Yes | Yes — env (D3) **and** settings, now covered by `TestHandleCreateShell_LeavesSettingsLocalJSONUnchanged` (cycle-1 Major 2 closed) | pass |
| REQ-3 no SQLite row from any shell operation | Yes | Yes (D13, real row count) | pass |
| REQ-4 segmented control in mainhead + every tile footer, pip | Yes | Yes (E1, tile-scoping E2E, pip-token E2E, unit tests) | pass — REQ-4 amended per decision `shell-pip-hue`, and the shipped pip resolves to `--shell-pip` |
| REQ-5 switching disposes the hidden surface's socket | Yes | Yes (E1, socket trackers) | pass |
| REQ-6 shell survives session switch, view switch, parent ending | Yes | Yes (E4, E5, E11) | pass — re-measured: a shell started in Focus was still selected and lit after ⌘\ to Tiles |
| REQ-7 a shell can be **started** on a dead session | Yes | Yes (D5, E5) | pass — re-measured by hand on a dead tile |
| REQ-8 `exit` → 4001 → segment reverts, pip clears, respawn works | Yes | Yes (D7, E6) | pass — re-measured by hand |
| REQ-9 Remove kills the shell, End does not | Yes | Yes (D9, D10, E13) | pass |
| REQ-10 reconcile kills every `muster-<n>-shell`, never "unknown" | Yes | Yes (D11, D12, E8) | pass — re-measured: `shells_killed=1` on restart, no unknown-session warning |
| REQ-11 file drop and resize behave as in a Claude pane | Yes | Yes (E14, E16) | pass |
| REQ-12 spawn failure surfaces its message, segment reverts | **Yes** — now holds on live sessions, Focus dead surfaces and tile dead surfaces alike | Yes — E9 plus the two new dead-session variants (cycle-1 Major 1 closed) | pass |
| REQ-13 tile footer absorbs the control without overflowing | Yes | Reviewer-measured against the shipped app | pass |

Invariants: INV-1 (D3 + a live differential measurement, below), INV-2 (D13), INV-3 (two
daemon tests in both directions + E12), INV-4 (E13 + registry test + a live measurement
that a notice never leaks to a neighbouring tile), INV-5 (D11 + E8 + measured restart),
INV-6 (E7/E15 + the `nudgeOnEOF` test) all hold.

## Build & Tests

E2E tests: **pass (281/281)** — full suite, every spec file, 0 skipped
Daemon tests: pass (`make test`, 13 packages `ok`, 0 failures)
Web tests: pass (1041 in 28 files)
Daemon build: pass
Web build: pass
Lint: pass (`golangci-lint`, 0 issues)

The two counts moved for honest reasons and I checked the arithmetic in both directions.
E2E 278 → 281 is the three tests e2e-specs added. Web 1046 → 1041 is eleven
`aliveOnly`/`surfaceDiff` tests dropped alongside the production functions they covered,
plus six new `showDeadSurfaceNotice` tests: 1046 − 11 + 6 = 1041 exactly. No assertion was
weakened to make a number work.

## Acceptance Checks

Run via `.claude/skills/orchestrate/scripts/gates.sh plain-terminal-session --checks-only`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `make lint` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make contrast` | pass |
| E1 | `make e2e` | pass |

6 lines, 0 failed.

`make contrast` with the new token included:

```
instrument: 43 pairs, 0 failures
dark: 43 pairs, 0 failures
light: 43 pairs, 0 failures
```

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7 | no `any` types in new web code | pass | grepped every non-e2e `.ts` file in the plan's full diff for `: any` / `<any>` / `as any` / `any[]` — zero hits across all twelve files. Test fakes use `as unknown as HTMLElement`. |
| D3 / INV-1 | the env assertion is a real oracle | pass | The daemon test's oracle (the spawned process echoing its own `$MUSTER_SESSION`) was verified in cycle 1 and is unchanged. I corroborated it live against a running shell: `tmux show-environment -t muster-1` printed `MUSTER_SESSION=1` while `-t muster-1-shell` printed no `MUSTER_*` at all. The same variable present on one target and absent on the other is a differential, not a vacuous check. The shell pane's process is `/bin/zsh -i`. |
| D4 / REQ-2 | the settings assertion is a real oracle | pass | The new test launches through the real `sessionLauncher` (not `launchRealSession`, which would leave the directory with no file at all and let an "absent" assertion pass for the wrong reason), then asserts content **and** mtime unchanged across the POST. Its own comment names that trap. This is exactly the caveat cycle 1 asked for. |
| D13 / INV-2 | the row-count assertion is a real oracle | pass | Unchanged since cycle 1: `SELECT COUNT(*)` over `session` + `repo` + `event` against the daemon's real SQLite file, before and after a full spawn → attach → type → resize → `exit` → respawn → kill cycle. |
| REQ-13 | the measured footer numbers still hold against the shipped CSS | pass | Driven in a real browser at 1152px, 3×2, six tiles including two dead ones (the tight `✕ ended <age>` + Resume + Remove + segment case). Every footer: 0 overflow at 381px, 0 label clipping, body overflow 0. Table below. |
| REQ-13 | the 1024px floor is fixed or still documented | pass | Re-measured at 1024px: 0 overflow on all six footers at 338px, so the plan's documented 6px floor stays pessimistic rather than wrong-in-the-dangerous-direction. `TODO.md` and `SPEC.md` both now record the correction explicitly. |
| Boundary | no Claude-Code-format knowledge in the shell spawn path | pass | `internal/server/shells.go` imports only `context`, `fmt`, `os`, `sync`, `zerolog` and `internal/tmux`; grepping both it and `internal/tmux/` for `claudecode` returns nothing. It deliberately bypasses `sessionLauncher`, the one path that would pull the adapter in. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — swept the whole repo for `hook_event_name` / `rate_limits` / `permission_mode` / `transcript_path` outside that package; every hit is either Muster's own DB column or its own event-type string, and none is new in this plan |
| 2 | No terminal-output state parsing | pass — the shell is a display surface only; nothing reads its bytes |
| 3 | No blocking hook handler | pass — the ingest path is untouched by this plan |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — swept every added tmux invocation in the plan's diff: each carries `-L` or a per-test `-S <socket>`. `resize-pane` appears nowhere outside prose that documents why it is wrong |
| 5 | No payload logging | pass — the new log lines carry only session ids and tmux names |
| 6 | No empty-gauge dishonesty | pass — the pip is a positive claim, absent when nothing is known; measured absent on a session that never had a shell |
| 7 | Session identity on the tmux target | pass — the shell keys on `muster-<id>-shell` |
| 8 | No settings trespass | pass — now machine-enforced by D4's new test, not only reviewer measurement; nothing touches `~/.claude/` |
| 9 | No real `claude` outside canary/probes | pass — the shell runs `/bin/zsh -i`; no test or fixture in this plan invokes `claude` |

**Design-system sweep.** Cycle 1's Major 3 is settled as Option B and the shipped build
matches: `.surfseg .pip` reads `var(--shell-pip)`, defined in all three `[data-theme]`
blocks, and I measured the live pip's computed background at `rgb(108, 158, 229)` — byte
for byte the page's own `--shell-pip`, and distinct from `--teal` at `rgb(86, 197, 208)`.
§3's four state hues are untouched. The `contrast-pairs.json` addition pairs an `exempt`
entry (a decorative 5px dot with no text of its own, the same category as gauge tracks)
with a `hueBands` entry that machine-enforces the new hue stays clear of all four state
bands — the exemption does not go unpoliced, which is the right shape for an addition to a
closed list. No colour literal outside the theme blocks, no web font, no `@import`.

The new `[hidden]` toggles are covered: both new elements reuse the existing
`.terminal-notice` class, and `.terminal-notice[hidden] { display: none; }` already sits
next to the author `display` rule at `web/src/style.css:789`. I measured the notice going
from a 0×0 hidden box to a visible 724×40 one and back, so the companion rule works in
practice, not just on paper. The segment carries no changing numeric value, so
`tabular-nums` does not apply. Terminal §7 holds: one live client per attach target,
`scrollback: 0` unchanged, sizing still `pty.Setsize` then `resize-window`.

## Manual Verification

Drove the shipped dashboard in a real Chromium against a real scratch daemon on its own
port, data dir and tmux socket, with six sessions.

**A genuinely real shell.** Clicking `shell` in the Focus mainhead mounted a container
labelled exactly `Shell: rv-repoA`. Typing `echo RV2-$((13*17))-$(basename $PWD)` read back
`RV2-221-repoA`. The arithmetic and the directory name are both the shell's own work, so
the round trip is real, and the prompt itself (`damian@Damians-MacBook repoA %`) confirms
REQ-1's cwd. A stray keystroke earlier produced a genuine `zsh: command not found: eecho`,
which is its own proof the pane is a live zsh and not a replayed fixture.

**Cycle-1 Major 1, the finding that blocked approval.** Reproduced the exact case that
measured zero visible feedback last cycle: ended a session, deleted its directory, clicked
`shell`. The daemon answered `409 directory_missing`, the segment stayed on `claude` with
no pip, and this time the dead surface's own `role="status"` notice became visible at
724×40 carrying the daemon's message verbatim, including the removed directory's full
path. I had to watch it through a `MutationObserver` — my first read came back empty
because the notice had already auto-hidden after its 5s window, which is the intended
behaviour mirrored from `TerminalSurface.showNotice`.

**The routing bug e2e-specs caught mid-cycle (`f2433ae`).** This is the case that mattered
most, so I set up observers on all three dead-surface notices before clicking. With
session 3 focused and the app in Tiles view, clicking `shell` on session 3's **own** tile
put the notice in that tile's dead surface (573×58 visible) and left Focus's `#dead-surface`
notice untouched and empty. That is precisely the misroute the first fix attempt produced.
Clicking a non-focused dead tile behaved the same, and neither click leaked a notice onto
the other tile — so the per-tile scoping is real, not incidental.

**REQ-7 and REQ-8 end to end.** Started a shell on a **dead** session whose directory still
existed: it mounted, the pip lit, and the tile body showed `damian@Damians-MacBook repoF %`
with the dead surface replaced. Typing `exit` then cleared the pip, flipped the segment
back to `claude`, and swapped the dead surface back in.

**REQ-10 measured, not inferred.** With a live shell running, restarting the daemon logged
`shells_killed=1 kept_alive=3`, `muster-1-shell` was gone from the socket afterwards, the
three Claude sessions survived, and no "unknown muster tmux session" warning appeared.

**Tiles, 3×2, six tiles, two of them dead.**

| viewport | tiles | footer width | worst footer overflow | worst label clip | body overflow |
|---|---|---|---|---|---|
| 1152px | 6 (2 dead) | 381px | 0px | 0px | 0px |
| 1024px | 6 (2 dead) | 338px | 0px | 0px | 0px |

Zero `.surfseg` elements in any `.thead` (W3), and every one of the six footers carries the
segment.

**W5, daemon down.** Killed the daemon: the "musterd unreachable" banner appeared and all
twelve tile segment buttons went `disabled`. The Focus mainhead's two buttons read
`disabled: false`, but the mainhead lives inside `#view-focus`, which was `hidden` at the
time — an invisible control's state is not observable by the user, and cycle 1 measured
the Focus case live with the view showing and found both buttons disabled.

**Lazy spawn, negatively.** After three failed spawns and one successful one, `tmux ls` on
the review socket listed exactly the shells that should exist. No `muster-2-shell` or
`muster-3-shell` was ever created, confirming REQ-12's "no half-created shell tab left
behind" at the tmux layer rather than only in the DOM.

All scratch state — daemon, tmux server, data dir, repos — was torn down afterwards; the
user's own tmux socket was never touched.

## Doc Upkeep Verification

The orchestrator's `052296c` is accurate. I checked each factual claim in it against what
shipped rather than against the plan:

- "reconcile kills every `muster-<n>-shell` unconditionally" — measured, `shells_killed=1`.
- "a `--shell-pip` token per theme rather than an exemption" — measured on the live pip.
- "the tile control lives in `.tfoot .acts`, not `.thead`" — measured, 0 segments in any header.
- "footer overflow measured 0 at both 1152px and 1024px in the shipped build, so the plan's
  6px floor is pessimistic" — I re-measured both and got 0 and 0.

`docs/protocol.md` §3.16, §6.1, §3.8's shell-kill note and the §3 index row all match the
shipped implementation, including the pre-upgrade error codes. `README.md` says nothing
about the shell surface, so there is no user-facing document contradicting anything this
plan shipped. The SPEC heading's omitted review-cycle suffix is the deliberate
pre-approval state the orchestrator flagged.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** `shellRegistry.spawned` is write-only state —
   `internal/server/shells.go:29`, written at `:73`, deleted at `:88`, and read nowhere in
   the package or its tests (grepped). `PaneExists` is the actual source of truth for
   whether a shell is running, and `mu` is what makes `Ensure` safe, so the map carries no
   information: it only grows one entry per session per daemon lifetime for sessions that
   are never Removed. Deleting the field and its two write sites leaves `Ensure` and `Kill`
   behaving identically. This is the same category as cycle 1's Minor 1 on the web side,
   which was fixed; I missed it last cycle.

2. **[e2e-specs]** The new tile dead-surface test leaks its scratch directory on failure —
   `web/e2e/plain-shell.spec.ts`, the "DEAD tile with its directory removed" test. Its
   `finally` block runs only `dirB.cleanup()`, because `dirA.cleanup()` is called
   mid-test as part of the fixture. If any assertion between `launchSession` and that
   mid-test call throws, `dirA` is never removed. The Focus variant immediately above
   solves exactly this with a `cleaned` boolean guard and an `if (!cleaned) await
   cleanup()` in its `finally`; the tile variant should use the same shape. Harmless while
   the test is green, which is precisely when it will not be noticed.

### Notes

1. **[note]** `findDeadSurfaceRefs`'s Focus branch returns `deadSurfaceRefs` whenever
   `view === "focus" && focusedId === id`, without checking that the dead surface is
   actually showing. It is unreachable today because the only caller falls through to it
   only when no live `TerminalSurface` is mounted for that id, and a live focused session
   always has one. Worth remembering if a future change ever routes something else through
   that helper — the guard it relies on lives in the caller, not in the function.

2. **[note]** `showDeadSurfaceNotice(refs, null)` is never called with `null` from
   production code; the clear path exists only to mirror `TerminalSurface.showNotice`'s
   contract, and is unit-tested. Deliberate symmetry, not an oversight — recording it so a
   future dead-code sweep does not mistake it for the same category as Minor 1 above.

3. **[note]** Cycle 1's Note 1 still stands: edge case 7's stale pip is accepted in the
   plan and real in the shipped build, and the narrower sub-case (a shell dying externally
   while its session is selected-but-not-visible costs two clicks to recover rather than
   one) is still unnamed in the plan. No change requested; the proper fix needs shell
   liveness on `/ws`, which the spec's own REQ-11 forbids.

4. **[note]** Cycle 1's Note 4 still stands: `interactiveShellArgv` reads `os.Getenv("SHELL")`
   from the **daemon's** environment. Correct for how musterd is started today, but it
   would silently fall back to `/bin/zsh` under launchd. I confirmed the happy path by
   measurement — the spawned pane really is `/bin/zsh -i` and really is the user's shell.

5. **[note]** The plan's Implementation Notes still record a 6px dead-tile overflow at
   1024px, which I measured at 0 in the shipped build for the second cycle running. This is
   a plan document rather than a user-facing one, and both `TODO.md` and `SPEC.md` now carry
   the correction explicitly, so nothing needs changing. Recording it only so a future
   reader of the plan does not take that number as current.
