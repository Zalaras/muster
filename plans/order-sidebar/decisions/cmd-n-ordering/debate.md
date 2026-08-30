# Debate: cmd-n-ordering

### Turn 1 — advocate-a (argument)

Steelman of B: ⌘1 is today the only single keystroke that reaches whatever is blocking Damian without him reading the rail first. That is a real affordance, it costs zero code to keep, and the manual order is *his* — he already knows where his cards are, so he needs a key least for exactly those. A doc line is cheaper than a behaviour change.

My case:

1. **B keeps one key and wastes eight.** `sortSessions` (`web/src/sessions/sort.ts:47-61`) is a six-tier priority table with time tiebreaks. "1st by attention" is memorable; "7th by attention" is not predictable by anyone, and it re-ranks on every state transition. Under A all nine keys index a list the user authored and can see; under B ⌘2–9 are practically unusable.

2. **In Tiles, B indexes a list shown nowhere.** The strip now renders `orderRail(...)` (`web/src/main.ts:612-615`). On `main` the strip was `sortSessions(...)` (`main.ts:577`), so ⌘N at least shared the strip's ranking *function*. After this plan, B leaves ⌘N ranked by an order no Tiles surface displays. Honest caveat: A does not make ⌘N equal the strip either — `focusNth` counts all sessions, the strip excludes live tiles — but A counts over an order the user set.

3. **Two definitions of "first session" in one file.** Default focus falls back to `orderRail(sessions, railSort)[0]` (`main.ts:641`). Under B, the card you land on at load and the card ⌘1 gives you are different cards. Under A, ⌘1 is "back to the top of my rail".

4. **It is the plan's own premise.** Overview (`plans/order-sidebar/plan.md:13-15`): the point is muscle memory, cards that don't move under you; REQ-7 (`:70-73`) forbids a state change moving a card. B keeps one control whose target a state change still moves.

5. `sort.ts:66-69` already asserts display order lives in one function. B leaves `focusNth` (`main.ts:291`) as `main.ts`'s only remaining `sortSessions` caller.

Cost I accept: A loses the neediest jump, and does not restore it in attention mode either (the pinned block precedes). My reading: "who needs me" is the toggle's job; the rail's job is where I put things.

### Turn 2 — advocate-b (argument)

Steelman of A: a stable position→session map is exactly the muscle memory this plan exists to build (plan.md Overview; TODO.md "Pre-v1 Cleanup"). Under B, ⌘2–9 index a six-tier priority table that re-ranks on every hook — nobody can predict "7th by attention". Nine learnable keys beat one, and A costs one line.

Three answers.

1. **The attention reading is not an accident of the two orders coinciding — it was specified and is tested.** `web/e2e/views.spec.ts:69`: *"Cmd+\\ toggles the view and Cmd+1 focuses the top-priority session **regardless of launch order** (E7)"*. Its setup comment (`:77-78`) launches `prio-b` first and `prio-a` second, gives only A a permission prompt, "so it must sort to the top (M1's needs-input-first rule) regardless of launch order", and asserts ⌘1 focuses A (`:100-101`). Under A with the default `manual` sort (REQ-5), `railPos` is launch order → ⌘1 focuses `prio-b`, and E7 fails. That spec is green inside this plan's 136/136 (review.md, Build & Tests), and e2e-validate repaired three pre-existing specs but not this one. "Regardless of launch order" is exactly the property A deletes. So the review's "before this plan the two orders were the same function, so they could not disagree" understates it: M1 chose the attention reading deliberately and pinned it in a named test. A reverses a recorded decision — and needs a test wave, since impl agents can't edit tests.

2. **A's nine-key benefit is Focus-only.** The rail *and* `#rail-sort` sit inside `#view-focus` (index.html:32-41), which is `hidden` in Tiles (main.ts:682-683). In Tiles, A makes ⌘N index an invisible list ordered by a control unreachable from that view. You conceded ⌘N ≠ strip; so "a list the user can see" holds in one of two views, and in the other A adds a hidden dependency B does not have.

3. **A deletes the last keyboard path to SPEC §2.1** ("Sorted with Needs-Input first, longest-blocked at the top"). You concede attention mode does not restore it (pins precede — sort.ts:71-76). The plan kept the attention sort because "'where am I needed' and 'where did I put things' are both wanted at different moments" (Overview). B serves both at once: your layout on screen, one key to whoever is blocking. A serves one, and approximating the other costs a mode flip that also disables drag (REQ-10).

### Turn 2 — advocate-a (argument)

