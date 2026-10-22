# Proposed backlog — ws-close-code-1

Proposed, not filed: the developer files what they want into `TODO.md`.

- **The wedged-directory repo-poll test flakes under the full race suite** —
  `TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading` in
  `internal/server/reporefresh_addeddirs_test.go` failed once in this batch's Final Validation
  (`make test-race`, package `server` at 398 s) with `Should be true: the added read's deadline
  does not discard the launch directory's reading` and a nil launch branch, while the identical
  production tree passed the same gate in review cycle 1 and six consecutive `-race` runs of the
  test alone pass. Expected: the test passes whatever the machine's load. The test shortens
  `repoReadTimeout` to 1.5 s, and the launch directory's read runs under that same deadline
  through the `$PATH` git shim. (Final Validation gate, this batch; pre-existing — the branch does
  not touch the repo poll or its tests)
