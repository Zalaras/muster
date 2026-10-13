---
id: process-comment-pass-drop-reaches-tests-and-css
type: decision
status: accepted
date: 2026-10-13
summary: The comment pass's drop also reaches unit tests, E2E specs and helpers, and stylesheets, so every stale-comment note has a route; strip is unchanged.
features: [comment-pass]
tags: [pipeline, user-decision]
files: [internal/commentpass/scope.go, internal/commentpass/drop.go, internal/commentpass/csscomments.go, internal/commentpass/collect.go]
tests: [TestDrop_ReachesTestFilesE2EHelpersAndStylesheets, TestScanCSS_FindsOnlyBlockComments]
refs: [kb:adr/process-comment-pass-owns-code-comments, plan:title-crop-stop-resume-button, plans/title-crop-stop-resume-button/review.cycle1.md]
supersedes: []
---
**Context.** The orchestrator answers a reviewer's `[note]` naming a stale comment with `commentpass drop`, never a wave. Drop shared strip's scope — non-test Go and TypeScript — so in plan `title-crop-stop-resume-button` it refused `web/e2e/helpers/focus-header.ts` ("outside the pass's scope"), and stale comments in that helper and in `web/src/style.css` stayed flagged across both review cycles with no route at all.

**Options.** (A) Keep drop's scope; route such notes to the file's agent in a wave. (B) Widen drop alone to test files, E2E specs and helpers, and stylesheets. (C) Also strip and judge test comments.

**Decision.** B (the developer, 2026-10-13). Drop removes only a block a reviewer named, so it needs no judge; it reaches `_test.go`, `*.test.ts`, `web/e2e/**/*.ts` and `web/src/**/*.css`. A stylesheet is read by a CSS-only scanner — block comments only, so a `//` in a `url()` or a `/*` in a string is never one — and is never handed to Biome. Strip, the judge and verify keep their production-only scope; C would need a plan-ID exception, since test titles cite plan IDs by convention.

**Consequences.** Every stale-comment note has a mechanical route. Test files' added comments are still read only by the `comment-checks.py` regex hook.
