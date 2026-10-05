# Debate: control-hide-rule

### Turn 1 — advocate-a (argument)

**B's strongest case, as I read it.** Spec item 10 (`plans/groups/spec.md:114-117`), REQ-10 (`plan.md:48`) and design-system §5 (`docs/design/design-system.md:258-259`) all say the control hides "before the title shortens". The developer's decision today kept that step explicitly (`plan.md:49`, last sentence).

**1. B fails the plan's own acceptance check; A passes it.** E27 (`plan.md:697`) requires the control *present* at 1140 and 724 px "with a long title". Today's amendment (`plan.md:698`) rewrote only E27's repo clause and kept "present at the first two". With the 65-character test title (`web/e2e/groups-focus.spec.ts:212`; the brief says 66), the title measured 293 px at 724 with the control shown (`review.browser.md:113`), so it is ellipsized there. The brief puts B's hide for that title at every width up to about 1160 px, so under B E27 is false at both widths. The developer's same-day decision affirmed both halves of the contradiction, so it does not pick between them. Only the width rule has a passing acceptance test.

**2. The design authority is A, verbatim.** Mockup Q3b is captioned "the chosen rule, live CSS" (`docs/design/mockups/groups/a-round3.html:88-93`). Its CSS is a pure `@container (max-width: 640px)` (`shared.css:270-279`), shown with a 57-character title at 1140, 724, 600 and 500. Its text: "The title grows first and is the only thing that ellipsises; the group control stays while the pane can hold it and is the first to go." In my reading, "before the title shortens" names the control's place in the narrowing sequence, and the mockup shows that sequence.

**3. The plan already weighed B.** kb:adr/focus-group-control-hides-below-640px-container-width lists "Measure whether the title would ellipsise and hide the control first, in JavaScript" and chose the container query because "the spec's acceptance criterion names a breakpoint" (`spec.md:212-214`).

**4. B's cost falls on the control's purpose.** The rail measured 0–299 px (`review.browser.md:19`), leaving a header of about 980 px in a 1280 px window. Under B a long-titled session never shows its group control there. I judge it would also blink as titles are renamed. A's cost is bounded: the title never drops below its 6rem floor (≥123 px measured) and its hover `title` carries the full name (`design-system.md:247`).

**5. B adds a feedback loop.** Hiding the control changes the title's room, so B needs the guard `fitMainheadMeta` already carries: measure "with the cap cleared, every time, so the decision never feeds on its own result" (`web/src/render/mainhead.ts:67-72`).

### Turn 1 — advocate-b (argument)

**A's strongest point, as I read it.** E27 (`plan.md:697`) passes under A and fails under B. The developer's amendment today (`plan.md:698`) kept E27's "present at the first two" widths. The mockup captioned "the chosen rule, live CSS" (`a-round3.html:88`) is a pure container query, and it shows a long title ellipsized beside the control.

**On 1, E27.** Both options amend a sentence the developer kept today. A rewrites REQ-10 and the other places that say "before the title shortens" (`spec.md:40`, `:116`, `:273`, `design-system.md:259`). B rewrites E27's two widths. By your own reading the decision picks neither, so this point is level.

**On 2, the mockup.** The CSS behind "live CSS" gives the title `min-width:22ch` (`shared.css:275`). The plan rejected that floor as "a mockup convenience" (kb:adr/focus-group-control-hides-below-640px-container-width). So the mockup never showed the title below 22ch beside the control. Under A the floor is 6rem, which I estimate (unmeasured) is about half of 22ch at the title's size, and review measured 123 of 228 px. In my reading, what survives from the mockup is its words: "the first thing dropped on a narrow pane" (`README.md:39`). Under A the title gives up text from 864 px while the control stays until 668 px, so the control is not dropped first.

**On 3, the ADR.** It is this plan's own and only proposed, so it is the choice under review. Its one reason was that the acceptance criterion "names a breakpoint" (`spec.md:212-214`). B keeps the 640 px hide, so that reason does not tell the two options apart.

