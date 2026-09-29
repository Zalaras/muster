# Decision: a pending resume holds its Claude session id

**Reached by**: user decision (the developer, 2026-09-27)
**Raised by**: review cycle 1, code "Decisions for the orchestrator" 2; the same gap as browser Critical 2 and maintainability Major 3.

**Options.** (A) Count an alive, unbound row spawned with `--resume X` as holding X until it binds or dies. (B) Accept the window and narrow INV-4 to "bound".

**Outcome.** A. `openSessionId` and `409 already_open` now mean "an alive session bound to, or pending a resume of, this id". The plan's Protocol Contract and `docs/protocol.md` are amended to say so.
→ kb:adr/launch-resume-pending-resume-holds-id
