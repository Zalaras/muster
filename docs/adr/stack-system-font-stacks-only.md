---
id: stack-system-font-stacks-only
type: decision
status: accepted
date: 2026-08-16
summary: Typography uses system font stacks only; no web fonts, no CDN, no vendored font binaries.
features: [theme]
tags: [deps, ux]
files: [web/src/style.css, web/index.html]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/design-system.md]
supersedes: []
---
**Context.** The dashboard is a localhost app with a deliberately small dependency tree. The visual direction wanted a monospaced, dense feel that a bundled typeface could sharpen.

**Options.** (A) Load a web font from a CDN. (B) Vendor font binaries into the build. (C) Use the platform's system font stacks and accept their variation.

**Decision.** C. A CDN fetch makes a local tool depend on the network and leaks a request; vendored binaries add weight and a licence to track for no functional gain.

**Consequences.** The type ramp is specified in relative sizes against system faces, and the design system names fallbacks rather than a single family. Any future proposal to ship a typeface reopens this record.
