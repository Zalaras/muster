import { describe, expect, it } from "vitest";
import type { Group, UngroupedLayout } from "../protocol/groups";
import type { RailSort } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import {
  buildSections,
  caretLabel,
  commonGroupId,
  defaultFocusId,
  emptySectionLine,
  filterForFocus,
  filterHides,
  groupLabel,
  groupOf,
  groupsInRailOrder,
  headerCheckboxLabel,
  moveSection,
  NEW_GROUP_CHOICE,
  NO_GROUP_CHOICE,
  popoverModel,
  type RailFilter,
  type Section,
  sectionOrder,
  sectionShown,
  selectionState,
  SUMMARY_ORDER,
  sessionsPhrase,
  shownCards,
  shownCount,
  summarize,
  summaryRows,
  summaryStateOf,
  summaryStateWord,
  summaryTitle,
  UNGROUPED_KEY,
  visibleCards,
} from "./sections";
import { makeSession } from "./testfixtures";

const group = (id: number, pos: number, over: Partial<Group> = {}): Group => ({
  id,
  name: `group-${id}`,
  pos,
  collapsed: false,
  ...over,
});
const ungrouped = (pos: number, collapsed = false): UngroupedLayout => ({ pos, collapsed });
const ids = (cards: readonly Session[]): number[] => cards.map((c) => c.id);
const sectionIds = (sections: readonly Section[]): Array<number | null> =>
  sections.map((s) => s.id);
const cardIds = (sections: readonly Section[]): number[][] => sections.map((s) => ids(s.cards));

// G3 above Ungrouped above G5: pos 0, 1, 2.
const G3 = group(3, 0);
const G5 = group(5, 2);
const UNG = ungrouped(1);

describe("buildSections — flat rail with no groups (I6, W6)", () => {
  it("is one headless Ungrouped section holding every session, so the rail reads as it did before groups", () => {
    const sessions = [makeSession({ id: 2 }), makeSession({ id: 1 })];
    const sections = buildSections(sessions, [], ungrouped(0), "manual");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      id: null,
      key: UNGROUPED_KEY,
      name: "Ungrouped",
      headed: false,
      collapsed: false,
    });
    expect(ids(sections[0]!.cards)).toEqual([1, 2]);
  });

  it("ignores a collapsed Ungrouped layout: with no group nothing is collapsible", () => {
    const [section] = buildSections([makeSession({ id: 1 })], [], ungrouped(0, true), "manual");
    expect(section?.collapsed).toBe(false);
    expect(section?.headed).toBe(false);
  });

  it("is still one section, empty, with no sessions", () => {
    const sections = buildSections([], [], ungrouped(0), "manual");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.cards).toEqual([]);
  });

  it("a session naming a group that does not exist reads as Ungrouped, not an error (REQ-26)", () => {
    const [section] = buildSections(
      [makeSession({ id: 1, groupId: 9 })],
      [],
      ungrouped(0),
      "manual",
    );
    expect(ids(section!.cards)).toEqual([1]);
  });
});

