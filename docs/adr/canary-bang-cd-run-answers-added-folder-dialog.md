---
id: canary-bang-cd-run-answers-added-folder-dialog
type: decision
status: accepted
date: 2026-11-17
summary: Run N keeps --add-dir and the harness answers the added-folder prompt Claude Code 2.1.326 raises for it; a test pins both the asked and the unasked launch.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/harness_turns_test.go, test/canary/turns_test.go]
tests: [TestAddDirFlagAsksTrustAtStartup, TestAddedDirsInStatusLine]
refs: [kb:fact/added-dirs-in-status-line, kb:fact/trust-prompt-preselects-exit, kb:adr/canary-drives-installed-claude-through-production-chain]
supersedes: [canary-bang-cd-run-adds-dir]
---
**Context.** Run N appends `--add-dir <dir>` so the canary can guard `workspace.added_dirs`
(kb:fact/added-dirs-in-status-line). The flag was chosen because it had no dialog to drive.
Claude Code 2.1.326 ended that: an added directory it does not trust raises an "Adding a new
directory:" prompt before the session starts. The prompt preselects "No, exit", no hook fires
until it is answered, and the answer is not saved. The harness knew only the workspace-trust
prompt's wording, so run N waited 90 s for a `SessionStart` that never came and three tests
went red (probe 2026-11-17).

**Options.** (A) Answer the prompt in the harness as it answers workspace trust: read the
marker's row, move it onto "Yes, add it", then Enter. (B) Trust the directory first by starting
Claude Code inside it once — one more launch per canary, resting on the prompt's own unmeasured
claim that this lasts. (C) Drop `--add-dir` and leave the fact unguarded.

**Decision.** A. Run N still passes `--add-dir` with a directory outside the scratch repo, and
`waitForSessionStart` answers the added-folder prompt whenever one appears, on any run.
`TestAddDirFlagAsksTrustAtStartup` pins both shapes: the prompt shows from 2.1.326 and does not
show below it.

**Consequences.** Run N departs from production in its fail-server env, its argv and now one
answered prompt, which adds about four seconds. A reworded title or Yes row turns run N red
again, by design. `DirectoryAdded` stays a static check, and the "for this session" versus
"remember" behaviour of `/add-dir` stays probe-only.
