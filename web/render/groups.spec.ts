// groups — the display properties of plan groups, re-levelled from web/e2e/groups.spec.ts,
// groups-select.spec.ts, groups-focus.spec.ts and groups-launch.spec.ts on 2026-10-20
// (plans/_audit/relevel/groups.md): what the rail's sections, their header summary and
// popover, select mode, the filter, the chords, the Focus header's group control and the
// launch dialog's Group row show for a given snapshot. Nothing here reaches the daemon: a
// pending name field, a menu, a dialog, a selection, the filter and a card click are
// window state; a drop or a key that would have sent nothing is proved to send nothing;
// the sort, a collapsed section and the states come from the fixtures (`groups-titled*`,
// `groups-summary`, `groups-needs-input`, `groups-focus-header`), since the dashboard adopts
// `railSort` and `collapsed` only from the daemon's broadcast.
import {
  barButton,
  bulkRemoveDialog,
  bulkStopDialog,
  cardCheckbox,
  deleteGroupDialog,
  expectFocusAndNodeSurviveTick,
  filterButton,
  filterGroup,
  type FloorCheck,
  groupActionsButton,
  groupBody,
  groupCaret,
  groupHead,
  groupHeads,
  groupName,
  groupNameField,
  groupNameInput,
  groupSelect,
  headerCheckbox,
  mainheadGroupButton,
  menuItem,
  newGroupModal,
  openGroupMenu,
  openMenu,
  openRailMenu,
  optionLabels,
  popover,
  railActionsButton,
  railCardByFolder,
  railCount,
  sectionCardIds,
  sectionCards,
  sectionIds,
  selectBar,
  selectBarCount,
  selectedOptionLabel,
  selectToggle,
  setMainheadContentWidth,
  setMainheadWidth,
  summaryCount,
  summaryState,
  summaryStates,
  titleAndRepoFloorProblems,
  titleFloorAndReadoutProblems,
  trackMutations,
  UNGROUPED,
  visibleRailCardIds,
} from "./helpers/groups";
import { mainheadBranch, mainheadFitProblems, mainheadFolder } from "./helpers/card-location";
import {
  type Dashboard,
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  type Session,
  settleFor,
  test,
} from "./helpers/harness";
import { newTab, openLaunchDialog, resumeTab } from "./helpers/shortcuts";
import { tokenColor } from "./helpers/style";

// --- the rail's own controls, as web/e2e/helpers/railorder.ts and picker.ts locate them ---

/** A rail card by title (`#sessions`, never the Tiles strip's copy of the same session). */
function railCard(page: Page, title: string): Locator {
  return page.locator("#sessions").getByTestId("session-card").filter({ hasText: title });
}

/** The pin/unpin control inside a card's state row: `Pin` unpinned, `Unpin` pinned. */
function pinButton(card: Locator): Locator {
  return card.getByRole("button", { name: /^(Pin|Unpin)$/ });
}

/** The rail-head sort toggle (`combobox` named "Sort", a real `<select>`). */
function railSortSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Sort" });
}

const mainheadName = (page: Page) => page.locator("#mainhead .name");

// --- reading the fixture ---

/** The fixture's group by name — a scenario names each group once. */
function groupNamed(
  fixture: RenderFixture,
  name: string,
): RenderFixture["snapshot"]["groups"][number] {
  const group = fixture.snapshot.groups.find((g) => g.name === name);
  if (!group) throw new Error(`fixture ${fixture.scenario} has no group named ${name}`);
  return group;
}

/** The fixture's session by title — every titled scenario titles each session once. */
function sessionTitled(fixture: RenderFixture, title: string): Session {
  const session = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`fixture ${fixture.scenario} has no session titled ${title}`);
  return session;
}

/** One section's members in the daemon's own order: pinned block first, then `railPos`. */
function memberIds(fixture: RenderFixture, groupId: number | null): number[] {
  return fixture.snapshot.sessions
    .filter((s) => s.groupId === groupId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.railPos - b.railPos;
    })
    .map((s) => s.id);
}

// ═══ web/e2e/groups.spec.ts — the sections ═══

// The pending section is window state until Enter commits a non-empty name
// (kb:adr/rail-new-group-is-named-before-it-exists): discarding it sends nothing, which the
// request log proves where the journey read the daemon's empty group list.
async function openPendingGroup(page: Page, dashboard: Dashboard): Promise<Locator> {
  const fixture = await dashboard.open("three-states");
  expect(fixture.snapshot.groups).toEqual([]);
  await expect(page.locator("#sessions").getByTestId("session-card")).toHaveCount(
    fixture.snapshot.sessions.length,
  );
  await openRailMenu(page);
  await menuItem(page, "New group…").click();
  const field = groupNameInput(page.locator("#sessions"));
  await expect(field).toBeFocused();
  return field;
}

test("Escape in the new-group textbox discards the pending section and creates nothing (REQ-1, E2)", async ({
  page,
  dashboard,
}) => {
  const field = await openPendingGroup(page, dashboard);
  const net = trackMutations(page);
  await page.keyboard.type("Never kept");
  await page.keyboard.press("Escape");

  await expect(field).toHaveCount(0);
  await expect(groupHeads(page)).toHaveCount(0);
  await expect(filterGroup(page)).toHaveCount(0);
  await settleFor(page, 600);
  expect(net.requests()).toEqual([]);
});

for (const typed of ["", "   "]) {
  test(`Enter on ${typed === "" ? "an empty" : "a whitespace-only"} name discards the pending section and creates nothing (REQ-1, E2)`, async ({
    page,
    dashboard,
  }) => {
    const field = await openPendingGroup(page, dashboard);
    const net = trackMutations(page);
    if (typed !== "") await page.keyboard.type(typed);
    await page.keyboard.press("Enter");

    await expect(field).toHaveCount(0);
    await expect(groupHeads(page)).toHaveCount(0);
    await expect(filterGroup(page)).toHaveCount(0);
    await settleFor(page, 600);
    expect(net.requests()).toEqual([]);
  });
}