describe("buildSections — with groups (I6)", () => {
  it("yields every group and a headed Ungrouped section, ordered by pos with Ungrouped in its place", () => {
    const sections = buildSections([], [G5, G3], UNG, "manual");
    expect(sectionIds(sections)).toEqual([3, null, 5]);
    expect(sections.every((s) => s.headed)).toBe(true);
    expect(sections.map((s) => s.key)).toEqual(["3", UNGROUPED_KEY, "5"]);
    expect(sections.map((s) => s.name)).toEqual(["group-3", "Ungrouped", "group-5"]);
  });

  it("carries each section's own place and collapsed state", () => {
    const sections = buildSections(
      [],
      [group(3, 0, { collapsed: true }), group(5, 2)],
      ungrouped(1, true),
      "manual",
    );
    expect(sections.map((s) => [s.pos, s.collapsed])).toEqual([
      [0, true],
      [1, true],
      [2, false],
    ]);
  });

  it("a single empty group is enough to head Ungrouped: the header and filter exist iff a group exists", () => {
    const sections = buildSections([makeSession({ id: 1 })], [G3], ungrouped(1), "manual");
    expect(sectionIds(sections)).toEqual([3, null]);
    expect(sections.every((s) => s.headed)).toBe(true);
    expect(cardIds(sections)).toEqual([[], [1]]);
  });

  it("puts each session in its own section; ungrouped sessions in Ungrouped", () => {
    const sessions = [
      makeSession({ id: 1, groupId: 5 }),
      makeSession({ id: 2 }),
      makeSession({ id: 3, groupId: 3 }),
      makeSession({ id: 4, groupId: 5 }),
    ];
    expect(cardIds(buildSections(sessions, [G3, G5], UNG, "manual"))).toEqual([[3], [2], [1, 4]]);
  });

  it("a session whose groupId names no known group renders in Ungrouped until the next groups message (W5)", () => {
    const sessions = [makeSession({ id: 1, groupId: 99 }), makeSession({ id: 2, groupId: 3 })];
    expect(cardIds(buildSections(sessions, [G3], ungrouped(1), "manual"))).toEqual([[2], [1]]);
  });

  it("group ids are matched by id, not by array position or pos", () => {
    const sections = buildSections(
      [makeSession({ id: 1, groupId: 7 })],
      [group(7, 4), group(2, 0)],
      ungrouped(2),
      "manual",
    );
    expect(sectionIds(sections)).toEqual([2, null, 7]);
    expect(cardIds(sections)).toEqual([[], [], [1]]);
  });

  it("a tie in pos (a lost frame, not a current daemon) is stable: groups by id, Ungrouped after them", () => {
    const sections = buildSections([], [group(8, 1), group(2, 1)], ungrouped(1), "manual");
    expect(sectionIds(sections)).toEqual([2, 8, null]);
  });

  it("never mutates the sessions or groups it is given", () => {
    const sessions = [makeSession({ id: 2, groupId: 3 }), makeSession({ id: 1, groupId: 3 })];
    const groups = [G5, G3];
    buildSections(sessions, groups, UNG, "manual");
    expect(ids(sessions)).toEqual([2, 1]);
    expect(groups.map((g) => g.id)).toEqual([5, 3]);
  });
});

describe("buildSections — cards sort inside a section, sections keep their place (I8, kb:adr/rail-pin-invariant-scoped-per-section)", () => {
  const sessions = [
    makeSession({ id: 1, groupId: 3, railPos: 30, state: "working" }),
    makeSession({ id: 2, groupId: 3, railPos: 10, state: "idle" }),
    makeSession({
      id: 3,
      groupId: 3,
      railPos: 20,
      state: "needs_input",
      attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
    }),
    makeSession({ id: 4, groupId: 5, railPos: 5, state: "working" }),
    makeSession({ id: 5, groupId: 5, railPos: 99, pinned: true, state: "idle" }),
  ];
  const groups = [G3, G5];

  it("manual orders each section's unpinned cards by railPos, its pinned block first", () => {
    expect(cardIds(buildSections(sessions, groups, UNG, "manual"))).toEqual([
      [2, 3, 1],
      [],
      [5, 4],
    ]);
  });

  it("attention orders each section's unpinned cards by state, its pinned block still first", () => {
    expect(cardIds(buildSections(sessions, groups, UNG, "attention"))).toEqual([
      [3, 1, 2],
      [],
      [5, 4],
    ]);
  });

  it.each<RailSort>(["manual", "attention"])(
    "a state change in a collapsed group moves no section in %s mode, only its own cards",
    (sort) => {
      const collapsed = [group(3, 0, { collapsed: true }), G5];
      const before = buildSections(sessions, collapsed, UNG, sort);
      const flipped = sessions.map((s) =>
        s.id === 1
          ? {
              ...s,
              state: "needs_input" as const,
              attention: { reason: "idle" as const, since: "2026-08-22T00:00:00Z" },
            }
          : s,
      );
      const after = buildSections(flipped, collapsed, UNG, sort);
      expect(sectionIds(after)).toEqual(sectionIds(before));
      expect(after.map((s) => s.pos)).toEqual(before.map((s) => s.pos));
      expect(ids(after[1]!.cards)).toEqual(ids(before[1]!.cards));
    },
  );

  it("a pinned card never leaves the top of its own section, whatever another section holds", () => {
    const mixed = [
      makeSession({ id: 1, groupId: 3, pinned: true, railPos: 50 }),
      makeSession({ id: 2, groupId: 3, railPos: 1 }),
      makeSession({ id: 3, railPos: 2 }),
      makeSession({ id: 4, railPos: 60, pinned: true }),
    ];
    expect(cardIds(buildSections(mixed, [G3], ungrouped(1), "manual"))).toEqual([
      [1, 2],
      [4, 3],
    ]);
  });
});

