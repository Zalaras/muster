# Review: embed-dashboard

**Plan**: embed-dashboard
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `internal/webui` embeds `all:assets`, `fs.Sub`-rooted FS + has-dashboard predicate | Yes — `internal/webui/webui.go` (`FS()`, `HasDashboard(fs.FS)`) | Yes — `TestFS_RootedAtAssets`, `TestHasDashboard` (5 subtests), E1 | pass |
| REQ-2 Serving precedence: `-web-dist` non-empty → disk, empty → embedded; default flips to `""` | Yes — `internal/server/server.go:321-331`, `cmd/musterd/main.go:72` | Yes — `TestStaticServing_DiskOverride` / `_Embedded` (incl. a real no-fallback assertion), plus 157 pre-existing E2E specs on the disk branch and 4 new on the embedded branch | pass |
| REQ-3 Fail-fast: no `-web-dist` + nothing embedded → non-zero exit naming both remedies | Yes — `cmd/musterd/main.go:254-264` (`checkWebDist`), called before `os.MkdirAll` and before listening | Branch condition unit-tested (`TestHasDashboard`); fatal exit + message reviewer-verified hands-on this cycle (see Manual Verification). No automated regression guard on the message — Minor 2 | pass |
| REQ-4 Fresh clone `go build ./...` with no npm build | Yes — `internal/webui/assets/.gitkeep` committed, `.gitignore:29-33` carve-out | Yes — D1/D4, and verified post-`make clean` | pass |
| REQ-5 Vite `outDir`/`emptyOutDir`/`.gitkeep` plugin | Yes — `web/vite.config.ts` (`keep-gitkeep`, `closeBundle`) | Yes — W1–W4 against a real `vite build` | pass |
| REQ-6 Makefile: help text, `e2e: web-build build`, `run` disk override, `clean` preserves `.gitkeep` | Yes — `Makefile:38,44-51,56-58,65-67` | Yes — E1 (`make e2e`), R6 verified hands-on | pass |
| REQ-7 Harness `webDist` move + `serveEmbedded` fixture | Yes — `web/e2e/helpers/daemon.ts:41,81-91,220-236,279-318` | Yes — full suite green on the new path; fixture-sanity test asserts the absent trees | pass |
| REQ-8 New `web/e2e/embedded.spec.ts` | Yes — 4 tests | Yes — all 4 green in the full-suite run | pass |
| REQ-9 (Should) `-web-dist` set but no `index.html` → warning, not fatal | Yes — `cmd/musterd/main.go:255-261` | Yes — `TestCheckWebDist_DiskOverrideEmptyDir…`, `…MissingDirectory…`; `onexit_test.go` untouched and green; D6 verified hands-on | pass |

Protocol Contract: "No protocol changes." Confirmed by inspection — no ingest/WS/API handler
touched (`git diff main...HEAD -- internal/server/ingest*.go internal/claudecode` is empty),
`requireCookie` wraps both static branches identically, `docs/protocol.md` needs no delta.

## Build & Tests

E2E tests: **pass (161/161)** — full suite via `make e2e`, exit 0, including the 4 new `embedded.spec.ts` tests and all 157 pre-existing specs now exercising the disk override at `internal/webui/assets`
Daemon tests: **pass** — `make test`, all 11 packages ok (incl. new `internal/webui`)
Web tests: **pass (571/571, 20 files)** — `npm test`
Daemon build: **pass** — `go build ./...`, and again after `make clean`
Web build: **pass** — `tsc --noEmit && vite build`
Lint: **pass** — `golangci-lint run`, 0 issues