test("tabbing out of the new-group textbox discards the pending section and creates nothing (REQ-1, UI Specifications New group)", async ({
  page,
  dashboard,
}) => {
  const field = await openPendingGroup(page, dashboard);
  const net = trackMutations(page);
  await page.keyboard.type("Typed then abandoned");
  await page.keyboard.press("Tab");

  await expect(field).toHaveCount(0);
  await expect(groupHeads(page)).toHaveCount(0);
  await settleFor(page, 600);
  expect(net.requests()).toEqual([]);
});

test("Escape while editing a name, and a whitespace-only name on Enter, each restore the old name and send nothing (REQ-2, E3, edge case 12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const group = groupNamed(fixture, "Alpha");
  const head = groupHead(page, group.id);
  await expect(groupName(head)).toHaveText("Alpha");
  const net = trackMutations(page);

  await groupName(head).dblclick();
  await expect(groupNameInput(head)).toBeFocused();
  await page.keyboard.type("Gamma");
  await page.keyboard.press("Escape");
  await expect(groupNameInput(head)).toHaveCount(0);
  await expect(groupName(head)).toHaveText("Alpha");

  await groupName(head).dblclick();
  await expect(groupNameInput(head)).toBeFocused();
  await page.keyboard.type("   ");
  await page.keyboard.press("Enter");
  await expect(groupNameInput(head)).toHaveCount(0);
  await expect(groupName(head)).toHaveText("Alpha");

  await settleFor(page, 600);
  expect(net.requests().filter((r) => r.startsWith("PUT /api/groups"))).toEqual([]);
  await expect(groupName(head)).toHaveText("Alpha");
});

test("a header's name is uppercased by CSS while its text stays the raw name, and the header is sticky (REQ-2, UI Specifications Sections)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  // A mixed-case name, so the transform is visible against the raw text.
  const group = groupNamed(fixture, "Alpha");
  const head = groupHead(page, group.id);
  await expect(groupName(head)).toHaveText("Alpha");
  await expect(groupName(head)).toHaveCSS("text-transform", "uppercase");
  await expect(head).toHaveCSS("position", "sticky");
});

test("a group made empty shows the drop line, and an Ungrouped section whose sessions all moved says no ungrouped sessions (REQ-4, REQ-15)", async ({
  page,
  dashboard,
}) => {
  // `groups-summary` holds the three states at once: an empty group, an Ungrouped section
  // every session has left, and a group that has members.
  const fixture = await dashboard.open("groups-summary");
  const empty = groupNamed(fixture, "Void");
  const filled = groupNamed(fixture, "Mixed");
  expect(memberIds(fixture, empty.id)).toEqual([]);
  expect(memberIds(fixture, null)).toEqual([]);
  expect(memberIds(fixture, filled.id)).not.toEqual([]);

  await expect(groupBody(page, empty.id).locator(".empty")).toHaveText(
    "empty — drop sessions here",
  );
  await expect(summaryCount(groupHead(page, empty.id))).toHaveText("0");

  await expect(groupBody(page, UNGROUPED).locator(".empty")).toHaveText("no ungrouped sessions");
  await expect(summaryCount(groupHead(page, UNGROUPED))).toHaveText("0");
  await expect(groupBody(page, filled.id).locator(".empty")).toHaveCount(0);
});

test("Cancel and Escape in the Delete group dialog leave the group and its members as they were (REQ-5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const group = groupNamed(fixture, "Alpha");
  const members = memberIds(fixture, group.id);
  expect(members).toHaveLength(2);
  await expect.poll(() => sectionCardIds(page, group.id)).toEqual(members);
  const net = trackMutations(page);

  await openGroupMenu(page, groupHead(page, group.id));
  await menuItem(page, "Delete group…").click();
  const dialog = deleteGroupDialog(page, "Alpha");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  await openGroupMenu(page, groupHead(page, group.id));
  await menuItem(page, "Delete group…").click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await settleFor(page, 500);
  expect(net.requests().filter((r) => r.startsWith("DELETE /api/groups"))).toEqual([]);
  expect(await sectionCardIds(page, group.id)).toEqual(members);
});

test("a header shows the member count and one state item per state present in attention order, an ended member counts under a neutral ended dot (REQ-16, E8)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-summary");
  const group = groupNamed(fixture, "Mixed");
  const head = groupHead(page, group.id);
  await expect(summaryCount(head)).toHaveText("7");
  // The states present, in the order needs input, failed, started, planning, working, idle, ended.
  await expect
    .poll(() =>
      summaryStates(head).evaluateAll((els) => els.map((el) => el.getAttribute("data-state"))),
    )
    .toEqual(["needs_input", "failed", "started", "working", "idle", "ended"]);
  const expected: Record<string, [string, string]> = {
    needs_input: ["1", "1 needs input"],
    failed: ["1", "1 failed"],
    started: ["1", "1 started"],
    working: ["2", "2 working"],
    idle: ["1", "1 idle"],
    ended: ["1", "1 ended"],
  };
  for (const [state, [number, title]] of Object.entries(expected)) {
    await expect(summaryState(head, state)).toHaveText(number);
    await expect(summaryState(head, state)).toHaveAttribute("title", title);
  }
  // The ended dot is the neutral token, never a state colour.
  const endedDot = summaryState(head, "ended").locator("i");
  await expect(endedDot).toHaveCSS("background-color", await tokenColor(page, "--line-control"));
  // Cross-check the count against the snapshot the daemon sent.
  const members = fixture.snapshot.sessions.filter((s) => s.groupId === group.id);
  expect(members).toHaveLength(7);
  expect(members.filter((s) => !s.alive)).toHaveLength(1);
});

test("hovering a header shows a tooltip naming the group, its session count, each state present and each member's title under its state (REQ-16, E9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-summary");
  const group = groupNamed(fixture, "Hover me");
  const head = groupHead(page, group.id);
  await expect(summaryState(head, "needs_input")).toHaveText("1");
  await expect(summaryState(head, "working")).toHaveText("1");

  await page.mouse.move(0, 0);
  await expect(popover(page)).toHaveCount(0);
  await head.hover();
  const tip = popover(page);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Hover me");
  await expect(tip).toContainText("3 sessions");
  const rows = [
    ["needs_input", "needs input", "e9-need"],
    ["working", "working", "e9-work"],
    ["started", "started", "e9-new"],
  ] as const;
  for (const [state, word, title] of rows) {
    const row = tip.locator(`.pr[data-state="${state}"]`);
    await expect(row).toContainText(word);
    await expect(row.locator(".pt")).toHaveText([title]);
  }
  // Pointer-events none: the tooltip never steals a click (UI Specifications Popover).
  await expect(tip).toHaveCSS("pointer-events", "none");

  // Removed on leave.
  await page.mouse.move(0, 0);
  await expect(popover(page)).toHaveCount(0);

  // And on pointerdown while it is showing.
  await head.hover();
  await expect(popover(page)).toBeVisible();
  await page.mouse.down();
  await expect(popover(page)).toHaveCount(0);
  await page.mouse.up();
});

