# Debate: read-idle-title-colour

### Turn 1 — advocate-a (argument)

**Steelman B.** B is the minimal diff. It touches no token, changes nothing outside the read-idle rule, needs no re-review of surfaces this plan never opened, and still leaves two carriers of "read": weight 700→600 and the dot's absence. `--fg-dim` really is the floor of the ladder in all three theme blocks (`style.css:41-43,86-88,127-129`), so B is right that no token sits below it.

**One brief correction, with evidence.** "every card title in the rail *and the strip* gets brighter than it has ever been" is false of the strip. `.strip` (`style.css:1736-1742`), `.strip .card` (`1748-1754`), `.card`, `.card-in`, `.r1` and the ancestors `#app` / `.tiles-view` declare no `color`; the nearest declaration is `body { color: var(--fg) }` (`style.css:189`). Only the rail's `.cards { color: var(--fg-dim) }` (`522`) intervenes. So today the one shared template paints its title `--fg` in the strip and `--fg-dim` in the rail, and the shipped rule (`1867-1870`) drops correctly in the strip while rising in the rail. A makes the two surfaces agree; B keeps them split and leaves the drop wrong in the rail.

**A's measured blast radius is one element.** Every other card descendant declares its own colour: `.badge` and `.r3` `--fg-muted`; `.timer`, `.r2` and `.activity` `--fg-dim`; `.note` `--amber-note`. The only other thing inheriting `522` is the "No sessions yet" text node, which is not a `.name` and A leaves alone. "Wider than this plan's scope" does not survive that read.

**The gate cannot move.** `contrast-pairs.json`'s `_comment` says the script evaluates `pairs` entries against each `[data-theme]` block — tokens, never selectors. `--fg` on `--bg`, `--bg-raised` and `--bg-hover` are already gated at ≥ 4.5. I ran `make contrast` on the shipped tree: instrument, dark, light, 43 pairs each, 0 failures. A adds no token and no pair.

**Authority.** design-system §1 assigns `--fg`/`--fg-muted`/`--fg-dim` to primary / secondary / metadata-and-label text; §2 gives the session title its own display role, listed apart from "All metadata, gauges, timers, paths, state badges". A rail title in `--fg-dim` is a title wearing the metadata token. That is the defect; REQ-9 only exposed it.

kb:adr/rail-unread-marker-neutral-dot records the developer's pick from mockups where the drop was real. B ships half of it.

### Turn 1 — advocate-b (concession)

**Steelman A.** The same card template renders on two surfaces. Only the rail interposes `.cards { color: var(--fg-dim) }` (`style.css:522`), so the shipped read-idle rule drops correctly in the strip and rises in the rail. A makes the two agree on the value one of them already ships; B fixes the rail by deleting a drop that currently works.

I concede: the snapshot strip already paints the shared template's title `--fg`, so A does not introduce an unseen appearance — it extends one the app ships today — and B would regress the strip to fix the rail.

I verified it rather than taking it. Nothing between `body { color: var(--fg) }` (`style.css:189`) and `.strip .card .name` declares a colour: `#app`, `.tiles-view`, `.strip` (`1736-1742`), `.strip .card` (`1748-1754`), `.card`, `.card-in`, `.r1`, `.card .name` (`1843-1850`). `#tiles-strip` is a sibling of the tiles grid (`web/index.html:120`), never a descendant of `.cards`.

That dissolves both arguments I was holding.

- **Blast radius.** Reading the card block myself: every descendant declares its own colour (`.badge`/`.r3` muted; `.timer`/`.r2`/`.activity` dim; `.note` the note tokens). `.card .name` is the only inheritor; `522`'s other consumer is the "No sessions yet" text node `web/src/render/sessions.ts:516` writes into `#sessions.cards`, which A leaves alone. "Wider than this plan's scope" does not survive that.
- **Unmeasured brightening.** I measured the ladder on `--bg-raised`: instrument fg 13.92 / muted 8.57 / dim 7.58; dark 13.12 / 9.20 / 8.01; light 15.93 / 9.19 / 8.05. A moves rail titles the full ladder — but onto the value the strip renders now. I ran `make contrast` on the shipped tree: instrument, dark, light, 43 pairs, 0 failures. It gates tokens, not selectors, so A cannot move it.

What I had left was history: `ui-text-and-focus` answered dim text by raising the tokens (`d9f8c0b`, `--fg-dim` #8087a0 → #a6abbc plus the other two themes) rather than reassigning the title. That is evidence nobody re-examined the title's token, not evidence anybody chose it. Against design-system §2's type roles and the strip's own render, it does not carry.

**One correction of my own.** The reading list calls `kb:adr/nongoal-accessibility-i18n-multiuser-other-platforms` accepted; its frontmatter says `status: rejected`. Nothing here turns on it — design-system §1 documents the contrast gate independently.