Repairs table in `test-specs.md`: "None. My spec passed on the first live run… No assertion
was deleted, skipped, or weakened." Verified independently — `git diff main...HEAD -- web/e2e`
contains no `test.skip`, `test.fixme`, or `.only`, and no assertion in `embedded.spec.ts` is a
bare container-level `toBeVisible()`: each targets a specific role plus text, status code, or
cookie attribute. The fixture synthesizes no Claude Code payloads at all (`helpers/payloads.ts`
untouched), so there is no wire-format-drift risk to check on this plan.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `go build ./...` | pass |
| D2 | `make test` | pass |
| D3 | `make lint` | pass (0 issues) |
| D4 | `[ "$(git ls-files internal/webui/assets)" = "internal/webui/assets/.gitkeep" ]` | pass |
| W1 | `make web-build` | pass |
| W2 | `test -f internal/webui/assets/index.html` | pass |
| W3 | `test -f internal/webui/assets/.gitkeep` | pass (0 bytes) |
| W4 | `[ -z "$(git status --porcelain internal/webui/assets)" ]` | pass |
| E1 | `make e2e` | pass (161 passed, exit 0 — covers E1 and E2) |

Every line was run verbatim from the repo root, in the plan's stated order.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | `-web-dist` default `""`, help text describes override-vs-embedded | pass | `cmd/musterd/main.go:72`: `fs.String("web-dist", "", "serve the dashboard from this directory instead of the embedded copy (dev override; empty uses the binary's embedded dashboard)")` |
| R2 | Fail-fast message names both remedies; check unit-tested via injected `fs.FS` | pass | Observed message: ``musterd: no dashboard embedded in this binary: run `make web-build` before building musterd, or pass -web-dist pointing at a built dashboard directory`` — both remedies present. The predicate seam the plan's Implementation Notes prescribe is `HasDashboard(fs.FS)`, unit-tested against 5 `fstest.MapFS` trees |
| R3 | No remaining `web/dist` references in Makefile, vite.config.ts, cmd/, internal/, web/src/, web/e2e/ | pass (one documented exception) | Grep finds 3 hits: two are explanatory prose comments in `web/vite.config.ts:10` and `web/e2e/helpers/daemon.ts:41` (the plan's own §Automated Checks anticipates prose naming the old path); one is `Makefile:66`'s `rm -rf bin web/dist`, a cleanup of the retired directory for stale checkouts — nothing in the build, serve, or test path names `web/dist` any more. See Minor 1 |
| R4 | `emptyOutDir: true` + `.gitkeep`-restoring `closeBundle` plugin | pass | `web/vite.config.ts:21-26,30-34`; `gitkeepPath` resolved from `import.meta.url` so it tracks `outDir`'s own relative resolution. W3/W4 confirm it fires on every build path |
| R5 | Serving parity by inspection; only intended divergence is zero-ModTime | pass | `server.go:325-330` — both branches are `http.FileServer`, both wrapped by the identical `requireCookie(s.uiToken, writeHTMLUnauthorized, static)`. Measured on a live embedded-serving binary: `/` → `text/html; charset=utf-8`, `/assets/index-*.js` → `text/javascript; charset=utf-8`, and **no** `Last-Modified` on either (exactly Edge Case 7, nothing else diverged) |
| R6 | `make clean` leaves `.gitkeep`; post-clean `go build ./...` passes | pass | Ran `make clean`; `find internal/webui/assets` → only `internal/webui/assets/.gitkeep`; `go build ./...` exit 0 |
| R7 | Embedded fixture runs a **copied** binary, scratch `cwd`, genuinely omits `-web-dist` | pass | `daemon.ts:228-235` `copyFile(musterdBin, embeddedBinPath)` + `chmod 0o755`; `:312` `spawn(this.serveEmbedded ? this.embeddedBinPath : musterdBin, …)`; `:314-318` `cwd: this.serveEmbedded ? this.dataDir : undefined`; `:293-297` `if (!this.serveEmbedded) { args.push("-web-dist", webDist); }` — the flag is omitted, not emptied. `startScratchDaemon` forwards `opts` unchanged (`:500-502`) |
| R8 | `web/src/**` and `cmd/musterd/onexit_test.go` untouched | pass | `git diff main...HEAD --stat -- web/src cmd/musterd/onexit_test.go` → empty |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (no Claude-Code-format knowledge outside `internal/claudecode/`) | pass — no `hook_event_name`/`rate_limits`/`permission_mode`/`transcript_path` in any file this plan touches; `internal/claudecode` untouched |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in any touched file; no state derivation added at all |
| 3 | Non-blocking hook handler | pass — no ingest handler or hook-timeout change (`internal/server/ingest*.go` diff empty) |
| 4 | tmux always on a dedicated socket; no `resize-pane` for sizing | pass — no new tmux invocation; every pre-existing harness call still uses `-S <scratch path>`; `resize-pane` appears nowhere in the tree |
| 5 | No payload logging | pass — the one new log line is `Warn().Str("web_dist", …)`, a directory path |
| 6 | No empty-gauge dishonesty | pass — no `web/src` change; verified in the browser that the embedded-served dashboard still renders `5h unknown` / `7d unknown` rather than `0%` |
| 7 | Session identity on the tmux target | pass — no `session_id` reference; no session logic touched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json` or `CLAUDE_CONFIG_DIR` reference (the `.gitignore` hit is a pre-existing comment about the committed project harness config) |
| 9 | No real `claude` outside canary/probes | pass — `embedded.spec.ts` launches no session at all; the fixture still points `-claude-bin` at the harness stub |

## Manual Verification

Built fresh (`make web-build && make build`), copied `bin/musterd` alone into
`/tmp/muster-selfcontained/` (a directory containing nothing but the binary and an empty
data dir — no `web/`, no `internal/`), and ran it from that `cwd` with **no** `-web-dist`
flag. Then drove it in real headless Chromium (repo Playwright build) at the printed
`/auth?token=…` URL:

- Redirect landed on `/` with **status 200**, `<title>` = `Muster`, `<h1>` = `Muster`.
- `role="status"` read **`connected`** — so the module script really executed and the
  WebSocket really opened off the embedded FS (module scripts are MIME-strict, which is
  the plan's own functional Content-Type proof).
- Cookie: one `muster_auth`, `httpOnly: true`, `sameSite: Strict`.
- **Zero** console errors / page errors.
- Screenshot inspected by hand: full CSS applied, masthead usage row reads
  `5h unknown  7d unknown  Fable ▮▮▮ 80% · resets Tue`, rail shows `No sessions yet`,
  main pane `No sessions yet — ⌘N to launch`. Nothing rendered a dishonest `0%`.
- Cookie-less second browser context on `/` → **401** with the relaunch page (R5 parity
  observed in a browser, not only asserted in the spec).

Headers measured by hand on that same live embedded binary: `/` → `text/html; charset=utf-8`,
`/assets/index-BdfCTTZN.js` → `text/javascript; charset=utf-8`, `/.gitkeep` → 200
`text/plain; charset=utf-8` (Edge Case 6, accepted), and no `Last-Modified` anywhere
(Edge Case 7 confirmed as the only parity divergence).

Also verified by hand, outside the test suites:

- **D5** — built an assetless binary (`make clean` then `go build -o /tmp/musterd-noassets
  ./cmd/musterd`) and ran it from `/tmp` with no `-web-dist`: exit **1**, message
  ``musterd: no dashboard embedded in this binary: run `make web-build` before building
  musterd, or pass -web-dist pointing at a built dashboard directory``. It also never
  created its `-data-dir` — the check genuinely precedes `os.MkdirAll` and listening.
- **D6** — same binary with `-web-dist /tmp/<empty dir>`: started normally, served
  `/healthz` → `{"status":"ok",…}`, logged exactly one warning
  (`-web-dist directory has no index.html; serving whatever is there web_dist=/tmp/…`),
  and shut down cleanly on SIGTERM.
- `musterd -version` returns **before** `checkWebDist` (`main.go:90-95` vs `:109`), so an
  assetless binary still answers `-version` — worth knowing for the CI follow-up's smoke
  checks.
- Tree state after all of the above: `git status --short` shows only the two pre-existing
  untracked files (`masthead.png`, `orchestration-state.json`); no build residue, and
  `make build` stamped `main.version=ea1f841` with no `-dirty` (Edge Case 5 holds).

Temporary artifacts (`/tmp/muster-selfcontained`, `/tmp/musterd-noassets`, the D6 dirs and
their tmux sockets) were removed and both test daemons killed.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** Doc upkeep from the plan's own list is still pending — all of it
   outside any impl agent's remit: `SPEC.md:668-670`'s M0 decision ("Static assets are
   served from disk (`-web-dist`), not `go:embed`… Revisit only if a self-contained binary
   ever matters") needs the changelog amendment quoting that clause;
   `.claude/skills/dev-loop/SKILL.md:19-20,41` still tells sessions the daemon serves
   `web/dist` and that `-web-dist` defaults to it; `.claude/skills/orchestrate/SKILL.md:225-226,322`
   and `.claude/agents/e2e-specs.md:78,81` still carry the `make build web-build` ordering
   lore and the "prebuilt `web/dist`" wording that this plan inverted. The rebuild-order
   lore is the load-bearing one: a wave-3 agent following it today compiles the binary
   before the assets exist and embeds a stale tree.
2. **[orchestrator]** `TODO.md` has **no** embed-dashboard item to tick (grepped for
   `embed`, `goreleaser`, `self-contained`, `single binary`, `dist`, `release` — nothing).
   The plan's doc-upkeep instruction "tick the embed-dashboard item" cannot be followed
   literally; add a completed entry instead. Minor plan defect, orchestrator's call.

### Minor

1. **[daemon-impl]** `Makefile:66` — `clean`'s `rm -rf bin web/dist` is the last live
   mention of the retired path, and unlike `.gitignore:11-12` it carries no `# Historic:`
   comment saying why. Keeping the removal is right (stale checkouts still have the
   directory); add the same one-line historic comment so R3's sweep and any future grep
   gate read unambiguously.
2. **[daemon-impl]** `cmd/musterd/main.go:263` — REQ-3's fatal branch has no automated
   regression guard, only my hands-on D5 check this cycle, because `checkWebDist` calls
   `webui.HasDashboard(webui.FS())` against the compile-time embed var, whose contents
   vary with build state (`daemon-tests.md` documents this honestly and correctly declines
   to write an environment-dependent test). A one-line seam fixes it inside the plan's
   stated design — `checkWebDist(webDist string, embedded fs.FS, log zerolog.Logger)` with
   `run()` still passing the real `webui.FS()` — after which daemon-tests can assert the
   fatal error and its two-remedy wording deterministically. Suggestion only; the
   requirement itself is verified.

### Notes

1. **[note]** The embedded tree now carries the 955 kB JS sourcemap (`sourcemap: true` is
   pre-existing in `web/vite.config.ts`, unchanged by this plan), so the shipped binary
   embeds the full TypeScript sources — ~5% of the 18.9 MB binary. Harmless and useful for
   debugging a personal tool whose source is in the repo anyway; no change requested, but
   the GoReleaser follow-up may want to decide it deliberately rather than inherit it.
2. **[note]** `make run`'s prerequisites are still `build web-build` while `e2e` was
   deliberately flipped to `web-build build`. Genuinely harmless today — `run` passes
   `-web-dist internal/webui/assets`, so the embed's freshness is irrelevant to it — and
   `daemon-implementation.md` records the decision. Worth remembering only if `run` ever
   stops passing the override.
3. **[note]** `internal/webui/webui_test.go`'s `TestFS_DoesNotPanic` is close to testing a
   platform guarantee (`fs.Sub` on a `go:embed`-proved directory). Cheap, and the package
   doc comment does claim "cannot fail in practice", so it reads as a deliberate guard on
   that claim rather than filler. No change requested.
4. **[note]** Unrelated to this plan, but visible during manual verification: the installed
   Claude Code is 2.1.251 against a pin of 2.1.246, and the masthead correctly shows
   `claude 2.1.251 (drift from pinned 2.1.246)`. The `make canary` ritual
   (`docs/claude-code-pin.md`) is the owner of that, not this plan.