test("the popover of an empty group says empty (REQ-4, REQ-16, E9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-summary");
  const group = groupNamed(fixture, "Void");
  await page.mouse.move(0, 0);
  await groupHead(page, group.id).hover();
  await expect(popover(page)).toBeVisible();
  await expect(popover(page)).toContainText("Void");
  await expect(popover(page)).toContainText("empty");
});

test("keyboard focus reaching a header's caret shows the same popover (REQ-16, UI Specifications Popover)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-summary");
  // The first section's caret is the first one a keyboard user reaches from the rail head.
  const first = [...fixture.snapshot.groups].sort((a, b) => a.pos - b.pos)[0];
  if (!first) throw new Error("the fixture has no group");
  const caret = groupCaret(groupHead(page, first.id));
  await expect(caret).toBeVisible();
  await page.mouse.move(0, 0);
  // Reach the caret the way a keyboard user does: tab forward from the rail head.
  await selectToggle(page).focus();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    if (await caret.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(caret).toBeFocused();
  await expect(popover(page)).toBeVisible();
  await expect(popover(page)).toContainText(first.name);
  await page.keyboard.press("Tab");
  await expect(popover(page)).toHaveCount(0);
});

test("cards and headers are both draggable in attention sort (REQ-25, E10, plan rail-card-organise REQ-12, REQ-19)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled-attention");
  const groupA = groupNamed(fixture, "Alpha");
  const groupB = groupNamed(fixture, "Bravo");
  await expect(railSortSelect(page)).toHaveValue("attention");
  await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "true");
  await expect(groupHead(page, groupA.id)).toHaveAttribute("draggable", "true");
  await expect(groupHead(page, groupB.id)).toHaveAttribute("draggable", "true");
});

test("dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order (REQ-25, E11)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const groupA = groupNamed(fixture, "Alpha");
  const groupB = groupNamed(fixture, "Bravo");
  await expect(groupHeads(page)).toHaveCount(3);
  const sectionsBefore = await sectionIds(page);
  const cards = async () => ({
    a: await sectionCardIds(page, groupA.id),
    b: await sectionCardIds(page, groupB.id),
    u: await sectionCardIds(page, UNGROUPED),
  });
  const cardsBefore = await cards();
  expect(cardsBefore).toEqual({
    a: memberIds(fixture, groupA.id),
    b: memberIds(fixture, groupB.id),
    u: memberIds(fixture, null),
  });
  const net = trackMutations(page);

  await groupHead(page, groupA.id).dragTo(railCard(page, "bravo-one"));
  await railCard(page, "loose-one").dragTo(page.locator(".railhead"));
  await railCard(page, "loose-one").dragTo(filterGroup(page));

  await settleFor(page, 800);
  expect(net.requests()).toEqual([]);
  expect(await sectionIds(page)).toEqual(sectionsBefore);
  expect(await cards()).toEqual(cardsBefore);
});

test("the filter offers All, Groups and Ungrouped, the count reads n of m while it hides cards, and it resets to All on reload (REQ-17, E22)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const total = fixture.snapshot.sessions.length;
  const grouped = fixture.snapshot.sessions.filter((s) => s.groupId !== null).length;
  expect(total).toBe(4);
  expect(grouped).toBe(3);
  await expect(filterGroup(page)).toBeVisible();
  await expect(filterGroup(page).getByRole("button")).toHaveText(["All", "Groups", "Ungrouped"]);
  await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(railCount(page)).toHaveText(`${total}`);

  await filterButton(page, "Groups").click();
  await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "true");
  await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "false");
  await expect(railCount(page)).toHaveText(`${grouped} of ${total}`);
  await expect(railCard(page, "alpha-one")).toBeVisible();
  await expect(railCard(page, "loose-one")).toBeHidden();

  await filterButton(page, "Ungrouped").click();
  await expect(railCount(page)).toHaveText(`${total - grouped} of ${total}`);
  await expect(railCard(page, "alpha-one")).toBeHidden();
  await expect(railCard(page, "loose-one")).toBeVisible();

  await filterButton(page, "Groups").click();
  await expect(railCount(page)).toHaveText(`${grouped} of ${total}`);
  await page.reload();
  await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(railCount(page)).toHaveText(`${total}`);
});

test("the rail ⋯ and header ⋯ buttons open their menus from the keyboard, the opener stays the same node and the menu survives a render tick (REQ-1, REQ-3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const group = groupNamed(fixture, "Alpha");
  const head = groupHead(page, group.id);
  await expect(groupName(head)).toHaveText("Alpha");

  for (const opener of [railActionsButton(page), groupActionsButton(head)]) {
    await opener.focus();
    await opener.evaluate((el) => {
      Reflect.set(el, "__e2eOpener", true);
    });
    await page.keyboard.press("Enter");
    await expect(openMenu(page)).toBeVisible();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await settleFor(page, 1_300);
    await expect(openMenu(page)).toBeVisible();
    expect(await opener.evaluate((el) => Reflect.get(el, "__e2eOpener") === true)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(openMenu(page)).toHaveCount(0);
    await expect(opener).toHaveAttribute("aria-expanded", "false");
  }
});

