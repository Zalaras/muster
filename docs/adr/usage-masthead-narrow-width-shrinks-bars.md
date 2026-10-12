---
id: usage-masthead-narrow-width-shrinks-bars
type: decision
status: accepted
date: 2026-10-12
summary: The masthead never wraps its text; below 1840px its gaps tighten and bars drop to 40px. No readout truncates now the model readout is gone.
features: [usage]
tags: [ux]
files: [web/src/style.css]
tests: []
refs: [plan:masthead-indicators, kb:adr/usage-masthead-shows-no-model, kb:adr/nongoal-ui-scaling-delegated-to-browser-zoom]
supersedes: [usage-masthead-narrow-width-shrinks-bars-truncates-model]
---
**Context.** The earlier decision made the model name the one readout that truncates at narrow widths. The model readout is removed (kb:adr/usage-masthead-shows-no-model), the connection text becomes a dot, and reset suffixes change to bracketed times of about the same width.

**Options.** (A) Keep the rule and pick another readout to truncate. (B) Keep the no-wrap, 1840px, 40px-bar rule with nothing elastic, measured at 1512px and 1440px.

**Decision.** B. The row loses more width than it gains, so it needs no elastic readout.

**Consequences.** The 1840px breakpoint stays a measured number and needs re-measuring when a readout is added. A future readout that does not fit has to bring its own narrow-width rule.
