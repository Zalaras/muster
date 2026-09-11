---
id: stack-git-and-gh-clis-not-go-git
type: decision
status: accepted
date: 2026-08-16
summary: Git and GitHub operations shell out to the git and gh CLIs; go-git and the GitHub MCP server were rejected.
features: [launch, issue]
tags: [deps]
files: [internal/gitutil/gitutil.go, internal/ghissue/ghissue.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/conventions.md, kb:adr/issue-auth-gh-token-at-time-of-use, kb:adr/process-exec-waitdelay-on-pipe-owning-commands, kb:adr/process-faked-subprocess-boundary]
supersedes: []
---
**Context.** Muster needs a little git knowledge, such as telling a worktree from a checkout and naming the branch, and one GitHub write, filing an issue. Claude Code itself does both by shelling out.

**Options.** For git: (A) go-git, a pure-Go implementation whose behaviour drifts from the git binary on the same checkout; (B) os/exec against the git CLI. For GitHub: (C) the GitHub MCP server, which Damian would prefer in principle but believed lacked the tools needed; (D) the gh CLI, already logged in on the machine.

**Decision.** B and D. Matching Claude Code's own behaviour matters more than avoiding a subprocess, and the CLIs are already present wherever Claude Code runs.

**Consequences.** No git or GitHub library enters the dependency tree. Every call is a subprocess with a timeout and a wait delay, and Go tests cross that boundary through an injectable run function. The gh token is borrowed at time of use and never stored. A machine without gh cannot file issues and gets a distinct error saying so.
