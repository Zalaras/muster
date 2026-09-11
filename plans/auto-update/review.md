# Review: auto-update

**Plan**: auto-update
**Verdict**: approved

Delta re-review (cycle 2). Cycle 1's only agent-tagged issue was one `[daemon-impl]` Minor
(REQ-28), so §9 applies: the full regression net (§1 `make e2e`, §2 builds, unit tests, lint,
authored checks) ran in full; §2a and the §3–§7 re-read are waived because the diff since
cycle 1 touches exactly one non-test source file and only within that Minor's stated scope.
Zero Critical, zero Major, zero Minor. Both cycle 1 fixes are present, correct, and accurate.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-27 | Yes | Yes | pass — verified in full in cycle 1 (`review.cycle1.md`); `git diff fca6bec..HEAD` touches no file any of them depend on, so they are carried forward, not re-asserted |
| REQ-28 startup log names install kind + remedy | **Yes** — `cmd/musterd/main.go:306` adds `.Str("install", string(install.Kind))` to the existing `musterd starting` event; `:309-313` logs `install.Remedy` once when non-empty | No unit test — verified by a measured startup log pasted in `daemon-implementation.md` (see Note 2) | **pass** (was FAIL) |

## Build & Tests

E2E tests: pass (302 passed, 0 failed, 0 skipped — full suite; see Note 1 on the first run)
Daemon tests: pass (all 15 test packages `ok`, none skipped)
Web tests: pass (1424 in 30 files)
Daemon build: pass (`go build ./...`, exit 0)
Web build: pass (`tsc` + Vite, 44 modules)
Lint: pass (`0 issues.`)

## Acceptance Checks

Run through `.claude/skills/orchestrate/scripts/gates.sh auto-update --checks-only`, one line
per ID, from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | negative `rg` for release-URL construction outside `internal/selfupdate` | pass |
| D5 | `test -s internal/selfupdate/minisign.pub` | pass |
| D6 | `goreleaser check` | pass — the runner reports FAIL only because `goreleaser` is not on `PATH`; run verbatim with `~/go/bin` on `PATH` it printed `1 configuration file(s) validated` and exited 0. Environment gap, not a plan defect (see Note 4) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make contrast` | pass |
| W4 | `make e2e-lint` | pass |
| E1 | `make e2e` | pass |
| DOC | plan's Doc-upkeep list | pass — `SPEC.md` changelog and §5 stack row, `docs/protocol.md` delta, and the `TODO.md` follow-up item ("installer verifies `checksums.txt.minisig` too", `TODO.md:795`) were verified in cycle 1. Cycle 1's two gaps are now closed by `a5aa53e`: `docs/design/design-system.md` §5 Modal and the `README.md` "Updating" paragraph. Both were checked against shipped code, not just read — see Delta. The one remaining item, ticking `TODO.md:775`, is the orchestrator's completion step by design and is correctly still open |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7–D26, W5–W10, E2–E15, M1–M2 | unit, web and spec-level claims | pass | verified in full in cycle 1; unaffected by this cycle's diff, which adds no test and changes no tested behaviour |
| REQ-28 (cycle 2) | the log line names the kind, and the remedy fires only for `homebrew`/`unmanaged` | pass | read `cmd/musterd/main.go:300-313` against `internal/selfupdate/install.go` `Classify`: `Remedy` is non-empty for exactly `KindHomebrew` and `KindUnmanaged`, empty for `KindDev` and `KindInstaller`, so the second line cannot fire for the other two. `install` is a pre-existing local at `main.go:162`, so the fix adds no plumbing |
| Doc accuracy (cycle 2) | `a5aa53e`'s two doc claims match shipped code | pass | see Delta table |

## Hard-Rule Checklist

Scoped to this cycle's diff (`README.md`, `cmd/musterd/main.go`, `docs/design/design-system.md`
and plan files). Cycle 1's full nine-rule sweep over the whole implementation was clean and
nothing in this diff can reopen it.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the added lines name `selfupdate.Install` fields only; no Claude-Code field name |
| 2 | Terminal-output state parsing | pass — no `capture-pane` in the diff |
| 3 | Blocking hook handler | pass — no ingest path touched |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — the two log events carry an install kind and a compile-time constant remedy string. No prompt text, no user data, nothing derived from a hook payload |
| 6 | Empty-gauge dishonesty | pass — no view changed |
| 7 | Session identity on `session_id` | pass — untouched |
| 8 | Settings trespass | pass — no read or write of `~/.claude/settings*.json` |
| 9 | Real `claude` outside canary | pass — no test or fixture added |

## Manual Verification

Browser verification is waived for this cycle under §9: cycle 1 drove the feature end to end in
a real headless Chromium against a real fake release server (badge, dialog, a genuine signature
refusal with a byte-identical binary before and after, the restart confirm, and the toggle-off
request count), and this cycle's diff contains no `web/src` change that could move any of it.

What I did verify by hand this cycle, because `a5aa53e` makes new factual claims about the UI:

- **The badge dot.** `docs/design/design-system.md` now says "6px dot in `--fg-muted`". Exactly
  one rule styles it (`web/src/style.css:299-307`): `width: 6px`, `height: 6px`,
  `background: var(--fg-muted)`. No later rule overrides either. Cycle 1 separately measured
  that computed background live as `rgb(178, 182, 195)`.
- **The accessible name.** The doc's `Settings, update available` is the literal string set in
  `web/src/render/update.ts:153`, and it is removed again when the badge clears.
- **The dialog's contents and order.** The doc's list — theme picker, one-line hint, then the
  Updates fieldset (running/available, the checkbox, a `role="status"` line, both buttons),
  then Close — matches `web/index.html`'s `#settings-dialog` element for element, including the
  checkbox's exact label text `Check for updates daily`.
