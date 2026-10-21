---
id: notes-escape-only-from-inside-the-panel
type: decision
status: accepted
date: 2026-10-21
summary: The note panel reacts to Escape only while focus is inside it, so Escape typed in the terminal always reaches Claude Code.
features: [notes]
tags: [ux]
files: []
tests: []
refs: [plan:session-notes]
supersedes: []
---
**Context.** The popped-out panel stays open while the developer types in the terminal, and Escape
is how a Claude Code turn is interrupted. A document-level Escape handler would swallow it.

**Decision.** The panel handles Escape only from an element inside it. In the editor, Escape leaves
edit mode. Elsewhere in the panel, outside edit mode, Escape closes the anchored form or the
popped-out form. Escape pressed anywhere else never closes, pops in or changes the panel, and is
not prevented from reaching its own target.

**Consequences.** A popped-out note never gets in the way of interrupting Claude. Closing the panel
by keyboard needs focus in it first.
