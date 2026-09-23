# Decision: check-kb-before-approval

**Outcome**: A. "land the staged launch-spec globs before an approval cycle. The orchestrator can do it, or doc-reconcile can be spawned early for the frontmatter only." The orchestrator makes the edit.
**Reached by**: user decision. The developer answered "Granted" to the orchestrator's recommendation, "one more cycle, Option A, and may I run the forced canary?", on 2026-09-23 after review cycle 3.
**Decisive argument**: With K1 red, `merge-review` computes `needs-changes` (`orch-state.py:162`), and doc-reconcile, which owns the globs, runs only after approval. The run could never approve. The globs are registry wiring already staged verbatim in `doc-delta.md`. Landing them lets the gate go green honestly, whereas Option B would have needed a merge-script override.
**Dissent to honour**: None. Doc-reconcile still owns every prose claim in `docs/features/launch/spec.md`, and it finds these three glob entries already present.
**Landed in**: docs/features/launch/spec.md (frontmatter `go:`/`web:`/`e2e:` only), docs/adr/process-unowned-file-globs-land-before-approval.md