**On 4, cost.** Under B a long title hides the control at 980 px. What is lost is a second route to information the rail already shows. The focused card sits under its section header in the always-visible rail (`ux-flows.md` §3.1), and Move to stays reachable from the selection bar (`spec.md:126`). Under A, title text is lost. The title is Focus's only rename trigger (kb:adr/focus-mainhead-title-keeps-a-floor). I judge that a duplicated control costs less to lose than unique text.

**On 5, the loop.** I agree B needs that guard. It already exists and runs on every render and pane resize (`features/focus.ts:138`), so B extends a pattern. The `↳` block already gives way by content, not by a fixed width: it hides "whenever it does not fit" (`style.css:755-758`). A content-aware hide is how this header's narrowing order already works, and the fixed 640 px rule is the exception.

### Turn 2 — advocate-a (argument)

**B's strongest point, as I read it.** The mockup's title floor was 22ch, which the plan rejected, so the mockup never showed a title squeezed to 123 px beside the control. What survives of the design is its words, "the first thing dropped on a narrow pane". Under A the title loses text from 864 px while the control stays until 668 px; the control is not dropped first. A duplicated control costs less to lose than unique title text.

**I accept two of your answers.** On E27, both options amend a sentence the developer kept today, so that point is level. On the ADR, B keeps the 640 px hide too, so "names a breakpoint" does not separate the options. I drop both.

**The README's locked sentence favours A.** It reads in full: "a group control that is the first thing dropped on a narrow pane — title first to a 22ch floor" (`docs/design/mockups/groups/README.md:39-40`). The same sentence says the title gives way first, down to its floor. "Dropped" means removed whole, and the title is never removed, so the control is the first thing removed. That is A's order. Under B the title never shortens while the control shows, which contradicts "title first". The 22ch-versus-6rem difference changes how far the title shrinks, not which gives way first.

**The title text is not unique.** The focused card stays visible in the rail (`ux-flows.md` §3.1). Its title wraps there with `white-space: normal` (`web/src/style.css:2165-2170`), so in the default density it reads whole. The mainhead title's hover `title` also carries the full name (`design-system.md:247`). Your duplication argument applies equally to the title. On the group side, the rail shows the section, but moving a session from the rail takes a card drag, in manual sort only (`plan.md:47`), or Select, a card click, Move to and a choice (`spec.md:124-127`). The header control does it in one click from the focused pane.

**On the `↳` block.** It gives way by CSS wrap-and-clip (`style.css:752-758`), not by a script measure. The brief says B "needs a measure in the mainhead render, not a pure container query". So B adds the header's second script-driven layout decision.

**What remains.** A keeps the locked design order and a one-click control at common widths. B removes that control at every width a 1280 px window allows, for any long title, to protect text the rail already shows whole.

### Turn 2 — advocate-b (concession)

**A's strongest point, as I read it.** The locked round-3 sentence says the control is "the first thing dropped on a narrow pane — title first to a 22ch floor" (`docs/design/mockups/groups/README.md:38-39`). That one sentence orders both things. The title gives up width first, down to a floor, and the control is the first item removed whole. That is A's order. B contradicts "title first", because under B the title never shortens while the control shows.

I concede: the README's locked sentence settles which half of the plan is the paraphrase. I checked it and it reads as you quote. The spec's "hides before the title shortens" (`spec.md:116`) and the derived lines restate that lock. The lock itself says "title first", and the mockup's live CSS implements it as a pure container query (`shared.css:270-279`). My 22ch point changes how far the title shrinks, not which gives way first, as you say. The 6rem floor is an accepted decision and is not in question here.

I also accept your answers on the other points. The rail card title wraps whole in comfortable density (`style.css:2160-2169`), so my "unique text" argument applies to the title as much as to the group. The control's distinct value is a one-click move of the focused session, which the rail offers only by a manual-sort drag or a four-step Select flow. My `↳` comparison was wrong in kind: that block gives way by CSS wrap-and-clip, while B would add a script measure.

The amendment A needs is REQ-10 and the lines that repeat its clause (`spec.md:40`, `:116`, `:273`, `plan.md:48`, `:762`, `doc-delta.md:39`, `:73`, `design-system.md:259`). Each should say the control hides below a 640 px content box, and above that the title may shorten beside it, never below its 6rem floor.
