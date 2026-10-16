---
id: canary-bang-cd-run-adds-dir
type: decision
status: accepted
date: 2026-10-16
summary: Run N appends --add-dir to the production argv so the canary can guard workspace.added_dirs at zero tokens; the DirectoryAdded hook stays a static check.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_turns_test.go]
tests: [TestAddedDirsInStatusLine]
refs: [kb:fact/added-dirs-in-status-line, kb:adr/canary-interrupt-run-preallows-bash, kb:adr/canary-drives-installed-claude-through-production-chain]
supersedes: []
---
**Context.** Showing a session's added directories (#93, #101) rests on kb:fact/added-dirs-in-status-line:
the status line's `workspace.added_dirs` lists them, led by the launch directory. Production
never passes `--add-dir`, so no canary run had an added directory to observe.

**Options.** (A) A new interactive run that types `/add-dir` and answers its dialog. (B) Append
`--add-dir <dir>` to an existing interactive run's argv. (C) Leave the fact unguarded.

**Decision.** B, on run N. It is interactive and every API call fails, so it costs nothing, and
the flag fills `added_dirs` from the first status post with no dialog to drive. The added
directory sits outside the scratch repo, so run N's `!cd /` still leaves every allowed directory
and resets as before. `DirectoryAdded` fires only for `/add-dir`, and production registers no
hook for it, so the static tier checks only that its name is still in the bundle.

**Consequences.** Run N departs from production in both its fail-server env and its argv. The
"for this session" versus "remember" behaviour of `/add-dir` stays probe-only.
