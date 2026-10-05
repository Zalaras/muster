import { expect, settleFor, test } from "./helpers/fixtures";
import {
  barButton,
  createGroupViaApi,
  deleteGroupDialog,
  deleteGroupViaApi,
  driveToState,
  endSessionViaApi,
  expectFocusAndNodeSurviveTick,
  filterButton,
  filterGroup,
  getGroupsState,
  groupActionsButton,
  groupBody,
  groupCaret,
  groupHead,
  groupHeads,
  groupName,
  groupNameInput,
  headerCheckbox,
  holdResponse,
  launchTitled,
  mainheadGroupButton,
  memberIdsOracle,
  menuItem,
  moveToGroupViaApi,
  openGroupMenu,
  openMenu,
  openRailMenu,
  popover,
  putGroupsOrderViaApi,
  railActionsButton,
  railCount,
  railInvariantProblems,
  removeSessionViaApi,
  danglingGroupIds,
  sectionCardIds,
  sectionCards,
  sectionIds,
  sectionOrderOracle,
  selectToggle,
  sessionsPhrase,
  summaryCount,
  summaryState,
  summaryStates,
  trackMutations,
  UNGROUPED,
  updateGroupViaApi,
} from "./helpers/groups";
import { rawNotification } from "./helpers/payloads";
import { launchDialog } from "./helpers/picker";
import { pinViaApi, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";
import { resolvedCssVar } from "./helpers/theme";

// Plan groups — the rail's sections: creating, renaming, collapsing, deleting, ungrouping and
// stopping a group, the header summary and popover, dragging cards and headers, the filter,
// the daemon-down and two-window behaviour. Plan acceptance E1-E11, E24, E25, with REQ-1 to
// REQ-9, REQ-15 to REQ-18, REQ-20, REQ-23 to REQ-25 and invariants I1 to I3, I6, I8.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon`
// fixture. Each asserts section order, counts or the Ungrouped header's presence, which are
// daemon-global, and the restart tests restart their daemon; a neighbour's session or group on a
// shared daemon would corrupt every one of them.
//
// Groups and sessions are SET UP through the real endpoints (helpers/groups.ts) and the
// behaviour under test is driven through the UI. Sessions are real launches; Claude Code is
// faked by helpers/payloads.ts's measured builders, only to change a member's state.
//
// Titles inside one test never contain one another: `railCard` matches by substring.

test("with no groups the rail is today's plus Select and ⋯, and Rail actions → New group… names the first group and brings the Ungrouped header and the filter (REQ-1, REQ-15, I6, E1)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e1-one", "e1-two"]);
  try {
    await expect.poll(() => railOrderIds(page)).toEqual(sessions.map((s) => s.id));
    await expect(groupHeads(page)).toHaveCount(0);
    await expect(filterGroup(page)).toHaveCount(0);
    await expect(selectToggle(page)).toBeVisible();
    await expect(railActionsButton(page)).toBeVisible();
    await expect(railCount(page)).toHaveText("2");

    await openRailMenu(page);
    await expect(railActionsButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(menuItem(page, "Collapse all groups")).toBeDisabled();
    await expect(menuItem(page, "Expand all groups")).toBeDisabled();
    await menuItem(page, "New group…").click();

    const field = groupNameInput(page.locator("#sessions"));
    await expect(field).toBeFocused();
    // The pending section sits above the loose cards.
    const fieldBox = await field.boundingBox();
    const firstCardBox = await railCard(page, "e1-one").boundingBox();
    expect(fieldBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      firstCardBox?.y ?? Number.NEGATIVE_INFINITY,
    );
    // Nothing exists on the daemon until a name is committed (kb:adr/rail-new-group-is-named-before-it-exists).
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);

    await page.keyboard.type("PR reviews");
    await page.keyboard.press("Enter");

    await expect(groupHeads(page)).toHaveCount(2);
    await expect(filterGroup(page)).toBeVisible();
    await expect(field).toHaveCount(0);
    const state = await getGroupsState(page, daemon);
    expect(state.groups.map((g) => g.name)).toEqual(["PR reviews"]);
    await expect.poll(() => sectionIds(page)).toEqual(sectionOrderOracle(state));
    await expect(groupName(groupHead(page, state.groups[0]?.id ?? -1))).toHaveText("PR reviews");
    await expect(groupName(groupHead(page, UNGROUPED))).toHaveText("Ungrouped");
    await expect(railCount(page)).toHaveText("2");
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual(sessions.map((s) => s.id));
  } finally {
    await cleanup();
  }
});

test("Escape in the new-group textbox discards the pending section and creates nothing (REQ-1, E2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e2-esc-one"]);
  try {
    await expect(railCard(page, "e2-esc-one")).toBeVisible();
    await openRailMenu(page);
    await menuItem(page, "New group…").click();
    const field = groupNameInput(page.locator("#sessions"));
    await expect(field).toBeFocused();
    await page.keyboard.type("Never kept");
    await page.keyboard.press("Escape");

    await expect(field).toHaveCount(0);
    await expect(groupHeads(page)).toHaveCount(0);
    await expect(filterGroup(page)).toHaveCount(0);
    await settleFor(page, 600);
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);
  } finally {
    await cleanup();
  }
});

