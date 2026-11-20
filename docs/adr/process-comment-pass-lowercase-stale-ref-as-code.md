---
id: process-comment-pass-lowercase-stale-ref-as-code
type: decision
status: accepted
date: 2026-11-20
summary: A removed all-lowercase name makes an old comment stale-ref only where written as code; a name with a capital still matches as a whole word.
features: [comment-pass]
tags: [pipeline]
files: [internal/commentpass/collect.go]
tests: [TestStrip_LowercaseRemovedNameMatchesOnlyAsCode]
refs: []
supersedes: []
---
**Context.** `strip` flags every pre-existing comment that names an identifier the branch
removed, matching the name as a whole word. On `diff-viewer`, review cycle 3 removed the method
`gitRunner.branch`; 72 of 77 candidates were `stale-ref` on the English word "branch" in 40+
untouched files, every one kept by the judge.

**Decision.** An all-lowercase removed name counts only written as code: in backticks, followed
by `(`, or after a `.`. A name with any capital (`Helper`, `newFn`, `topLevel`) still matches as
a whole word, because Go comments name identifiers bare (217 of ~14,000 Go comment lines in this
repository use backticks) and a capitalised name rarely collides with prose.

**Alternatives.** Scoping by visibility (a lowercase Go name to its package, a non-exported
TypeScript name to its file, an exported one to its importers) is more precise but needs
per-language rules and import parsing, and still flags prose inside the scope. Collapsing a name
that matches many comments into one report line needs an arbitrary threshold and waves a widely
referenced stale name through in bulk.

**Consequences.** On the `diff-viewer` tree the rule cuts the `branch` matches from 44 files to 3
comments, each naming a `branch` field as code. A stale comment that mentions a lowercase name
in plain prose ("the branch helper retries") is no longer a candidate.
