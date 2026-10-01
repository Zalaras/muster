# Decision: focus-model-never-truncates

**Outcome**: A — REQ-13 holds at every width. Below the point where the Focus header meta's name blocks reach their floors, the blocks give way (hidden, or collapsed to the `↳` glyph) before the model loses a pixel.
**Reached by**: user decision (the developer, 2026-10-01, review cycle 2 browser Major 2)
**Decisive argument**: The developer chose the model readout over the repo readout on a narrow window; the rail card still shows the repo and branch.
**Dissent to honour**: Option B (ellipsize below 1024 px, as the masthead does — kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model) was not chosen.
**Landed in**: `docs/adr/focus-model-never-truncates-name-blocks-give-way.md` (proposed)
