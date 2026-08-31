# Plan: embed-dashboard

**Created**: 2026-08-31
**Status**: completed
**Work Type**: full-stack (web side is build configuration only — no dashboard logic changes)
**E2E Scope**: new-specs
**Description**: Embed the built dashboard into the musterd binary so the daemon ships as a single self-contained executable, with the on-disk `-web-dist` path kept as a dev override.

## Overview

Today `musterd` serves the dashboard from disk: `internal/server/server.go` routes `/` to
`http.FileServer(http.Dir(s.webDist))`, `-web-dist` defaults to the Vite output directory,
and a binary copied anywhere else silently serves 404s at `/`. This plan makes the binary
self-contained: Vite builds into `internal/webui/assets/`, a new `internal/webui` package
embeds that directory via `//go:embed all:assets`, and the serving precedence becomes
**`-web-dist` set → disk (dev override, behaviour unchanged); `-web-dist` unset (new
default `""`) → embedded FS**. A binary built without a prior web build **fails fast at
startup** with an actionable message instead of serving silent 404s.

This is the precondition for the CI/GoReleaser follow-up (SEPARATE plan — no workflow
files, no `.goreleaser.yaml`, no version changes here). It amends the M0 SPEC decision
"Static assets are served from disk, not `go:embed`" — that decision explicitly ends
"Revisit only if a self-contained binary ever matters" (SPEC.md changelog, 2026-08-22
entry), and it now does; the orchestrator's doc-upkeep records the amendment.

**Path contract for parallel agents**: the built dashboard lives at
`internal/webui/assets/` (repo-relative). daemon-impl embeds it, web-impl points Vite at
it, e2e-specs points the harness at it. Nobody invents a different path.

All Go dependencies are pure Go; `CGO_ENABLED=0` already works. There is no CGO problem
in this plan.

## Requirements

### Must Have
- [ ] REQ-1: New package `internal/webui` embeds `internal/webui/assets/` via `//go:embed all:assets`, exposing the asset tree rooted at `assets/` (via `fs.Sub`) and a way to ask whether a built dashboard (an `index.html`) is actually embedded.
- [ ] REQ-2: Serving precedence in `internal/server`: `-web-dist` non-empty → `http.Dir` from disk exactly as today; empty → `http.FileServer` over the embedded FS. Flag default flips from `"web/dist"` to `""`.
- [ ] REQ-3: Startup fail-fast: `-web-dist` unset **and** no `index.html` in the embedded FS → `musterd` exits non-zero before listening, with a message naming both remedies (`make web-build` before building, or pass `-web-dist`).
- [ ] REQ-4: A fresh clone passes `go build ./...` with no `npm install`/build: `internal/webui/assets/.gitkeep` is committed (the `all:` prefix matches dotfiles, so the embed pattern always resolves), with a `.gitignore` carve-out ignoring the directory's contents but not `.gitkeep`.
- [ ] REQ-5: `web/vite.config.ts`: `build.outDir` → `../internal/webui/assets`, `build.emptyOutDir: true` (outDir is outside the Vite root, so this must be explicit — and without it stale hashed bundles accumulate into the binary), plus a small inline plugin that rewrites `.gitkeep` in `closeBundle` so every build — `npm run build` or via make — leaves the committed file in place and the tree clean.
- [ ] REQ-6: Makefile updated: `web-build` help text names the new output dir; `e2e` prerequisites become `web-build build` **in that order** (the binary must embed fresh assets before the embedded-serving spec runs); `run` serves the disk override (`./$(BIN) -web-dist internal/webui/assets`) so the dev loop keeps iterating the frontend without a Go relink; `clean` removes `bin` and the contents of `internal/webui/assets/` **except `.gitkeep`** (post-clean `go build ./...` must still pass).
- [ ] REQ-7: E2E harness: `web/e2e/helpers/daemon.ts`'s `webDist` constant (line 39, currently `join(repoRoot, "web", "dist")`) moves to `internal/webui/assets` — **the prior session's "already safe" claim was wrong**: the flag is passed explicitly, but the path it names stops being produced. The harness also gains an opt-in way to launch a daemon with no `-web-dist` flag at all, from a copy of `bin/musterd` placed in the scratch dir with `cwd` set there (the embedded-serving fixture).
- [ ] REQ-8: New Playwright spec (`web/e2e/embedded.spec.ts`): the copied binary, run from a directory containing no `web/`, no `internal/`, and no `-web-dist` flag, serves the working dashboard — auth flow, masthead renders, WS connects.

