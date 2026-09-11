---
id: ingest-shell-quote-at-write-boundary
type: decision
status: accepted
date: 2026-08-25
summary: MergeSettings single-quotes both command-hook paths at the write boundary; the default data dir with a space stays and nothing else quotes.
features: [ingest, launch]
tags: [claude-code-format]
files: [internal/claudecode/settings.go]
tests: [TestMergeSettings_CommandFieldIsShellQuotedForSpaceBearingPath, TestMergeSettings_ShellQuoteEscapesSingleQuoteAndStaysIdempotent, TestShellQuote]
refs: [docs/history/spec-changelog.md, plan:m4-hook-quoting, kb:fact/hook-commands-are-shell-lines, kb:anchor/ingest.envelope]
supersedes: []
---
**Context.** The command-hook and status-line command fields are shell command lines, not paths. Muster wrote bare paths, and the default data directory under the user's application support folder contains a space, so neither wrapper script had ever run against the real daemon; the gauges had only ever seen synthesized input.

**Options.** (A) Move the data directory to a space-free location. (B) Quote the path at the one place it is written into settings, keeping raw paths everywhere else in the daemon.

**Decision.** B, with single quotes and the standard escape for an embedded quote.

**Consequences.** The matcher that recognises Muster's own entries accepts both the quoted and the legacy bare form, so an already-instrumented directory has its stale entry replaced rather than duplicated. The config struct keeps raw paths and no caller quotes. The test harness's scratch data dir carries a space so every run exercises the production path shape.