describe("sectionShown / filter (I6)", () => {
  const sections = buildSections([], [G3], ungrouped(1), "manual");
  const [grouped, none] = sections as [Section, Section];

  it.each<[RailFilter, boolean, boolean]>([
    ["all", true, true],
    ["groups", true, false],
    ["ungrouped", false, true],
  ])("filter %s keeps a group: %s, Ungrouped: %s", (filter, keepsGroup, keepsUngrouped) => {
    expect(sectionShown(grouped, filter)).toBe(keepsGroup);
    expect(sectionShown(none, filter)).toBe(keepsUngrouped);
  });

  it("a headless (flat) rail has nothing to filter", () => {
    const [flat] = buildSections([], [], ungrouped(0), "manual") as [Section];
    for (const filter of ["all", "groups", "ungrouped"] as const) {
      expect(sectionShown(flat, filter)).toBe(true);
    }
  });
});

describe("visibleCards / shownCards — what ⌥⌘1-9 and select all index (I5, W8)", () => {
  // G3: [1, 2]   Ungrouped: [3]   G5: [4]
  const sessions = [
    makeSession({ id: 1, groupId: 3 }),
    makeSession({ id: 2, groupId: 3 }),
    makeSession({ id: 3 }),
    makeSession({ id: 4, groupId: 5 }),
  ];
  const build = (collapsed: number[], ungroupedCollapsed = false, sort: RailSort = "manual") =>
    buildSections(
      sessions,
      [
        group(3, 0, { collapsed: collapsed.includes(3) }),
        group(5, 2, { collapsed: collapsed.includes(5) }),
      ],
      ungrouped(1, ungroupedCollapsed),
      sort,
    );

  it.each<RailSort>(["manual", "attention"])(
    "lists every card in section order, %s mode, with nothing folded or filtered",
    (sort) => {
      expect(ids(visibleCards(build([], false, sort), "all"))).toEqual([1, 2, 3, 4]);
    },
  );

  it.each<RailSort>(["manual", "attention"])(
    "skips a collapsed section's cards, %s mode",
    (sort) => {
      expect(ids(visibleCards(build([3], false, sort), "all"))).toEqual([3, 4]);
      expect(ids(visibleCards(build([], true, sort), "all"))).toEqual([1, 2, 4]);
    },
  );

  it.each<RailSort>(["manual", "attention"])("skips filtered-out sections, %s mode", (sort) => {
    expect(ids(visibleCards(build([], false, sort), "groups"))).toEqual([1, 2, 4]);
    expect(ids(visibleCards(build([], false, sort), "ungrouped"))).toEqual([3]);
  });

  it("skips a section that is both collapsed and filtered, and keeps one that is only one of those", () => {
    expect(ids(visibleCards(build([3]), "groups"))).toEqual([4]);
    expect(ids(visibleCards(build([3]), "ungrouped"))).toEqual([3]);
  });

  it("a flat rail shows everything, in order", () => {
    const flat = buildSections(sessions, [], ungrouped(0), "manual");
    expect(ids(visibleCards(flat, "all"))).toEqual([1, 2, 3, 4]);
  });

  it("a headless section that somehow reads collapsed is still shown: only a headed one folds", () => {
    const [flat] = buildSections(sessions, [], ungrouped(0), "manual");
    expect(ids(visibleCards([{ ...flat!, collapsed: true }], "all"))).toEqual([1, 2, 3, 4]);
  });

  it("shownCards keeps collapsed sections' cards, since folding is not filtering", () => {
    expect(ids(shownCards(build([3]), "all"))).toEqual([1, 2, 3, 4]);
    expect(ids(shownCards(build([3]), "groups"))).toEqual([1, 2, 4]);
    expect(ids(shownCards(build([3]), "ungrouped"))).toEqual([3]);
  });

  it("shownCount counts what the filter keeps, and filterHides reads n of m only when a card is hidden", () => {
    const sections = build([3]);
    expect(shownCount(sections, "all")).toBe(4);
    expect(shownCount(sections, "groups")).toBe(3);
    expect(shownCount(sections, "ungrouped")).toBe(1);
    expect(filterHides(sections, "all")).toBe(false);
    expect(filterHides(sections, "groups")).toBe(true);
    expect(filterHides(sections, "ungrouped")).toBe(true);
  });

  it("a filter that happens to keep every card hides nothing", () => {
    const onlyGrouped = buildSections(
      [makeSession({ id: 1, groupId: 3 })],
      [G3],
      ungrouped(1),
      "manual",
    );
    expect(filterHides(onlyGrouped, "groups")).toBe(false);
    expect(filterHides(onlyGrouped, "ungrouped")).toBe(true);
  });

  it("an empty rail has no cards, shows none and hides none", () => {
    const empty = buildSections([], [G3], UNG, "manual");
    expect(visibleCards(empty, "all")).toEqual([]);
    expect(shownCount(empty, "all")).toBe(0);
    expect(filterHides(empty, "groups")).toBe(false);
  });
});

