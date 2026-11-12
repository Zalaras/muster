# Decision: nav-global-scroll

**Outcome**: C — one scroll for the whole nav; every section at its natural height.
**Reached by**: user decision (the developer, 2026-11-12, after mockups A–D in plans/claude-tmp-files/mockups/nav-height.html)
**Source**: review cycle 2, browser Major 2 `[orchestrator:decision]` (in a 600 px-tall 3×2 tile the unfolded tree and outline are 8 px and 17 px; widen the out-of-scope call, or make one whole row per section the bar). The developer chose neither: the nav scrolls as one column instead.
**Decisive argument**: Per-section shrinking cannot keep a usable row in a short tile without a floor; a single scroller keeps every row reachable at any height with no floor. The developer compared it to VS Code; the orchestrator noted VS Code's Explorer is the panes model (D), which is filed for a later revisit.
**Dissent to honour**: With a long file list the outline sits below the tree and the files header and filter scroll away. Revisit filed in TODO.md § Tweaks, "Revisit the reader nav's scrolling" (panes as in D, a pinned filter).
**Landed in**: docs/adr/reader-nav-scrolls-as-one-column.md (supersedes reader-nav-sections-shrink-without-floor); plans/claude-tmp-files/plan.md Views *Amended* note (replaces the earlier too-short-nav note); TODO.md § Tweaks; plans/claude-tmp-files/doc-delta.md. kb:adr/reader-nav-too-short-for-fixed-rows-out-of-scope and its proposed-backlog entry are withdrawn: a scrolling nav has no too-short case.
