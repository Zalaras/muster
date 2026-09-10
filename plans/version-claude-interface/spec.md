# Spec: Version the Claude Code interface — a verified range, not a pin

**Plan**: version-claude-interface
**Created**: 2026-09-10
**Status**: Draft

## Goal

Replace the single pinned Claude Code version with a **declared, observed range**: a floor and
a ceiling that are derived from the list of versions `make canary` has actually gone green on,
surfaced to the user in support terms rather than developer terms, and extended automatically
by the canary itself.

Muster today assumes exactly one Claude Code wire format — the pin (`PinnedVersion`,
2.1.246). The user's `claude` auto-updates and may sit anywhere; "drift from pinned 2.1.246"
in the masthead means nothing to anyone who didn't set the pin
([#6](https://github.com/Zalaras/muster/issues/6)), and the pin bump is a manual ritual that is
currently outstanding (installed 2.1.267 went green on 2026-09-10; the constant still says
2.1.246). This is pre-v1 work: a shipped v1 has to say honestly which Claude Code versions it
has been verified against and what it does outside that.

**Explicitly not built in this run — decided 2026-09-10:** no version-gated adapters, no
change-point table, no in-built startup probe. There are **zero observed change points**:
every shape in `spikes/canary-fields.md` has held from 2.1.233 through 2.1.267 and every
recorded delta is an *addition*, so a gate would have nothing to gate and a probe nothing to
disambiguate. The seam for the first real change point is simply a parsed, comparable installed
version available inside `internal/claudecode` at startup; the branch is added by hand when a
red canary gives it a shape (see the red-run ritual below).

## Background & Context

- **SPEC §8 (Dependency posture)** still reads "pin the Claude Code version (disable
  auto-update)". That was reversed on 2026-08-16 (detect drift, don't freeze — there is one
  `claude` binary on the machine and it serves all of Damian's work). Landing this rewrites §8
  to the range posture and needs a §11 changelog entry.
- **`docs/claude-code-pin.md`** is the current ritual: green canary → bump the constant, README
  table and `canary-fields.md` header by hand; red → fix `internal/claudecode/` then bump.
- **`internal/claudecode/version.go`**: `PinnedVersion`, `InstalledVersion` (runs
  `<claude-bin> --version` with a `WaitDelay`, parses the leading semver), `CheckPin` (string
  equality → `VersionDriftError`). Consumed by `cmd/musterd/main.go:checkClaudeCode` (startup
  warning + the hello frame), `-version` (`"musterd X (pinned to Claude Code Y)"`), and
  `test/canary/canary_test.go:TestInstalledVersionMatchesPin`.
- **Protocol** (`docs/protocol.md` §5.1): `hello.claudeCode = {pinned, installed, drift}`;
  `installed`/`drift` are `null` when the startup check failed. Rule: additive fields don't
  bump `protocolVersion`, changing/removing a field does. The dashboard is embedded in the
  binary (plan `embed-dashboard`), so daemon and client always ship together; the only
  skewed client is a tab left open across a `musterd` upgrade, which already gets "reload the
  dashboard".
- **Dashboard**: `web/src/render/masthead.ts:renderClaudeVersion` renders the four states
  from `hello.claudeCode`; `web/src/protocol.ts:parseClaudeCode` validates the shape.
- **E2E**: the stub `claude` (`web/e2e/helpers/daemon.ts`, `STUB_CLAUDE_VERSION =
  "2.0.0-e2e-stub"`) answers `--version` with a deliberately unreal version. Under the range
  model every E2E run classifies as `below` unless the stub version is made a fixture knob.
- **Canary** (`test/canary/`, plan `canary-full-coverage`, done 2026-09-10): runs A/B/C×4/D/E
  against the *installed* binary (~2.5–3 min, 4 haiku turns), a static-binary tier and a live
  Keychain/usage tier; `MUSTER_CANARY_OFFLINE=1` is the zero-token path. The convention for a
  plan review is a full run saved to `plans/<name>/canary-run.log` once per review cycle.
- **Measured versions**: 2.1.233 (step-1 spikes, HTTP-hook era), 2.1.237 / 2.1.245 (probes),
  2.1.246 (first green `make canary`, first run of the production command-wrapper chain
  end-to-end), 2.1.259 (subagent-fields probe), 2.1.267 (full-coverage canary). The
  **floor is 2.1.246**, not 2.1.233: the chain that ships (command-wrapper hooks + envelope,
  `m4-hook-lifetime`) was never run on anything older, and the range is a record of
  observation, not a claim made in advance (Damian, 2026-09-07 and 2026-09-10).

## Scope

**In Scope:**

- **A — version model** in `internal/claudecode`: an observed-versions record as the single
  source of truth; floor/ceiling derived as its min/max; semver comparison; a startup
  classification (`unknown | below | verified | above`) replacing the equality drift check;
  warn-and-best-effort policy on both sides of the range (startup never fails on version).
- **D — canary lifecycle**: same-version runs skip (force flag to override); a green run
  outside the range appends the installed version to the observed list and regenerates the
  docs; `docs/claude-code-pin.md` rewritten around the green and red rituals.
- **E — inventory**: `spikes/canary-fields.md` header becomes the generated observed-versions
  table; rows whose applicability differs from the whole range gain `since`/`until`.
- **F — surfacing**: protocol 2 `hello.claudeCode = {installed, floor, verified, status}`;
  masthead wording per state with a hover-text warning icon (closes #6); `musterd -version`
  prints the range; startup log wording.
- **G — docs**: SPEC §8 + §11 changelog, README version table and "Version pinning" section,
  pin doc rewrite, TODO fold-in of the post-v1 "rethink the pin strategy" item.
- **Docs generation**: marker-bounded sections in `README.md`, `spikes/canary-fields.md` and
  the pin doc rendered from the observed list by a make target; `make check` fails when stale.

**Out of Scope:**

- Version-gated adapters, a `Shape` struct, a change-point table, per-surface gating hooks,
  or any test faking a divergence (list items B 7–11 of the 2026-09-10 interview). Nothing has
  diverged; build the branch when a red canary names it.
- An in-built startup probe, probe-result caching, or any process launch on the daemon's
  startup path beyond the existing `claude --version` (items C 12–14). Only needed to choose
  between adapters, and there are none.
- A multi-version canary rig / installing several `claude` builds. The canary keeps running
  against the installed binary only.
- Disabling Claude Code's auto-updater, or any read/write of `~/.claude/settings.json`.
- A dismiss control on the masthead warning (dropped 2026-09-10 — the icon + hover text is the
  whole UI).
- Committing from the bump script. It edits and stops; Damian commits with the run referenced.
- Transcript paths: nothing in the tree reads a transcript, so there is nothing to version.

## Requirements

### R1 — Single source of truth for observed versions
- One record in `internal/claudecode/` (Go literal or embedded data file — the plan decides)
  listing every Claude Code version the canary has gone green on: version, date, note.
  Initial rows: `2.1.246` (2026-08-29, plan `m4-canary`), `2.1.267` (2026-09-10, plan
  `canary-full-coverage`). 2.1.233/2.1.237/2.1.245/2.1.259 are probe evidence, recorded in the
  doc prose, not rows — they predate or bypass the production chain.
- `Floor()` and `Verified()` (the ceiling) are derived as the list's min and max. There is no
  independently editable floor/ceiling constant. `PinnedVersion` is removed.

### R2 — Classification replaces the pin check
- `InstalledVersion` is unchanged (leading `major.minor.patch`, suffix ignored, `WaitDelay`).
- `Classify(installed)` → `unknown` (check failed / unparseable), `below` (`< Floor()`),
  `verified` (`Floor() ≤ v ≤ Verified()`), `above` (`> Verified()`), by semver comparison.
- Versions strictly inside the range that were never individually run are still `verified` —
  the docs say plainly that intermediate versions are inferred.

### R3 — Policy: warn, best-effort, never refuse
- `below` and `above` both log a warning at startup and continue exactly as `verified` does;
  `below`'s wording adds the remedy (update Claude Code). `unknown` logs the existing "could
  not determine claude code version" warning. Startup never fails on version.

### R4 — Protocol 2
- `hello.claudeCode` becomes `{ installed: string|null, floor: string, verified: string,
  status: "unknown"|"below"|"verified"|"above" }`. `pinned` and `drift` are removed.
  `installed` is `null` iff `status` is `"unknown"`. `floor`/`verified` are always present.
- `protocolVersion` bumps 1 → 2; `docs/protocol.md` §5.1 and changelog updated; the client's
  unknown-version → "reload the dashboard" path is unchanged.
- The `/api/issue` capture's `drift` field (`internal/server/issue.go`) follows: it reports the
  `status` string instead of a boolean.

### R5 — Masthead (#6)
- `verified`: `claude <installed>`, no icon (as today).
- `above`: version + a warning icon; hover text "This Claude Code version has not been tested
  with Muster".
- `below`: version + the same icon; hover text "This Claude Code version has not been tested
  with Muster — please update Claude Code".
- `unknown`: "Claude installation unknown".
- No dismiss, no persistence.

### R6 — `musterd -version`
- Prints the musterd version and the verified Claude Code range, e.g.
  `musterd 0.7.0 (Claude Code verified 2.1.246–2.1.267)`, from R1.

### R7 — Canary skip and force
- `make canary` (non-offline) first compares installed with `Verified()`: equal and no force
  flag → exit green immediately without launching a session, spending tokens, or touching
  the Keychain; print why. A force flag (name per plan, e.g. `MUSTER_CANARY_FORCE=1`) runs
  everything regardless — this is the path plan reviews use for `canary-run.log`.
- The skip lives in `TestMain` and applies to the harness + live tiers. The static tier and
  compile always run. `MUSTER_CANARY_OFFLINE=1` behaviour is unchanged and never bumps.
- `TestInstalledVersionMatchesPin` is replaced by a parse-and-report test (installed version
  parses; classification logged).

### R8 — Green-run bump
- After a green non-offline run: if installed is `above`, append it to R1's list (new
  ceiling); if `below`, append it (new floor); if inside the range, do nothing. Then run the
  docs generator (R9). The tree is left **uncommitted**; the make target prints the diff
  summary and the commit hint. A red run edits nothing.
- The script refuses (non-zero, named reason) if R1's file already has uncommitted changes.
  Doc consistency is not the script's job — `make check` (R9) owns that.

### R9 — Generated doc sections
- A make target (`gen-versions` or equivalent) renders marker-bounded sections
  (`<!-- versions:start -->` … `<!-- versions:end -->`) from R1 into: the Claude Code row of
  the README version table and the range sentence in README "Version pinning"; the
  observed-versions table at the head of `spikes/canary-fields.md`; the range line in the pin
  doc.
- `make check` regenerates to a temp copy and fails with a named file when committed text is
  stale.

### R10 — Rituals and docs
- `docs/claude-code-pin.md` rewritten (rename to e.g. `docs/claude-code-versions.md` is the
  plan's call; update every reference if so): why there is a range; green run → automatic
  extend (R8), commit it; red run → real interface change: add the version branch by hand in
  `internal/claudecode/` keyed off the classified version, keep the old code, extend the canary
  for the new shape, record `since`/`until` in `canary-fields.md`, then re-run; the force-flag
  review convention; the residual manual `/interface-probe` rituals carried over.
- SPEC §8 dependency posture rewritten to the range posture; §11 changelog entry.
- README "Version pinning" reworded (range, auto-extend, no auto-update freeze).
- `spikes/canary-fields.md`: rows whose applicability differs from the whole range gain
  `since`/`until` (subagent fields, `session_title`/`session_name`, optional
  `permission_suggestions`); the header states once that all other rows have held across the
  range.
- TODO: this item ticked; the post-v1 "rethink the pin strategy itself" item folded in and
  ticked; #6 closed by the `/land` commit.

### Non-functional / constraints
- Everything Claude-Code-specific stays in `internal/claudecode/` (hard rule). `cmd/musterd`
  and `internal/server` consume the classification and the derived range only.
- No new process launches at daemon startup; the existing `--version` call is the only probe.
- No real `claude` in unit or E2E tests (existing rule) — the E2E stub's `--version` reply
  becomes a fixture parameter.
- Hard rules on canary token spend unchanged: haiku only, trivial prompts, sessions killed.

## Edge Cases & Considerations

1. `claude --version` fails, hangs (existing 5 s timeout + `WaitDelay`) or is unparseable →
   `status: "unknown"`, `installed: null`, floor/verified still on the wire; masthead "Claude
   installation unknown"; startup continues.
2. Suffixed versions (`2.0.0-e2e-stub`, a future `2.2.0-beta`) parse as their leading
   `major.minor.patch`; comparison ignores the suffix. Non-semver garbage → `unknown`.
3. `MUSTER_CANARY_OFFLINE=1` never bumps and never skips the static tier.
4. Same-version skip vs. adapter changes: a change to `internal/claudecode/` on an unchanged
   install must be verified with the force flag — the pin doc says so, and the review
   `canary-run.log` convention names the flag.
5. Rollback inside the range (`claude update 2.1.250`): not the ceiling → runs (no skip); green
   → no bump, since the range already covers it.
6. Green below the floor (e.g. 2.1.240): floor moves down — the same append rule as the
   ceiling; one rule, no special case.
7. Hand edits to generated sections: `make check` fails until reverted or made in R1.
8. Uncommitted changes to R1's file when the bump script runs: refuse with a named reason.
9. E2E default stub version `2.0.0-e2e-stub` classifies as `below`; the fixture knob lets
   specs set the stub to `Verified()` (read from the hello frame or passed in), above it, or
   make `--version` exit non-zero for `unknown`.
10. Versions between observed points were never run; the docs say so. If a red run ever
    lands on an intermediate version, that version becomes the change point and the range
    splits per the red ritual — not this plan's concern beyond documenting the honesty.
11. Protocol 2: a dashboard tab left open across the upgrade shows "reload the dashboard"
    via the existing path; no compatibility shim for protocol 1.

## Acceptance Criteria

- [ ] `internal/claudecode` has one observed-versions record; `Floor()`/`Verified()` are
      derived as its min/max; no separately editable floor/ceiling constant exists;
      `PinnedVersion` is gone. Initial rows: 2.1.246 (2026-08-29), 2.1.267 (2026-09-10).
- [ ] `Classify(installed)` returns exactly one of `unknown | below | verified | above` by
      semver comparison of the leading `major.minor.patch`; unit tests cover each, including a
      suffixed version, an intermediate never-run version (→ `verified`), and an unparseable one.
- [ ] Startup logs the classification; `below` and `above` warn with the user-facing wording;
      startup never fails on version (E2E: stub `--version` exiting non-zero still yields a
      serving daemon with `status: "unknown"`).
- [ ] `hello` is protocol 2 with `claudeCode: {installed, floor, verified, status}`; `pinned`
      and `drift` are gone from the wire and from `web/src/protocol.ts`; `docs/protocol.md`
      §5.1 and changelog record the break; the unknown-protocol "reload the dashboard" path
      is exercised by a test.
- [ ] Masthead renders the four states per R5 (observed DOM in E2E for each, via the
      stub-version fixture knob); no dismiss control exists.
- [ ] `musterd -version` prints the verified range from the same source (output pasted).
- [ ] `make canary` with installed == `Verified()` and no force flag exits green without
      launching a session or spending tokens (run log shows the skip reason and no run A–E);
      with the force flag every tier runs. `MUSTER_CANARY_OFFLINE=1` still compiles + runs the
      static tier and never edits anything.
- [ ] A green non-offline run outside the range appends the installed version to the record
      and regenerates the docs, leaving the tree uncommitted (evidence: run log + `git diff`
      summary); inside the range → no edit; a red run edits nothing; a dirty R1 file → the
      script refuses with a named reason.
- [ ] `TestInstalledVersionMatchesPin` is replaced by a parse-and-report test; the skip lives
      in `TestMain`.
- [ ] The docs generator renders marker-bounded sections in `README.md`,
      `spikes/canary-fields.md` and the pin doc; `make check` fails naming the stale file
      when one is hand-edited (evidence: the failing output).
- [ ] The pin doc is rewritten around the green (automatic extend) and red (by-hand change
      point) rituals plus the force-flag review convention; SPEC §8 reworded with a §11
      changelog entry; README "Version pinning" reworded.
- [ ] `canary-fields.md` rows whose applicability differs from the range carry `since`/`until`;
      the header states once that all other rows held across it.
- [ ] `/land` closes #6; the post-v1 "rethink the pin strategy itself" TODO item is folded in
      and ticked alongside this one.

## References

- `TODO.md` — "Version the Claude Code interface" (pre-v1), including the 2026-09-07 mechanism
  notes and the 2026-09-09 parking note; "Version-pin warning is developer-facing"
  ([#6](https://github.com/Zalaras/muster/issues/6)); post-v1 "rethink the pin strategy itself".
- `SPEC.md` §8 Dependency posture; §11 entries 2026-08-29 (pin 2.1.233 → 2.1.246) and
  2026-09-10 (`canary-full-coverage`).
- `docs/claude-code-pin.md`; `docs/protocol.md` §1 (versioning rule), §5.1 (`hello`).
- `spikes/canary-fields.md` (header + versions cited inline); `spikes/FINDINGS.md`.
- `internal/claudecode/version.go`; `cmd/musterd/main.go:checkClaudeCode`;
  `internal/server/ws.go:claudeCodeWire`; `internal/server/issue.go` (`drift` field);
  `web/src/render/masthead.ts:renderClaudeVersion`; `web/src/protocol.ts:parseClaudeCode`;
  `web/e2e/helpers/daemon.ts:STUB_CLAUDE_VERSION`; `test/canary/canary_test.go`.
- Interview 2026-09-10: the 28-item full-mechanism list; A/D/E/F/G taken, B/C dropped.
