---
id: unknown-model-warning-names-assumed-window
type: fact
status: active
date: 2026-10-14
summary: From 2.1.299 claude --model X -p "" warns on stderr 'Claude Code doesn't recognize the model "X", so it assumes a context window of 200k tokens'; no tokens.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/modelcheck.go]
tests: [TestModelCatalogPrecheck, TestInstalledBinaryCarriesInterfaceStrings, TestStderrSaysUnrecognised]
refs: [kb:fact/model-catalog-precheck-zero-token, plan:model-catalog-sentence]
verified: 2.1.299..canary
guard: TestModelCatalogPrecheck
---
The zero-token check is unchanged: `claude --bare --no-session-persistence --model <m> -p "" </dev/null`
spends no tokens and exits 1 with `Error: Input must be provided …` whether or not the model is
known (kb:fact/model-catalog-precheck-zero-token). From 2.1.299 the stderr line for a model the
binary does not know is:

```
Claude Code doesn't recognize the model "zephyr", so it assumes a context window of 200k tokens. Update Claude Code, or see https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id to set the window.
```

It replaces the older `"<model>" isn't described by this version's model catalog; …` line on
this path. The 2.1.300 bundle still holds the old string twice, so the static tier passes on
either sentence and the pre-check matches both. The change came in 2.1.297, 2.1.298 or 2.1.299;
neither 2.1.297 nor 2.1.298 was probed. On 2.1.300 `zephyr`, `claude-opus-9-9` and
`muster-canary-unrecognized-model` were flagged, and `haiku` printed no warning.

The new wording also states a consequence: an unknown model is run with an assumed 200k-token
context window.

Evidence: direct probe 2026-10-14 of the installed 2.1.296, 2.1.299 and 2.1.300 binaries, using
`zephyr` on each and three more models on 2.1.300.
