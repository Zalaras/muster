---
id: process-comment-pass-edited-comment-judged-on-truth
type: decision
status: accepted
date: 2026-10-13
summary: A comment the branch edited by at most half its lines is judged on truth alone, not on whether it guards; one rewritten by more is the branch's own.
features: [comment-pass]
tags: [pipeline]
files: [internal/commentpass/strip.go, internal/commentpass/gitdiff.go, internal/commentpass/render.go, .claude/agents/comment-judge.md]
tests: [TestStrip_EditedBlockIsWholeWithPrevious, TestStrip_MajorityNewBlockIsAddedNotEdited, TestParseDiff_HunksAndRemovedIdents]
refs: [kb:adr/process-comment-pass-owns-code-comments, plan:masthead-indicators, plan:comment-pass-edited]
supersedes: []
---
**Context.** The comment pass marks any block with one added line a candidate, `edited` when
not every line is new, and the judge ruled on the whole block under the guard-only rule. On
`masthead-indicators` five pre-existing comments — three module headers, `UsageInfo`'s doc,
the `shellsBusy?` note — each lost to a one-line edit the plan made to keep them true,
leaving two feature modules headerless and `shellsBusy` without the note its neighbours
keep. The parent decision says `main`'s comments are out of scope; the edited
rule brought one in per word touched, and the only route for the honest case (`stale-ref`)
sees top-level declarations, not fields. The judge was also shown, as a block's `previously:`,
every comment line the branch removed anywhere in the file.

**Options.** (A) Keep the rule and sweep all of `main` once under it, so no sibling is left
to be out of step — hundreds of comments, a decision of its own. (B) On a drop, restore the
`previously:` text — reinstates the stale reference the edit removed. (C) Judge an edited
block on truth alone.

**Decision.** C. A block is `edited` when the branch added at most half of its lines; more
than half and it is `added`, the branch's own comment. An `edited` or `stale-ref` candidate is
kept unless the stripped file contradicts it or it names an identifier the branch removed;
the guard test applies to `added` only. A block's `previously:` holds only the comment lines
of the hunks that land inside it.

**Consequences.** A plan that touches a word of a legacy comment no longer deletes it; the
maintainability `[note]` on files out of step with their siblings goes with it. `main`'s
comment debt stays where it is, to be swept deliberately or not at all.