for (const typed of ["", "   "]) {
  test(`Enter on ${typed === "" ? "an empty" : "a whitespace-only"} name discards the pending section and creates nothing (REQ-1, E2)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { cleanup } = await launchTitled(page, daemon, ["e2-blank-one"]);
    try {
      await expect(railCard(page, "e2-blank-one")).toBeVisible();
      await openRailMenu(page);
      await menuItem(page, "New group…").click();
      const field = groupNameInput(page.locator("#sessions"));
      await expect(field).toBeFocused();
      if (typed !== "") await page.keyboard.type(typed);
      await page.keyboard.press("Enter");

      await expect(field).toHaveCount(0);
      await expect(groupHeads(page)).toHaveCount(0);
      await expect(filterGroup(page)).toHaveCount(0);
      await settleFor(page, 600);
      expect((await getGroupsState(page, daemon)).groups).toEqual([]);
    } finally {
      await cleanup();
    }
  });
}

test("tabbing out of the new-group textbox discards the pending section and creates nothing (REQ-1, UI Specifications New group)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e2-blur-one"]);
  try {
    await expect(railCard(page, "e2-blur-one")).toBeVisible();
    await openRailMenu(page);
    await menuItem(page, "New group…").click();
    const field = groupNameInput(page.locator("#sessions"));
    await expect(field).toBeFocused();
    await page.keyboard.type("Typed then abandoned");
    await page.keyboard.press("Tab");

    await expect(field).toHaveCount(0);
    await expect(groupHeads(page)).toHaveCount(0);
    await settleFor(page, 600);
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("double-clicking a group's name edits it in place and the new name shows in the header, the popover, the launch dialog and the Focus header (REQ-2, E3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e3-one", "e3-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Alpha", [one.id, two.id]);
    const head = groupHead(page, group.id);
    await railCard(page, "e3-one").click();
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Alpha");

    await groupName(head).dblclick();
    const field = groupNameInput(head);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Alpha");
    // Prefilled, selected and focused: typing replaces the old name.
    expect(
      await field.evaluate(
        (el) =>
          (el as HTMLInputElement).selectionStart === 0 &&
          (el as HTMLInputElement).selectionEnd === 5,
      ),
    ).toBe(true);
    await page.keyboard.type("Beta");
    await page.keyboard.press("Enter");

    await expect(field).toHaveCount(0);
    await expect(groupName(head)).toHaveText("Beta");
    await expect(groupCaret(head)).toHaveAccessibleName("Collapse Beta");
    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name))
      .toEqual(["Beta"]);
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Beta");

    // The popover names the new name.
    await page.mouse.move(0, 0);
    await head.hover();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page)).toContainText("Beta");
    await expect(popover(page)).toContainText("2 sessions");
    await page.mouse.move(0, 0);
    await expect(popover(page)).toHaveCount(0);

    // The launch dialog's Group options.
    await page.keyboard.press("Alt+Meta+KeyN");
    const dialog = launchDialog(page);
    await expect(dialog).toBeVisible();
    const options = await dialog
      .getByRole("combobox", { name: "Group", exact: true })
      .locator("option")
      .allTextContents();
    expect(options.map((o) => o.trim())).toContain("Beta");
    expect(options.map((o) => o.trim())).not.toContain("Alpha");
  } finally {
    await cleanup();
  }
});

test("Escape while editing a name, and a whitespace-only name on Enter, each restore the old name and send nothing (REQ-2, E3, edge case 12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e3r-one", "e3r-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Alpha", [one.id, two.id]);
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
    expect((await getGroupsState(page, daemon)).groups.map((g) => g.name)).toEqual(["Alpha"]);
  } finally {
    await cleanup();
  }
});

test("⋯ → Rename opens the same in-place editor, and leaving the field commits a non-empty name (REQ-2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e3m-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Alpha", [sessions[0]?.id ?? -1]);
    const head = groupHead(page, group.id);
    await expect(groupName(head)).toHaveText("Alpha");

    await openGroupMenu(page, head);
    await menuItem(page, "Rename").click();
    await expect(groupNameInput(head)).toBeFocused();
    await expect(groupNameInput(head)).toHaveValue("Alpha");
    await page.keyboard.type("  Delta  ");
    await page.keyboard.press("Tab");

    await expect(groupNameInput(head)).toHaveCount(0);
    await expect(groupName(head)).toHaveText("Delta");
    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name))
      .toEqual(["Delta"]);
  } finally {
    await cleanup();
  }
});

test("a header's name is uppercased by CSS while its text stays the raw name, and the header is sticky (REQ-2, UI Specifications Sections)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["css-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Mixed Case", [sessions[0]?.id ?? -1]);
    const head = groupHead(page, group.id);
    await expect(groupName(head)).toHaveText("Mixed Case");
    await expect(groupName(head)).toHaveCSS("text-transform", "uppercase");
    await expect(head).toHaveCSS("position", "sticky");
  } finally {
    await cleanup();
  }
});

test("clicking a header, its caret and ⋯ → Collapse each toggle the section, and a collapsed section shows only its header (REQ-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e4c-one", "e4c-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Fold", [one.id, two.id]);
    const head = groupHead(page, group.id);
    const collapsedOnDaemon = async () =>
      (await getGroupsState(page, daemon)).groups.find((g) => g.id === group.id)?.collapsed;

    await expect(groupCaret(head)).toHaveAccessibleName("Collapse Fold");
    await expect(groupCaret(head)).toHaveAttribute("aria-expanded", "true");

    // The header itself.
    await summaryCount(head).click();
    await expect(groupCaret(head)).toHaveAccessibleName("Expand Fold");
    await expect(groupCaret(head)).toHaveAttribute("aria-expanded", "false");
    await expect(head).toHaveClass(/collapsed/);
    await expect(groupBody(page, group.id)).toBeHidden();
    await expect(railCard(page, "e4c-one")).toBeHidden();
    await expect(railCard(page, "e4c-two")).toBeHidden();
    await expect(head).toBeVisible();
    await expect.poll(collapsedOnDaemon).toBe(true);

    // The caret.
    await groupCaret(head).click();
    await expect(groupCaret(head)).toHaveAccessibleName("Collapse Fold");
    await expect(groupBody(page, group.id)).toBeVisible();
    await expect(railCard(page, "e4c-one")).toBeVisible();
    await expect.poll(collapsedOnDaemon).toBe(false);

    // ⋯ → Collapse, then ⋯ → Expand.
    await openGroupMenu(page, head);
    await menuItem(page, "Collapse").click();
    await expect(head).toHaveClass(/collapsed/);
    await expect(groupBody(page, group.id)).toBeHidden();
    await openGroupMenu(page, head);
    await expect(menuItem(page, "Collapse")).toHaveCount(0);
    await menuItem(page, "Expand").click();
    await expect(head).not.toHaveClass(/collapsed/);
    await expect(groupBody(page, group.id)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("Collapse all groups and Expand all groups from the rail menu toggle every section, Ungrouped included (REQ-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e4a-one",
    "e4a-two",
    "e4a-three",
  ]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 3 sessions");
    const a = await createGroupViaApi(page, daemon, "Aaa", [one.id]);
    const b = await createGroupViaApi(page, daemon, "Bbb", [two.id]);
    await expect(groupHeads(page)).toHaveCount(3);

    await openRailMenu(page);
    await expect(menuItem(page, "Collapse all groups")).toBeEnabled();
    await menuItem(page, "Collapse all groups").click();
    for (const id of [a.id, b.id, UNGROUPED]) {
      await expect(groupHead(page, id)).toHaveClass(/collapsed/);
      await expect(groupBody(page, id)).toBeHidden();
    }
    await expect
      .poll(async () => {
        const s = await getGroupsState(page, daemon);
        return [...s.groups.map((g) => g.collapsed), s.ungrouped.collapsed];
      })
      .toEqual([true, true, true]);

    await openRailMenu(page);
    await menuItem(page, "Expand all groups").click();
    for (const id of [a.id, b.id, UNGROUPED]) {
      await expect(groupHead(page, id)).not.toHaveClass(/collapsed/);
      await expect(groupBody(page, id)).toBeVisible();
    }
  } finally {
    await cleanup();
  }
});

test("deleting the last session of a group leaves the group with a 0 count, the drop line and a menu offering Rename and Delete group… (REQ-4, REQ-20, E4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e4-member", "e4-loose"]);
  try {
    const [member, loose] = sessions;
    if (!member || !loose) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Lonely", [member.id]);
    const head = groupHead(page, group.id);
    await expect(summaryCount(head)).toHaveText("1");

    // The real single Remove, from the mainhead.
    await railCard(page, "e4-member").click();
    await page.locator("#mainhead").getByRole("button", { name: "Remove", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(railCard(page, "e4-member")).toHaveCount(0);
    await expect(head).toBeVisible();
    await expect(summaryCount(head)).toHaveText("0");
    await expect(summaryStates(head)).toHaveCount(0);
    await expect(groupBody(page, group.id).locator(".empty")).toHaveText(
      "empty — drop sessions here",
    );
    // The group stays: only the developer deletes it (edge case 9).
    expect((await getGroupsState(page, daemon)).groups.map((g) => g.id)).toEqual([group.id]);

    await openGroupMenu(page, head);
    await expect(menuItem(page, "Rename")).toBeEnabled();
    await expect(menuItem(page, "Delete group…")).toBeEnabled();
    await expect(menuItem(page, "Select all (0)")).toBeDisabled();
    await expect(menuItem(page, "Stop all…")).toBeDisabled();
  } finally {
    await cleanup();
  }
});

test("a group made empty shows the drop line, and an Ungrouped section whose sessions all moved says no ungrouped sessions (REQ-4, REQ-15)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e4e-one"]);
  try {
    const empty = await createGroupViaApi(page, daemon, "Waiting");
    await expect(groupBody(page, empty.id).locator(".empty")).toHaveText(
      "empty — drop sessions here",
    );
    await expect(summaryCount(groupHead(page, empty.id))).toHaveText("0");

    await moveToGroupViaApi(page, daemon, [sessions[0]?.id ?? -1], empty.id);
    await expect(groupBody(page, UNGROUPED).locator(".empty")).toHaveText("no ungrouped sessions");
    await expect(summaryCount(groupHead(page, UNGROUPED))).toHaveText("0");
    await expect(groupBody(page, empty.id).locator(".empty")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("Delete group… with Move them to Ungrouped (the default) keeps the members in Ungrouped in their order and states the count (REQ-5, E7)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e7u-a1", "e7u-a2", "e7u-b1"]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Doomed", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Staying", [b1.id]);
    await expect(groupHeads(page)).toHaveCount(3);

    await openGroupMenu(page, groupHead(page, groupA.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Doomed");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `The group goes away. Choose what happens to its ${sessionsPhrase(2)}.`,
    );
    await expect(dialog.getByRole("radio", { name: "Move them to Ungrouped" })).toBeChecked();
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(groupHead(page, groupA.id)).toHaveCount(0);
    const state = await getGroupsState(page, daemon);
    expect(state.groups.map((g) => g.id)).toEqual([groupB.id]);
    expect(
      state.sessions
        .filter((s) => s.groupId === null)
        .map((s) => s.id)
        .sort(),
    ).toEqual([a1.id, a2.id].sort());
    expect(danglingGroupIds(state)).toEqual([]);
    expect(await sectionCardIds(page, UNGROUPED)).toEqual(memberIdsOracle(state, null));
    expect(await sectionCardIds(page, groupB.id)).toEqual([b1.id]);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("Delete group… with Move them to another group puts the members at the end of that group (REQ-5, E7)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e7m-a1", "e7m-a2", "e7m-b1"]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Source", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Target", [b1.id]);

    await openGroupMenu(page, groupHead(page, groupA.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Source");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Move them to another group" }).check();
    await dialog.getByRole("combobox", { name: "Target group" }).selectOption({ label: "Target" });
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(groupHead(page, groupA.id)).toHaveCount(0);
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, a1.id, a2.id]);
    const state = await getGroupsState(page, daemon);
    expect(memberIdsOracle(state, groupB.id)).toEqual([b1.id, a1.id, a2.id]);
    expect(danglingGroupIds(state)).toEqual([]);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("Delete group… with Stop and remove them removes every member, stops the live ones first and leaves another group's sessions alone (REQ-5, I3, E7)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e7r-a1",
    "e7r-a2",
    "e7r-b1",
    "e7r-u1",
  ]);
  try {
    const [a1, a2, b1, u1] = sessions;
    if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Purge", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Bystanders", [b1.id]);
    await driveToState(request, daemon, a1, "claude-e7r-a1", "working");
    await driveToState(request, daemon, b1, "claude-e7r-b1", "working");
    await endSessionViaApi(page, daemon, a2.id);
    await expect(railCard(page, "e7r-a2")).toHaveClass(/ended/);
    expect(await daemon.tmuxPaneExists(a1.tmuxTarget)).toBe(true);

    const bystanderBefore = (await getGroupsState(page, daemon)).sessions.find(
      (s) => s.id === b1.id,
    );

    await openGroupMenu(page, groupHead(page, groupA.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Purge");
    await expect(dialog).toContainText(`its ${sessionsPhrase(2)}.`);
    await dialog.getByRole("radio", { name: "Stop and remove them" }).check();
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(groupHead(page, groupA.id)).toHaveCount(0);
    await expect(railCard(page, "e7r-a1")).toHaveCount(0);
    await expect(railCard(page, "e7r-a2")).toHaveCount(0);
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.map((s) => s.id).sort()).toEqual([b1.id, u1.id].sort());
    // The live member was stopped first: its tmux window is gone.
    await expect.poll(() => daemon.tmuxPaneExists(a1.tmuxTarget)).toBe(false);

    // Bystanders: the other group's live member and the ungrouped one keep group, pin, position, life.
    expect(state.groups.map((g) => g.id)).toEqual([groupB.id]);
    const bystander = state.sessions.find((s) => s.id === b1.id);
    expect(bystander?.groupId).toBe(groupB.id);
    expect(bystander?.alive).toBe(true);
    expect(bystander?.railPos).toBe(bystanderBefore?.railPos);
    expect(bystander?.pinned).toBe(bystanderBefore?.pinned);
    expect(await daemon.tmuxPaneExists(b1.tmuxTarget)).toBe(true);
    expect(await daemon.tmuxPaneExists(u1.tmuxTarget)).toBe(true);
    expect(state.sessions.find((s) => s.id === u1.id)?.groupId).toBeNull();
  } finally {
    await cleanup();
  }
});

test("deleting the last group removes the Ungrouped header and the filter, and the dialog's Target group select is absent with no other group (REQ-5, REQ-15, I6, E7)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e7l-one", "e7l-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Only", [one.id]);
    await expect(filterGroup(page)).toBeVisible();
    await expect(groupHead(page, UNGROUPED)).toBeVisible();

    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Only");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Target group" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(groupHeads(page)).toHaveCount(0);
    await expect(filterGroup(page)).toHaveCount(0);
    await expect(railCard(page, "e7l-one")).toBeVisible();
    await expect(railCard(page, "e7l-two")).toBeVisible();
    await expect(railCount(page)).toHaveText("2");
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("Delete group… on an empty group says nothing else changes and removes it (REQ-4, REQ-5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e7e-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Hollow");
    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Hollow");
    await expect(dialog).toContainText("The group is empty; nothing else changes.");
    await dialog.getByRole("button", { name: "Delete group", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(groupHeads(page)).toHaveCount(0);
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("Cancel and Escape in the Delete group dialog leave the group and its members as they were (REQ-5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e7c-one", "e7c-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Kept", [one.id, two.id]);
    const net = trackMutations(page);

    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Kept");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();

    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Delete group…").click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await settleFor(page, 500);
    expect(net.requests().filter((r) => r.startsWith("DELETE /api/groups"))).toEqual([]);
    expect(await sectionCardIds(page, group.id)).toEqual([one.id, two.id]);
  } finally {
    await cleanup();
  }
});

test("⋯ → Ungroup dissolves the group with no dialog and its sessions keep their relative order in Ungrouped (REQ-6)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e6-s1",
    "e6-s2",
    "e6-s3",
    "e6-s4",
  ]);
  try {
    const [s1, s2, s3, s4] = sessions;
    if (!s1 || !s2 || !s3 || !s4) throw new Error("expected 4 sessions");
    // Joining a group takes the end of the order, so the daemon's order is s2, s4, s1, s3 now.
    const group = await createGroupViaApi(page, daemon, "Brief", [s1.id, s3.id]);
    await expect.poll(() => sectionCardIds(page, group.id)).toEqual([s1.id, s3.id]);

    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Ungroup").click();

    await expect(groupHeads(page)).toHaveCount(0);
    await expect(filterGroup(page)).toHaveCount(0);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const state = await getGroupsState(page, daemon);
    expect(state.groups).toEqual([]);
    expect(state.sessions.every((s) => s.groupId === null)).toBe(true);
    const expected = memberIdsOracle(state, null);
    expect(expected).toEqual([s2.id, s4.id, s1.id, s3.id]);
    await expect.poll(() => railOrderIds(page)).toEqual(expected);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("⋯ → Stop all… confirms with the count, stops every member, keeps them in the group as ended and leaves another group's live sessions alone (REQ-7, I3)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e5s-a1",
    "e5s-a2",
    "e5s-a3",
    "e5s-b1",
  ]);
  try {
    const [a1, a2, a3, b1] = sessions;
    if (!a1 || !a2 || !a3 || !b1) throw new Error("expected 4 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Wind down", [a1.id, a2.id, a3.id]);
    const groupB = await createGroupViaApi(page, daemon, "Carry on", [b1.id]);
    await driveToState(request, daemon, b1, "claude-e5s-b1", "working");
    const net = trackMutations(page);

    await openGroupMenu(page, groupHead(page, groupA.id));
    await menuItem(page, "Stop all…").click();
    const dialog = page.getByRole("dialog", { name: "Stop 3 sessions?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Each is stopped the way Stop does: it stays in the rail as ended and can be resumed. The group stays.",
    );
    await dialog.getByRole("button", { name: "Stop 3", exact: true }).click();
    await expect(dialog).toBeHidden();

    for (const title of ["e5s-a1", "e5s-a2", "e5s-a3"]) {
      await expect(railCard(page, title)).toHaveClass(/ended/);
    }
    await expect(summaryState(groupHead(page, groupA.id), "ended")).toHaveText("3");
    expect(await sectionCardIds(page, groupA.id)).toEqual([a1.id, a2.id, a3.id]);
    // One batch request, never a loop of single Stops (REQ-22).
    expect(net.requests().filter((r) => r.endsWith("/end"))).toEqual(["POST /api/sessions/end"]);

    const state = await getGroupsState(page, daemon);
    for (const s of [a1, a2, a3]) {
      const now = state.sessions.find((x) => x.id === s.id);
      expect(now?.alive).toBe(false);
      expect(now?.groupId).toBe(groupA.id);
    }
    const bystander = state.sessions.find((s) => s.id === b1.id);
    expect(bystander?.alive).toBe(true);
    expect(bystander?.groupId).toBe(groupB.id);
    expect(await daemon.tmuxPaneExists(b1.tmuxTarget)).toBe(true);
    await expect(summaryState(groupHead(page, groupB.id), "working")).toHaveText("1");
  } finally {
    await cleanup();
  }
});

test("a header shows the member count and one state item per state present in attention order, an ended member counts under a neutral ended dot (REQ-16, E8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const titles = ["e8-need", "e8-fail", "e8-new", "e8-work1", "e8-work2", "e8-idle", "e8-dead"];
  const { sessions, cleanup } = await launchTitled(page, daemon, titles);
  try {
    const [need, fail, started, work1, work2, idle, dead] = sessions;
    if (!need || !fail || !started || !work1 || !work2 || !idle || !dead) {
      throw new Error("expected 7 sessions");
    }
    const group = await createGroupViaApi(
      page,
      daemon,
      "Mixed",
      sessions.map((s) => s.id),
    );
    await driveToState(request, daemon, need, "claude-e8-need", "needs_input");
    await driveToState(request, daemon, fail, "claude-e8-fail", "failed");
    await driveToState(request, daemon, work1, "claude-e8-w1", "working");
    await driveToState(request, daemon, work2, "claude-e8-w2", "working");
    await driveToState(request, daemon, idle, "claude-e8-idle", "idle");
    await endSessionViaApi(page, daemon, dead.id);

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
    await expect(endedDot).toHaveCSS(
      "background-color",
      await resolvedCssVar(page, "--line-control", "background-color"),
    );
    // Cross-check the count against the daemon.
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.filter((s) => s.groupId === group.id)).toHaveLength(7);
    expect(state.sessions.filter((s) => s.groupId === group.id && !s.alive)).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

for (const sort of ["manual", "attention"] as const) {
  test(`a state change in a collapsed ${sort}-sorted group changes its summary and moves no section, and a repeated hook counts once (REQ-16, I8, E8)`, async ({
    page,
    request,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `e8c-${sort}-a1`,
      `e8c-${sort}-a2`,
      `e8c-${sort}-b1`,
      `e8c-${sort}-u1`,
    ]);
    try {
      const [a1, a2, b1, u1] = sessions;
      if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
      const groupA = await createGroupViaApi(page, daemon, "Folded", [a1.id, a2.id]);
      await createGroupViaApi(page, daemon, "Open", [b1.id]);
      await railSortSelect(page).selectOption(sort);
      await expect(railSortSelect(page)).toHaveValue(sort);
      await groupCaret(groupHead(page, groupA.id)).click();
      await expect(groupBody(page, groupA.id)).toBeHidden();

      const orderBefore = await sectionIds(page);
      const head = groupHead(page, groupA.id);
      await expect(summaryState(head, "needs_input")).toHaveCount(0);

      await driveToState(request, daemon, a1, `claude-e8c-${sort}`, "needs_input");
      // A duplicated Notification changes the dot once (edge case 1).
      await request.post(daemon.ingestURL("hook"), {
        data: rawNotification(`claude-e8c-${sort}`, "p1", "permission_prompt"),
      });

      await expect(summaryState(head, "needs_input")).toHaveText("1");
      await expect(summaryState(head, "needs_input")).toHaveAttribute("title", "1 needs input");
      await expect(summaryCount(head)).toHaveText("2");
      expect(await sectionIds(page)).toEqual(orderBefore);
      await expect(groupBody(page, groupA.id)).toBeHidden();
      await settleFor(page, 1_300);
      expect(await sectionIds(page)).toEqual(orderBefore);
      await expect(summaryState(head, "needs_input")).toHaveText("1");
      const state = await getGroupsState(page, daemon);
      expect(await sectionIds(page)).toEqual(sectionOrderOracle(state));
      // The bystander in Ungrouped is untouched by the group's state change.
      expect(await sectionCardIds(page, UNGROUPED)).toEqual([u1.id]);
    } finally {
      await cleanup();
    }
  });
}

test("hovering a header shows a tooltip naming the group, its session count, each state present and each member's title under its state (REQ-16, E9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e9-need", "e9-work", "e9-new"]);
  try {
    const [need, work, started] = sessions;
    if (!need || !work || !started) throw new Error("expected 3 sessions");
    const group = await createGroupViaApi(
      page,
      daemon,
      "Hover me",
      sessions.map((s) => s.id),
    );
    await driveToState(request, daemon, need, "claude-e9-need", "needs_input");
    await driveToState(request, daemon, work, "claude-e9-work", "working");
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
  } finally {
    await cleanup();
  }
});

test("the popover of an empty group says empty (REQ-4, REQ-16, E9)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e9e-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Void");
    await page.mouse.move(0, 0);
    await groupHead(page, group.id).hover();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page)).toContainText("Void");
    await expect(popover(page)).toContainText("empty");
  } finally {
    await cleanup();
  }
});

test("keyboard focus reaching a header's caret shows the same popover (REQ-16, UI Specifications Popover)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e9k-one", "e9k-two"]);
  try {
    const group = await createGroupViaApi(
      page,
      daemon,
      "Keyed",
      sessions.map((s) => s.id),
    );
    const caret = groupCaret(groupHead(page, group.id));
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
    await expect(popover(page)).toContainText("Keyed");
    await page.keyboard.press("Tab");
    await expect(popover(page)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("attention sort keeps every section in its place while cards sort inside each section, with a pinned block per section (REQ-18, REQ-23, E8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "r18-a1",
    "r18-a2",
    "r18-b1",
    "r18-b2",
    "r18-u1",
  ]);
  try {
    const [a1, a2, b1, b2, u1] = sessions;
    if (!a1 || !a2 || !b1 || !b2 || !u1) throw new Error("expected 5 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Sec A", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Sec B", [b1.id, b2.id]);
    await pinViaApi(page, daemon.baseURL, b1.id, true);
    await driveToState(request, daemon, u1, "claude-r18-u1", "needs_input");
    await driveToState(request, daemon, b2, "claude-r18-b2", "needs_input");
    await driveToState(request, daemon, a2, "claude-r18-a2", "needs_input");

    const state0 = await getGroupsState(page, daemon);
    const manualSections = sectionOrderOracle(state0);
    expect(manualSections).toEqual([String(groupA.id), String(groupB.id), UNGROUPED]);
    await expect.poll(() => sectionIds(page)).toEqual(manualSections);
    expect(await sectionCardIds(page, groupA.id)).toEqual([a1.id, a2.id]);

    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    // Sections stay put; the needs-input card rises inside Sec A; Sec B keeps its pinned block first
    // even though its other card needs input.
    await expect.poll(() => sectionCardIds(page, groupA.id)).toEqual([a2.id, a1.id]);
    expect(await sectionIds(page)).toEqual(manualSections);
    expect(await sectionCardIds(page, groupB.id)).toEqual([b1.id, b2.id]);
    expect(await sectionCardIds(page, UNGROUPED)).toEqual([u1.id]);

    await railSortSelect(page).selectOption("manual");
    await expect.poll(() => sectionCardIds(page, groupA.id)).toEqual([a1.id, a2.id]);
    expect(await sectionIds(page)).toEqual(manualSections);
    const state = await getGroupsState(page, daemon);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("dropping a card on a group header moves it to the end of that section and the move survives a reload (REQ-9, REQ-23, E5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e5h-a1",
    "e5h-b1",
    "e5h-b2",
    "e5h-u1",
  ]);
  try {
    const [a1, b1, b2, u1] = sessions;
    if (!a1 || !b1 || !b2 || !u1) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "From", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "To", [b1.id, b2.id]);
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, b2.id]);

    await railCard(page, "e5h-u1").dragTo(groupHead(page, groupB.id));

    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, b2.id, u1.id]);
    await expect(summaryCount(groupHead(page, groupB.id))).toHaveText("3");
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === u1.id)?.groupId).toBe(groupB.id);
    expect(memberIdsOracle(state, groupB.id)).toEqual([b1.id, b2.id, u1.id]);
    expect(railInvariantProblems(state)).toEqual([]);

    await page.reload();
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, b2.id, u1.id]);
  } finally {
    await cleanup();
  }
});

test("dropping a card among another section's cards places it directly before the target and it takes the target's pin state (REQ-9, REQ-23, E5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e5c-a1",
    "e5c-a2",
    "e5c-b1",
    "e5c-b2",
  ]);
  try {
    const [a1, a2, b1, b2] = sessions;
    if (!a1 || !a2 || !b1 || !b2) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "Donor", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Host", [b1.id, b2.id]);
    await pinViaApi(page, daemon.baseURL, b1.id, true);
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, b2.id]);

    // Onto the pinned card: joins the pinned block, before it.
    await railCard(page, "e5c-a1").dragTo(railCard(page, "e5c-b1"));
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([a1.id, b1.id, b2.id]);
    let state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === a1.id)).toMatchObject({
      groupId: groupB.id,
      pinned: true,
    });

    // Onto the unpinned card: joins the unpinned block, before it.
    await railCard(page, "e5c-a2").dragTo(railCard(page, "e5c-b2"));
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([a1.id, b1.id, a2.id, b2.id]);
    state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === a2.id)).toMatchObject({
      groupId: groupB.id,
      pinned: false,
    });
    expect(memberIdsOracle(state, groupB.id)).toEqual([a1.id, b1.id, a2.id, b2.id]);
    expect(railInvariantProblems(state)).toEqual([]);
    await expect(page.locator("article.card.dragging")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("dropping a grouped card on the Ungrouped header leaves its group (REQ-9, E5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e5u-g1", "e5u-g2", "e5u-u1"]);
  try {
    const [g1, g2, u1] = sessions;
    if (!g1 || !g2 || !u1) throw new Error("expected 3 sessions");
    const group = await createGroupViaApi(page, daemon, "Leaving", [g1.id, g2.id]);

    await railCard(page, "e5u-g1").dragTo(groupHead(page, UNGROUPED));

    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([u1.id, g1.id]);
    await expect.poll(() => sectionCardIds(page, group.id)).toEqual([g2.id]);
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === g1.id)?.groupId).toBeNull();
    expect(danglingGroupIds(state)).toEqual([]);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("cards are not draggable in attention sort but a header still drags (REQ-25, E10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["r25-a1", "r25-b1"]);
  try {
    const [a1, b1] = sessions;
    if (!a1 || !b1) throw new Error("expected 2 sessions");
    const groupA = await createGroupViaApi(page, daemon, "First", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Second", [b1.id]);
    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect(railCard(page, "r25-a1")).toHaveAttribute("draggable", "false");
    await expect(groupHead(page, groupA.id)).toHaveAttribute("draggable", "true");
    await expect(groupHead(page, groupB.id)).toHaveAttribute("draggable", "true");
  } finally {
    await cleanup();
  }
});

for (const sort of ["manual", "attention"] as const) {
  test(`dragging a group header above another section, and the Ungrouped header above a group, reorders the sections in ${sort} sort and the order survives a reload (REQ-8, REQ-25, E10)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `e10-${sort}-a1`,
      `e10-${sort}-b1`,
      `e10-${sort}-u1`,
    ]);
    try {
      const [a1, b1] = sessions;
      if (!a1 || !b1) throw new Error("expected 3 sessions");
      const groupA = await createGroupViaApi(page, daemon, "Alpha", [a1.id]);
      const groupB = await createGroupViaApi(page, daemon, "Bravo", [b1.id]);
      await railSortSelect(page).selectOption(sort);
      await expect(railSortSelect(page)).toHaveValue(sort);
      const a = String(groupA.id);
      const b = String(groupB.id);
      await expect.poll(() => sectionIds(page)).toEqual([a, b, UNGROUPED]);

      // The upper half of the target's header: drop above it.
      await groupHead(page, groupB.id).dragTo(groupHead(page, groupA.id), {
        targetPosition: { x: 40, y: 2 },
      });
      await expect.poll(() => sectionIds(page)).toEqual([b, a, UNGROUPED]);
      let state = await getGroupsState(page, daemon);
      expect(sectionOrderOracle(state)).toEqual([b, a, UNGROUPED]);

      await groupHead(page, UNGROUPED).dragTo(groupHead(page, groupB.id), {
        targetPosition: { x: 40, y: 2 },
      });
      await expect.poll(() => sectionIds(page)).toEqual([UNGROUPED, b, a]);
      state = await getGroupsState(page, daemon);
      expect(sectionOrderOracle(state)).toEqual([UNGROUPED, b, a]);

      await page.reload();
      await expect.poll(() => sectionIds(page)).toEqual([UNGROUPED, b, a]);
    } finally {
      await cleanup();
    }
  });
}

