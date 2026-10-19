# Debate: location-panel-overflow

### Turn 1 — advocate-a (argument)

B's strongest form, as I read it: the failure needs 13+ directories, nothing says the developer has that many, and A spends a new line, a plan amendment and part of the list on a case that may never occur.

1. **B is not "cost: none".** Edge case 15 (`plan.md:230`) promises "the panel lists all". Measured, it does not at 20+ rows: 22 long paths span 8–1281 px in an 800 px viewport, `pointer-events: none`, `overflow: visible`, so the lower rows cannot be reached (review.md browser matrix, edge 15 FAIL). The panel cannot scroll: REQ-9 makes it untouchable (`plan.md:67-68`) and leaving the readout closes it (`locationpanel.ts`, `mouseleave` → `close`). So B also edits edge case 15, to record a known defect. Both options amend the plan; only A's amendment describes behaviour that holds at every count.

2. **Edge case 15 was never tested.** It maps to W4 (`plan.md:230`), and W4 is the suffix-ellipsis check (`plan.md:255`, `test-specs.md:33`). The only evidence on "lists all" is the reviewer's, and it fails.

3. **B's failure is silent; A's is stated.** Under B, rows past the bottom edge vanish with no mark; the reader sees `Added directories · 22` and whatever fits. Under A the heading keeps the true N and the last line says `+K more`. In my reading that is the spirit of design-system §6 (`design-system.md:359-384`): the UI must not imply something Muster does not know, here that the visible rows are the whole list. (Judgement: no §6 rule names this case.)

4. **The flip covers what the panel describes.** At 13/15/18 two-line rows `placeAnchored` (`anchored.ts:29-31`) moves the panel to top 8, over the readout, including the `+N` it explains, and over the session name. Two-line rows are ordinary: at `.loc-pop`'s 380 px max width (`style.css:4460-4462`) in `--fs-2xs` mono (0.68rem, `style.css:22`) I estimate about 54 characters a line (computed, not measured), and this worktree's own absolute path is 59 characters.

5. **The review asks for arbitrary counts elsewhere.** Browser Major 1 requires the repo poll to keep working "however many directories are added". Under B the daemon is fixed for 32 directories while the one surface that shows them breaks at 13.

6. **Cost.** Browser Minor 1 already sends web-impl back into `locationpanel.ts` `show` this cycle; capping rows is the same function in the same wave.

"The full list is not shown anywhere" is true of B too past about 20 rows, unstated.

### Turn 1 — advocate-b (argument)

A's strongest form, as I read it: B also has to rewrite edge case 15, so both options amend the plan; only A's amendment holds at every count, and only A states a cut instead of letting rows fall silently off the bottom.

I grant points 1 and 2: "cost: none" is wrong; edge case 15 is reworded under B too, and was never tested (W4 is the suffix check, `plan.md:255`). The question is which rewording is better.

1. **A hides rows that fit today.** A caps at what fits *below the readout*: readout bottom 85.4, panel top 89.4, so in 800 px the room is 89.4 to 792, about 703 px. B's flip uses 8 to 792, about 784 px. The reviewer measured 15 long-path dirs at 8–726 in 800 px (review.md:143): **every row visible, inside the viewport**. A would show about 13–14 of them and a `+1 more`/`+2 more` line. So across the band of roughly 13–19 long-path (or up to ~20 short-path) directories, B shows the full list and A withholds part of it, with no other place to read it (rail and tile unchanged, ADR `focus-added-dirs-folder-suffix-and-location-panel`). A only wins past about 20.

2. **Covering the readout costs nothing that the panel does not restate.** The flipped panel is a transient `pointer-events: none` tooltip (`style.css:4385`) that closes on `mouseleave` (`locationpanel.ts:79`). What it covers, the folder, branch and `+N`, is restated inside it: the Location row and `Added directories · N` (`locationpanel.ts:41-48`). Nothing is lost while it is open.

3. **N is already stated, so past ~20 the cut is not unannounced.** The sub-heading carries the true N (`locationpanel.ts:47`) and so does the header suffix. I concede that a reader must count to notice the shortfall, which is weaker than `+K more` (judgement).

On point 5: Major 1 (review.md:172) is a different kind of failure. Past ~24 directories the poll stops refreshing the session's **own** branch and delays every **other** session's, a regression of existing behaviour. The panel overflow degrades only the panel, only while hovered.

Reach: Muster's launch argv never passes `--add-dir` (`internal/claudecode/launch.go:70-88`), so a Muster session gets directories only by typed `/add-dir` or `permissions.additionalDirectories` (kb:fact/added-dirs-in-status-line). SPEC.md:56 sets scale at 3–6 sessions. The sibling group popover also lists every row uncapped (`grouppopover.ts:73`).

Proposed B wording for edge case 15: "lists all; past what fits it flips above and, past the viewport, drops rows, a known limit".

### Turn 2 — advocate-a (concession)

Steelman: A caps rows at the room below the readout (about 89 to 792 px in 800), while B's flip uses 8 to 792 px; the reviewer measured 15 long-path rows at 8–726, every row visible. So at every count B shows at least as many rows as A, and from about 13 to 20 it shows all of them where A withholds some, with nowhere else to read them. What the flip covers (folder, branch, `+N`) is restated inside the panel, and only while it is hovered.

I concede: B shows at least as many real rows as A at every count (`anchored.ts:29-32` places a flipped panel from top 8, A's cap starts below the readout), and the true N is already stated in the sub-heading (`locationpanel.ts:46`) and the header suffix. A's only remaining gains are a `+K more` line where the panel visibly runs off the bottom anyway, and an uncovered header the reader is not looking at while hovering. Those do not justify new UI that `final.html` and the ADR do not describe.

Note for the record: the advocate-b turn 1 text in `debate.md` differs from the message I received; I answered the `debate.md` version, which carries the measured argument above.