### Should Have
- [ ] REQ-9: When `-web-dist` **is** set but the directory has no `index.html`, log a startup **warning** (not fatal — `cmd/musterd/onexit_test.go:125` passes an empty `t.TempDir()` and must keep working; the disk path is an explicit dev override and stays permissive).

### Nice to Have
- (none)

## Protocol Contract

**No protocol changes.** No WS message or HTTP endpoint changes shape; the only change is
where the bytes behind `GET /` come from. `requireCookie` continues to gate the static
handler on both paths. Nothing to merge into `docs/protocol.md`.

## Schema Changes

No schema changes required.

## UI Specifications

No dashboard views, flows, or DOM change. The three-states rule is untouched. The new
E2E spec asserts **existing** surface only.

### Testable UI Elements

Existing elements, transcribed from `web/index.html` (not composed from memory):

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Masthead brand heading | `heading` | `Muster` | native `<h1>Muster</h1>` inside `.brand` |
| Connection status | `status` | — | explicit `role="status"` on `#connection-status`; text is connection-state-dependent — locator strategy and expected text are e2e-specs' call from the live DOM |

### Invariants

No runtime invariants of the m1 kind (no state machine, no per-session resource, no
multi-instance interaction is touched). The parity requirement — disk and embedded paths
serve the same content the same way — is reviewer-verified (R5) and functionally covered
by E1's browser load: module scripts are MIME-type-strict in browsers, so a Content-Type
regression on the embedded path fails the spec outright.

### Carried-over measurements

None. This plan carries no spike/FINDINGS values forward — nothing here touches hook
wire formats, tmux, or Claude Code behaviour.

## Affected Files

### Daemon (daemon-impl)
- `internal/webui/webui.go` — **new**: `//go:embed all:assets`, an accessor returning the `fs.Sub`-rooted FS, and a has-dashboard predicate. Factor the "does this FS contain index.html" logic as a function taking an `fs.FS` so the fail-fast branch is unit-testable (see Implementation Notes).
- `internal/webui/assets/.gitkeep` — **new**, committed, empty.
- `cmd/musterd/main.go` — `-web-dist` default `"web/dist"` → `""`, help text describes the override semantics ("serve the dashboard from this directory instead of the embedded copy"); startup validation: embedded-missing → fatal error (REQ-3), disk-missing-index → warning (REQ-9).
- `internal/server/server.go` — `routes()`: pick `http.Dir(s.webDist)` when non-empty, else `http.FS` over `internal/webui`'s embedded tree; `requireCookie` wrapping unchanged.
- `Makefile` — `web-build` help text, `e2e` prerequisite order (`web-build build`), `run` disk override, `clean` preserving `.gitkeep` (REQ-6).
- `.gitignore` — replace the effect of line 13: ignore `internal/webui/assets/*` with `!internal/webui/assets/.gitkeep`; keep the existing `web/dist/` line (stale checkouts may still have one lying around — a comment marks it historic).

### Web (web-impl)
- `web/vite.config.ts` — `outDir: "../internal/webui/assets"`, `emptyOutDir: true`, inline `keep-gitkeep` plugin (`closeBundle` writes an empty `.gitkeep` into the outDir via `node:fs`). Tooling/config is impl-owned per pipeline rules; e2e-specs never touches this file.

### E2E (e2e-specs)
- `web/e2e/helpers/daemon.ts` — `webDist` constant → `join(repoRoot, "internal", "webui", "assets")`; new `ScratchDaemonOptions` member (e.g. `serveEmbedded?: boolean`) that (a) copies `bin/musterd` into the scratch dir, (b) spawns that copy with `cwd` = scratch dir, (c) omits `-web-dist` entirely. Exact option shape is e2e-specs' call; the three behaviours are the contract.
- `web/e2e/embedded.spec.ts` — **new** (REQ-8/E1).

### Not listed anywhere above by design
- `SPEC.md`, `TODO.md`, `.claude/skills/dev-loop/SKILL.md`, `.claude/skills/orchestrate/SKILL.md`, `.claude/agents/e2e-specs.md` — orchestrator doc-upkeep, see Implementation Notes.
- `web/src/**` — untouched; the web-tests track has nothing to test (no new TS logic) and should report that rather than invent tests.
- `cmd/musterd/onexit_test.go` — genuinely safe (passes `t.TempDir()` explicitly); must keep passing unmodified. REQ-9 is a warning, not an error, precisely so this holds.