test("dropping a header onto a card and a card onto the rail head or the filter row send no request and change no order (REQ-25, E11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e11-a1", "e11-b1", "e11-u1"]);
  try {
    const [a1, b1] = sessions;
    if (!a1 || !b1) throw new Error("expected 3 sessions");
    const groupA = await createGroupViaApi(page, daemon, "One", [a1.id]);
    await createGroupViaApi(page, daemon, "Two", [b1.id]);
    await expect(groupHeads(page)).toHaveCount(3);
    const sectionsBefore = await sectionIds(page);
    const cardsBefore = await railOrderIds(page);
    const stateBefore = await getGroupsState(page, daemon);
    const net = trackMutations(page);

    await groupHead(page, groupA.id).dragTo(railCard(page, "e11-b1"));
    await railCard(page, "e11-u1").dragTo(page.locator(".railhead"));
    await railCard(page, "e11-u1").dragTo(filterGroup(page));

    await settleFor(page, 800);
    expect(net.requests()).toEqual([]);
    expect(await sectionIds(page)).toEqual(sectionsBefore);
    expect(await railOrderIds(page)).toEqual(cardsBefore);
    const stateAfter = await getGroupsState(page, daemon);
    // The snapshot's `sessions` array has no promised order (kb:anchor/ws.snapshot): compare by id.
    const rows = (state: typeof stateAfter) =>
      state.sessions
        .map((s) => [s.id, s.groupId, s.pinned, s.railPos])
        .sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(rows(stateAfter)).toEqual(rows(stateBefore));
    expect(stateAfter.groups).toEqual(stateBefore.groups);
  } finally {
    await cleanup();
  }
});

