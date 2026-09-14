---
id: reader-served-paths-confined-to-directory-or-plan
type: decision
status: accepted
date: 2026-09-14
summary: The file route serves only a resolved path under the resolved session directory ending in .md, or the resolved plan path; anything else is 404, nothing writes.
features: [reader]
tags: [security]
files: []
tests: []
refs: [plan:markdown-viewing, kb:anchor/browse.get, kb:adr/ingest-separate-token-in-url-path]
supersedes: []
---
**Context.** Serving file contents from a LAN-reachable daemon behind a cookie is a file-read primitive if left loose. The existing directory browser lists any directory, which is acceptable for names and unacceptable for contents. The plan lives outside the repository, so a directory-only rule would exclude it.

**Options.** (A) Serve any absolute path the cookie holder asks for. (B) Serve only under the session directory. (C) Serve under the resolved directory when the name ends in .md, plus the single resolved plan path, refusing everything else with one indistinguishable not-found answer.

**Decision.** C, with symlinks resolved on both sides before comparison, a 10 MiB ceiling answered with its own code, and no mutating route under the reader prefix.

**Consequences.** Traversal, symlinks out of the directory, the plan's subagent and workshop siblings, non-markdown files and directories all read as missing. The looseness of the directory browser is not copied. A future need to read code files is a new decision, not a widening of this one.