## Edge Cases

1. **Binary built without a web build, run with no `-web-dist`** — fatal at startup (REQ-3). This replaces today's silent-404 failure mode, which is the pain this plan exists to remove.
2. **`-web-dist` points at a missing or empty directory** — startup warning, then serve whatever is there (404s). Permissive by design: it's an explicit dev override, and `onexit_test.go:125` depends on an empty dir being accepted.
3. **Stale embedded assets** (Go build ran before the web build) — mitigated structurally: `make e2e` orders `web-build` before `build`; orchestrate/e2e-specs lore docs update from "make build web-build" to "make web-build build" (doc-upkeep). Residual risk is a human running `go build` by hand after editing TS — the same stale-tree trap that already exists with `web/dist`, no worse.
4. **`make clean` then `go build ./...`** — must pass: clean preserves `.gitkeep`, so the embed pattern still resolves.
5. **Tree cleanliness / `git describe --dirty`** — the Vite build empties the outDir (deleting `.gitkeep`) then the plugin rewrites it byte-identical in `closeBundle`; everything else in the dir is gitignored, so `git status` stays clean and `make build`'s `VERSION` never picks up a spurious `-dirty`.
6. **`/.gitkeep` is servable** on the embedded path (`all:` embeds dotfiles). Accepted: an empty file, behind `requireCookie`, single-user localhost daemon.
7. **`Last-Modified` divergence** — `embed.FS` files have zero ModTime, so the embedded path sends no `Last-Modified`/304s while the disk path does. Accepted as immaterial (hashed asset filenames, single user); noted so the review doesn't flag it as an unnoticed parity break.
8. **Make parallelism** — the `e2e: web-build build` ordering relies on make's serial default; nothing in this repo runs `make -j`. A one-line comment in the Makefile records the ordering as load-bearing.
9. Standing Muster edge cases (hook loss/duplication/reordering, `/clear` rebinds, daemon restart mid-session, pane death) — untouched by this plan; no session-logic code changes.

## Acceptance Criteria

IDs unique across the section — `D*` daemon, `W*` web, `E*` e2e. One clause per criterion.