// I4: the focused session is never in a filtered-out section. Every route that focuses a session
// (a launch, ⌥⌘0, the default-focus pick) asks this one function what the filter must become.
describe("filterForFocus (I4, W9)", () => {
  const sessions = [
    makeSession({ id: 1, groupId: 3 }),
    makeSession({ id: 2 }),
    makeSession({ id: 3, groupId: 3, alive: false }),
  ];
  const sections = buildSections(sessions, [G3], ungrouped(1), "manual");

  it("a launched ungrouped session under filter Groups flips the filter to All", () => {
    expect(filterForFocus(sections, "groups", 2)).toBe("all");
  });

  it("⌥⌘0 landing on a grouped needs-input session under filter Ungrouped flips the filter to All", () => {
    expect(filterForFocus(sections, "ungrouped", 1)).toBe("all");
  });

  it("an ended session in a hidden section flips it too (the neediest pick is not the only route)", () => {
    expect(filterForFocus(sections, "ungrouped", 3)).toBe("all");
  });

  it.each<[RailFilter, number]>([
    ["groups", 1],
    ["ungrouped", 2],
    ["all", 1],
    ["all", 2],
  ])("keeps filter %s when session %i is in a section it shows", (filter, id) => {
    expect(filterForFocus(sections, filter, id)).toBe(filter);
  });

  it("keeps the filter when the section is hidden only by being collapsed: folding is not filtering", () => {
    const folded = buildSections(
      sessions,
      [group(3, 0, { collapsed: true })],
      ungrouped(1),
      "manual",
    );
    expect(filterForFocus(folded, "groups", 1)).toBe("groups");
  });

  it("keeps the filter for a session that is in no section (it was just removed): nothing to reveal", () => {
    expect(filterForFocus(sections, "groups", 99)).toBe("groups");
  });

  it("a flat rail has no filter to reset", () => {
    const flat = buildSections(sessions, [], ungrouped(0), "manual");
    expect(filterForFocus(flat, "groups", 2)).toBe("groups");
  });

  it("a session naming an unknown group is filtered with Ungrouped, like the rail draws it", () => {
    const orphan = buildSections(
      [makeSession({ id: 7, groupId: 99 })],
      [G3],
      ungrouped(1),
      "manual",
    );
    expect(filterForFocus(orphan, "groups", 7)).toBe("all");
    expect(filterForFocus(orphan, "ungrouped", 7)).toBe("ungrouped");
  });
});

