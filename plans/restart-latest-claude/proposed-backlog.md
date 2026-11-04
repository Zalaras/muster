# Proposed backlog — restart-latest-claude

Proposals only; nothing here is filed. `/land` puts each to the developer.

### Canary guard for the running-version fact

**Summary**: Pin kb:fact/running-session-version-sources (status line `version` = the binary a session started from) with a canary test.
**Source**: plan.md § Implementation Notes → Doc upkeep ("propose a canary guard for the running-version half in the run's proposals").
**Change requested**: yes — the plan asks for it; the fact and kb:fact/resume-with-plan-flag-keeps-plan carry `guard: none`.
**Suggested section**: Tooling and docs
**Pre-existing**: no — the facts were recorded for this plan; the restart feature now depends on the first.

### `make e2e` and `make e2e-soak` cannot wait longer for a busy gate lock

**Summary**: `bin/gatelock` ignores MUSTER_GATELOCK_WAIT, so a direct `make e2e` exits 75 after 4 min behind another worktree's sweep.
**Source**: plans/restart-latest-claude/test-specs.md (wave 3) and daemon-tests.md (cycle 1 fix wave): both agents fell back to `bin/gatelock run --wait …` by hand; `gates.sh` does honour the variable.
**Change requested**: no — both agents called it "a tooling note, not a handoff request".
**Suggested section**: Tooling and docs
**Pre-existing**: yes — this branch does not touch `tools/gatelock` or the Makefile.

### Masthead right cluster overflows a 900px window

**Summary**: At 900×700 the masthead's right cluster runs past the viewport, so anchored panels are pushed away from their anchor.
**Source**: review.browser.cycle1.md Note 2 (re-stated in cycle 2).
**Change requested**: no — "This was already so before this plan; it only widened the box slightly."
**Suggested section**: Tweaks
**Pre-existing**: yes — the readout box grew 1ch on this branch; the overflow predates it.

## Decisions (the developer, 2026-11-04)

1. Canary guard for the running-version fact — not filed: done directly on `main` after this land.
2. `make e2e` and `make e2e-soak` cannot wait longer for a busy gate lock — not filed: done directly on `main` after this land.
3. Masthead right cluster overflows a 900px window — not doing
