---
id: print-mode-untrusted-workspace-loads-skills-but-not-allow-list
type: fact
status: active
date: 2026-10-22
summary: In an untrusted directory claude -p loads CLAUDE.md, project skills and hooks but ignores the project allow list; --allowedTools Bash covers any command.
features: []
tags: [claude-code-format, pipeline]
files: [scripts/sweep.py]
tests: []
refs: [kb:adr/process-fix-sweep-fresh-process-per-batch, kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop]
verified: 2.1.308..2.1.308
guard: none
---
Trust is recorded per exact directory path in `~/.claude.json`
(`projects[<path>].hasTrustDialogAccepted`); a freshly created sibling worktree has no entry, so
every sweep batch runs in an untrusted workspace. Measured in a scratch `git init` repo with no
trust entry, `--model claude-haiku-4-5-20251001 --output-format json --permission-mode
acceptEdits`:

- **Project allow list ignored.** stderr: `Ignoring 1 permissions.allow entry from
  .claude/settings.json: this workspace has not been trusted. Run Claude Code interactively here
  once and accept the trust dialog, or set projects["<path>"].hasTrustDialogAccepted: true in
  /Users/<user>/.claude.json.` Whether `permissions.deny` is also ignored was not measured.
- **`--allowedTools "Bash,Agent"` is enough.** `python3 -c 'print("py-ok")'` — on no allow list
  anywhere — ran and printed `py-ok`; `echo sh-ok` ran. Nothing was denied, so the sweep loop
  passes the tool names on the command line and relies on no project allow entry.
- **Skills, CLAUDE.md and hooks load.** `claude -p "/ping"` with a project skill named `ping`
  under the scratch repo's `.claude/skills/` and a `CLAUDE.md` naming a codeword answered
  `ping-skill-loaded mango`; the project `SubagentStop` hook fired in the same workspace
  (kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop).
- `--output-format json` returns `result`, `total_cost_usd`, `num_turns`, `duration_ms`. With
  no stdin redirect, print mode waits 3 s for piped input and warns; pass `< /dev/null`.