describe("defaultFocusId (I4, I5, W9)", () => {
  it("is the first displayed card", () => {
    const sections = buildSections(
      [
        makeSession({ id: 1, groupId: 5 }),
        makeSession({ id: 2 }),
        makeSession({ id: 3, groupId: 3 }),
      ],
      [G3, G5],
      UNG,
      "manual",
    );
    expect(defaultFocusId(sections, "all")).toBe(3);
    expect(defaultFocusId(sections, "ungrouped")).toBe(2);
    expect(defaultFocusId(sections, "groups")).toBe(3);
  });

  it("skips a collapsed section for the next section's first card", () => {
    const sections = buildSections(
      [makeSession({ id: 1, groupId: 3 }), makeSession({ id: 2 })],
      [group(3, 0, { collapsed: true })],
      ungrouped(1),
      "manual",
    );
    expect(defaultFocusId(sections, "all")).toBe(2);
  });

  it("falls back to the first card of the whole rail when every kept section is empty or collapsed", () => {
    const sections = buildSections(
      [makeSession({ id: 1, groupId: 3 }), makeSession({ id: 2 })],
      [group(3, 0, { collapsed: true })],
      ungrouped(1, true),
      "manual",
    );
    expect(defaultFocusId(sections, "all")).toBe(1);
  });

  it("falls back across the filter, and filterForFocus then un-filters for the card it picked", () => {
    // Filter Ungrouped, Ungrouped empty: the only card is in G3, which the filter hides.
    const sections = buildSections(
      [makeSession({ id: 1, groupId: 3 })],
      [G3],
      ungrouped(1),
      "manual",
    );
    const picked = defaultFocusId(sections, "ungrouped");
    expect(picked).toBe(1);
    expect(filterForFocus(sections, "ungrouped", picked as number)).toBe("all");
  });

  it("falls back to a card the filter keeps but a fold hides, leaving the filter alone", () => {
    const sections = buildSections(
      [makeSession({ id: 1, groupId: 3 }), makeSession({ id: 2 })],
      [group(3, 0, { collapsed: true })],
      ungrouped(1),
      "manual",
    );
    const picked = defaultFocusId(sections, "groups");
    expect(picked).toBe(1);
    expect(filterForFocus(sections, "groups", picked as number)).toBe("groups");
  });

  it("is null only with no sessions at all", () => {
    expect(defaultFocusId(buildSections([], [G3], UNG, "manual"), "all")).toBeNull();
    expect(defaultFocusId(buildSections([], [], ungrouped(0), "manual"), "all")).toBeNull();
  });
});

