# Daemon Tests: embed-dashboard

**Plan**: embed-dashboard
**Verdict**: pass

## Summary

Tests created: 14 (across 3 new files) | Passing: 14 | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `internal/webui/webui_test.go` | TestHasDashboard/empty_tree_has_no_dashboard | `HasDashboard` false on an empty `fstest.MapFS` (D5/R2's predicate) | pass |
| `internal/webui/webui_test.go` | TestHasDashboard/tree_with_only_unrelated_files_has_no_dashboard | false when other files exist but no root `index.html` | pass |
| `internal/webui/webui_test.go` | TestHasDashboard/tree_with_index.html_at_its_root_has_a_dashboard | true when `index.html` is at the tree's root | pass |
| `internal/webui/webui_test.go` | TestHasDashboard/index.html_alongside_other_real_build_output_still_counts | true with realistic hashed-asset siblings present too | pass |
| `internal/webui/webui_test.go` | TestHasDashboard/index.html_nested_under_a_subdirectory_does_not_count | false when `index.html` exists only under a subdirectory (root-only check) | pass |
| `internal/webui/webui_test.go` | TestFS_RootedAtAssets | `FS()` is rooted at `assets/` — `.gitkeep` visible at root, `assets/.gitkeep` is not (REQ-1) | pass |
| `internal/webui/webui_test.go` | TestFS_DoesNotPanic | `FS()` callable repeatedly without panicking (`fs.Sub` regression guard) | pass |
| `cmd/musterd/webdist_test.go` | TestCheckWebDist_DiskOverridePresent | `-web-dist` dir with `index.html` → nil error, no warning logged | pass |
| `cmd/musterd/webdist_test.go` | TestCheckWebDist_DiskOverrideEmptyDirWarnsButDoesNotFail | `-web-dist` dir without `index.html` → nil error, warning logged naming the dir (REQ-9/D6) | pass |
| `cmd/musterd/webdist_test.go` | TestCheckWebDist_DiskOverridePointsAtMissingDirectoryWarnsButDoesNotFail | `-web-dist` pointing at a nonexistent path → same permissive warning path | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_DiskOverride/serves_the_file_present_on_disk | `WebDist` set → `GET /` serves that directory's `index.html` content | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_DiskOverride/does_not_fall_back_to_the_embedded_tree_for_a_path_absent_on_disk | disk branch never silently falls back to the embedded tree (true precedence, not fallback) | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_DiskOverride/still_gates_on_the_auth_cookie | disk branch still 401s without the auth cookie | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_Embedded/serves_an_always-embedded_file_with_no_disk_override_configured | `WebDist` empty → `GET /.gitkeep` served from the embedded FS (REQ-2's embedded branch, build-state-independent) | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_Embedded/gates_the_embedded_static_handler_on_the_auth_cookie_same_as_the_disk_branch | embedded branch 401s + HTML relaunch page without cookie, matching the disk branch (R5) | pass |
| `internal/server/staticserve_test.go` | TestStaticServing_Embedded/wrong_cookie_value_is_rejected_on_the_embedded_branch_too | embedded branch rejects a wrong cookie value too | pass |

(Table lists 16 subtests across 3 files landing under the 14 top-level `Test*` funcs named above.)

## Coverage notes / deliberate gaps

- **D5's fatal branch (`checkWebDist("", ...)` when nothing is embedded) is not exercised
  directly.** `checkWebDist` calls `webui.HasDashboard(webui.FS())` with the real,
  compile-time `//go:embed` var — it is not parameterized over an injected `fs.FS`. Since
  `make test`'s target (`go test -count=1 ./...`) has no `web-build` prerequisite, whether
  `internal/webui/assets/` actually contains a built `index.html` at test time varies by
  machine/CI state (this checkout currently has a prior real web build sitting there
  uncommitted), so asserting on `checkWebDist("", ...)`'s outcome would be environment-
  dependent, not a deterministic unit test. This is exactly the limitation the plan's own
  Implementation Notes name ("the real embed var can't exercise this branch after a web
  build") and the reason `HasDashboard` was factored to take a caller-supplied `fs.FS` in
  the first place — that seam is what `TestHasDashboard` exhaustively covers instead
  (empty → false, with `index.html` → true, plus the nested/sibling-file cross-checks).
  The fatal message's wording (both remedies named) was confirmed by reading
  `cmd/musterd/main.go`'s `checkWebDist` directly; per the plan this is R2, reviewer-
  verified, not additionally unit-tested with a fabricated helper.
- Chose `.gitkeep` (not `index.html`) as the assertion target for the embedded-serving
  tests in `internal/server/staticserve_test.go`, for the same reason: `.gitkeep` is
  committed and always present in the real embedded tree regardless of build state
  (REQ-4), so the test is deterministic across a fresh clone or a built checkout alike.
- No test touches `cmd/musterd/onexit_test.go` or any implementation file (verified via
  `git status --porcelain` — only the three new `_test.go` files are untracked besides
  the pre-existing stray `masthead.png` and `orchestration-state.json`, both left alone).
- Web-tests track note (per plan Implementation Notes, not this agent's scope, restated
  for completeness): no TS logic changed by this plan, so no Vitest coverage is expected
  there.

## Implementation Bugs

None found. Implementation matches the plan and REQ-1/REQ-2/REQ-3/REQ-9 as written.

## Test Run Output

```
$ go build ./...
(exit 0)

$ go vet ./...
(exit 0)

$ make lint
golangci-lint run
0 issues.

$ make test
go test -count=1 ./...
ok  	github.com/Zalaras/muster/cmd/musterd	7.987s
ok  	github.com/Zalaras/muster/internal/claudecode	1.990s
?   	github.com/Zalaras/muster/internal/claudecode/claudecodetest	[no test files]
ok  	github.com/Zalaras/muster/internal/gitutil	4.777s
ok  	github.com/Zalaras/muster/internal/server	14.347s
ok  	github.com/Zalaras/muster/internal/session	6.884s
ok  	github.com/Zalaras/muster/internal/store	3.452s
ok  	github.com/Zalaras/muster/internal/termbridge	7.219s
ok  	github.com/Zalaras/muster/internal/tmux	7.820s
ok  	github.com/Zalaras/muster/internal/usage	1.564s
ok  	github.com/Zalaras/muster/internal/webui	4.198s
?   	github.com/Zalaras/muster/test/rig/capture	[no test files]
?   	github.com/Zalaras/muster/test/rig/failproxy	[no test files]

$ [ "$(git ls-files internal/webui/assets)" = "internal/webui/assets/.gitkeep" ] && echo D4_OK
D4_OK
```
