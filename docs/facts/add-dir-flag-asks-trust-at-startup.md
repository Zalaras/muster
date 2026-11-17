---
id: add-dir-flag-asks-trust-at-startup
type: fact
status: active
date: 2026-11-17
summary: From 2.1.326 a launch with --add-dir on an untrusted folder blocks on an "Adding a new directory:" dialog preselecting "No, exit"; the answer lasts one session.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_turns_test.go, test/canary/harness_test.go, test/canary/turns_test.go]
tests: [TestAddDirFlagAsksTrustAtStartup]
refs: [kb:fact/trust-prompt-preselects-exit, kb:fact/added-dirs-in-status-line, kb:adr/canary-bang-cd-run-answers-added-folder-dialog]
verified: 2.1.326..canary
guard: TestAddDirFlagAsksTrustAtStartup
---
An interactive launch with `--add-dir <dir>`, where `<dir>` is not already trusted, stops on a
dialog before the session starts. No hook fires and no status line renders until it is answered:

```
 Adding a new directory:
 /private/tmp/…/added
 This session hasn't worked here before. Is this a directory you created or one you trust?
 Claude Code'll be able to read, edit, and execute files here. … Your answer holds for this
 session. Starting Claude Code in this directory and trusting it there lasts, …
 Security guide
 ❯ No, exit
   Yes, add it
 Enter to confirm · Esc to cancel
```

It shares no wording with the workspace-trust prompt. The canary harness answers it on run N
(kb:adr/canary-bang-cd-run-answers-added-folder-dialog).

- **`Yes, add it`** (Down, then Enter): `SessionStart` fires and the first status post lists
  both directories in `workspace.added_dirs`.
- **The answer is not saved.** A second launch with the flag asked again.
- **`No, exit`** (a bare Enter): Claude Code prints `To go on without it, start again with the
  same flags but without --add-dir <dir>. Add --resume to pick up an earlier conversation.` and
  exits 1. One `SessionEnd` fires with `reason: "other"`, under a session id that never had a
  `SessionStart`.

2.1.325 has no such dialog: `make canary` went green on it with run N's `--add-dir`
unanswered, and its bundle lacks `AddedFolderTrustPrompt`. Production never passes `--add-dir`,
so only run N meets this. The guard pins that the dialog shows; the rows' effects are from the
probe alone.

Not measured: whether a folder trusted by starting Claude Code inside it skips the dialog, as
its text says, and its order against the workspace-trust prompt.

Evidence: zero-token probe 2026-11-17 on 2.1.326 (from the status posts), `capture-3.jsonl`
lines 2624–2630. The dialog showed on 2 of 2 launches: session `72083075` accepted,
`cdf5a557` declined.