test("a drag, a collapse and a section reorder survive a reload and then a daemon restart with the same order, membership and collapsed state (REQ-8, REQ-20, E6)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e6r-a1",
    "e6r-a2",
    "e6r-b1",
    "e6r-u1",
  ]);
  try {
    const [a1, a2, b1, u1] = sessions;
    if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Keep A", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Keep B", [b1.id]);
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id]);

    await railCard(page, "e6r-u1").dragTo(groupHead(page, groupB.id));
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, u1.id]);
    await putGroupsOrderViaApi(page, daemon, [groupB.id, 0, groupA.id]);
    await groupCaret(groupHead(page, groupA.id)).click();
    await expect(groupHead(page, groupA.id)).toHaveClass(/collapsed/);
    await expect
      .poll(
        async () =>
          (await getGroupsState(page, daemon)).groups.find((g) => g.id === groupA.id)?.collapsed,
      )
      .toBe(true);

    const snapshot = async () => ({
      sections: await sectionIds(page),
      collapsed: await page
        .locator("#sessions .ghead")
        .evaluateAll((els) => els.map((el) => el.classList.contains("collapsed"))),
      members: {
        a: await sectionCardIds(page, groupA.id),
        b: await sectionCardIds(page, groupB.id),
        u: await sectionCardIds(page, UNGROUPED),
      },
    });
    const expected = {
      sections: [String(groupB.id), UNGROUPED, String(groupA.id)],
      collapsed: [false, false, true],
      members: { a: [a1.id, a2.id], b: [b1.id, u1.id], u: [] as number[] },
    };
    await expect.poll(snapshot).toEqual(expected);

    await page.reload();
    await expect.poll(snapshot).toEqual(expected);

    await daemon.restart();
    await page.goto(daemon.dashboardUrl);
    await expect.poll(snapshot).toEqual(expected);
    const state = await getGroupsState(page, daemon);
    expect(sectionOrderOracle(state)).toEqual(expected.sections);
    expect(danglingGroupIds(state)).toEqual([]);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("the filter offers All, Groups and Ungrouped, the count reads n of m while it hides cards, and it resets to All on reload (REQ-17, E22)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "r17-g1",
    "r17-g2",
    "r17-u1",
    "r17-u2",
    "r17-u3",
  ]);
  try {
    const [g1, g2] = sessions;
    if (!g1 || !g2) throw new Error("expected 5 sessions");
    await createGroupViaApi(page, daemon, "Filtered", [g1.id, g2.id]);
    await expect(filterGroup(page)).toBeVisible();
    await expect(filterGroup(page).getByRole("button")).toHaveText(["All", "Groups", "Ungrouped"]);
    await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(railCount(page)).toHaveText("5");

    await filterButton(page, "Groups").click();
    await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "true");
    await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "false");
    await expect(railCount(page)).toHaveText("2 of 5");
    await expect(railCard(page, "r17-g1")).toBeVisible();
    await expect(railCard(page, "r17-u1")).toBeHidden();

    await filterButton(page, "Ungrouped").click();
    await expect(railCount(page)).toHaveText("3 of 5");
    await expect(railCard(page, "r17-g1")).toBeHidden();
    await expect(railCard(page, "r17-u1")).toBeVisible();

    await filterButton(page, "Groups").click();
    await expect(railCount(page)).toHaveText("2 of 5");
    await page.reload();
    await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(railCount(page)).toHaveText("5");
  } finally {
    await cleanup();
  }
});