test("a group header's ⋯ menu offers the full item list while the Ungrouped header offers no Rename, Ungroup or Delete group… (REQ-2, REQ-5, REQ-6, UI Specifications Header menu)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  // A group of one and an Ungrouped section of one, so both menus read `Select all (1)`.
  const group = groupNamed(fixture, "Bravo");
  expect(memberIds(fixture, group.id)).toHaveLength(1);
  expect(memberIds(fixture, null)).toHaveLength(1);

  await openGroupMenu(page, groupHead(page, group.id));
  for (const name of [
    "Rename",
    "Collapse",
    "Select all (1)",
    "New group…",
    "Stop all…",
    "Ungroup",
    "Delete group…",
  ]) {
    await expect(menuItem(page, name)).toBeVisible();
  }
  await page.keyboard.press("Escape");

  await openGroupMenu(page, groupHead(page, UNGROUPED));
  for (const name of ["Collapse", "Select all (1)", "New group…", "Stop all…"]) {
    await expect(menuItem(page, name)).toBeVisible();
  }
  for (const name of ["Rename", "Ungroup", "Delete group…"]) {
    await expect(menuItem(page, name)).toHaveCount(0);
  }
  await expect(sectionCards(page, UNGROUPED)).toHaveCount(1);
});

// ═══ web/e2e/groups-select.spec.ts — select mode ═══

test("in attention sort Select shows a checkbox per card and per header and the bar's buttons follow the selection (REQ-12, E12)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled-attention");
  await expect(railSortSelect(page)).toHaveValue("attention");
  await expect(selectBar(page)).toBeHidden();
  await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");

  await selectToggle(page).click();
  await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(selectBar(page)).toBeVisible();
  await expect(selectBarCount(page)).toHaveText("Select sessions");
  for (const title of ["alpha-one", "alpha-two", "bravo-one", "loose-one"]) {
    await expect(cardCheckbox(page, title)).toBeVisible();
    await expect(cardCheckbox(page, title)).not.toBeChecked();
    // The pin control hides while selecting.
    await expect(pinButton(railCard(page, title))).toBeHidden();
  }
  await expect(headerCheckbox(page, "Alpha")).toBeVisible();
  await expect(headerCheckbox(page, "Bravo")).toBeVisible();
  await expect(headerCheckbox(page, "Ungrouped")).toBeVisible();

  // At zero selected the actions that need a selection are disabled; All and Done are not.
  for (const name of ["Move to", "Ungroup", "Stop…", "Remove…"] as const) {
    await expect(barButton(page, name)).toBeDisabled();
  }
  await expect(barButton(page, "All")).toBeEnabled();
  await expect(barButton(page, "Done")).toBeEnabled();

  // A grouped, live card: everything is enabled.
  await cardCheckbox(page, "alpha-one").check();
  await expect(selectBarCount(page)).toHaveText("1 selected");
  for (const name of ["Move to", "Ungroup", "Stop…", "Remove…"] as const) {
    await expect(barButton(page, name)).toBeEnabled();
  }
  // Only an ungrouped card: Ungroup has nothing to do.
  await cardCheckbox(page, "alpha-one").uncheck();
  await cardCheckbox(page, "loose-one").check();
  await expect(selectBarCount(page)).toHaveText("1 selected");
  await expect(barButton(page, "Ungroup")).toBeDisabled();
  await expect(barButton(page, "Move to")).toBeEnabled();
});

test("in manual sort a selected card in select mode is draggable and an unselected one is not, the pin control is hidden, and dragging an unselected card moves nothing (REQ-12, REQ-24, E12, plan rail-card-organise REQ-15)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const groupA = groupNamed(fixture, "Alpha");
  const groupB = groupNamed(fixture, "Bravo");
  await expect(railSortSelect(page)).toHaveValue("manual");
  await expect(railCard(page, "loose-one")).toHaveAttribute("draggable", "true");
  await expect(pinButton(railCard(page, "loose-one"))).toBeVisible();

  await selectToggle(page).click();
  await cardCheckbox(page, "loose-one").check();
  // Only the selected card drags now; every other card is not draggable.
  await expect(railCard(page, "loose-one")).toHaveAttribute("draggable", "true");
  await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "false");
  await expect(railCard(page, "bravo-one")).toHaveAttribute("draggable", "false");
  await expect(pinButton(railCard(page, "loose-one"))).toBeHidden();

  const order = async () => ({
    a: await sectionCardIds(page, groupA.id),
    b: await sectionCardIds(page, groupB.id),
    u: await sectionCardIds(page, UNGROUPED),
  });
  const before = await order();
  const net = trackMutations(page);
  await railCard(page, "alpha-one").dragTo(groupHead(page, groupB.id));
  await railCard(page, "alpha-one").dragTo(railCard(page, "bravo-one"));
  await settleFor(page, 800);
  expect(net.requests()).toEqual([]);
  expect(await order()).toEqual(before);
  // The dragged card is still in its group, and the selected one still loose.
  expect(before.a).toContain(sessionTitled(fixture, "alpha-one").id);
  expect(before.u).toContain(sessionTitled(fixture, "loose-one").id);

  await barButton(page, "Done").click();
  await expect(railCard(page, "loose-one")).toHaveAttribute("draggable", "true");
  await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "true");
  await expect(pinButton(railCard(page, "loose-one"))).toBeVisible();
});

test("a selected card carries the selected class and its ground is the --bg-hover token (REQ-12, UI Specifications Select mode)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await selectToggle(page).click();
  await cardCheckbox(page, "loose-one").check();
  const selected = railCard(page, "loose-one");
  await expect(selected).toHaveClass(/selected/);
  await expect(selected).toHaveCSS("background-color", await tokenColor(page, "--bg-hover"));
  await expect(railCard(page, "alpha-one")).not.toHaveClass(/selected/);
});