describe("sectionOrder / moveSection (header drag, kb:anchor/groups.order)", () => {
  it("sectionOrder is every group id and 0 for Ungrouped, in display order", () => {
    expect(sectionOrder(buildSections([], [G5, G3], UNG, "manual"))).toEqual([3, 0, 5]);
  });

  it("a flat rail's order is just Ungrouped's 0", () => {
    expect(sectionOrder(buildSections([], [], ungrouped(0), "manual"))).toEqual([0]);
  });

  it("a forward drag lands the dragged section after its target, a backward drag before it", () => {
    expect(moveSection([3, 0, 5], 3, 0)).toEqual([0, 3, 5]);
    expect(moveSection([3, 0, 5], 5, 3)).toEqual([5, 3, 0]);
    expect(moveSection([3, 0, 5], 3, 5)).toEqual([0, 5, 3]);
  });

  it("moves Ungrouped, whose id 0 is falsy, like any other section", () => {
    expect(moveSection([3, 0, 5], 0, 5)).toEqual([3, 5, 0]);
    expect(moveSection([3, 0, 5], 0, 3)).toEqual([0, 3, 5]);
    expect(moveSection([3, 5, 0], 5, 0)).toEqual([3, 0, 5]);
  });

  it("is null for a self-drop and for an id the order does not hold", () => {
    expect(moveSection([3, 0, 5], 3, 3)).toBeNull();
    expect(moveSection([3, 0, 5], 0, 0)).toBeNull();
    expect(moveSection([3, 0, 5], 9, 3)).toBeNull();
    expect(moveSection([3, 0, 5], 3, 9)).toBeNull();
  });

  it("keeps every id exactly once and never mutates its input", () => {
    const order = [3, 0, 5, 8];
    const moved = moveSection(order, 8, 3);
    expect(moved).toEqual([8, 3, 0, 5]);
    expect([...(moved ?? [])].sort()).toEqual([...order].sort());
    expect(order).toEqual([3, 0, 5, 8]);
  });
});

describe("groupOf / groupLabel / commonGroupId (mainhead control, Move to menu)", () => {
  const groups = [G3, G5];

  it("groupOf is the session's group, null for Ungrouped and for an unknown id", () => {
    expect(groupOf(makeSession({ id: 1, groupId: 5 }), groups)).toBe(G5);
    expect(groupOf(makeSession({ id: 1 }), groups)).toBeNull();
    expect(groupOf(makeSession({ id: 1, groupId: 99 }), groups)).toBeNull();
  });

  it("groupLabel is the group's name, `no group` for Ungrouped and for an unknown group id", () => {
    expect(groupLabel(makeSession({ id: 1, groupId: 3 }), groups)).toBe("group-3");
    expect(groupLabel(makeSession({ id: 1 }), groups)).toBe("no group");
    expect(groupLabel(makeSession({ id: 1, groupId: 99 }), groups)).toBe("no group");
    expect(groupLabel(makeSession({ id: 1, groupId: 3 }), [])).toBe("no group");
  });

  it("groupLabel shows the name as sent: the uppercasing is CSS", () => {
    expect(
      groupLabel(makeSession({ id: 1, groupId: 3 }), [group(3, 0, { name: "PR reviews" })]),
    ).toBe("PR reviews");
  });

  it("commonGroupId is the shared group id, null when all are Ungrouped", () => {
    const inFive = [makeSession({ id: 1, groupId: 5 }), makeSession({ id: 2, groupId: 5 })];
    expect(commonGroupId(inFive, groups)).toBe(5);
    expect(commonGroupId([makeSession({ id: 1 }), makeSession({ id: 2 })], groups)).toBeNull();
  });

  it("commonGroupId is undefined for a mixed selection and for none", () => {
    expect(
      commonGroupId([makeSession({ id: 1, groupId: 5 }), makeSession({ id: 2 })], groups),
    ).toBeUndefined();
    expect(
      commonGroupId(
        [makeSession({ id: 1, groupId: 5 }), makeSession({ id: 2, groupId: 3 })],
        groups,
      ),
    ).toBeUndefined();
    expect(commonGroupId([], groups)).toBeUndefined();
  });

  it("commonGroupId counts an unknown group id as Ungrouped, matching where the card draws", () => {
    expect(
      commonGroupId([makeSession({ id: 1, groupId: 99 }), makeSession({ id: 2 })], groups),
    ).toBeNull();
  });
});