test("with the daemon down an open menu closes and every group control is disabled, and after a restart each section renders once (REQ-21, E24)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e24-a1", "e24-b1"]);
  try {
    const [a1, b1] = sessions;
    if (!a1 || !b1) throw new Error("expected 2 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Down A", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Down B", [b1.id]);
    await railCard(page, "e24-a1").click();
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Down A");
    await expect(mainheadGroupButton(page)).toBeEnabled();
    const headA = groupHead(page, groupA.id);
    await openGroupMenu(page, headA);

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();

    await expect(openMenu(page)).toHaveCount(0);
    await expect(railActionsButton(page)).toBeDisabled();
    await expect(selectToggle(page)).toBeDisabled();
    await expect(groupCaret(headA)).toBeDisabled();
    await expect(groupActionsButton(headA)).toBeDisabled();
    await expect(groupActionsButton(groupHead(page, UNGROUPED))).toBeDisabled();
    await expect(mainheadGroupButton(page)).toBeDisabled();

    await daemon.restart();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
    await expect(railActionsButton(page)).toBeEnabled();
    await expect(mainheadGroupButton(page)).toBeEnabled();
    const state = await getGroupsState(page, daemon);
    await expect.poll(() => sectionIds(page)).toEqual(sectionOrderOracle(state));
    for (const id of [groupA.id, groupB.id, UNGROUPED]) {
      await expect(groupHead(page, id)).toHaveCount(1);
    }
    await expect(groupHeads(page)).toHaveCount(3);
    expect(await railOrderIds(page)).toEqual(
      memberIdsOracle(state, groupA.id).concat(memberIdsOracle(state, groupB.id)),
    );
  } finally {
    await cleanup();
  }
});

