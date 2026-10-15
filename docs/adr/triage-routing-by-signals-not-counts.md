---
id: triage-routing-by-signals-not-counts
type: decision
status: accepted
date: 2026-10-15
summary: An issue routes on danger signals — bidi, a rule-family hit, zero-width text, a classifier score — never on sanitiser counts, which are reported only.
features: [triage]
tags: [security, pipeline, user-decision]
files: [internal/triage/route.go, internal/triage/rules.go, internal/triage/scorer.go, internal/triage/artifact.go, tools/triage/main.go]
tests: [TestRoute, TestDangerIsSignalsOnly, TestRuleFamilies, TestScorerProtocol, TestCorpusAdversarialNeverNormal, TestCorpusBenignNeverHeld, TestScanWritesNothing]
refs: [kb:adr/triage-auto-close-never, kb:adr/process-exec-waitdelay-on-pipe-owning-commands, docs/history/design/triage-hardening.md]
supersedes: []
---
**Context.** Routing keyed on `Flags.Any()`: one escaped `<`, one defanged URL, one stripped link or one non-ASCII rune moved an issue off the normal path. A pasted screenshot is an `<img>` tag, so the developer's own report with a picture in it was unreadable (#92, 2026-10-15), and across 92 real issues no count ever marked anything dangerous. The tripwire was twelve phrases.

**Options.** (A) Keep counts as signals and widen the owner exception. (B) Separate what the sanitiser *did* (counts: information) from what the text *is doing* (signals), and route on signals alone. (C) Replace the tripwire with a classifier.

**Decision.** B, settled with the developer, with C left as a hook. The signals are a bidi override, a hit in one of eight rule families (instruction override, role hijack, fake system tag, prompt extraction, data exfiltration, tool coercion, approval bypass, agent-addressed text — phrase lists, precision first, normalised and entity-decoded before matching), hidden zero-width text, and an optional external score. Bidi, a family hit and a score at 0.8 hold; zero-width text or a score at 0.5 restrict. Every count stays in the report. The scorer is any command speaking one JSON line in, `{"id","p"}` out: a number comes back, never text, and a failing scorer flags the issue and leaves its route. No model ships; `scan --state all` calibrates one.

**Consequences.** Run over every real issue with nothing trusted, the rules held exactly the two planted injection tests (#22, #23) and nothing else. A snapshot ambiguity is not a signal: ambiguity already discards the snapshot, so nothing forged reaches an entry. A family's phrases are second-person imperatives so repro steps never trip; "system prompt" stays the one accepted false positive. The report prints a family name, never a phrase or a slice of the body.
