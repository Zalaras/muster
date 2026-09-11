---
id: launch-model-presets-passed-verbatim
type: decision
status: accepted
date: 2026-08-30
summary: The Model control offers named presets, including fable, that are passed to --model verbatim; the daemon accepts any non-empty model string.
features: [launch]
tags: [claude-code-format, ux]
files: [web/src/features/launch.ts, internal/claudecode/launch.go]
tests: [TestLaunchFlags, web/e2e/launch.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:new-session-dialog, kb:fact/fable-model-alias, kb:anchor/sessions.create]
supersedes: []
---
**Context.** Claude Code accepts model aliases as well as full ids, and the set of useful aliases changes with releases. The launch form needed to offer the common ones without Muster becoming the authority on what is valid.

**Options.** (A) A free-text model field only. (B) Named presets in the form, each passed through unchanged, with the daemon validating nothing beyond non-empty.

**Decision.** B. A preset is added only after the alias is measured against the installed binary, which is how fable joined haiku, sonnet and opus.

**Consequences.** Adding a preset is a form change and a doc comment on the create endpoint, never a wire change. An alias the installed binary rejects fails inside the session where the user can see it, which is the honest place.