test("in select mode a card click toggles instead of focusing, the mainhead keeps its session, and a header checkbox selects all its members (REQ-12, E13)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await railCard(page, "loose-one").click();
  await expect(mainheadName(page)).toHaveText("loose-one");

  await selectToggle(page).click();
  await railCard(page, "alpha-one").click();
  await expect(cardCheckbox(page, "alpha-one")).toBeChecked();
  await expect(selectBarCount(page)).toHaveText("1 selected");
  await railCard(page, "bravo-one").click();
  await expect(cardCheckbox(page, "bravo-one")).toBeChecked();
  await expect(selectBarCount(page)).toHaveText("2 selected");
  // Neither click focused a session: the mainhead still names the previous one.
  await expect(mainheadName(page)).toHaveText("loose-one");
  await expect(railCard(page, "loose-one")).toHaveAttribute("aria-current", "true");

  // A second click toggles it back off.
  await railCard(page, "bravo-one").click();
  await expect(cardCheckbox(page, "bravo-one")).not.toBeChecked();
  await expect(selectBarCount(page)).toHaveText("1 selected");

  // A header checkbox selects every member of its group.
  await headerCheckbox(page, "Alpha").check();
  await expect(cardCheckbox(page, "alpha-one")).toBeChecked();
  await expect(cardCheckbox(page, "alpha-two")).toBeChecked();
  await expect(cardCheckbox(page, "loose-one")).not.toBeChecked();
  await expect(selectBarCount(page)).toHaveText("2 selected");
  await headerCheckbox(page, "Alpha").uncheck();
  await expect(selectBarCount(page)).toHaveText("Select sessions");
  await expect(mainheadName(page)).toHaveText("loose-one");
});

test("⋯ → Select all (n) on a header turns on select mode with that group's members selected (REQ-12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const group = groupNamed(fixture, "Alpha");
  expect(memberIds(fixture, group.id)).toHaveLength(2);

  await openGroupMenu(page, groupHead(page, group.id));
  await menuItem(page, "Select all (2)").click();

  await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(selectBarCount(page)).toHaveText("2 selected");
  await expect(cardCheckbox(page, "alpha-one")).toBeChecked();
  await expect(cardCheckbox(page, "alpha-two")).toBeChecked();
  await expect(cardCheckbox(page, "loose-one")).not.toBeChecked();
});

test("a selection of one reads in the singular: Stop 1 session? with Stop 1, and Remove 1 session? with Remove 1 (REQ-13)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await selectToggle(page).click();
  await cardCheckbox(page, "alpha-one").check();

  await barButton(page, "Stop…").click();
  const stop = bulkStopDialog(page, 1);
  await expect(stop).toBeVisible();
  await expect(stop.getByRole("button", { name: "Stop 1", exact: true })).toBeVisible();
  await stop.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(stop).toBeHidden();

  await barButton(page, "Remove…").click();
  const remove = bulkRemoveDialog(page, 1);
  await expect(remove).toBeVisible();
  await expect(remove.getByRole("button", { name: "Remove 1", exact: true })).toBeVisible();
});

test("Cancel and Escape in a bulk dialog close it without a request, leaving the selection and select mode as they were (REQ-12, REQ-13)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const n = fixture.snapshot.sessions.length;
  await selectToggle(page).click();
  await barButton(page, "All").click();
  await expect(selectBarCount(page)).toHaveText(`${n} selected`);
  const net = trackMutations(page);

  await barButton(page, "Remove…").click();
  const dialog = bulkRemoveDialog(page, n);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  await barButton(page, "Stop…").click();
  const stop = bulkStopDialog(page, n);
  await expect(stop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stop).toBeHidden();

  await settleFor(page, 500);
  expect(net.requests()).toEqual([]);
  // Escape closed the dialog, not select mode (Escape leaves the mode only with no dialog open).
  await expect(selectBar(page)).toBeVisible();
  await expect(selectBarCount(page)).toHaveText(`${n} selected`);
  await expect(railCard(page, "alpha-one")).not.toHaveClass(/ended/);
});

for (const how of ["Escape", "Done"] as const) {
  test(`${how} leaves select mode with no checkbox and nothing selected (REQ-12, E16)`, async ({
    page,
    dashboard,
  }) => {
    await dashboard.open("groups-titled");
    await selectToggle(page).click();
    await cardCheckbox(page, "alpha-one").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");

    if (how === "Escape") await page.keyboard.press("Escape");
    else await barButton(page, "Done").click();

    await expect(selectBar(page)).toBeHidden();
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sessions").getByRole("checkbox")).toHaveCount(0);
    // Nothing stays selected: the next Select starts from zero.
    await selectToggle(page).click();
    await expect(selectBarCount(page)).toHaveText("Select sessions");
    await expect(cardCheckbox(page, "alpha-one")).not.toBeChecked();
  });
}

test("a card checkbox, a header checkbox and the All button keep focus and the same node across a render tick after a real key (REQ-12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const n = fixture.snapshot.sessions.length;
  await selectToggle(page).click();

  await expectFocusAndNodeSurviveTick(page, cardCheckbox(page, "loose-one"), "Space", async () => {
    await expect(cardCheckbox(page, "loose-one")).toBeChecked();
  });
  await expectFocusAndNodeSurviveTick(page, headerCheckbox(page, "Alpha"), "Space", async () => {
    await expect(headerCheckbox(page, "Alpha")).toBeChecked();
  });
  await expectFocusAndNodeSurviveTick(page, barButton(page, "All"), "Enter", async () => {
    await expect(selectBarCount(page)).toHaveText(`${n} selected`);
  });
});

// ═══ web/e2e/groups-focus.spec.ts — the Focus header's group control and the chords ═══

test("the Focus header shows the focused session's group between the name and the repo readout, and no group for an ungrouped one (REQ-10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await railCard(page, "alpha-one").click();
  await expect(mainheadName(page)).toHaveText("alpha-one");
  const control = mainheadGroupButton(page);
  await expect(control).toBeVisible();
  await expect(control).toHaveRole("button");
  await expect(control).toHaveAccessibleName("Alpha");
  await expect(control).toHaveAttribute("title", "Group — click to move");
  // Between the name (and bypass chip) and the repo / branch readout, in the DOM.
  const order = await page.evaluate(() => {
    const name = document.querySelector("#mainhead .name");
    const ingroup = document.querySelector("#mainhead .ingroup");
    const meta = document.querySelector("#mainhead .meta");
    if (!name || !ingroup || !meta) return null;
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { afterName: follows(name, ingroup), beforeMeta: follows(ingroup, meta) };
  });
  expect(order).toEqual({ afterName: true, beforeMeta: true });
  // The control's own style: a 1px --line-control border, --fg-dim text.
  await expect(control).toHaveCSS("border-top-width", "1px");
  await expect(control).toHaveCSS("border-top-color", await tokenColor(page, "--line-control"));
  await expect(control).toHaveCSS("color", await tokenColor(page, "--fg-dim"));

  await railCard(page, "loose-one").click();
  await expect(mainheadName(page)).toHaveText("loose-one");
  await expect(control).toHaveAccessibleName("no group");
});