- **The Homebrew guidance.** `HomebrewRemedy` in `internal/selfupdate/install.go:26` is
  `installed by Homebrew — run brew upgrade musterd`, which is what the README tells a Homebrew
  user to run, and `renderUpdateSection`'s view model routes that remedy into the status line
  while leaving both buttons disabled for any non-`installer` kind.
- **The rest of the README paragraph.** Each claim maps to a requirement verified in cycle 1:
  the daily check and the "off means no request at all" behaviour (REQ-2, measured in cycle 1),
  the two buttons' distinct semantics (REQ-12/REQ-19), `musterd -update` (REQ-22), and the
  double verification of minisign signature then SHA-256 with no unsigned fallback
  (REQ-15/REQ-16/REQ-24, the refusal measured in cycle 1).

## Delta

| Prior issue | Fix commit | Verified how |
|-------------|-----------|--------------|
| cycle 1 Minor 1 `[daemon-impl]` — "REQ-28 is not implemented … add `.Str("install", string(install.Kind))` to the existing `musterd starting` event, plus a single `log.Info()` naming `install.Remedy` when it is non-empty" | `9b0b394` | Read the diff: it is that change and only that change, 7 added lines in `cmd/musterd/main.go`, nothing removed. Cross-read `Classify` to confirm the `Remedy != ""` guard selects exactly `homebrew` and `unmanaged`. `daemon-implementation.md`'s Fix Attempt 1 pastes a real startup log from a `v0.1.0` build staged under a scratch `HOMEBREW_PREFIX` showing both `install=homebrew` on the starting line and the remedy line following it, plus scratch cleanup. `make test`, `make lint`, `go build ./...` all re-run green here |
| cycle 1 Major 1 `[orchestrator]` — design-system §5 Modal falsely said the Settings dialog holds "only the theme picker" | `a5aa53e` | The word "only" is gone; the replacement describes the Updates fieldset, the 6px `--fg-muted` dot and the `Settings, update available` name, and explains why the dot is neutral rather than `--amber`/`--rose`. Every claim checked against `web/index.html`, `web/src/style.css` and `web/src/render/update.ts` — all accurate |
| cycle 1 DOC row — missing `README.md` "Updating" paragraph | `a5aa53e` | Present at `README.md:53-63`, covering Settings → Update, `musterd -update`, and `brew upgrade musterd`, which is what the plan's Doc-upkeep list asked for. Claims verified as above |

Scope check: `git diff fca6bec..HEAD` touches `README.md`, `cmd/musterd/main.go`,
`docs/design/design-system.md`, and three files under `plans/auto-update/`. No test file, no
`web/src`, no `internal/`. The single `cmd/` change is inside the Minor's stated scope, so §9's
condition for reopening the §3–§7 read is not met.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The first `make e2e` of this review failed one test —
   `web/e2e/terminal.spec.ts:235` (E12, "killing the stub's tmux session shows the ended
   placeholder"), a spec this plan did not author. It is a flake, not a regression, and I
   confirmed that rather than assuming it: the only production change since cycle 1's green
   302/302 run is two logging statements in `cmd/musterd/main.go`, which cannot affect PTY EOF;
   the test passed 3/3 in isolation in under 900 ms each against its own 15-second timeout; and
   an immediate second full `make e2e` was 302/302 green. The spec's own comment at
   `terminal.spec.ts:243-247` documents exactly this: "transient timeouts only under full-suite
   parallelism". No change requested here, but it is worth knowing that the suite has a
   real, if low-rate, parallelism flake in the terminal-attach path — roughly 1 run in 2
   observed today.
2. **[note]** REQ-28 ships without a unit test. `daemon-implementation.md` states plainly that
   no test file changed, and the requirement is instead evidenced by a pasted real startup log.
   I accept that: the assertion available to a test is the field set of one log event, which is
   brittle to write and tests the logger more than any logic, and Muster's testing bar reserves
   unit tests for specific logic. The remedy-selection logic that actually matters is already
   covered by D13's `Classify` tests.
3. **[note]** The README's "the dialog says so instead of offering the buttons" describes a
   Homebrew install where both buttons are rendered but disabled, not absent — absent is the
   `dev` case. I read that as accurate (a disabled button is not an offer) and want no change,
   but flagging it since a reader could expect no buttons at all.
4. **[note]** D6 is the one authored check whose result depends on the reviewer's environment:
   `goreleaser` is not on `PATH` here or in the gates runner, so the runner prints FAIL. The
   command itself passes. Nothing to fix in the plan, but any future reviewer will hit the same
   line and should re-run it with `~/go/bin` on `PATH` before believing it.
5. **[note]** Cycle 1's five notes all still stand and are not repeated here: E11's repair
   trading two UI clicks for two direct POSTs, D21's `runUpdate` seam, D22's control-flow-only
   proof, the `aead.dev/minisign` module path, and `-update-base-url ""` being unreachable.
   None were requests for work then and none are now.
6. **[note]** M1 remains unverifiable before landing by construction: the first real release
   carrying a `.minisig` is a post-landing ritual, recorded in `docs/release-signing.md`. The
   `signs:` block has no error suppression and no `continue-on-error`, so a missing secret
   fails the release loudly rather than shipping unsigned — that much was verified in cycle 1
   and is unchanged.
