---
id: reader-body-keyboard-focus-keeps-ua-ring
type: decision
status: accepted
date: 2026-10-15
summary: A keyboard switch to docs focuses the reader body with Chrome's default ring; amber would read as a Needs-Input border, none would hide focus.
features: [reader, surfaces]
tags: [ux, consensus]
files: [web/src/style.css]
tests: [web/e2e/plain-shell.spec.ts]
refs: [plan:focus-lands, plans/focus-lands/decisions/docs-focus-ring/decision.md]
supersedes: []
---
**Context.** Switching a session to its docs surface now moves keyboard focus onto the reader's
rendered body (`article.md`, `tabindex="-1"`). After a keyboard switch Chrome draws its default
focus ring round the whole body; a pointer switch draws none.

**Decision.** The body keeps Chrome's default ring; `style.css` adds no `.md:focus-visible` rule.

**Why.** The reader mounts in tile bodies too, so an amber ring would be a pane-sized amber border,
which design-system §3 reserves for Needs-Input. `outline: none` would remove the only visible sign
that focus landed in the reader, which has no cursor. The UA ring is already the keyboard focus
treatment of every unstyled control, the surface switch's own segments included.

**Consequences.** The ring's blue is a colour no theme defines; measured against `--well` it is
3.20:1 (Instrument), 3.08:1 (Dark) and 5.98:1 (Light), clear of the 3:1 non-text floor.