describe("summaryStateOf / summaryRows / summarize (W6, REQ-16)", () => {
  const needs = makeSession({
    id: 1,
    state: "needs_input",
    attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
  });
  const failed = makeSession({ id: 2, state: "failed" });
  const started = makeSession({ id: 3, state: "started" });
  const planning = makeSession({ id: 4, state: "planning" });
  const working = makeSession({ id: 5, state: "working" });
  const idle = makeSession({ id: 6, state: "idle" });
  const ended = makeSession({
    id: 7,
    state: "working",
    alive: false,
    endedAt: "2026-08-22T01:00:00Z",
  });

  it("the attention order is needs input, failed, started, planning, working, idle, ended", () => {
    expect([...SUMMARY_ORDER]).toEqual([
      "needs_input",
      "failed",
      "started",
      "planning",
      "working",
      "idle",
      "ended",
    ]);
  });

  it("returns states in that order whatever order the cards come in", () => {
    const shuffled = [ended, idle, working, planning, started, failed, needs];
    expect(summarize(shuffled)).toEqual({
      count: 7,
      states: [
        { state: "needs_input", n: 1 },
        { state: "failed", n: 1 },
        { state: "started", n: 1 },
        { state: "planning", n: 1 },
        { state: "working", n: 1 },
        { state: "idle", n: 1 },
        { state: "ended", n: 1 },
      ],
    });
  });

  it("counts ended from alive:false, whatever state the pane died in", () => {
    expect(summaryStateOf(ended)).toBe("ended");
    expect(summaryStateOf(makeSession({ id: 8, state: "needs_input", alive: false }))).toBe(
      "ended",
    );
    expect(summaryStateOf(working)).toBe("working");
    expect(summarize([ended]).states).toEqual([{ state: "ended", n: 1 }]);
  });

  it("counts several in one state once and leaves absent states out", () => {
    const summary = summarize([working, makeSession({ id: 9, state: "working" }), idle]);
    expect(summary).toEqual({
      count: 3,
      states: [
        { state: "working", n: 2 },
        { state: "idle", n: 1 },
      ],
    });
  });

  it("read and unread idle are one idle count, shown once (kb:adr/rail-summary-dot-order-is-attention-order-idle-once)", () => {
    const summary = summarize([idle, makeSession({ id: 9, state: "idle", unread: true })]);
    expect(summary.states).toEqual([{ state: "idle", n: 2 }]);
  });

  it("an empty section is a count of 0 and no states, never a gauge", () => {
    expect(summarize([])).toEqual({ count: 0, states: [] });
    expect(summaryRows([])).toEqual([]);
  });

  it("summaryRows keeps the cards of each state, in the order given", () => {
    const rows = summaryRows([working, makeSession({ id: 9, state: "working" }), needs]);
    expect(rows.map((r) => [r.state, ids(r.cards)])).toEqual([
      ["needs_input", [1]],
      ["working", [5, 9]],
    ]);
  });

  it("names a state by its badge word, `ended` for ended", () => {
    expect(summaryStateWord("needs_input")).toBe("needs input");
    expect(summaryStateWord("working")).toBe("working");
    expect(summaryStateWord("ended")).toBe("ended");
  });

  it("titles a summary item `<n> <state word>`", () => {
    expect(summaryTitle("needs_input", 2)).toBe("2 needs input");
    expect(summaryTitle("ended", 1)).toBe("1 ended");
  });
});

describe("popoverModel (REQ-16)", () => {
  const section = (cards: Session[]): Section => ({
    id: 3,
    key: "3",
    name: "PR reviews",
    pos: 0,
    collapsed: false,
    headed: true,
    cards,
  });

  it("names the group and `n sessions`, then one row per state present with its session titles", () => {
    const model = popoverModel(
      section([
        makeSession({ id: 1, title: "fix flake", state: "working" }),
        makeSession({ id: 2, title: "bump deps", state: "working" }),
        makeSession({ id: 3, title: "old one", state: "working", alive: false }),
      ]),
    );
    expect(model).toEqual({
      name: "PR reviews",
      sessions: "3 sessions",
      rows: [
        { state: "working", word: "working", n: 2, titles: ["fix flake", "bump deps"] },
        { state: "ended", word: "ended", n: 1, titles: ["old one"] },
      ],
    });
  });

  it("an untitled session reads `untitled`, the one fallback every surface shares", () => {
    const model = popoverModel(section([makeSession({ id: 1, title: null })]));
    expect(model.rows[0]?.titles).toEqual(["untitled"]);
    expect(model.sessions).toBe("1 session");
  });

  it("an empty group has no rows, and says `0 sessions`", () => {
    expect(popoverModel(section([]))).toEqual({
      name: "PR reviews",
      sessions: "0 sessions",
      rows: [],
    });
  });
});

