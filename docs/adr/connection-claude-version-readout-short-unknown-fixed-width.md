---
id: connection-claude-version-readout-short-unknown-fixed-width
type: decision
status: accepted
date: 2026-10-15
summary: The Claude version readout's unknown state reads "claude unknown" and the readout keeps one width, so a live change never moves the masthead controls.
features: [connection]
tags: [ux, user-decision]
files: [web/src/style.css, web/src/features/connectionversion.ts]
tests: [web/e2e/claude-version.spec.ts]
refs: [plan:claude-version-watch, kb:adr/connection-claude-version-watched-and-pushed, kb:adr/connection-installed-claude-classified-never-refused]
supersedes: []
---
**Context.** Once the version is pushed live, the readout can change width while the page is open. It sits right of Issue and Settings in a right-anchored row, so going from "Claude installation unknown" (~201 px) to "claude 2.1.300" (~104 px) moved Settings 92 px, enough to turn a click on Settings into one on Issue. Reserving the long text's width held the controls still but overflowed the masthead at 1280 px with every gauge known and at 1000 px and 900 px.

**Options.** (A) Reserve the long text's width and accept the overflow. (B) Shorten the unknown text to "claude unknown" and reserve the widest version text's width. (C) Reserve the version width and accept one shift when unknown changes to a version.

**Decision.** B, the developer's choice: the only option that keeps the controls still and the masthead fitting.

**Consequences.** Every state renders inside one reserved width, right-aligned. The unknown state's hover text explains it. The pre-hello placeholder and the unknown state read the same, which is true of both.
