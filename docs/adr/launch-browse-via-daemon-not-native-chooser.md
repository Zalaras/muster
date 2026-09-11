---
id: launch-browse-via-daemon-not-native-chooser
type: decision
status: accepted
date: 2026-08-22
summary: Directory choice browses through a daemon listing endpoint rooted at a configurable home, because browsers never reveal a picked folder's absolute path.
features: [launch]
tags: [ux]
files: [internal/server/browse.go, web/src/features/launch.ts]
tests: [web/e2e/launch.spec.ts]
refs: [docs/history/protocol-changelog.md, plan:m1-sessions, kb:anchor/browse.get, kb:adr/launch-hybrid-mru-directory-memory]
supersedes: []
---
**Context.** The first protocol draft assumed the launch dialog could use the browser's native folder chooser to pick a directory to launch in.

**Options.** (A) The native chooser. (B) A daemon endpoint that lists a directory's children and parent, which the dialog navigates.

**Decision.** B. The native chooser was wrong by design: browsers deliberately never disclose a chosen folder's absolute path, and the daemon needs exactly that path.

**Consequences.** The endpoint's no-argument default and its upward ceiling are a browse root that defaults to the user's home and can be pointed elsewhere, so the E2E harness browses a scratch tree instead of the real home. Explicit absolute paths outside the root stay browsable. Dotfiles are excluded from listings by decision.