test("the Focus header's group control keeps its node and its open menu across a render tick when opened from the keyboard (REQ-10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await railCard(page, "alpha-one").click();
  const control = mainheadGroupButton(page);
  await expect(control).toHaveAccessibleName("Alpha");

  await control.focus();
  await control.evaluate((el) => {
    Reflect.set(el, "__e2eOpener", true);
  });
  await page.keyboard.press("Enter");
  await expect(openMenu(page)).toBeVisible();
  await expect(control).toHaveAttribute("aria-expanded", "true");
  await settleFor(page, 1_300);
  await expect(openMenu(page)).toBeVisible();
  expect(await control.evaluate((el) => Reflect.get(el, "__e2eOpener") === true)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(openMenu(page)).toHaveCount(0);
});

// The Focus header at the four widths the plan names, measured on the header itself (the control's
// 640px rule is a container query on the header's own width, not the window's). A long title proves
// the title floor; `groups-focus-header` holds both checkouts under it in one group, so the card is
// picked by its folder line: `muster-app` (12 characters, held to the repo block's 8-character floor)
// and `muster` (`muster /` is exactly the floor, so it can never be truncated, where a longer folder
// ellipsizes only once the header is on two rows and then before the title does — plan
// title-crop-stop-resume-button, REQ-2: the readout gives way ahead of the title, which keeps its
// 6rem floor last).
const LONG_TITLE = "rework shift-swap approval for the weekend rostering rule changes";
const REPO_FOLDER = "muster-app";
const FLOOR_FOLDER = "muster";

/** Opens `groups-focus-header` in a wide window and focuses the session in `folder`. */
async function focusHeaderUnderGroupControl(
  page: Page,
  dashboard: Dashboard,
  folder: string,
): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 800 });
  const fixture = await dashboard.open("groups-focus-header");
  const group = groupNamed(fixture, "Wide control");
  const session = fixture.snapshot.sessions.find(
    (s) => s.title === LONG_TITLE && s.repo?.name === folder,
  );
  if (!session) throw new Error(`${fixture.scenario} has no ${folder} session under the fit title`);
  expect(session.groupId).toBe(group.id);
  await railCardByFolder(page, LONG_TITLE, folder).click();
  await expect(mainheadFolder(page)).toHaveText(`${folder} /`);
  await expect(mainheadBranch(page)).toHaveText("main");
  await expect(mainheadGroupButton(page)).toHaveAccessibleName("Wide control");
}

async function expectHeaderAtWidth(
  page: Page,
  dashboard: Dashboard,
  folder: string,
  width: number,
  present: boolean,
  check: FloorCheck,
): Promise<void> {
  await focusHeaderUnderGroupControl(page, dashboard, folder);
  const settled = await setMainheadWidth(page, width);
  expect(Math.abs(settled - width)).toBeLessThanOrEqual(1);
  if (present) {
    await expect(mainheadGroupButton(page)).toBeVisible();
  } else {
    await expect(mainheadGroupButton(page)).toBeHidden();
    await expect(mainheadGroupButton(page)).toHaveCSS("display", "none");
  }
  await expect.poll(() => check(page, folder)).toEqual([]);
  await expect.poll(() => mainheadFitProblems(page)).toEqual([]);
}

const WIDTH_CASES = [
  [1140, true],
  [724, true],
  [600, false],
  [500, false],
] as const;

for (const [width, present] of WIDTH_CASES) {
  test(`at a header width of ${width}px the Focus header's group control is ${present ? "present" : "absent"}, the title keeps its 6rem floor and the repo block stays present at its 8-character floor or wider (REQ-10, E27)`, async ({
    page,
    dashboard,
  }) => {
    await expectHeaderAtWidth(
      page,
      dashboard,
      REPO_FOLDER,
      width,
      present,
      titleAndRepoFloorProblems,
    );
  });
}

for (const [width, present] of WIDTH_CASES) {
  test(`at a header width of ${width}px a folder within the repo block's floor reads whole beside the group control, which is ${present ? "present" : "absent"}, under a long title (REQ-10, E27)`, async ({
    page,
    dashboard,
  }) => {
    await expectHeaderAtWidth(
      page,
      dashboard,
      FLOOR_FOLDER,
      width,
      present,
      titleFloorAndReadoutProblems,
    );
  });
}

// The rule is `@container (width < 640px)` over the header's content box
// (kb:adr/focus-group-control-hides-below-640px-container-width): 640 shows the control and 639
// hides it, with the same session, group and viewport height either side.
for (const [contentWidth, present] of [
  [640, true],
  [639, false],
] as const) {
  test(`with a header content box of ${contentWidth}px the Focus header's group control is ${present ? "present" : "absent"} (REQ-10, E27)`, async ({
    page,
    dashboard,
  }) => {
    await focusHeaderUnderGroupControl(page, dashboard, REPO_FOLDER);

    expect(await setMainheadContentWidth(page, contentWidth)).toBe(contentWidth);
    if (present) {
      await expect(mainheadGroupButton(page)).toBeVisible();
      await expect(mainheadGroupButton(page)).toHaveCSS("display", "flex");
    } else {
      await expect(mainheadGroupButton(page)).toBeHidden();
      await expect(mainheadGroupButton(page)).toHaveCSS("display", "none");
    }
    // A render tick later the width and the control's state are the same.
    await settleFor(page, 1_300);
    expect(
      await page.locator("#mainhead").evaluate((el) => el.getBoundingClientRect().width - 28),
    ).toBe(contentWidth);
    await expect(mainheadGroupButton(page)).toHaveCSS("display", present ? "flex" : "none");
  });
}