Steelman: E7 is not the two orders coinciding by accident — a named spec asserts ⌘1 reaches the top-priority session *regardless of launch order*, it is green inside this plan's 136/136, A fails it, and in Tiles the rail and its toggle are hidden so A's "visible list" holds in one view only.

I read E7 (`web/e2e/views.spec.ts:69-108`). Your quotes are accurate and A does break it as written. Three answers.

1. **E7's greenness is caused by the choice under debate.** `focusNth` is the one consumer web-impl left on `sortSessions`; had it moved, E7 would have joined repairs #3–#5. Those are the same class — `test-specs.md:181`: *"Test predates this plan; assumed the rail's only sort was the priority/ended-last order this plan renamed to 'Attention mode' and made non-default"* — fixed by `selectOption("attention")`, with *"No assertion was deleted, skipped, or weakened"* (`:185`). The plan has already run this repair three times. E7 is a fourth instance, not a counterexample. And the reviewer ran E7 green and still filed this as `[orchestrator:decision]` — the pipeline does not treat E7 as settling it.

2. **What M1 decided.** E7 discriminates the sorted list from launch order; its own comment at the ⌘1 assertion names the invariant it guards — *"⌘1 moves focus the same way a rail-card click does (one live surface at a time, INV-2)"* (`:100-102`). In M1, launch order was an accident of store insertion, not a user artifact; there was nothing to choose between. REQ-1/REQ-5 make it the user's order and the default. A test proving "not raw insertion order" records no decision against an order that did not yet exist.

3. **Tiles.** Verified: `#rail-sort`/`#sessions` sit in `#view-focus` (`index.html:31-41`), hidden at `main.ts:682`. But `orderRail` is a total sort, so `orderRail(all, mode)` restricted to non-live cards *is* the strip (`main.ts:612-615`). Under A the visible strip is a subsequence of the ⌘N list. Under B, ⌘N ranks by an order with no witness in Tiles at all — grid is `tilesLive`, strip is `orderRail`. Partly visible beats nowhere.

4. **§2.1.** The plan amends it (`plan.md:36-38`): Needs-Input-first becomes the attention *mode*, and review Major 2 has the orchestrator recording that. There is no §2.1 keyboard obligation to delete. B's key is "whoever is blocking" only when something is blocking; otherwise it is the top of six tiers, and you must look to know which — at which point the needs-input card is already the loudest thing on screen (ux-flows §3.4).

### Turn 4 — advocate-b (concession)

Steelman of your turn 2: E7 proves ⌘1 is not raw store-insertion order — but at M1 insertion order was an accident, not a user artifact, so E7 chose between attention and *nothing*; it is a fourth instance of the repair class the plan has already sanctioned three times, not a decision against an order that did not yet exist. And `orderRail` being a comparator-based total sort makes the strip a subsequence of A's ⌘N list, so A is partly witnessed in Tiles where B is witnessed nowhere.

I verified both. `test-specs.md`, Repairs #3–#5: root cause "Test predates this plan; assumed the rail's *only* sort was the priority/ended-last order this plan renamed to 'Attention mode' and made non-default", fix `selectOption("attention")`, and `:187` "No assertion was deleted, skipped, or weakened." E7 is the same shape and repairs the same way — select Attention before the ⌘1 press at `views.spec.ts:100`; with nothing pinned, `orderRail`'s attention branch delegates to `sortSessions` and `prio-a` is still top, so the assertion survives verbatim. The subsequence claim is right too: filtering a comparator-ordered list preserves relative order, so A's list restricted to non-live cards is exactly the strip, while B's (`sortSessions` over all) is not.

**I concede: E7 records no decision between the attention order and a user-authored rail order, because no user-authored order existed at M1 — it discriminates only against store-insertion order, and it falls in the plan's already-sanctioned repair class. That was the only evidence I had that the attention reading of ⌘N was chosen rather than merely inherited from the two orders being one function.**

With it gone, your case stands unanswered: nine keys over an order the user authored beats one key plus eight unpredictable ones, and the plan says so itself — `plan.md:35-36`, "The Tiles strip follows the same order (minus live tiles), so there is **one order across both views**". Under B, ⌘N is a second order, against that sentence.

I also withdraw my §2.1 point: `plan.md:36-38` already amends §2.1's "Needs-Input first" to the rail's attention *mode*, so there is no standing obligation for a keyboard path to it. The cost you accepted is real but small at 4–6 sessions, where `needs_input` is by design the loudest thing on screen (ux-flows §3.4).

Option A.
