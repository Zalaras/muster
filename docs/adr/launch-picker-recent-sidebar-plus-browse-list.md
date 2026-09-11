---
id: launch-picker-recent-sidebar-plus-browse-list
type: decision
status: accepted
date: 2026-08-30
summary: The launch dialog is a Finder-style picker: a Recent sidebar beside a breadcrumb over one child listing, where the listed directory is the selection.
features: [launch]
tags: [ux, user-decision]
files: [web/src/features/launch.ts, web/src/render/crumbs.ts, web/e2e/helpers/picker.ts]
tests: [web/e2e/launch.spec.ts]
refs: [docs/history/spec-changelog.md, plan:new-session-dialog, plans/new-session-dialog/mockup.html, kb:anchor/browse.get, kb:anchor/repos.list, kb:adr/launch-hybrid-mru-directory-memory, docs/design/ux-flows.md]
supersedes: []
---
**Context.** The first launch dialog stacked a recent list, a browse button that unfolded a panel, and a form, and made directory choice a two-step ceremony ending in an apply button. It had no sense of place and grew when the browser opened.

**Options.** (A) Finder columns. (B) A persistent Recent sidebar beside a browse pane made of a clickable breadcrumb over a single child listing. (C) A path field with completion. For the title: fold it into the header, footer, strip or right column, or keep plain rows.

**Decision.** B, chosen by Damian from a visual comparison, with plain rows for the form. The listed directory is the selection; descending changes it, a crumb or the up chord goes back, and clicking a recent restores that directory's last model and mode. The footer always names what will launch.

**Consequences.** Model and start-in are segmented controls. The dialog has a fixed width with internally scrolling panes. Dotfiles stay excluded from the listing by decision. Web-only; the existing browse and repos endpoints already carried everything needed.
