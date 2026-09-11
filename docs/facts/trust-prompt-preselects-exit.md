---
id: trust-prompt-preselects-exit
type: fact
status: active
date: 2026-09-11
summary: The workspace-trust prompt preselects "No, exit" (2.1.259+): a bare Enter exits the session; the harness moves the marker first.
features: [launch, canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go]
tests: []
refs: [spikes/FINDINGS.md, kb:fact/trust-prompt-preselects-yes, plan:canary-full-coverage]
verified: 2.1.259..2.1.267
guard: none
---
On the first launch in a directory Claude Code has not seen, the workspace-trust prompt
blocks startup — no hooks fire and no status line renders until it is answered, and headless
`-p` runs do not record trust. Since 2.1.259 the prompt preselects `❯ No, exit`, with `Yes, I
trust this folder` on the second row; a bare Enter exits the session. The canary harness reads
the marker row and moves it onto the Yes row before pressing Enter (`answerTrustPrompt`);
Muster itself never answers the prompt.

Evidence: zero-token probe 2026-09-10 on 2.1.267, also seen on 2.1.259. Not asserted — the
harness depends on it but asserts nothing about it. Supersedes
kb:fact/trust-prompt-preselects-yes.