describe("selectionState (selection bar enablement)", () => {
  const groups = [G3];

  it("counts the selection; Ungroup needs a grouped session and Stop a live one", () => {
    expect(
      selectionState(
        [makeSession({ id: 1, groupId: 3 }), makeSession({ id: 2, alive: false })],
        groups,
      ),
    ).toEqual({ count: 2, anyGrouped: true, anyAlive: true });
  });

  it("an all-ungrouped selection has nothing to Ungroup", () => {
    expect(selectionState([makeSession({ id: 1 })], groups).anyGrouped).toBe(false);
  });

  it("a session in an unknown group is ungrouped as far as Ungroup goes", () => {
    expect(selectionState([makeSession({ id: 1, groupId: 99 })], groups).anyGrouped).toBe(false);
  });

  it("an all-ended selection has nothing to Stop", () => {
    expect(selectionState([makeSession({ id: 1, alive: false })], groups).anyAlive).toBe(false);
  });

  it("an empty selection enables nothing", () => {
    expect(selectionState([], groups)).toEqual({ count: 0, anyGrouped: false, anyAlive: false });
  });
});

describe("section text", () => {
  it("sessionsPhrase is singular at exactly 1", () => {
    expect(sessionsPhrase(0)).toBe("0 sessions");
    expect(sessionsPhrase(1)).toBe("1 session");
    expect(sessionsPhrase(2)).toBe("2 sessions");
    expect(sessionsPhrase(12)).toBe("12 sessions");
  });

  it("the caret names what pressing it does", () => {
    expect(caretLabel("PR reviews", false)).toBe("Collapse PR reviews");
    expect(caretLabel("PR reviews", true)).toBe("Expand PR reviews");
    expect(caretLabel("Ungrouped", false)).toBe("Collapse Ungrouped");
  });

  it("the header checkbox selects all in the section", () => {
    expect(headerCheckboxLabel("PR reviews")).toBe("Select all in PR reviews");
  });

  it("an empty section says so, differently for Ungrouped", () => {
    expect(emptySectionLine({ id: 3 })).toBe("empty — drop sessions here");
    expect(emptySectionLine({ id: null })).toBe("no ungrouped sessions");
  });
});

describe("groupsInRailOrder (the Move to menu, delete targets and launch Group row)", () => {
  it("orders groups by pos, not by id or arrival", () => {
    const groups = [group(9, 2), group(2, 0), group(5, 1)];
    expect(groupsInRailOrder(groups).map((g) => g.id)).toEqual([2, 5, 9]);
  });

  it("leaves Ungrouped out: its pos never shifts a group", () => {
    // Ungrouped sits at pos 1 among the sections but is not a Group, so the list is the groups only.
    expect(groupsInRailOrder([G3, G5]).map((g) => g.id)).toEqual([3, 5]);
  });

  it("returns a new array and leaves the caller's order alone", () => {
    const groups = [group(9, 2), group(2, 0)];
    const ordered = groupsInRailOrder(groups);
    expect(ordered).not.toBe(groups);
    expect(groups.map((g) => g.id)).toEqual([9, 2]);
  });

  it("is empty for no groups", () => {
    expect(groupsInRailOrder([])).toEqual([]);
  });
});

describe("shared choice labels", () => {
  it("word the no-group and new-group choices the menus and the launch select both show", () => {
    expect(NO_GROUP_CHOICE).toBe("No group");
    expect(NEW_GROUP_CHOICE).toBe("New group…");
  });
});
