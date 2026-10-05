# Decision: split a `groups` feature out of `rail`; add `knowledge` to the header

**Reached by**: user decision (asked by the orchestrator on 2026-10-05 after doc-reconcile returned `blocked`).

**Why it came up.** doc-reconcile (plans/groups/doc-reconcile.md) promoted every claim that fit and stopped on three: `tools/kb/anchors.tsv` maps to the `knowledge` feature, absent from the header; the rail spec sat at 792 of 800 words with the summary/popover composition, select mode and its exits, the name-click exception, Ungroup-in-place and persistence unpromoted; the launch spec at 799 with the request fields carried by citation.

**Options put to the developer.**
1. Anchors: add `knowledge` to the header (registry-only) — or revert the nine rows.
2. Specs: split a `groups` feature spec out of `rail` (sections, summary, select mode, filter; globs move) and re-run reconcile — or accept the citations and waive the budget items.

**Outcome.** Add `knowledge`; split `groups`. Launch keeps its citations (the request fields live in `kb:anchor/sessions.create` and the two launch ADRs). doc-reconcile re-runs with the widened header and writes `docs/features/groups/spec.md`.
