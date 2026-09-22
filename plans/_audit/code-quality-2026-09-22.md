# Code quality audit — 2026-09-22

Raised while reviewing the review agent (`.claude/agents/review-work.md`) on 2026-09-22 and filed at
the developer's request. The pipeline's reviewer checks conformance to the plan and to
`docs/conventions.md`; it has never looked for maintainability defects, so whatever leaked through
since 2026-08-16 has gone unreviewed for that class. This report records what a bounded measurement
found so that the cleanup session starts from numbers. **Nothing here has been changed.** Ranking
and placement stay the developer's (`docs/conventions.md` § Backlog).

## What the reviewer has never looked for

Agent-tagged findings across every `plans/*/review*.md` (58 files, 221 findings), by class:

| Class | Findings |
|---|---|
| Patterns, principles, coupling, abstraction | 0 |
| Duplication of an existing helper | 3 |
| Concurrency or races | 5 |
| Dead or leftover code | 4 |
| Readability, over-long functions | 4 |

Of 251 `[note]`s, 5 touch code quality. Three structural causes:

1. The Go and TypeScript review sections are conformance checks (`%w`, no `any`, no `init()`,
   registration-only composition roots), so they yield conformance findings.
2. The reviewer reads only the files listed in the implementation logs. It never opens a sibling
   module, so a helper duplicated from elsewhere or a shape that diverges from its neighbours is
   invisible from inside the diff.
3. The gates cover the shallow end only: `.golangci.yml` runs `gocyclo` at 15 plus `gocritic` and
   `revive`; there is no duplication or function-length linter, and `make test` is
   `go test -count=1 ./...` with no race detector.

## Measured — Go

- **`go test -race -count=1 ./...` fails.** One race, in `internal/server`, test
  `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput`: a write in
  `fakePaneConn.Write` (reached via `pumpShellSocketToPTY` from `handleShellTerminal`) against a
  read in the test body at `shellscroll_test.go:255-259`. The racing memory is the test fake, not
  production code. Every other package passed under the detector (`internal/server` took 85 s).
  Because the suite has never run under `-race`, production races have not been looked for either;
  a clean run of the fixed suite is the first real measurement.
- **Linters not in the gate**, run as
  `golangci-lint run --no-config --enable-only dupl,funlen,gocognit,nestif ./...` (v2.13.2):

  | Linter | Hits | Where |
  |---|---|---|
  | `dupl` | 7 | all tests: `internal/server/prefs_test.go` ×3, `shellscroll_test.go` ×2, `terminal_test.go` ×2 |
  | `funlen` (default 60 lines / 40 statements) | 50 | spread across `cmd/` and `internal/` |
  | `gocognit` (default 30) | 0 | |
  | `nestif` | 1 | |

- **Largest non-test files:** `internal/session/manager.go` 1699 lines (34 lock sites, 2 goroutine
  spawns), `cmd/musterd/main.go` 791, `internal/server/sessions.go` 785, `internal/server/issue.go`
  694, `internal/server/update.go` 691, `internal/tmux/tmux.go` 684.
- **Longest functions:** `server.New` 103 lines (the composition root; conventions § Composition
  roots wants registration only — worth a read), `session.applyInput` 98, `main.run` 98,
  `issueFeature.buildIssueSnapshot` 93, `sessionLauncher.Launch` 92.

## Measured — web

- `any`: 0 in non-test source (the two grep hits are inside comments).
- No exported function name is defined in more than one module.
- DOM access (`document.querySelector` / `getElementById`) outside `render/` and `features/`:
  only `web/src/dom.ts`, the intended seam.
- **Largest non-test files:** `web/src/protocol.ts` 877, `web/src/api.ts` 745,
  `web/src/features/reader.ts` 610, `web/src/render/reader.ts` 531, `web/src/features/launch.ts`
  521, `web/src/render/sessions.ts` 509, `web/src/terminal/pane.ts` 472.

## Not measured

- TypeScript function length — a line-based heuristic cannot see the nested closures this codebase
  uses; needs a proper tool or a read.
- Duplicated *logic* across modules on either side (no clone detector was run; `dupl` sees Go only).
- Pattern divergence between sibling modules, and principle-level issues (coupling between
  `features/` controllers, protocol types leaking into `render/`, error-handling consistency).
  These are the reviewer's blind spot and need a newcomer's read, not a grep.

## Proposed scope for the cleanup session (proposal — the developer picks)

1. **Mechanise first.** Add `-race` to the Go test gate (measure the full-suite time before deciding
   whether it is the default or its own target), enable `dupl` and `funlen` in `.golangci.yml`, and
   fix the one race and seven `dupl` sites so the widened gate lands green.
2. **A newcomer's read per package and per `web/src` directory** against `docs/conventions.md` and
   `kb:diagram/daemon-components` / `kb:diagram/web-components`: sibling divergence, duplicated
   helpers, coupling, dead code. Each class with a cause becomes a lesson record; each fix is a
   commit that says which convention it restores.
3. **Split the hotspots the numbers name:** `manager.go`, `main.run`, `server.New`, `protocol.ts`,
   `api.ts`.
4. Sequence it after the review-agent redesign (separate work, same date) so the maintainability
   reviewer that redesign adds holds the line afterwards.
