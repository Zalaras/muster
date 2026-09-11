# Review: auto-update

**Plan**: auto-update
**Verdict**: needs-changes

One agent-tagged Minor (REQ-28, an unimplemented plan requirement) and one `[orchestrator]`
Major (a now-false sentence in `docs/design/design-system.md`). No Critical issues, no test
failures, hard-rule checklist clean, every authored check passes, browser verification done.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `updateCheck` pref persisted/echoed | Yes — `internal/server/prefs.go`, `state.go` | Yes — `prefs_test.go`, `protocol.test.ts` | pass |
| REQ-2 pref off ⇒ zero requests | Yes — `update.go:198-208` | Yes — D14, E2; **measured in browser** | pass |
| REQ-3 off clears, on checks immediately | Yes — `SetCheckEnabled` | Yes — D15, D16, E3; measured | pass |
| REQ-4 async first check + interval | Yes — `Start`/`loop` | Yes — D14, E1, E14 | pass |
| REQ-5 `/latest` redirect, base URL seam | Yes — `selfupdate/release.go` | Yes — D8, E1 | pass |
| REQ-6 strictly newer only | Yes — `checkAvailability` | Yes — D9, E10; measured (0.2.0 > 0.1.0) | pass |
| REQ-7 failed check silent, 10 s timeout | Yes — debug log, `CheckTimeout` | Yes — D17, D26 | pass |
| REQ-8 non-release ⇒ `dev` | Yes — `Classify` guard first | Yes — D7, D13, E8 | pass |
| REQ-9 badge + accessible name | Yes — `renderSettingsBadge` | Yes — E1, W5; measured | pass |
| REQ-10 Updates section | Yes — `index.html`, `render/update.ts` | Yes — E1; measured | pass |
| REQ-11 restart confirm names shells | Yes — `renderRestartImpact` | Yes — E5, E6; measured | pass |
| REQ-12 phase broadcast + failure text | Yes — `setApplyPhase` | Yes — D19, E4, E7; measured | pass |
| REQ-13 buttons absent/disabled per kind | Yes — Text rules | Yes — E8, E9, E13 | pass |
| REQ-14 asset naming + 120 s timeout | Yes — `apply.go` | Yes — D26, E4 | pass |
| REQ-15 minisign both modes | Yes — `verify.go` | Yes — D10 | pass |
| REQ-16 SHA-256 against signed line | Yes — `ChecksumFor` | Yes — D10, E7 | pass |
| REQ-17 temp beside real path, rename | Yes — `installBinary` | Yes — D11 | pass |
| REQ-18 failure leaves binary identical | Yes | Yes — D10, D11, E7; **measured in browser** | pass |
| REQ-19 in-place re-exec | Yes — `errRestart` + `reexec` | Yes — D22, E5, E6, E12 | pass |
| REQ-20 apply serialisation | Yes — mutex + flock | Yes — D12, D18, E11 | pass |
| REQ-21 install classification | Yes — `install.go` | Yes — D13, E9, E13; measured (`installer`) | pass |
| REQ-22 `musterd -update` | Yes — `cmd/musterd/update.go` | Yes — D21, E14 | pass |
| REQ-23 `signs:` block + CI secrets | Yes — `.goreleaser.yaml`, `release.yml` | D6 `goreleaser check`; M2 read | pass |
| REQ-24 no unsigned fallback | Yes | Yes — E7; **measured in browser** | pass |
| REQ-25 restart-only apply skips download | Yes — `RequestApply` skip conditions | Yes — E15 | pass |
| REQ-26 out-of-band swap detection | Yes — `checkSwap` | Yes — D24, E14 | pass |
| REQ-27 `restart-impact` endpoint | Yes — `handleRestartImpact` | Yes — D23, E6; measured | pass |
| REQ-28 startup log names install kind | **No** | — | **FAIL** (Nice to Have — Minor 1) |

## Build & Tests

