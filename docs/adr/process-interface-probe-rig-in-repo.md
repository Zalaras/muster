---
id: process-interface-probe-rig-in-repo
type: decision
status: accepted
date: 2026-08-16
summary: Wire-format questions are answered by the in-repo probe rig through the interface-probe skill, against the real binary; findings land as fact records.
features: [canary]
tags: [claude-code-format, testing, pipeline]
files: [test/rig/newprobe.sh, .claude/skills/interface-probe/SKILL.md, spikes/FINDINGS.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:fact/headless-fires-full-hook-sequence]
supersedes: []
---
**Context.** The step-one spikes ran from a sibling directory with their own capture scripts. Once the repo existed, later questions about hook payloads and CLI behaviour needed the same rigour without re-deriving the setup each time.

**Options.** (A) Keep probing from the external spike directory and copy conclusions across. (B) Port the rig into the repo, wrap it as a skill, and make its captures and findings first-class files.

**Decision.** B. The rig lives under the test tree with its capture and fail-proxy helpers, and the skill runs a controlled probe against the pinned binary.

**Consequences.** Every wire-format claim points at a capture file. Failures are induced with a non-retryable client error, because the CLI retries server errors with backoff. Most probes run headless, since the full hook sequence fires without tmux. A probe burns real subscription usage, so it uses the cheapest model and trivial prompts.
