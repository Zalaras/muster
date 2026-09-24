# Debate: sessionend-alive-hint

### Turn 1 — advocate-a (argument)

No opponent point yet to steelman; I open.

**1. Which document tells the truth.** Five sources describe the hint as shipped: `docs/protocol.md:1305` (the row), `:984` ("live from the liveness poll and the SessionEnd hint"), `:1344` ("`SessionEnd` is only a hint"), `machine_test.go:893` (`TestApplyInput_DeathHint`), and `kb:fact/sessionend-reason-ambiguous`, whose own `tests:` field names that test. Two diverge: the ADR's sentence and `internal/session/CLAUDE.md:7`. The ADR was written on 2026-09-12 (`a039928`, "ADRs from the spec changelog"), three weeks after the arm shipped in M1 (`0767b9f`, 2026-08-22). The "removed once already" leak it cites was `sess.Alive = true` on a resume bind (`plans/m4-reconcile/review.cycle1.md:162-168`). That same fix enumerated `KindDeathHint` and judged it legitimate: "only `KindDeathHint` touches `Alive` … legitimate … corroborated by the liveness poll independently" (`cceb5b7`, m4 daemon-implementation). In my reading the ADR over-generalised a changelog line. A corrects two documents to match five; B changes shipped behaviour to match two.

**2. The hazard the ADR guards is one-directional.** The measured harm was a payload *reviving* a dead session. The hint can only write `alive=false`. It cannot create a live-looking card over a dead pane.

**3. Latency under B is the poll interval.** `defaultPollInterval = 5 * time.Second` (`manager.go:65`). Today nothing nudges on SessionEnd: the only `Nudge` caller is `terminal.go:259` (PTY EOF, only when a terminal is attached). So B's "keeps whatever else it does today" keeps nothing. SessionEnd becomes inert, and a card shows alive for up to 5 s after `/exit`. A nudge added at SessionEnd would race the process's own exit, because the hook fires from the still-running process and ingest returns 200 before processing. That is judgement; I have not measured it.

**4. False "ended": the honest cost of A, and how narrow it is.** A false hint is sticky. `checkLiveness` polls only `s.Alive` sessions (`liveness.go:130`), so recovery comes only from reconcile at restart (`reconcile.go:230`) or Resume. But the pane runs `claude` directly (`tmux.go:142`, `new-session … -- command`; no `remain-on-exit` anywhere in `internal/`). So a non-clear SessionEnd means the pane's only process is exiting. `/clear` is exempt (`interpret.go:208`). A late SessionEnd from a pre-resume pane goes unrouted by pane corroboration (`ingest.go:235`).

**5. Reconcile after restart is identical under both.** It ignores the stored flag (`protocol.md` § state.liveness).

### Turn 1 — advocate-b (argument)

**Steelman.** Five artefacts describe the shipped hint. The ADR was back-written later and over-generalised a leak that ran the other way (`alive=true`). A write of `alive=false` cannot paint a live card over a dead pane. B buys doc-consistency and costs up to 5 s of stale "alive".

**1. Point 5 is wrong, and that is where A does harm.** When the pane is absent, reconcile reads the stored flag: `alive=1` is kept as ended with Resume, and `alive=0` is **deleted** (`protocol.md:1361-1366`). `kb:adr/lifecycle-liveness-writes-stop-at-shutdown` fixed exactly this for the poll and the PTY nudge: "A pane dying just before a restart could therefore have `alive=false` persisted by the dying process… reconcile… swept it". That bug was measured at 8/10 failing. The ADR's consequence is "exactly one authority decides a session's final alive state". Its `stopped` guard lives only in `checkOneLiveness` (`liveness.go:175`), so the DeathHint arm is an unguarded third writer. `StopLivenessPoll` runs first (`server.go:276-290`), but hooks keep arriving until HTTP shutdown, and the ingest queue drains them (`ingest.go:110-113`). A `/exit` inside that several-second window, or inside an auto-update restart (`main.go:470-475`), therefore persists `alive=0`, and the next boot deletes the row. Under B the row is kept as ended, with Resume. This comes from reading the code, not a measurement, but it is the measured bug's mechanism in the same direction.

**2. A supersedes more than one ADR.** `kb:adr/lifecycle-alive-flag-not-a-state` says "No transition ever writes alive", and the arm is inside `applyInput`. `spec-changelog.md:310` says "never from a hook payload". The shutdown ADR's consequence is also false under A.

**3. The m4 quote is not a ruling.** It is daemon-impl's self-report (`daemon-implementation.md:80-84`). Its premise, "corroborated by the liveness poll independently", is false in code: once the hint sets `alive=false`, the poll never looks again (`liveness.go:130`). `protocol.md:1344` says `alive` "is decided by tmux pane existence" and calls SessionEnd "only a hint". So the protocol's authority sentence sides with B and its row contradicts it. Its "event-nudged (`SessionEnd`…)" is false today, as you found.

**4. I concede the latency cost.** Up to 5 s with no terminal attached. With one attached there is none, because PTY EOF nudges (`terminal.go:370-376`). The same poll bound was accepted for `kill -9` (`m1-sessions/plan.md:441`).

**5. Narrowness is judgement.** `interpret.go:208-211` maps *every* non-"clear" reason to a hint, including reasons never observed (the fact lists two).

### Turn 2 — advocate-a (concession)

**Steelman.** The hint is an unguarded writer of `alive=false`, and it keeps running during the shutdown window that `kb:adr/lifecycle-liveness-writes-stop-at-shutdown` closed for the poll and the PTY nudge. Reconcile deletes a paneless `alive=0` row, so a `/exit` during that window loses the user's Resume. Under B the row is kept as ended.

I checked it, and it holds. `shutdownGracefully` calls `StopLivenessPoll` first (`cmd/musterd/onexit.go:48`). It then runs `ShellCount` and the `-on-exit=ask` prompt, which can take up to 10 s (`onexit.go:22`, `:58`, `:66`). Only after that does it shut HTTP down (`onexit.go:96`). So hooks are still ingested and applied throughout. `stopped` is read only at `liveness.go:175`, so `Apply` (`internal/session/apply.go:44`, which persists via `sessionToRow`) has no guard. My point 5 was wrong: reconcile does read the stored flag (`protocol.md:1361-1366`).

**I concede:** keeping the hint makes it a third writer of the final `alive` state. That breaks the accepted shutdown ADR's "exactly one authority decides a session's final alive state". Its failure mode is the one that ADR measured (8/10): a swept row and a lost Resume. That is worse than the cost of B, which is up to 5 s of stale "alive" and only when no terminal is attached. I also accept point 3: the m4 justification "corroborated by the liveness poll independently" is false in code, because `checkLiveness` never re-checks a non-alive session (`liveness.go:130`). Point 5 on unobserved reasons also stands: `interpret.go:208-211` maps every non-clear reason to a hint.

**Note for the implementer (not a new option).** Under B, `protocol.md:1344`'s "event-nudged (`SessionEnd`, PTY EOF, End)" is still false, because nothing nudges on SessionEnd today. The doc edit must delete `SessionEnd` from that list, and fix `:984` and the `:1305` row with it.
