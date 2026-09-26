---
id: ingest-wrapper-scripts-replaced-atomically
type: decision
status: accepted
date: 2026-09-26
summary: The wrapper scripts are replaced by temp-file-and-rename and skipped when unchanged; serving before startup and a shorter curl timeout were declined.
features: [ingest]
tags: [user-decision]
files: [internal/claudecode/settings.go]
tests: []
refs: [plan:maintainability-regressions, kb:adr/ingest-all-hooks-command-wrappers, https://github.com/Zalaras/muster/issues/54]
supersedes: []
---
**Context.** Issue #54: once, right after an update, tool hooks surfaced `Failed with non-blocking status code: No stderr output`. The wrapper always ends in `exit 0`. A code review found two restart windows. The daemon rewrites each script in place, truncating then writing, and `/bin/sh` reads a script as it runs, so a hook that reaches the script's end while it is empty exits with curl's non-zero status. Separately, the listener is bound before startup work finishes, so a hook's curl can wait out its 2 s against a 2 s hook timeout.

**Options.** (A) Serve HTTP before startup work. (B) Replace the scripts atomically and skip an unchanged write. (C) Lower curl's `--max-time` below the hook timeout.

**Decision.** B only, the developer's choice after weighing all three.

**Consequences.** A hook always runs a complete script, old or new, and an ordinary restart does not touch the files. The listener-before-serve window remains, so #54 is watched for recurrence rather than considered proven fixed.
