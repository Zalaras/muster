# Proposed backlog: claude-version-watch

### `embedded.spec.ts:76` may be macOS holding a freshly copied musterd
**Summary**: the embedded fixture copies a new musterd per start and waits 10 s; macOS can hold a new binary's first run ~11 s.
**Source**: review.cycle1.md code Note 1; browser Note 1 (first start of a fresh `bin/musterd` took ~3 s to answer, a restart 59 ms).
**Change requested**: no (both are `[note]`).
**Suggested section**: the existing flaky-specs entry at `TODO.md` (shell/update/rail-cards/embedded).
**Pre-existing**: yes — this branch does not touch the fixture's copy or wait.

### Masthead buttons shift sideways when the Claude version readout changes live
**Summary**: the readout narrows 200 → 108 px on a live push and Settings moves ~92 px, so a click can land on Issue.
**Source**: review.browser.cycle1.md Note 2.
**Change requested**: no (`[note]`); a fixed-width readout or leaving it is the developer's call.
**Suggested section**: masthead.
**Pre-existing**: no — before this branch the width only changed at page load.

### The unresolved-claude warning says `status: unknown` while the held version is still served
**Summary**: mid-update, "could not determine claude code version" logs `unknown` though the readout keeps the previous result.
**Source**: review.md (cycle 2) code Note 1.
**Change requested**: no (`[note]`); rewording the log line would make it less misleading.
**Suggested section**: the installed Claude Code version.
**Pre-existing**: no — added by this branch's review-cycle-2 fix.

## Decisions (the developer, 2026-10-15)

- `embedded.spec.ts:76` may be macOS holding a freshly copied musterd — filed: TODO.md § beside "Four E2E specs go red when a second Playwright suite shares the machine", "`embedded.spec.ts:76` may be macOS holding a freshly copied musterd"
- Masthead buttons shift sideways when the Claude version readout changes live — fixed on this branch before landing (plan REQ-5). Not filed.
- The unresolved-claude warning says `status: unknown` while the held version is still served — fixed on this branch before landing (plan REQ-6). Not filed.
