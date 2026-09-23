---
id: model-catalog-precheck-zero-token
type: fact
status: active
date: 2026-09-23
summary: claude --model X -p "" warns on stderr that X "isn't described by this version's model catalog" when the binary lacks it; no API call, no tokens.
features: [launch]
tags: [claude-code-format]
files: [internal/claudecode/modelcheck.go]
tests: [TestModelCatalogPrecheck, TestInstalledBinaryCarriesInterfaceStrings, TestStderrSaysUnrecognised]
refs: [test/rig/captures/capture-3.jsonl, kb:fact/fable-model-alias, plan:new-session-improvement]
verified: 2.1.274..2.1.280
guard: TestModelCatalogPrecheck
---
The binary checks `--model` against a built-in model catalog at startup, before it
authenticates. For a string the catalog does not describe, it prints one stderr line beginning
`"<model>" isn't described by this version's model catalog; update Claude Code, …` and then
carries on. This is a warning, not a refusal.

The quietest check is `claude --bare --no-session-persistence --model <m> -p "" </dev/null`.
`--bare` skips hooks and keychain reads, so the run cannot authenticate, spends no tokens and
fires no hooks. It then exits 1 with `Error: Input must be provided …` whether or not the model
is known, so the stderr sentence is the only signal. It takes about 1.0 s. Without `--bare`,
the same check fired `SessionStart` and `SessionEnd`, and its only traffic under a failing proxy
was one `HEAD /api/hello`, with no `/v1/messages` call.

On 2.1.280 these were recognised: `sonnet`, `opus`, `haiku`, `fable`, `Sonnet`, `sonnet[1m]`,
`claude-haiku-4-5-20251001`, `claude-opus-5-5`, `claude-sonnet-5` and `claude-fable-5-1`. These
were flagged: `zephyr`, `claude-opus-9-9` and `mythos`, despite kb:fact/fable-model-alias. The
check covers what this binary knows, not what the account may run.

Evidence: interface probe 2026-09-23, instance 3. There were 12 unauthenticated runs on 2.1.280
and one `zephyr` run on each of 2.1.274, 2.1.278 and 2.1.280. There were 3 authenticated
empty-prompt runs through the fail-proxy. There were 4 `--bare` runs, which added 0 capture
lines.
