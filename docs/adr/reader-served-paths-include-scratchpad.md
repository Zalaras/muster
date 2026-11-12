---
id: reader-served-paths-include-scratchpad
type: decision
status: accepted
date: 2026-11-12
summary: The file route also serves a resolved .md under the session's resolved scratchpad folder; the folder is accepted only in the measured per-session shape.
features: [reader]
tags: [security]
files: []
tests: []
refs: [plan:claude-tmp-files, kb:fact/scratchpad-dir-per-session-id, kb:adr/reader-scratchpad-dir-from-hooks-persisted]
supersedes: [reader-served-paths-confined-to-directory-or-plan]
---
**Context.** The reader serves only markdown under the session directory or the single plan path. Scratch files live outside both, under the system temp directory. The folder comes from a hook payload, so a loosely accepted value would turn the route into a read of any markdown on the machine.

**Options.** (A) Serve any path a hook names. (B) Add the scratchpad folder as a third root, accepting the hook's value only when it is absolute, clean, ends in scratchpad and sits in a folder named for the hook's own session id. (C) Derive the folder from the user id and working directory instead of reading it.

**Decision.** B. A path is served when, with symlinks resolved on both sides, it is a .md under the directory, the plan path, or a .md under the session's scratchpad folder. Everything else stays one indistinguishable not-found, the 10 MiB ceiling and the read-only route are unchanged.

**Consequences.** One session's route never reaches another session's scratch files, since each folder is named for its own session id. Non-markdown scratch files, the sibling tasks folder and symlinks out of the folder read as missing. C was declined because the temp root and encoding are Claude Code's to change; the hook names the folder outright.