### Daemon
- **D1**: `go build ./...` succeeds.
- **D2**: `make test` passes.
- **D3**: `make lint` passes.
- **D4**: git tracks exactly one file under `internal/webui/assets/` — `.gitkeep` — so a fresh clone materialises precisely the state D1 builds against.
- **D5** (reviewer): with `-web-dist` unset and no embedded `index.html`, startup exits non-zero with a message naming both `make web-build` and `-web-dist` (unit-tested against an injected empty `fs.FS` — see Implementation Notes; the real embed var can't exercise this branch after a web build).
- **D6** (reviewer): with `-web-dist` set to a directory lacking `index.html`, startup succeeds and logs a warning.

### Web
- **W1**: `make web-build` succeeds with the new outDir.
- **W2**: after W1, `internal/webui/assets/index.html` exists.
- **W3**: after W1, `internal/webui/assets/.gitkeep` exists (the plugin restored it after `emptyOutDir`).
- **W4**: after W1, `git status --porcelain` reports nothing under `internal/webui/assets/` (tree stays clean; VERSION stays un-dirty).

### E2E
- **E1**: a copy of `bin/musterd` in a scratch directory (no `web/`, no `internal/` anywhere near it), run with `cwd` = that directory and **no** `-web-dist` flag, serves the dashboard: auth succeeds, the `Muster` masthead heading renders, and the connection status reaches its connected state. (Module scripts are MIME-strict in browsers, so this also functionally pins Content-Type on the embedded path.)
- **E2**: the full existing Playwright suite passes with the harness serving from the new on-disk assets path — proving the disk override still behaves exactly as today.

### Automated Checks

Every line is `<ID> <single-line shell command>` run from the project root; pass = exit 0.
Order matters: W1 runs before the W2–W4 file assertions. No negative greps in this plan —
the "no stray `web/dist` references" sweep is reviewer-verified (R3) instead, because a
migration plan necessarily names the old path in prose and a grep gate would force agents
into m0-style contortions.

```checks
D1 go build ./...
D2 make test
D3 make lint
D4 [ "$(git ls-files internal/webui/assets)" = "internal/webui/assets/.gitkeep" ]
W1 make web-build
W2 test -f internal/webui/assets/index.html
W3 test -f internal/webui/assets/.gitkeep
W4 [ -z "$(git status --porcelain internal/webui/assets)" ]
E1 make e2e
```

(`make e2e` covers both E1 and E2 — the new spec and the existing suite run together, with
`web-build build` ordering guaranteed by the target's prerequisites.)

### Reviewer-Verified

- **R1**: `-web-dist` default is `""` and its help text describes override-vs-embedded semantics.
- **R2**: the fail-fast error message names both remedies (D5's message content), and the check is unit-tested via an injected `fs.FS`.
- **R3**: no remaining `web/dist` references in `Makefile`, `web/vite.config.ts`, `cmd/`, `internal/`, `web/src/`, `web/e2e/` (the `.gitignore` historic line and prose lore in `.claude/` docs are exempt — the latter are doc-upkeep, verified updated separately).
- **R4**: `web/vite.config.ts` has `emptyOutDir: true` and the `.gitkeep`-restoring `closeBundle` plugin.
- **R5**: serving parity by inspection: both branches are `http.FileServer` behind the same `requireCookie` wrapper; the only intended divergence is the zero-ModTime `Last-Modified` note (Edge Case 7).
- **R6**: `make clean` leaves `internal/webui/assets/.gitkeep` in place (post-clean D1 would still pass).
- **R7**: `web/e2e/embedded.spec.ts`'s fixture really runs a **copied** binary with scratch `cwd` and genuinely omits `-web-dist` (not an empty-string flag).
- **R8**: `web/src/**` untouched; `onexit_test.go` untouched.

## Implementation Notes

- **Testing the fail-fast branch**: after any web build, the real embed var *contains*
  `index.html`, so the missing-dashboard branch is unreachable from a normally-compiled
  test. Factor the predicate as a function over a caller-supplied `fs.FS` (e.g.
  `hasDashboard(fsys fs.FS) bool` checking `index.html`), unit-test it with `fstest.MapFS`
  (empty → false, with index.html → true), and have `main.go`'s validation call it with
  the real embedded FS. daemon-tests owns those unit tests.
- **`fs.Sub` error**: subbing a `//go:embed`-declared directory that provably exists can
  treat the error as impossible (panic in a package-level accessor is acceptable per
  existing patterns — but a returned error handled once in `main.go` is equally fine;
  daemon-impl's call).
- **Vite plugin sketch** (web-impl adapts):
  `{ name: "keep-gitkeep", closeBundle() { writeFileSync(new URL("../internal/webui/assets/.gitkeep", import.meta.url), ""); } }`
  with `import { writeFileSync } from "node:fs"`. Must run on every build path, which
  `closeBundle` does; don't hook `buildEnd` (fires before the emptied dir is written).
- **Makefile `run`** keeps the disk override so the dev loop (edit TS → `make web-build`
  → reload) needs no Go relink; the embedded path gets its coverage from E1, not `run`.
- **web-tests track**: nothing to test — no TS logic changed. The agent should verify
  `make web-test` still passes and report no new tests needed, not invent coverage.
- **SPEC amendment is anticipated, not a re-litigation**: the M0 decision's own text ends
  "Revisit only if a self-contained binary ever matters." Quote that clause in the
  changelog entry.
- **Out of scope, do not touch**: GitHub Actions, GoReleaser, `.goreleaser.yaml`,
  version-stamping changes, brew, anything release-flow. That is the follow-up plan.

### Doc upkeep (orchestrator — never an impl agent)

- `SPEC.md` changelog: entry amending the 2026-08-22 M0 decision — static assets now
  embedded by default, `-web-dist` demoted to dev override, fail-fast on assetless binary.
- `TODO.md`: tick the embed-dashboard item.
- `.claude/skills/dev-loop/SKILL.md` lines 19–20 and 40–41: `web/dist` → the new assets
  path; `-web-dist` default is now `""` (embedded); `make run` serves the disk override.
- `.claude/skills/orchestrate/SKILL.md` lines 226 and 322: the rebuild lore's ordering
  flips to "`make web-build build`" (assets before compile — a stale embed is the new
  version of the stale-`web/dist` trap it describes).
- `.claude/agents/e2e-specs.md` line 81: same lore — "prebuilt `web/dist`" becomes the
  prebuilt assets dir, and the ordering note.