async function expectSweepHolds(
  page: Page,
  dashboard: Dashboard,
  folder: string,
  check: FloorCheck,
): Promise<void> {
  await focusHeaderUnderGroupControl(page, dashboard, folder);
  const widths: number[] = [];
  for (let w = 900; w >= 480; w -= 20) widths.push(w);
  for (const width of [...widths, ...[...widths].reverse()]) {
    const settled = await setMainheadWidth(page, width);
    // A container query measures the content box, 28px inside the header's own box: the band
    // around 640 is the rule's own edge, so only widths clear of it assert presence or absence.
    if (settled >= 680) await expect(mainheadGroupButton(page), `at ${settled}px`).toBeVisible();
    if (settled <= 600) await expect(mainheadGroupButton(page), `at ${settled}px`).toBeHidden();
    await expect.poll(() => check(page, folder), { message: `at ${settled}px` }).toEqual([]);
    await expect.poll(() => mainheadFitProblems(page), { message: `at ${settled}px` }).toEqual([]);
  }
}

test("sweeping the header width from 900px down to 480px and back, the group control is present exactly while the header is wide, and the title floor and the repo block's 8-character floor hold at every step (REQ-10, E27)", async ({
  page,
  dashboard,
}) => {
  await expectSweepHolds(page, dashboard, REPO_FOLDER, titleAndRepoFloorProblems);
});

test("sweeping the header width from 900px down to 480px and back, a folder within the repo block's floor reads whole at every step beside a group control present exactly while the header is wide (REQ-10, E27)", async ({
  page,
  dashboard,
}) => {
  await expectSweepHolds(page, dashboard, FLOOR_FOLDER, titleFloorAndReadoutProblems);
});

// The chords index the displayed cards: the collapsed first section (Alpha, folded through the
// real PUT in `groups-titled-collapsed{,-attention}`) and the sort come from the fixture, since
// the dashboard adopts both only from the daemon's broadcast.
for (const sort of ["manual", "attention"] as const) {
  test(`⌥⌘1 and ⌥⌘2 count the cards as displayed in ${sort} sort, skipping a collapsed section (REQ-19, I5, E20)`, async ({
    page,
    dashboard,
  }) => {
    const fixture = await dashboard.open(
      sort === "manual" ? "groups-titled-collapsed" : "groups-titled-collapsed-attention",
    );
    const alpha = groupNamed(fixture, "Alpha");
    const b1 = sessionTitled(fixture, "bravo-one");
    const u1 = sessionTitled(fixture, "loose-one");
    expect(alpha.collapsed).toBe(true);
    await expect(railSortSelect(page)).toHaveValue(sort);
    await expect(groupBody(page, alpha.id)).toBeHidden();
    // Displayed: Bravo's card, then the ungrouped one. The first section's two are not.
    await expect.poll(() => visibleRailCardIds(page)).toEqual([b1.id, u1.id]);

    await railCard(page, "loose-one").click();
    await expect(mainheadName(page)).toHaveText("loose-one");
    // The third card in DOM order is the first one displayed.
    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(mainheadName(page)).toHaveText("bravo-one");
    await page.keyboard.press("Alt+Meta+Digit2");
    await expect(mainheadName(page)).toHaveText("loose-one");
    // There is no third displayed card: the chord leaves the focus where it was.
    await page.keyboard.press("Alt+Meta+Digit3");
    await settleFor(page, 500);
    await expect(mainheadName(page)).toHaveText("loose-one");
  });
}

test("with the filter on Groups ⌥⌘1 focuses the first grouped card and the chords never reach a filtered-out card (REQ-17, REQ-19, I5, E20)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  const a1 = sessionTitled(fixture, "alpha-one");
  const a2 = sessionTitled(fixture, "alpha-two");
  const b1 = sessionTitled(fixture, "bravo-one");
  expect(fixture.snapshot.sessions).toHaveLength(4);
  await filterButton(page, "Groups").click();
  await expect(railCount(page)).toHaveText("3 of 4");
  await expect.poll(() => visibleRailCardIds(page)).toEqual([a1.id, a2.id, b1.id]);

  await railCard(page, "bravo-one").click();
  await expect(mainheadName(page)).toHaveText("bravo-one");
  await page.keyboard.press("Alt+Meta+Digit1");
  await expect(mainheadName(page)).toHaveText("alpha-one");
  await page.keyboard.press("Alt+Meta+Digit3");
  await expect(mainheadName(page)).toHaveText("bravo-one");
  // The fourth card in DOM order is filtered out, so a fourth displayed card does not exist.
  await page.keyboard.press("Alt+Meta+Digit4");
  await settleFor(page, 500);
  await expect(mainheadName(page)).toHaveText("bravo-one");
  await expect(railCard(page, "loose-one")).toBeHidden();
});

test("⌥⌘0 onto a grouped needs-input session while the filter is Ungrouped flips the filter to All (I4, E22)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-needs-input");
  const hidden = sessionTitled(fixture, "hidden-one");
  expect(hidden.state).toBe("needs_input");
  expect(hidden.groupId).toBe(groupNamed(fixture, "Hidden").id);
  expect(fixture.snapshot.sessions).toHaveLength(3);
  await filterButton(page, "Ungrouped").click();
  await expect(railCount(page)).toHaveText("2 of 3");
  await railCard(page, "loose-one").click();
  await expect(mainheadName(page)).toHaveText("loose-one");

  await page.keyboard.press("Alt+Meta+Digit0");

  await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(railCount(page)).toHaveText("3");
  await expect(mainheadName(page)).toHaveText("hidden-one");
  await expect(railCard(page, "hidden-one")).toBeVisible();
  await expect(railCard(page, "hidden-one")).toHaveAttribute("aria-current", "true");
});

test("a page load lands default focus on the first displayed card when the first section is collapsed (focus Doc Delta)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled-collapsed");
  const alpha = groupNamed(fixture, "Alpha");
  expect(alpha.collapsed).toBe(true);
  expect(alpha.pos).toBe(0);
  expect(memberIds(fixture, alpha.id)).toHaveLength(2);
  await expect(groupBody(page, alpha.id)).toBeHidden();
  await expect(mainheadName(page)).toHaveText("bravo-one");
  await expect(railCard(page, "bravo-one")).toHaveAttribute("aria-current", "true");
});

// `groups-needs-input`: the one group Hidden holds the needs-input session, so ⌥⌘1 (the first
// displayed card) and ⌥⌘0 (the neediest) would each move the focus to `hidden-one` if a chord acted
// under the dialog; the focus stays on the ungrouped card and nothing is sent.
const INERT_CASES = [
  "the Delete group dialog",
  "the New group from selection modal",
  "a bulk Remove dialog",
] as const;

