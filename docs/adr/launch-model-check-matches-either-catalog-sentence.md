---
id: launch-model-check-matches-either-catalog-sentence
type: decision
status: accepted
date: 2026-10-14
summary: The model pre-check treats either Claude Code unknown-model sentence (pre-2.1.299 or 2.1.299+) as unrecognised, whatever the installed version.
features: [launch, canary]
tags: [claude-code-format]
files: [internal/claudecode/modelcheck.go]
tests: [TestStderrSaysUnrecognised]
refs: [plan:model-catalog-sentence, kb:fact/unknown-model-warning-names-assumed-window, kb:fact/model-catalog-precheck-zero-token, kb:adr/launch-model-check-cached-per-binary-identity]
supersedes: []
---
**Context.** Between 2.1.296 and 2.1.299 Claude Code reworded its unknown-model warning. The
pre-check matched only the old sentence, so from 2.1.299 it passed every model as recognised.
The red ritual in `docs/claude-code-versions.md` says to key new behaviour off the installed
version. Here the change point is known only to within 2.1.297..2.1.299.

**Decision.** `stderrSaysUnrecognised` returns true when stderr carries either sentence. It
does not consult the installed version.

**Consequences.** It is exact for every version: each binary prints one sentence or the other
for an unknown model, and a known model prints neither. Keying off the version would have to
guess for the two unprobed releases. The canary's static tier asserts the new sentence, so a
further rewording is caught on the next version bump. The old sentence stays matched until the
verified range no longer reaches below 2.1.299.
