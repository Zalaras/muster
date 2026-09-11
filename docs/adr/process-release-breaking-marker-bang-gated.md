---
id: process-release-breaking-marker-bang-gated
type: decision
status: accepted
date: 2026-09-01
summary: The exclamation mark is the only breaking marker, legal only when a human sets MUSTER_BREAKING=1; the footer phrase is banned outright by the hook.
features: [release]
tags: [pipeline, security, user-decision]
files: [.githooks/commit-msg, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/release-versioning-automatic-from-conventional-commits, kb:adr/process-release-v0-clamp-v1-deliberate]
supersedes: []
---
**Context.** The convention had claimed a breaking footer would be silently ignored because commits carry no body. Measured wrong, and dangerously: the version tool matches the phrase anywhere in a message, hyphenated or mid-sentence, forces a major on any type, and honours the exclamation mark even on unknown types, while the default branch in fact carries bodies with trailers and retro paragraphs. A docs body merely mentioning the phrase would have cut a major.

**Options.** (A) Rely on convention: nobody writes the phrase or the marker. (B) Allow both markers and trust review. (C) One sanctioned marker, the exclamation mark, gated by an environment variable only a human sets; the footer phrase banned everywhere in a message by the commit-msg hook.

**Decision.** C, settled with Damian. Agents and skills never set the variable, so a breaking release is always a deliberate human act.

**Consequences.** On the pre-1.0 line the marker is honest history: it records the breakage and bumps minor like any feature, under the clamp decided alongside this record; from 1.0 it resumes meaning major. The hook rejects the phrase even in prose, so a commit explaining a breaking change must find other words. Safety is mechanical, not a sentence in the conventions.
