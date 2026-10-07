---
id: knowledge-refs-and-scope-are-kb-subcommands
type: decision
status: accepted
date: 2026-10-07
summary: Dead cited references and the changed-files feature scope are kb subcommands over the index; the full refs pass is part of kb check; the scripts are gone.
features: [knowledge]
tags: [pipeline]
files: [kb.yaml, .claude/skills/orchestrate/scripts/plan-lint.sh, .claude/skills/orchestrate/scripts/gates.sh]
tests: []
refs: [plan:kb-config, kb:adr/process-touched-features-widen-without-stopping, kb:adr/knowledge-repo-values-live-in-kb-yaml]
supersedes: []
---
**Context.** Two orchestration scripts carried knowledge rules outside the tool that owns them.
`dead-refs.py` checked that every repo path, `make` target and `musterd` flag a comment or a
markdown line cites exists, with its own regexes for comment lines and its own exclusion list,
mirrored by hand in `internal/kb`. `features-scope.sh` mapped a branch's changed files to
their owning features by building a temporary kb binary and parsing `kb for` with awk, and
`plan-lint.sh` did the same for a plan's Affected Files. Neither had tests; both duplicated
path logic the index already had.

**Options.** (A) Keep the scripts and the mirrors in step by review. (B) Port both into
`internal/kb` as `kb refs` and `kb scope`, add `kb owners` for scripts, and fold the full refs
pass into `kb check`. (C) Port them but keep refs a separate gate line.

**Decision.** B. `kb refs` keeps the script's modes (every tracked file, the files changed
against main, explicit files for the SubagentStop hook) and its output lines verbatim, so the
gates, the retro audit and the orchestrator's `touched <feature>` grep read what they read
before; its exclusions are the config's citation excludes, so the two scans cannot drift.
`CheckRepo` runs `Check` and then the full refs pass as findings, so `make check-kb` covers
dead references and `make check` drops its separate `refs` step; `make refs` stays as the
command that also prints the ignored-by-design lines. `kb scope --touch` edits the plan's
Touches header exactly as the script did, which keeps
kb:adr/process-touched-features-widen-without-stopping true unchanged.

**Consequences.** The gates lose a Python and a bash dependency, every path rule has one owner
with table tests in a scratch git repo, and `plan-lint` resolves owners with one `kb owners`
call instead of a build. The `dead-refs:` and `features-scope:` output prefixes stay, since
three skills read them.