E2E tests: pass (302 passed, 0 failed, 0 skipped — full suite, not just this plan's spec)
Daemon tests: pass (all 18 packages green)
Web tests: pass (1424 in 30 files)
Daemon build: pass
Web build: pass
Lint: pass (`0 issues.`)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | negative grep for release-URL construction outside `internal/selfupdate` | pass |
| D5 | `test -s internal/selfupdate/minisign.pub` | pass |
| D6 | `goreleaser check` | pass (via `~/go/bin/goreleaser`) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make contrast` | pass |
| W4 | `make e2e-lint` | pass |
| E1 | `make e2e` | pass |
| DOC | plan's Doc-upkeep list | **FAIL** — `TODO.md` follow-up item, `SPEC.md` changelog + §5 stack row (corrected to `aead.dev/minisign`) and `docs/protocol.md` §3.3/§3.17/§3.18/§5.2/§5.7 are all present and correct. Missing: the `README.md` "Updating" paragraph, and the `docs/design/design-system.md` §5 Modal note (see Major 1). |

All 11 authored checks were run through `gates.sh --checks-only`, one `PASS` line each, zero failures.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7–D26 | unit-level claims | pass | read `internal/selfupdate/*_test.go`, `internal/server/update_test.go`, `cmd/musterd/update_test.go`; `make test` green. Two scope decisions weighed — see Notes 2 and 3 |
| W5 | full Text-rules table test | pass | `render/update.test.ts` has both column tests and a literal 224-case cross-product grid |
| W6 | `parseMessage` tolerates missing `update`/`updateCheck` | pass | `parseSnapshot` defaults `update` to null, `parsePrefs` defaults `updateCheck` to true; 13 + 5 cases in `protocol.test.ts` |
| W7 | no `any` in new web code | pass | grepped every file in `web-implementation.md` for `: any`, `<any>`, `as any` — zero hits |
| W8 | badge/status use neutral tokens only | pass | `.update-dot` is `var(--fg-muted)`; status is `#settings-form .hint` (`--fg-muted`). Measured in a live browser: computed dot background `rgb(178, 182, 195)` = `--fg-muted` `#b2b6c3` exactly, not `--amber`/`--rose` |
| W9 | confirm dialog is a 440 px `.modal.confirm` | pass | measured `width: 440px`, `aria-labelledby` resolves to its `<h2>`, footer Cancel-then-primary order matches `#end-dialog` |
| W10 | no optimistic local state | pass | `main.ts` handlers only POST/PUT; `updateToggle.checked` is written only by `setChecked`, called only from `applyPrefsFromSnapshot`; `restartBtn.textContent` comes from the broadcast-derived view model |
| E2–E15 | each spec exists and passes | pass | all 15 present in `web/e2e/update.spec.ts`, all green under `make e2e` |
| M1 | first real release carries `.minisig` | **not verifiable now** | Post-landing ritual by construction. `docs/release-signing.md` records it, and the key fingerprint `647ADECB8044F4A2` |
| M2 | `signs:` block has no error suppression | pass | `.goreleaser.yaml:48-54` has no `ignore_errors`; `release.yml`'s three added steps carry no `continue-on-error`. A missing secret makes `minisign -S` fail and fails the release |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — `internal/selfupdate` imports nothing from `internal/claudecode`; D4's negative grep is green; no Claude-Code field name appears in new code |
| 2 | Terminal-output state parsing | pass — no `capture-pane` anywhere in the new code |
| 3 | Blocking hook handler | pass — no ingest path touched |
| 4 | Bare tmux | pass — `s.tmuxLister = tmux.New(cfg.TmuxSocket)`, socket-scoped; no `resize-pane` added |
| 5 | Payload logging | pass — new logs carry versions, tags and errors only |
| 6 | Empty-gauge dishonesty | pass — `unknown` / `not checked yet` / `checking disabled` / `not checked (development build)`, never `0%` or blank |
| 7 | Session identity on `session_id` | pass — `restart-impact` keys on the tmux session name via `tmux.IsShellSessionName` |
| 8 | Settings trespass | pass — no read or write of `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | Real `claude` outside canary | pass — `update.spec.ts` synthesizes no Claude payload and launches no real `claude`; every minisign fixture uses a disposable in-process keypair |

Design-system compliance also checked: no colour literal, font stack or spacing hard-coded in
components; the three `hidden` toggles (`.update-dot`, both apply buttons) each have a
`[hidden] { display: none; }` companion; `.update-versions dd` sets `font-variant-numeric:
tabular-nums`; exactly one filled-amber primary action per surface (`Update and restart` in the
Settings modal, `Restart` in the confirm); no web font added; §6 honesty rules and §7 terminal
rules untouched by this plan.

## Manual Verification

Built a real release-versioned pair (`0.1.0` staged outside the repo so it classifies
`installer`, `0.2.0` published as a tar.gz plus `checksums.txt`), stood up a local fake release
server that redirects `/latest` to `v0.2.0` and deliberately 404s `checksums.txt.minisig`, ran
the staged daemon against it, and drove the dashboard in a real headless Chromium.

Confirmed by hand, not by trusting a test:

- **Badge.** `aria-label="Settings, update available"`, `data-update="available"`, dot visible
  with computed `display: block` and background `rgb(178, 182, 195)`.
- **Dialog.** Legend `Updates`; `Running` reads `v0.1.0`; `Available` reads `v0.2.0`; toggle
  checked and enabled with the label `Check for updates daily`; both buttons visible and
  enabled; `aria-busy` absent. The version comparison is genuine semver against a real
  redirect, not a fixture string.
- **Refusal.** Clicking **Update** produced `Update failed: downloading checksums.txt.minisig:
  status 404 — this release has no signature, refusing to apply`. The staged binary's SHA-256
  was byte-identical before and after (`976aa662…9127` both times), no `.musterd-v0.2.0.tmp`
  was left behind, and both buttons were re-enabled. That is REQ-24 and INV-3 measured, not asserted.
- **Confirm.** **Update and restart** opened a 440 px dialog titled `Restart musterd?` reading
  `No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the
  restart.`, with Cancel and Restart. Cancel closed it and started nothing.
- **Toggle off.** Unchecking gave `Available: checking disabled`, dropped the badge and removed
  the `aria-label`, and the fake server's `/latest` count stayed at 12 across three further
  5-second tick intervals — REQ-2 and INV-1 measured.
- No console errors at any point. `GET /api/state` returned `install: "installer"`,
  `available: null`, `checkedAt: null`, `apply.phase: "failed"` with a non-null error and a
  non-null version, so INV-4 holds on a real wire read.

The in-place restart itself was not driven by hand — a successful apply needs a signed release,
and this reviewer must not touch the private key. E5, E6, E12 and E15 cover it under `make e2e`,
and they pass.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `docs/design/design-system.md` §5 Modal now states something false about
   shipped behaviour: "the **Settings** dialog is 440px and holds, in v1, **only** the theme
   picker … plus a one-line hint and a Close button". As of this plan it also holds the Updates
   fieldset. The word "only" makes the sentence wrong, not merely incomplete — a reader
   checking the design authority would conclude the Updates section is off-spec. The plan's own
   Doc-upkeep list already asks for exactly this edit ("the Settings dialog now holds the theme
   picker **and** the Updates section; note the neutral badge dot on the Settings button"), so
   it is orchestrator-owned and does not block approval. Fix in the same pass as the missing
   `README.md` "Updating" paragraph, which the same list calls for.

### Minor

1. **[daemon-impl]** REQ-28 is not implemented — `cmd/musterd/main.go`. The startup log line
   (`main.go:300-306`) carries version, port, data dir, dashboard URL and tmux version, but
   never the install kind, and never the `homebrew`/`unmanaged` remedy. Grepped: no log
   statement anywhere reads `install.Kind`. This is the plan's only undelivered requirement and
   `daemon-implementation.md` does not record dropping it. It is one line — add
   `.Str("install", string(install.Kind))` to the existing `musterd starting` event, plus a
   single `log.Info()` naming `install.Remedy` when it is non-empty. It has real value: a
   Homebrew or unmanaged user who never opens the Settings dialog otherwise never sees the
   remedy REQ-21 computes for them.

### Notes

1. **[note]** E11's repair replaced two UI button clicks with two direct authenticated POSTs,
   so the spec no longer matches the plan's literal wording ("two pages click **Update**"). I
   accept it. The product deliberately disables **Update** on every window the moment the first
   apply's `downloading` broadcast lands, which is correct per the Text rules and W10, so the
   plan's scenario is not reachable through Playwright's actionability wait. REQ-20 is worded
   about the POST, not the click, and the repair proves it more directly: two genuinely
   concurrent requests, both 202, exactly one archive download, and both real browser pages'
   dialogs converging on `Updated to v0.2.0…` over their own websockets. E4 already proves the
   click reaches the endpoint. Nothing is vacuous and no assertion was deleted or weakened —
   repairs 1, 2, 4 and 5 all check out too, and repair 1 was proven red against a deliberately
   broken product before being accepted.

2. **[note]** D21 is verified through `runUpdate` rather than `run()` for the two file-touching
   scenarios. The reasoning in `daemon-tests.md` is sound and I confirmed it: under `go test`,
   `run()` resolves `os.Executable()` to the running test binary, so a successful install would
   overwrite it mid-run. `TestRun_UpdateFlag_SafeSubset` still drives the literal
   `run([]string{"-update", …})` call for the three scenarios that provably never write a file.
   Coverage of D21's substance is complete.

3. **[note]** D22's "never calls `resolveOnExit`" is established by control flow, not by an
   assertion. I read `cmd/musterd/main.go` and confirmed the `case <-srv.RestartRequests():`
   arm returns `&errRestart{}` before the `select` block ends, and `resolveOnExit` is only
   reached after it — the two are mutually exclusive with no state a test could toggle. Making
   it observable would need a call counter in production code, which a test agent may not add.
   Accepted. The "unsets `MUSTER_RESTARTED`" sub-clause is likewise only indirectly covered
   (the read is proven by auto-open suppression in a real pty subprocess; the unset is not
   independently observable on macOS). Both were flagged honestly rather than claimed.

4. **[note]** `docs/conventions.md` and `SPEC.md` both now say `aead.dev/minisign`, matching
   what `go.mod` actually pins. The plan text still says `github.com/aead/minisign`; that is
   the plan as approved and correctly left alone. daemon-impl's measurement (`go get` failing
   with "module declares its path as: aead.dev/minisign") is recorded inline in
   `docs/conventions.md`, which is the right place for it.

5. **[note]** `musterd -update -update-base-url ""` is not special-cased: `runUpdate` builds
   `"/latest"` and fails with a transport error rather than the "updates are disabled" message
   REQ-5's prose implies. Unreachable in practice — the flag defaults non-empty for a release
   build, and every daemon that passes `""` is a dev build that exits earlier with "not a
   release build". No change requested.