test("the Delete group dialog closes when the daemon goes down (REQ-5, E24)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e24d-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Doomed once", [sessions[0]?.id ?? -1]);
    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Delete group…").click();
    const dialog = deleteGroupDialog(page, "Doomed once");
    await expect(dialog).toBeVisible();

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
    await expect(dialog).toBeHidden();

    await daemon.restart();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
    await expect(groupHead(page, group.id)).toHaveCount(1);
  } finally {
    await cleanup();
  }
});

test("a group created, renamed, collapsed, given a member and deleted in one window appears so in a second window without a reload (REQ-21, edge case 7, E25)", async ({
  page,
  context,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e25-one", "e25-two"]);
  try {
    const second = await context.newPage();
    await second.goto(daemon.dashboardUrl);
    await expect(railCard(second, "e25-one")).toBeVisible();

    // Created in the first window through the rail menu.
    await openRailMenu(page);
    await menuItem(page, "New group…").click();
    await expect(groupNameInput(page.locator("#sessions"))).toBeFocused();
    await page.keyboard.type("Shared");
    await page.keyboard.press("Enter");
    const created = (await getGroupsState(page, daemon)).groups[0];
    if (!created) throw new Error("the group was not created");
    await expect(groupName(groupHead(second, created.id))).toHaveText("Shared");
    await expect(filterGroup(second)).toBeVisible();

    // A move appears on the second window's rail on the session upsert.
    await moveToGroupViaApi(page, daemon, [sessions[0]?.id ?? -1], created.id);
    await expect.poll(() => sectionCardIds(second, created.id)).toEqual([sessions[0]?.id]);

    // Renamed in the first window.
    await groupName(groupHead(page, created.id)).dblclick();
    await page.keyboard.type("Renamed");
    await page.keyboard.press("Enter");
    await expect(groupName(groupHead(second, created.id))).toHaveText("Renamed");

    // Collapsed in the first window.
    await groupCaret(groupHead(page, created.id)).click();
    await expect(groupCaret(groupHead(second, created.id))).toHaveAccessibleName("Expand Renamed");
    await expect(groupBody(second, created.id)).toBeHidden();

    // Deleted in the first window.
    await openGroupMenu(page, groupHead(page, created.id));
    await menuItem(page, "Delete group…").click();
    await deleteGroupDialog(page, "Renamed")
      .getByRole("button", { name: "Delete group", exact: true })
      .click();
    await expect(groupHeads(second)).toHaveCount(0);
    await expect(filterGroup(second)).toHaveCount(0);
    await expect(railCard(second, "e25-one")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a group deleted and another renamed through the API appear in the open dashboard on the groups broadcast (REQ-21)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["r21-one", "r21-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const a = await createGroupViaApi(page, daemon, "Wire A", [one.id]);
    const b = await createGroupViaApi(page, daemon, "Wire B", [two.id]);
    await expect.poll(() => sectionIds(page)).toEqual([String(a.id), String(b.id), UNGROUPED]);

    await updateGroupViaApi(page, daemon, b.id, { name: "Wire B2", collapsed: true });
    await expect(groupName(groupHead(page, b.id))).toHaveText("Wire B2");
    await expect(groupHead(page, b.id)).toHaveClass(/collapsed/);

    await deleteGroupViaApi(page, daemon, a.id, { sessions: "ungroup" });
    await expect(groupHead(page, a.id)).toHaveCount(0);
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([one.id]);
    await removeSessionViaApi(page, daemon, one.id);
    await expect(railCard(page, "r21-one")).toHaveCount(0);
    expect(danglingGroupIds(await getGroupsState(page, daemon))).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("the filter segment, the caret and the Select toggle keep focus and the same node across a render tick after a real key (REQ-3, REQ-12, REQ-17)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["tick-one", "tick-two"]);
  try {
    const group = await createGroupViaApi(
      page,
      daemon,
      "Tick",
      sessions.map((s) => s.id),
    );
    await expect(filterGroup(page)).toBeVisible();

    await expectFocusAndNodeSurviveTick(page, filterButton(page, "Groups"), "Enter", async () => {
      await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "true");
    });
    await expectFocusAndNodeSurviveTick(page, filterButton(page, "All"), "Space", async () => {
      await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
    });

    const caret = groupCaret(groupHead(page, group.id));
    await expectFocusAndNodeSurviveTick(page, caret, "Enter", async () => {
      await expect(caret).toHaveAttribute("aria-expanded", "false");
    });
    await expectFocusAndNodeSurviveTick(page, caret, "Space", async () => {
      await expect(caret).toHaveAttribute("aria-expanded", "true");
    });

    await expectFocusAndNodeSurviveTick(page, selectToggle(page), "Enter", async () => {
      await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
    });
    await expect(barButton(page, "Done")).toBeVisible();
    await expect(headerCheckbox(page, "Tick")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("the rail ⋯ and header ⋯ buttons open their menus from the keyboard, the opener stays the same node and the menu survives a render tick (REQ-1, REQ-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["tickm-one"]);
  try {
    const group = await createGroupViaApi(page, daemon, "Menus", [sessions[0]?.id ?? -1]);
    const head = groupHead(page, group.id);
    await expect(groupName(head)).toHaveText("Menus");

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
  } finally {
    await cleanup();
  }
});

test("a group header's ⋯ menu offers the full item list while the Ungrouped header offers no Rename, Ungroup or Delete group… (REQ-2, REQ-5, REQ-6, UI Specifications Header menu)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["hm-one", "hm-two"]);
  try {
    const [one] = sessions;
    if (!one) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Menu check", [one.id]);

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
  } finally {
    await cleanup();
  }
});

test("a rename's daemon answer closes only the field it committed: a second name field opened while the request is in flight keeps its typed text (REQ-2, edge case 12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["eg-one", "eg-two"]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 2 sessions");
    const first = await createGroupViaApi(page, daemon, "Alpha", [one.id]);
    const second = await createGroupViaApi(page, daemon, "Bravo", [two.id]);
    const firstHead = groupHead(page, first.id);
    const secondHead = groupHead(page, second.id);
    await expect(groupName(secondHead)).toHaveText("Bravo");

    // The daemon applies the first rename at once, but its HTTP answer is withheld.
    const held = await holdResponse(page, "PUT", `/api/groups/${first.id}`);
    await groupName(firstHead).dblclick();
    await expect(groupNameInput(firstHead)).toBeFocused();
    await page.keyboard.type("Alpha renamed");
    await page.keyboard.press("Enter");
    await held.answered;

    // The developer starts a second name while the first request is in flight.
    await groupName(secondHead).dblclick();
    const field = groupNameInput(secondHead);
    await expect(field).toBeFocused();
    await page.keyboard.type("typing in bravo");
    await expect(field).toHaveValue("typing in bravo");
    // Across a render tick and the first rename's own `groups` frame, with no answer yet.
    await settleFor(page, 1_300);
    await expect(field).toHaveValue("typing in bravo");

    held.release();
    // The answer's continuation is a microtask after the page receives it; a field it wrongly
    // closed is gone well inside this hold.
    await settleFor(page, 700);
    await expect(field).toHaveCount(1);
    await expect(field).toHaveValue("typing in bravo");
    await expect(field).toBeFocused();
    await expect(groupName(firstHead)).toHaveText("Alpha renamed");

    await page.keyboard.press("Enter");
    await expect(field).toHaveCount(0);
    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name).sort())
      .toEqual(["Alpha renamed", "typing in bravo"]);
  } finally {
    await cleanup();
  }
});

test("a new group's daemon answer closes only the pending field it committed: a rename started while the create is in flight keeps its typed text (REQ-1, REQ-2, W11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["ec-one", "ec-two"]);
  try {
    const [one] = sessions;
    if (!one) throw new Error("expected 2 sessions");
    const existing = await createGroupViaApi(page, daemon, "Existing", [one.id]);
    const head = groupHead(page, existing.id);
    await expect(groupName(head)).toHaveText("Existing");

    const held = await holdResponse(page, "POST", "/api/groups");
    await page.keyboard.press("Alt+Meta+KeyG");
    const pending = groupNameInput(page.locator("#sessions"));
    await expect(pending).toBeFocused();
    await page.keyboard.type("Fresh");
    await page.keyboard.press("Enter");
    await held.answered;

    await groupName(head).dblclick();
    const field = groupNameInput(head);
    await expect(field).toBeFocused();
    await page.keyboard.type("typing in existing");
    await expect(field).toHaveValue("typing in existing");
    await settleFor(page, 1_300);
    await expect(field).toHaveValue("typing in existing");

    held.release();
    await settleFor(page, 700);
    await expect(groupNameInput(page.locator("#sessions"))).toHaveCount(1);
    await expect(field).toHaveValue("typing in existing");
    await expect(field).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(groupNameInput(page.locator("#sessions"))).toHaveCount(0);
    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name).sort())
      .toEqual(["Fresh", "typing in existing"]);
  } finally {
    await cleanup();
  }
});
