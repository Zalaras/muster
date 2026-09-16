# Debate: envelope-pane-corroboration

### Turn 1 — advocate-a (argument)

**The residual risk the issue names always carries a pane, so lenient closes all of it.**
`TODO.md:291` states the window: "a straggler from before a resume, on the same row". A
resume re-stamps the row's pane from the new tmux session (`docs/protocol.md:216`:
"`tmuxTarget`/`tmuxPane` are the new pane's"). A straggler from the pre-resume pane came
out of a real tmux pane, so its envelope carries `tmuxPane` — `internal/claudecode/settings.go:309`
emits the field iff `$TMUX_PANE` is set, and `kb:fact/command-hooks-inherit-pane-env`
measured it present on the interactive `SessionStart`. Option A's mismatch arm drops
exactly that event.

Strict's *extra* arm is "pane absent → unrouted". That fires only where `$TMUX_PANE` is
unset for a managed session, which on the measured chain is headless only — canary runs A
and C, where `test/canary/harness_test.go:407` strips `TMUX_PANE` from the run env.
Muster never launches a session outside tmux. So B's additional strictness reduces the
named risk by zero, while `docs/protocol.md:711` documents pane-absent as a legitimate
shape ("from $TMUX_PANE; absent outside tmux (headless probes)").

**B's cost is measurable, and larger than the brief's estimate.** I count 169 enveloped
fixture call sites outside `web/e2e/helpers/payloads.ts` (144 `envelopedSessionStart`, 17
`envelopedStatusLineFull`, 6 pre-first-response, 3 resume, 2 unbound), of which 141
already pass an explicit `musterSession: session.id`. `tmuxPane` is *not* on the wire
`Session` — `web/src/protocol.ts:139` carries `tmuxTarget` only, and `docs/protocol.md:847`
exposes only that — so B cannot read the pane from state it already has. Each site needs
`await daemon.tmuxPaneId(...)`, i.e. one extra tmux subprocess per fixture post, ~158 added
forks per e2e run. `payloads.ts:9-12` states the layer's contract: "Deliberately
deterministic: fixed session ids, fixed pane/envelope values … no randomness, no
wall-clock reads." B puts a live tmux read at every site in a suite whose flake bar is
`make e2e-soak N=10` (`docs/conventions.md` § Testing). Damian's constraint: "it shouldn't
be a 'big' change."

**Coverage is equal.** A already exercises both arms through the real pane, via the
existing scratch-socket query pattern at `web/e2e/helpers/daemon.ts:891`. B runs that same
oracle 158 more times and learns nothing further.

### Turn 1 — advocate-b (argument)

**Steelman.** A's strongest form: the residual the issue names — a straggler from before a resume — always carries a pane, since `MUSTER_SESSION` is injected only into a tmux pane (`internal/server/sessions.go:153`), where `$TMUX_PANE` is set and `settings.go:309` emits the field. So A's mismatch arm catches all of the named risk, and B's only extra arm fires on no producible managed post, while costing every call site a live tmux read in a layer whose stated contract is "fixed pane/envelope values" (`payloads.ts:9-12`).

That is correct about the named residual. I argue B on three other grounds.

**1. A does not leave the absent-pane branch alone; it moves the whole suite onto it.** A's own text changes both fixture defaults from `%12` to no pane. No enveloped fixture site passes a pane today: 143 in `web/e2e` by my count (123 `envelopedSessionStart`, 15 status-full, 3 pre-first-response, 2 resume — you count 169), plus 26 `claudecodetest.Enveloped*` bodies in Go. After A, every one of them routes through the uncorroborated branch, and the corroboration is exercised in exactly two tests. `docs/conventions.md` § Testing binds fixtures to "the shapes the fact records measured", and the measured managed shape carries a pane — `kb:fact/command-hooks-inherit-pane-env`'s guard asserts `tmuxPane` on the interactive `SessionStart`. A's new default is the headless-probe shape, which the product never sends from a managed session.

**2. The cost, measured.** 100 `tmux list-panes -F '#{pane_id}'` against a scratch socket: 1.014 s wall on this machine, ~10 ms each. At 169 uncached queries that is ~1.7 s added to a suite of 278 tests with a 60 s per-test timeout, on top of the 297 real tmux launches the suite already performs; memoising by target cuts it to one query per session. Determinism is unaffected: a pane id read from the session under test is derived, not random, and `web/e2e/helpers/daemon.ts`'s tmux queries are already called from 44 spec sites.

**3. The precedent argues for deleting the default, not swapping it.** `plans/plain-terminal-session/test-specs.md:196` was a builder default silently filling an envelope field the test did not intend. A replaces `%12` with a default that silently disables the new check. B removes the default so the field must be stated — which is the user's constraint verbatim: "touching a lot of code … small changes or a helper function".

### Turn 2 — advocate-a (concession)

**Steelman.** Your strongest point: Option A does not leave the absent-pane branch alone,
it moves the entire fixture suite onto it. A *must* flip the default to no-pane, because
`%12` would mismatch every real scratch-socket pane — so after A all 123 enveloped e2e
call sites and 26 `claudecodetest.Enveloped*` bodies route through the uncorroborated
branch, while the check itself is exercised twice. `docs/conventions.md` § Testing binds
fixtures to "the shapes the fact records measured", and the measured managed-tmux shape
carries a pane (`kb:fact/command-hooks-inherit-pane-env`'s guard asserts `tmuxPane` on the
interactive `SessionStart`). A's new default is a shape no session under e2e test could
produce, since every e2e session is a real tmux pane on the scratch socket.

Two corrections to the record, both against me. My 169 was inflated — it counted import
lines (19 for `envelopedSessionStart` alone); your 123 is the call-site figure. And a
follow-up count of mine, "14 e2e sites already pass a pane", was wrong: every one of those
matches is `tmuxPaneExists`, not a payload argument. No enveloped fixture site passes a
pane today, exactly as you said.

I concede: A's fixture default routes the whole suite through the lenient branch, making
the corroboration it adds non-load-bearing everywhere but two tests — which is
`kb:lesson/two-wire-shapes-accepted-hides-disagreement` ("every test green, contract
wrong") reproduced deliberately. My cost objection does not survive your measurement
(~10 ms per query, ~1.7 s over the run, memoisable to one query per session), and my
determinism objection was simply wrong: a pane id read from the session under test is
derived, not random. My remaining ground was that B's extra arm drops pane-less envelopes
— but by my own turn-1 analysis that arm never fires for a managed tmux session, so it
costs as little as it buys, and the fixture argument decides.

One shared hazard for whoever implements it, not an argument for A: `internal/server/sessions.go:271`
spawns the pane and `:288` records it, so a `SessionStart` arriving in that window meets an
empty stored `TmuxPane` and is a *mismatch* under both options. Strict should treat an
empty stored pane as "cannot corroborate", not as a mismatch.
