---
id: reader-nav-scrolls-as-one-column
type: decision
status: accepted
date: 2026-11-12
summary: The reader nav scrolls as one column; the claude section, the file tree and the outline each take their natural height and never shrink.
features: [reader]
tags: [ux, user-decision]
files: [web/src/style.css]
tests: [web/render/reader-scratch.spec.ts]
refs: [plan:claude-tmp-files, plans/claude-tmp-files/decisions/nav-global-scroll/decision.md, plans/claude-tmp-files/mockups/nav-height.html]
supersedes: [reader-nav-sections-shrink-without-floor]
---
**Context.** #121 put a third section (the claude section's plan and scratch rows) at the top of the reader nav. Under the per-section model each section shrank with no floor and scrolled inside itself. Review of #121 measured that model failing in short hosts: in a 3×2 tile in a 600 px window (nav 164 px) the unfolded tree got 8 px and the outline 17 px — scrollable, but never one whole row — and in a ~450 px window all three got 0 px.

**Options.** (A) Keep per-section scrolling and accept slivers in short tiles. (C) One scroll for the whole nav: every section at its natural height. (D) VS Code-style panes: each open section keeps a minimum and scrolls inside itself, a closed one collapses to its header. Mockups A–D in plans/claude-tmp-files/mockups/nav-height.html.

**Decision.** C, at the developer's call on 2026-11-12. The tree, the outline and the claude section's rows take their natural height and never shrink; `.rnav` is the one scroller. A row in any section is always reachable by scrolling the nav, in every host and at any height.

**Consequences.** Nothing is squeezed to a sliver or to zero. With a long file list the outline sits below the whole tree, and the files header and filter scroll out of view with the list. A revisit (panes as in D, a filter pinned at the top) is a TODO.md Tweak, "Revisit the reader nav's scrolling".
