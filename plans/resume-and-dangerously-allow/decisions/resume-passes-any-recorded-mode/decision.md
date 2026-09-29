# Decision: a resume passes any recorded permission mode verbatim

**Reached by**: user decision (the developer, 2026-09-27)
**Raised by**: review cycle 1, code "Decisions for the orchestrator" 1 (`launcherpast.go` sent `default` for a recorded mode Muster does not offer, such as `dontAsk`).

**Options.** (A) Pass any recorded mode verbatim, as the contract reads. (B) Keep the `default` fallback and amend the contract.

**Outcome.** A. "We are going with A and add an issue to add the mode or at least to explore it." Filed as https://github.com/Zalaras/muster/issues/63. No contract text changes: the contract already says "the transcript's last mode, or default when none is recorded", and the web parses any mode string.
→ kb:adr/launch-resume-passes-any-recorded-mode
