# Daemon Implementation: embed-dashboard

**Plan**: embed-dashboard
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/webui/webui.go` | created | New package: `//go:embed all:assets`, `FS()` returns the `fs.Sub`-rooted tree, `HasDashboard(fs.FS) bool` checks for `index.html` (factored to take an `fs.FS` param so daemon-tests can unit-test the fail-fast predicate against an injected `fstest.MapFS` — a real post-web-build embed always contains `index.html`). |
| `internal/webui/assets/.gitkeep` | created | Committed placeholder so `all:assets` always resolves on a fresh clone before any web build runs (REQ-4). |
| `internal/server/server.go` | modified | `routes()`: serving precedence — `s.webDist != ""` → `http.Dir` disk exactly as before; empty → `http.FS(webui.FS())`. Both wrapped by the same `requireCookie` unchanged. `Config.WebDist` doc comment updated to describe override-vs-embedded semantics. |
| `cmd/musterd/main.go` | modified | `-web-dist` default `"web/dist"` → `""`; help text describes override semantics (R1). New `checkWebDist` function: disk override missing `index.html` → `log.Warn` (REQ-9, permissive); embedded path with no dashboard → fatal error naming both remedies (`make web-build` / `-web-dist`) (REQ-3/R2), called before `os.MkdirAll` so it fires before any daemon state is touched and before listening. |
| `Makefile` | modified | `web-build` help text names `internal/webui/assets`; `e2e` prerequisite order flipped to `web-build build` (comment records the ordering as load-bearing, no `make -j` in this repo); `run` now serves `-web-dist internal/webui/assets` (disk override, unchanged dev-loop behaviour); `clean` now also does `find internal/webui/assets -mindepth 1 ! -name .gitkeep -delete` so `.gitkeep` survives (verified empirically, see Decisions). |
| `.gitignore` | modified | Added `internal/webui/assets/*` / `!internal/webui/assets/.gitkeep` carve-out; kept the `web/dist/` line with a "historic" comment per the plan's Affected Files note. |

## Decisions

- Verified `find internal/webui/assets -mindepth 1 ! -name .gitkeep -delete` actually preserves `.gitkeep` and removes nested subdirectories, not just top-level files: built a scratch tree with a `sub/a.js` file under `assets/`, ran the exact command, and `find` afterward showed only `.../assets/.gitkeep` remaining (macOS `/usr/bin/find`'s `-delete` implies `-depth`, so directory contents are removed before the directory itself is considered).
- Did not add a unit test for `webui.HasDashboard` myself (daemon-tests owns unit tests per the pipeline split, and the plan's Implementation Notes explicitly assign it there) — instead verified it manually with a throwaway `_test.go` file (`fstest.MapFS{}` → `false`, `fstest.MapFS{"index.html": ...}` → `true`), then deleted the file before committing so daemon-tests starts from a clean slate.
- Manually exercised both startup branches against the real built binary (a real web build already exists at `internal/webui/assets/index.html` in this working tree — a parallel web-impl run had produced it): (a) `-web-dist` pointed at an empty directory logged `-web-dist directory has no index.html; serving whatever is there` and started normally (REQ-9/D6, matches `onexit_test.go`'s expectation of a permissive empty-dir accept); (b) could not exercise the fatal fail-fast branch against the real embed, exactly as the plan's Implementation Notes predict ("the real embed var can't exercise this branch after a web build") — that's daemon-tests' unit-test-with-injected-`fs.FS` job (D5/R2).
- `make run`'s target order (`build web-build`) was left as-is (plan doesn't specify an order requirement for `run`, only for `e2e`); only `e2e`'s prerequisite order was changed per REQ-6.

## Handoff

**Build status**: `go build ./...` exits 0.
`gofmt -l .` clean, `go vet ./...` clean, `make lint` → 0 issues, `make test` → all packages pass (including `cmd/musterd/onexit_test.go` unmodified and still green).

No test files needed changes — none were touched, none needed an import fix.

**Not yet covered (by design, owned by daemon-tests)**: unit tests for `webui.HasDashboard` against `fstest.MapFS` (empty → false, with `index.html` → true), and a unit test for `cmd/musterd`'s `checkWebDist` fail-fast/warning branches (D5/D6/R2) — the real embed can't exercise the fatal branch, so this needs the injected-`fs.FS` approach the plan's Implementation Notes describe.