for (const which of INERT_CASES) {
  test(`⌥⌘1 and ⌥⌘0 change nothing while ${which} is open (edge case 17, E26)`, async ({
    page,
    dashboard,
  }) => {
    const fixture = await dashboard.open("groups-needs-input");
    const hidden = groupNamed(fixture, "Hidden");
    expect(sessionTitled(fixture, "hidden-one").state).toBe("needs_input");
    expect(fixture.snapshot.sessions).toHaveLength(3);
    await railCard(page, "loose-one").click();
    await expect(mainheadName(page)).toHaveText("loose-one");

    let dialog = page.getByRole("dialog");
    if (which === "the Delete group dialog") {
      await openGroupMenu(page, groupHead(page, hidden.id));
      await menuItem(page, "Delete group…").click();
      dialog = deleteGroupDialog(page, "Hidden");
    } else if (which === "the New group from selection modal") {
      await selectToggle(page).click();
      await cardCheckbox(page, "hidden-one").check();
      await barButton(page, "Move to").click();
      await menuItem(page, "New group…").click();
      dialog = newGroupModal(page, 1);
    } else {
      await selectToggle(page).click();
      await barButton(page, "All").click();
      await barButton(page, "Remove…").click();
      dialog = bulkRemoveDialog(page, 3);
    }
    await expect(dialog).toBeVisible();
    const net = trackMutations(page);

    await page.keyboard.press("Alt+Meta+Digit1");
    await page.keyboard.press("Alt+Meta+Digit0");
    await settleFor(page, 600);

    await expect(dialog).toBeVisible();
    await expect(mainheadName(page)).toHaveText("loose-one");
    await expect(railCard(page, "loose-one")).toHaveAttribute("aria-current", "true");
    expect(net.requests()).toEqual([]);
  });
}

// ═══ web/e2e/groups-launch.spec.ts — the launch dialog's Group row ═══

// The dialog opens client-side and builds its Group row from the snapshot's groups and the
// focused session. `GET /api/browse` answers 404 in this tier, so the dialog shows its browse
// error beside the row under test, which never depended on the listing; the Resume tab's list
// meets the same 404 and the row is independent of it too.

test("the launch dialog's Group row defaults to the focused session's group and lists No group, each group and New group… (REQ-11, E17)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await expect(groupHead(page, UNGROUPED)).toBeVisible();

  await railCard(page, "alpha-one").click();
  await expect(mainheadName(page)).toHaveText("alpha-one");
  const dialog = await openLaunchDialog(page);
  await expect(groupSelect(dialog)).toBeVisible();
  await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Alpha");
  const labels = await optionLabels(groupSelect(dialog));
  expect(labels[0]).toBe("No group");
  expect(labels[labels.length - 1]).toBe("New group…");
  expect(labels.slice(1, -1).sort()).toEqual(["Alpha", "Bravo"]);
  // The name field belongs to New group… alone, and starts empty.
  await expect(groupNameField(dialog)).toBeHidden();
  await groupSelect(dialog).selectOption({ label: "New group…" });
  await expect(groupNameField(dialog)).toBeVisible();
  await expect(groupNameField(dialog)).toHaveValue("");
  // The Group row sits under Title.
  const titleBox = await dialog.getByLabel("Title").boundingBox();
  const groupBox = await groupSelect(dialog).boundingBox();
  expect(titleBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
    groupBox?.y ?? Number.NEGATIVE_INFINITY,
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // An ungrouped session focused: No group.
  await railCard(page, "loose-one").click();
  await expect(mainheadName(page)).toHaveText("loose-one");
  const reopened = await openLaunchDialog(page);
  await expect.poll(() => selectedOptionLabel(groupSelect(reopened))).toBe("No group");
  await expect(groupNameField(reopened)).toBeHidden();
});

test("the Resume tab carries the same Group row with the same default (REQ-11, past-sessions, E17)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("groups-titled");
  await railCard(page, "alpha-one").click();
  await expect(mainheadName(page)).toHaveText("alpha-one");

  const dialog = await openLaunchDialog(page);
  await resumeTab(dialog).click();
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(groupSelect(dialog)).toBeVisible();
  await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Alpha");
  const labels = await optionLabels(groupSelect(dialog));
  expect(labels[0]).toBe("No group");
  expect(labels[labels.length - 1]).toBe("New group…");

  await newTab(dialog).click();
  await expect(groupSelect(dialog)).toBeVisible();
  await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Alpha");
});

for (const tab of ["New", "Resume"] as const) {
  test(`the ${tab} tab's Group select keeps focus, the same node and its choice across a render tick after typeahead (REQ-11)`, async ({
    page,
    dashboard,
  }) => {
    await dashboard.open("groups-titled");
    await railCard(page, "alpha-one").click();
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Alpha");
    const dialog = await openLaunchDialog(page);
    if (tab === "Resume") await resumeTab(dialog).click();
    await expect(groupSelect(dialog)).toBeVisible();
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Alpha");

    // One typeahead key picks the option starting with it ("Bravo"; the default was "Alpha"). A
    // control rebuilt by the render tick loses focus and its choice together
    // (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
    await expectFocusAndNodeSurviveTick(page, groupSelect(dialog), "KeyB", async () => {
      await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Bravo");
    });
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Bravo");
  });
}

test("the New group… name field keeps focus, its node and what was typed across a render tick (REQ-11)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("groups-titled");
  expect(fixture.snapshot.groups.length).toBeGreaterThan(0);
  const dialog = await openLaunchDialog(page);
  await groupSelect(dialog).selectOption({ label: "New group…" });
  await expect(groupNameField(dialog)).toBeVisible();

  await expectFocusAndNodeSurviveTick(page, groupNameField(dialog), "KeyQ", async () => {
    await expect(groupNameField(dialog)).toHaveValue("q");
  });
  await expect(groupNameField(dialog)).toHaveValue("q");
  await expect(groupSelect(dialog)).toBeVisible();
  expect(await selectedOptionLabel(groupSelect(dialog))).toBe("New group…");
});
