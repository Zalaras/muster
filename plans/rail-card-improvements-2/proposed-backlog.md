# Proposed backlog — rail-card-improvements-2

Proposals only. Nothing here is filed: an open `TODO.md` item is the developer's to write
(`kb:adr/process-backlog-entries-are-the-users-to-file`). Each entry records whether the
reviewer actually asked for a change, in its own words.

## 1. Data race in the shell-terminal scroll test under `-race`

**Change requested: no** — "out of this plan's scope, and I agree with that call … Worth a
backlog entry on its own merits, which is the developer's call to file."

Found by daemon-tests while running `go test ./internal/server/... -race`, which `make test`
does not do: `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput`
(`shellscroll_test.go:261`) races `terminal.go:472` through `fakes_test.go`'s
`fakePaneConn.Write`. Reproduces roughly 1 run in 5 under `-race -count=5` in isolation.
Measured as outside this plan: the branch changes four Go files (`update.go`, `update_test.go`,
`update_check_test.go`, `state_test.go`) and none of them is `terminal.go`, `shellscroll_test.go`
or `fakes_test.go`. Nothing gates on it today, which is also why it went unnoticed — the
question worth deciding is whether `-race` should gate at all.

## 2. Whether `-race` should be part of a gate

**Change requested: no** — implied by proposal 1 rather than stated by the reviewer.

The race above exists because no suite runs `-race`. Adding it to `make test` would have caught
it; it would also lengthen the suite. A decision, not a defect.

## 3. How much of Go's transport error chain the Settings status line should show

**Change requested: no** — "This still satisfies the contract … and REQ-12, and the plan left
the wording unpinned … Recording the rendered result so how much of Go's transport chain to
surface can be decided later on evidence, rather than inside a fix wave."

With the release host down, the 502 message renders in `#update-status` verbatim as
`update check failed: requesting http://127.0.0.1:57907/latest: Head
"http://127.0.0.1:57907/latest": dial tcp 127.0.0.1:57907: connect: connection refused` —
four wrapped lines, the URL twice, pushing the action row down. Screenshotted by the reviewer
in cycle 2. Contract-compliant (it names the reason and never includes the response body), so
this is a wording question to settle on the evidence, not a bug.

## 4. Naming the owning plan in `internal/server/update.go`'s inherited doc comments

**Change requested: no** — "Naming the owning plan in every such comment repo-wide is a
convention question, not this plan's defect, and it is the developer's to file if wanted."

Three sites (`update.go:114`, `:233-234`, `:300`) carry auto-update's own IDs with nothing of
this plan's near them, and one residual parenthetical at `:253` says `(D16)` — auto-update's ID —
two lines below this plan's newly-added name, so a reader chasing `D16` in
`rail-card-improvements-2` finds nothing (its D range stops at D13). The reviewer ruled
explicitly that all four stay: they are internally consistent and pre-existing, and the prose
around `D16` describes the behaviour completely, so the ID is a breadcrumb rather than the
explanation. `dead-refs` does not and cannot check plan IDs.

## 5. `kb pack` budget overrun

**Change requested: no** — "Not this plan's doing and nothing here depends on it."

Every role's pack for this plan ran far over budget: 24,952 words for review, 24,109 for
orchestrator, 17,840 for e2e-specs, 16,858 for daemon-impl, against a stated 8,000. The four
features this plan touches (rail, surfaces, update, settings) pull in 7,668 words of decisions
alone. Worth deciding whether the budget is wrong or the packing is.
