import { expect, type Page, settleFor, test } from "./helpers/fixtures";
import {
  barButton,
  bulkRemoveDialog,
  bulkStopDialog,
  cardCheckbox,
  createGroupViaApi,
  driveToState,
  endSessionViaApi,
  expectFocusAndNodeSurviveTick,
  getGroupsState,
  groupBody,
  groupHead,
  groupName,
  headerCheckbox,
  launchTitled,
  menuItem,
  newGroupModal,
  openGroupMenu,
  openMenu,
  removeSessionViaApi,
  sectionCardIds,
  selectBar,
  selectBarCount,
  selectToggle,
  summaryState,
  trackMutations,
  UNGROUPED,
} from "./helpers/groups";
import { pinButton, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";
import { resolvedCssVar } from "./helpers/theme";

// Plan groups — select mode and the bulk actions: the checkboxes, the bar, Move to, bulk Stop and
// Remove (#27), leaving the mode, the partial-batch report. Plan acceptance E12-E16, with REQ-12
// to REQ-14, REQ-22, REQ-24, REQ-27 and invariant I3.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture.
// Bulk Remove must leave "No sessions yet", a daemon-global state, and the others read counts,
// selections and every session's liveness; a neighbour's session on a shared daemon would corrupt
// them.
//
// Every bulk action is asserted as ONE batch request (REQ-22): the dashboard never loops the
// single-session endpoints.

/** `#action-error`, the global failure alert (render/actionerror.ts); hidden while empty. */
const actionError = (page: Page) => page.locator("#action-error");

test("in attention sort Select shows a checkbox per card and per header and the bar's buttons follow the selection (REQ-12, E12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e12a-g1", "e12a-g2", "e12a-u1"]);
  try {
    const [g1, g2] = sessions;
    if (!g1 || !g2) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Pick me", [g1.id, g2.id]);
    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect(selectBar(page)).toBeHidden();
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");

    await selectToggle(page).click();
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(selectBar(page)).toBeVisible();
    await expect(selectBarCount(page)).toHaveText("Select sessions");
    for (const title of ["e12a-g1", "e12a-g2", "e12a-u1"]) {
      await expect(cardCheckbox(page, title)).toBeVisible();
      await expect(cardCheckbox(page, title)).not.toBeChecked();
      // The pin control hides while selecting.
      await expect(pinButton(railCard(page, title))).toBeHidden();
    }
    await expect(headerCheckbox(page, "Pick me")).toBeVisible();
    await expect(headerCheckbox(page, "Ungrouped")).toBeVisible();

    // At zero selected the actions that need a selection are disabled; All and Done are not.
    for (const name of ["Move to", "Ungroup", "Stop…", "Remove…"] as const) {
      await expect(barButton(page, name)).toBeDisabled();
    }
    await expect(barButton(page, "All")).toBeEnabled();
    await expect(barButton(page, "Done")).toBeEnabled();

    // A grouped, live card: everything is enabled.
    await cardCheckbox(page, "e12a-g1").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");
    for (const name of ["Move to", "Ungroup", "Stop…", "Remove…"] as const) {
      await expect(barButton(page, name)).toBeEnabled();
    }
    // Only an ungrouped card: Ungroup has nothing to do.
    await cardCheckbox(page, "e12a-g1").uncheck();
    await cardCheckbox(page, "e12a-u1").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");
    await expect(barButton(page, "Ungroup")).toBeDisabled();
    await expect(barButton(page, "Move to")).toBeEnabled();
  } finally {
    await cleanup();
  }
});

test("in manual sort a card in select mode has draggable false and the pin control hidden, and a drag moves nothing (REQ-12, REQ-24, E12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e12m-a1", "e12m-b1", "e12m-u1"]);
  try {
    const [a1, b1] = sessions;
    if (!a1 || !b1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Source", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Sink", [b1.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");
    await expect(railCard(page, "e12m-u1")).toHaveAttribute("draggable", "true");
    await expect(pinButton(railCard(page, "e12m-u1"))).toBeVisible();

    await selectToggle(page).click();
    await cardCheckbox(page, "e12m-u1").check();
    await expect(railCard(page, "e12m-u1")).toHaveAttribute("draggable", "false");
    await expect(railCard(page, "e12m-a1")).toHaveAttribute("draggable", "false");
    await expect(pinButton(railCard(page, "e12m-u1"))).toBeHidden();

    const before = await railOrderIds(page);
    const net = trackMutations(page);
    await railCard(page, "e12m-u1").dragTo(groupHead(page, groupB.id));
    await railCard(page, "e12m-a1").dragTo(railCard(page, "e12m-b1"));
    await settleFor(page, 800);
    expect(net.requests()).toEqual([]);
    expect(await railOrderIds(page)).toEqual(before);
    expect(
      (await getGroupsState(page, daemon)).sessions.find((s) => s.title === "e12m-u1")?.groupId,
    ).toBeNull();

    await barButton(page, "Done").click();
    await expect(railCard(page, "e12m-u1")).toHaveAttribute("draggable", "true");
    await expect(pinButton(railCard(page, "e12m-u1"))).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a selected card carries the selected class and its ground is the --bg-hover token (REQ-12, UI Specifications Select mode)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["css-sel-a", "css-sel-b"]);
  try {
    await createGroupViaApi(page, daemon, "Look", [sessions[0]?.id ?? -1]);
    await selectToggle(page).click();
    await cardCheckbox(page, "css-sel-b").check();
    const selected = railCard(page, "css-sel-b");
    await expect(selected).toHaveClass(/selected/);
    await expect(selected).toHaveCSS(
      "background-color",
      await resolvedCssVar(page, "--bg-hover", "background-color"),
    );
    await expect(railCard(page, "css-sel-a")).not.toHaveClass(/selected/);
  } finally {
    await cleanup();
  }
});

test("in select mode a card click toggles instead of focusing, the mainhead keeps its session, and a header checkbox selects all its members (REQ-12, E13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e13-a1",
    "e13-a2",
    "e13-b1",
    "e13-u1",
  ]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "Pair", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "Single", [b1.id]);
    await railCard(page, "e13-u1").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e13-u1");

    await selectToggle(page).click();
    await railCard(page, "e13-a1").click();
    await expect(cardCheckbox(page, "e13-a1")).toBeChecked();
    await expect(selectBarCount(page)).toHaveText("1 selected");
    await railCard(page, "e13-b1").click();
    await expect(cardCheckbox(page, "e13-b1")).toBeChecked();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    // Neither click focused a session: the mainhead still names the previous one.
    await expect(page.locator("#mainhead .name")).toHaveText("e13-u1");
    await expect(railCard(page, "e13-u1")).toHaveAttribute("aria-current", "true");

    // A second click toggles it back off.
    await railCard(page, "e13-b1").click();
    await expect(cardCheckbox(page, "e13-b1")).not.toBeChecked();
    await expect(selectBarCount(page)).toHaveText("1 selected");

    // A header checkbox selects every member of its group.
    await headerCheckbox(page, "Pair").check();
    await expect(cardCheckbox(page, "e13-a1")).toBeChecked();
    await expect(cardCheckbox(page, "e13-a2")).toBeChecked();
    await expect(cardCheckbox(page, "e13-u1")).not.toBeChecked();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await headerCheckbox(page, "Pair").uncheck();
    await expect(selectBarCount(page)).toHaveText("Select sessions");
    await expect(page.locator("#mainhead .name")).toHaveText("e13-u1");
  } finally {
    await cleanup();
  }
});

test("⋯ → Select all (n) on a header turns on select mode with that group's members selected (REQ-12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e13s-a1", "e13s-a2", "e13s-u1"]);
  try {
    const [a1, a2] = sessions;
    if (!a1 || !a2) throw new Error("expected 3 sessions");
    const group = await createGroupViaApi(page, daemon, "Whole", [a1.id, a2.id]);

    await openGroupMenu(page, groupHead(page, group.id));
    await menuItem(page, "Select all (2)").click();

    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "e13s-a1")).toBeChecked();
    await expect(cardCheckbox(page, "e13s-a2")).toBeChecked();
    await expect(cardCheckbox(page, "e13s-u1")).not.toBeChecked();
  } finally {
    await cleanup();
  }
});

test("Move to lists the groups, New group… and Ungrouped, and choosing a group moves the selection to the end of it (REQ-13, E14)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e14m-a1",
    "e14m-b1",
    "e14m-u1",
    "e14m-u2",
  ]);
  try {
    const [a1, b1, u1, u2] = sessions;
    if (!a1 || !b1 || !u1 || !u2) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "Alpha", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Bravo", [b1.id]);

    await selectToggle(page).click();
    await cardCheckbox(page, "e14m-u1").check();
    await cardCheckbox(page, "e14m-u2").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await barButton(page, "Move to").click();
    await expect(openMenu(page)).toBeVisible();
    for (const name of ["Alpha", "Bravo", "New group…", "Ungrouped"]) {
      await expect(menuItem(page, name)).toBeVisible();
    }
    const net = trackMutations(page);
    await menuItem(page, "Bravo").click();

    await expect.poll(async () => (await sectionCardIds(page, groupB.id)).length).toBe(3);
    expect((await sectionCardIds(page, groupB.id)).slice(0, 1)).toEqual([b1.id]);
    expect((await sectionCardIds(page, groupB.id)).slice(1).sort()).toEqual([u1.id, u2.id].sort());
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.filter((s) => s.groupId === groupB.id)).toHaveLength(3);
    expect(net.requests()).toEqual(["PUT /api/sessions/group"]);
  } finally {
    await cleanup();
  }
});

test("Move to → New group… asks for a name in a small modal and creates the group with the selection in it (REQ-1, REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e14n-one",
    "e14n-two",
    "e14n-three",
  ]);
  try {
    const [one, two] = sessions;
    if (!one || !two) throw new Error("expected 3 sessions");
    await selectToggle(page).click();
    await cardCheckbox(page, "e14n-one").check();
    await cardCheckbox(page, "e14n-two").check();

    await barButton(page, "Move to").click();
    await menuItem(page, "New group…").click();
    const modal = newGroupModal(page, 2);
    await expect(modal).toBeVisible();
    // Cancel creates nothing.
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(modal).toBeHidden();
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);

    await barButton(page, "Move to").click();
    await menuItem(page, "New group…").click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("textbox", { name: "Group name" })).toBeFocused();
    await page.keyboard.type("Fresh");
    await modal.getByRole("button", { name: "Create", exact: true }).click();
    await expect(modal).toBeHidden();

    const state = await getGroupsState(page, daemon);
    const created = state.groups[0];
    expect(state.groups.map((g) => g.name)).toEqual(["Fresh"]);
    await expect(groupName(groupHead(page, created?.id ?? -1))).toHaveText("Fresh");
    await expect
      .poll(async () => (await sectionCardIds(page, created?.id ?? -1)).slice().sort())
      .toEqual([one.id, two.id].sort());
    expect(await sectionCardIds(page, UNGROUPED)).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

test("the Ungroup button and Move to → Ungrouped take the selection out of its groups (REQ-12, REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e14u-a1", "e14u-a2", "e14u-b1"]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Left", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Right", [b1.id]);

    await selectToggle(page).click();
    await cardCheckbox(page, "e14u-a1").check();
    await barButton(page, "Ungroup").click();
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([a1.id]);

    await cardCheckbox(page, "e14u-a1").uncheck();
    await cardCheckbox(page, "e14u-b1").check();
    await barButton(page, "Move to").click();
    await menuItem(page, "Ungrouped").click();
    await expect
      .poll(async () => (await sectionCardIds(page, UNGROUPED)).slice().sort())
      .toEqual([a1.id, b1.id].sort());
    await expect(groupBody(page, groupB.id).locator(".empty")).toHaveText(
      "empty — drop sessions here",
    );
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === a2.id)?.groupId).not.toBeNull();
  } finally {
    await cleanup();
  }
});

test("Stop… states the count, Stop N ends exactly the selection in one batch and leaves every other session alive (REQ-13, REQ-22, I3, E14)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e14s-a1", "e14s-b1", "e14s-u1"]);
  try {
    const [a1, b1, u1] = sessions;
    if (!a1 || !b1 || !u1) throw new Error("expected 3 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Stop A", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Stop B", [b1.id]);

    await selectToggle(page).click();
    await cardCheckbox(page, "e14s-a1").check();
    await cardCheckbox(page, "e14s-b1").check();
    const net = trackMutations(page);
    await barButton(page, "Stop…").click();
    const dialog = bulkStopDialog(page, 2);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Each is stopped the way Stop does: it stays in the rail as ended and can be resumed.",
    );
    // A selection's Stop does not say "The group stays." — that is the header's Stop all….
    await expect(dialog).not.toContainText("The group stays.");
    await dialog.getByRole("button", { name: "Stop 2", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(railCard(page, "e14s-a1")).toHaveClass(/ended/);
    await expect(railCard(page, "e14s-b1")).toHaveClass(/ended/);
    // Both stay in their groups, counted under ended.
    expect(await sectionCardIds(page, groupA.id)).toEqual([a1.id]);
    expect(await sectionCardIds(page, groupB.id)).toEqual([b1.id]);
    await expect(summaryState(groupHead(page, groupA.id), "ended")).toHaveText("1");
    await expect(summaryState(groupHead(page, groupB.id), "ended")).toHaveText("1");
    expect(net.requests().filter((r) => r.endsWith("/end"))).toEqual(["POST /api/sessions/end"]);
    await expect(actionError(page)).toBeHidden();

    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === a1.id)?.alive).toBe(false);
    expect(state.sessions.find((s) => s.id === b1.id)?.alive).toBe(false);
    const bystander = state.sessions.find((s) => s.id === u1.id);
    expect(bystander?.alive).toBe(true);
    expect(await daemon.tmuxPaneExists(u1.tmuxTarget)).toBe(true);
    expect(await daemon.tmuxPaneExists(a1.tmuxTarget)).toBe(false);
  } finally {
    await cleanup();
  }
});

test("Remove… states how many are live and will be stopped first, Remove N removes the selection in one batch and leaves every other session alone (REQ-13, REQ-22, I3, E14)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e14r-a1",
    "e14r-a2",
    "e14r-b1",
    "e14r-u1",
  ]);
  try {
    const [a1, a2, b1, u1] = sessions;
    if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Rem A", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Rem B", [b1.id]);
    await endSessionViaApi(page, daemon, a2.id);
    await expect(railCard(page, "e14r-a2")).toHaveClass(/ended/);

    await selectToggle(page).click();
    for (const title of ["e14r-a1", "e14r-a2", "e14r-b1"]) await cardCheckbox(page, title).check();
    await expect(selectBarCount(page)).toHaveText("3 selected");
    const net = trackMutations(page);
    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 3);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "2 of them are alive and will be stopped first. A removed session cannot be resumed.",
    );
    await dialog.getByRole("button", { name: "Remove 3", exact: true }).click();
    await expect(dialog).toBeHidden();

    for (const title of ["e14r-a1", "e14r-a2", "e14r-b1"]) {
      await expect(railCard(page, title)).toHaveCount(0);
    }
    await expect(railCard(page, "e14r-u1")).toBeVisible();
    expect(net.requests().filter((r) => r.includes("/api/sessions"))).toEqual([
      "POST /api/sessions/remove",
    ]);
    await expect(actionError(page)).toBeHidden();

    const state = await getGroupsState(page, daemon);
    expect(state.sessions.map((s) => s.id)).toEqual([u1.id]);
    expect(state.sessions[0]?.alive).toBe(true);
    // The groups stay, empty (edge case 9).
    expect(state.groups.map((g) => g.id).sort()).toEqual([groupA.id, groupB.id].sort());
    await expect.poll(() => daemon.tmuxPaneExists(a1.tmuxTarget)).toBe(false);
    await expect.poll(() => daemon.tmuxPaneExists(b1.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(u1.tmuxTarget)).toBe(true);
  } finally {
    await cleanup();
  }
});

test("Remove… over ended sessions only says a removed session cannot be resumed, with no live count (REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e14e-one", "e14e-two"]);
  try {
    for (const s of sessions) await endSessionViaApi(page, daemon, s.id);
    await expect(railCard(page, "e14e-one")).toHaveClass(/ended/);
    await expect(railCard(page, "e14e-two")).toHaveClass(/ended/);

    await selectToggle(page).click();
    await barButton(page, "All").click();
    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 2);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("A removed session cannot be resumed.");
    await expect(dialog).not.toContainText("of them are alive");
    await expect(dialog).not.toContainText("stopped first");
    await dialog.getByRole("button", { name: "Remove 2", exact: true }).click();
    await expect(
      page.locator("#sessions").getByText("No sessions yet", { exact: true }),
    ).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a selection of one reads in the singular: Stop 1 session? with Stop 1, and Remove 1 session? with Remove 1 (REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e14o-one", "e14o-two"]);
  try {
    await selectToggle(page).click();
    await cardCheckbox(page, "e14o-one").check();

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
  } finally {
    await cleanup();
  }
});

test("Cancel and Escape in a bulk dialog close it without a request, leaving the selection and select mode as they were (REQ-12, REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["e14c-one", "e14c-two"]);
  try {
    await selectToggle(page).click();
    await barButton(page, "All").click();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    const net = trackMutations(page);

    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 2);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();

    await barButton(page, "Stop…").click();
    const stop = bulkStopDialog(page, 2);
    await expect(stop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(stop).toBeHidden();

    await settleFor(page, 500);
    expect(net.requests()).toEqual([]);
    // Escape closed the dialog, not select mode (Escape leaves the mode only with no dialog open).
    await expect(selectBar(page)).toBeVisible();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(railCard(page, "e14c-one")).not.toHaveClass(/ended/);
  } finally {
    await cleanup();
  }
});

test("Select → All → Remove… with groups present removes every session, leaves the rail reading No sessions yet, the mainhead hidden and select mode off (REQ-14, #27, E15)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e15-a1",
    "e15-a2",
    "e15-b1",
    "e15-u1",
    "e15-u2",
  ]);
  try {
    const [a1, a2, b1, u1, u2] = sessions;
    if (!a1 || !a2 || !b1 || !u1 || !u2) throw new Error("expected 5 sessions");
    await createGroupViaApi(page, daemon, "Wipe A", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "Wipe B", [b1.id]);
    await driveToState(request, daemon, a1, "claude-e15-a1", "working");
    await driveToState(request, daemon, a2, "claude-e15-a2", "needs_input");
    await driveToState(request, daemon, b1, "claude-e15-b1", "idle");
    await endSessionViaApi(page, daemon, u2.id);
    await expect(railCard(page, "e15-u2")).toHaveClass(/ended/);
    await railCard(page, "e15-u1").click();
    await expect(page.locator("#mainhead")).toBeVisible();

    await selectToggle(page).click();
    await barButton(page, "All").click();
    await expect(selectBarCount(page)).toHaveText("5 selected");
    const net = trackMutations(page);
    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 5);
    await expect(dialog).toBeVisible();
    // Four are live: a1, a2, b1, u1. u2 was stopped.
    await expect(dialog).toContainText(
      "4 of them are alive and will be stopped first. A removed session cannot be resumed.",
    );
    await dialog.getByRole("button", { name: "Remove 5", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(
      page.locator("#sessions").getByText("No sessions yet", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("session-card")).toHaveCount(0);
    await expect(page.locator("#mainhead")).toBeHidden();
    await expect(page.locator("#main-empty")).toBeVisible();
    await expect(selectBar(page)).toBeHidden();
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sessions").getByRole("checkbox")).toHaveCount(0);
    expect(net.requests().filter((r) => r.includes("/api/sessions"))).toEqual([
      "POST /api/sessions/remove",
    ]);

    expect((await getGroupsState(page, daemon)).sessions).toEqual([]);
    for (const s of [a1, a2, b1, u1]) {
      await expect.poll(() => daemon.tmuxPaneExists(s.tmuxTarget)).toBe(false);
    }
  } finally {
    await cleanup();
  }
});

test("Select → All → Remove… with no groups removes every session too (REQ-14, #27, E15)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e15n-one",
    "e15n-two",
    "e15n-three",
  ]);
  try {
    await expect.poll(() => railOrderIds(page)).toEqual(sessions.map((s) => s.id));
    await selectToggle(page).click();
    await barButton(page, "All").click();
    await expect(selectBarCount(page)).toHaveText("3 selected");
    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 3);
    await expect(dialog).toContainText(
      "3 of them are alive and will be stopped first. A removed session cannot be resumed.",
    );
    await dialog.getByRole("button", { name: "Remove 3", exact: true }).click();

    await expect(
      page.locator("#sessions").getByText("No sessions yet", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#mainhead")).toBeHidden();
    await expect(selectBar(page)).toBeHidden();
    expect((await getGroupsState(page, daemon)).sessions).toEqual([]);
  } finally {
    await cleanup();
  }
});

for (const how of ["Escape", "Done"] as const) {
  test(`${how} leaves select mode with no checkbox and nothing selected (REQ-12, E16)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `e16-${how}-a1`,
      `e16-${how}-u1`,
    ]);
    try {
      await createGroupViaApi(page, daemon, "Leave", [sessions[0]?.id ?? -1]);
      await selectToggle(page).click();
      await cardCheckbox(page, `e16-${how}-a1`).check();
      await expect(selectBarCount(page)).toHaveText("1 selected");

      if (how === "Escape") await page.keyboard.press("Escape");
      else await barButton(page, "Done").click();

      await expect(selectBar(page)).toBeHidden();
      await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("#sessions").getByRole("checkbox")).toHaveCount(0);
      // Nothing stays selected: the next Select starts from zero.
      await selectToggle(page).click();
      await expect(selectBarCount(page)).toHaveText("Select sessions");
      await expect(cardCheckbox(page, `e16-${how}-a1`)).not.toBeChecked();
    } finally {
      await cleanup();
    }
  });
}

test("switching to Tiles leaves select mode, the Tiles strip shows no header, section or checkbox, and coming back shows no checkbox (REQ-12, I7, E16)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e16t-a1",
    "e16t-a2",
    "e16t-b1",
    "e16t-u1",
    "e16t-u2",
  ]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 5 sessions");
    await createGroupViaApi(page, daemon, "Tiles A", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "Tiles B", [b1.id]);
    await selectToggle(page).click();
    await cardCheckbox(page, "e16t-a1").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");

    // The groups above are named "Tiles A" and "Tiles B": only the exact name is the view switch.
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tiles", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Five sessions: four live tiles and one strip card.
    await expect(page.locator("#tiles-strip [data-testid='session-card']")).toHaveCount(1);
    await expect(page.locator("#tiles-strip .ghead")).toHaveCount(0);
    await expect(page.locator("#tiles-strip .gbody")).toHaveCount(0);
    await expect(page.locator("#tiles-strip").getByRole("checkbox")).toHaveCount(0);
    await expect(page.locator("#view-tiles .ghead")).toHaveCount(0);
    await expect(selectBar(page)).toBeHidden();

    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sessions").getByRole("checkbox")).toHaveCount(0);
    await expect(selectBar(page)).toBeHidden();
    await selectToggle(page).click();
    await expect(selectBarCount(page)).toHaveText("Select sessions");
  } finally {
    await cleanup();
  }
});

test("a bulk Remove where one selected session is already gone reports the partial result in the action-error line, and a complete batch shows nothing (REQ-27, edge case 8)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "r27-one",
    "r27-two",
    "r27-three",
  ]);
  try {
    const [, two, three] = sessions;
    if (!two || !three) throw new Error("expected 3 sessions");
    await selectToggle(page).click();
    await cardCheckbox(page, "r27-one").check();
    await cardCheckbox(page, "r27-two").check();
    await barButton(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 2);
    await expect(dialog).toBeVisible();
    // The dialog's count was true when it opened; a member goes away before the confirm.
    await removeSessionViaApi(page, daemon, two.id);
    await expect(railCard(page, "r27-two")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Remove 2", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(railCard(page, "r27-one")).toHaveCount(0);
    await expect(actionError(page)).toBeVisible();
    await expect(actionError(page)).not.toHaveText("");
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.map((s) => s.id)).toEqual([three.id]);

    // A complete batch afterwards shows nothing: the line clears and stays clear.
    await cardCheckbox(page, "r27-three").check();
    await barButton(page, "Remove…").click();
    await bulkRemoveDialog(page, 1).getByRole("button", { name: "Remove 1", exact: true }).click();
    await expect(railCard(page, "r27-three")).toHaveCount(0);
    await expect(actionError(page)).toBeHidden();
  } finally {
    await cleanup();
  }
});

test("a card checkbox, a header checkbox and the All button keep focus and the same node across a render tick after a real key (REQ-12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["tick12-one", "tick12-two"]);
  try {
    await createGroupViaApi(page, daemon, "Tick12", [sessions[0]?.id ?? -1]);
    await selectToggle(page).click();

    await expectFocusAndNodeSurviveTick(
      page,
      cardCheckbox(page, "tick12-two"),
      "Space",
      async () => {
        await expect(cardCheckbox(page, "tick12-two")).toBeChecked();
      },
    );
    await expectFocusAndNodeSurviveTick(page, headerCheckbox(page, "Tick12"), "Space", async () => {
      await expect(headerCheckbox(page, "Tick12")).toBeChecked();
    });
    await expectFocusAndNodeSurviveTick(page, barButton(page, "All"), "Enter", async () => {
      await expect(selectBarCount(page)).toHaveText("2 selected");
    });
  } finally {
    await cleanup();
  }
});

const unreachable = (page: Page) =>
  page.getByRole("alert").filter({ hasText: /musterd unreachable/i });

test("with the daemon down in select mode every bar button and both kinds of checkbox are disabled, a card click changes nothing, and after a restart they work again (REQ-12, REQ-21, E24)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e24s-a1", "e24s-a2", "e24s-u1"]);
  try {
    const [a1, a2] = sessions;
    if (!a1 || !a2) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Downed", [a1.id, a2.id]);
    await selectToggle(page).click();
    await cardCheckbox(page, "e24s-a1").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");
    // Connected, a grouped live selection enables all six: the disabled state below is the outage's.
    for (const name of ["Move to", "Ungroup", "Stop…", "Remove…", "All", "Done"] as const) {
      await expect(barButton(page, name)).toBeEnabled();
    }
    await expect(cardCheckbox(page, "e24s-a2")).toBeEnabled();
    await expect(headerCheckbox(page, "Downed")).toBeEnabled();
    await expect(headerCheckbox(page, "Ungrouped")).toBeEnabled();

    await daemon.kill();
    await expect(unreachable(page)).toBeVisible();

    for (const name of ["Move to", "Ungroup", "Stop…", "Remove…", "All", "Done"] as const) {
      await expect(barButton(page, name), `${name} while down`).toBeDisabled();
    }
    for (const title of ["e24s-a1", "e24s-a2", "e24s-u1"]) {
      await expect(cardCheckbox(page, title), `${title} checkbox while down`).toBeDisabled();
    }
    await expect(headerCheckbox(page, "Downed")).toBeDisabled();
    await expect(headerCheckbox(page, "Ungrouped")).toBeDisabled();

    // Every way a click could still change the selection is a no-op: the card itself, and a
    // forced click on each kind of disabled checkbox.
    await railCard(page, "e24s-u1").click();
    await railCard(page, "e24s-a1").click();
    await cardCheckbox(page, "e24s-a2").click({ force: true });
    await headerCheckbox(page, "Downed").click({ force: true });
    await headerCheckbox(page, "Ungrouped").click({ force: true });
    await settleFor(page, 1_300);
    await expect(selectBarCount(page)).toHaveText("1 selected");
    await expect(cardCheckbox(page, "e24s-a1")).toBeChecked();
    await expect(cardCheckbox(page, "e24s-a2")).not.toBeChecked();
    await expect(cardCheckbox(page, "e24s-u1")).not.toBeChecked();

    await daemon.restart();
    await expect(unreachable(page)).toBeHidden();
    for (const name of ["Move to", "Ungroup", "Stop…", "Remove…", "All", "Done"] as const) {
      await expect(barButton(page, name), `${name} after restart`).toBeEnabled();
    }
    await expect(cardCheckbox(page, "e24s-a2")).toBeEnabled();
    await expect(headerCheckbox(page, "Downed")).toBeEnabled();
    await cardCheckbox(page, "e24s-a2").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
  } finally {
    await cleanup();
  }
});

test("Escape leaves select mode while the daemon is down, clearing the bar and every checkbox (REQ-12, E16, E24)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e24e-a1", "e24e-u1"]);
  try {
    await createGroupViaApi(page, daemon, "Escaped", [sessions[0]?.id ?? -1]);
    await selectToggle(page).click();
    await cardCheckbox(page, "e24e-a1").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");

    await daemon.kill();
    await expect(unreachable(page)).toBeVisible();
    await expect(barButton(page, "Done")).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(selectBar(page)).toBeHidden();
    await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sessions").getByRole("checkbox")).toHaveCount(0);

    await daemon.restart();
    await expect(unreachable(page)).toBeHidden();
    await expect(selectToggle(page)).toBeEnabled();
    // Nothing stayed selected through the outage.
    await selectToggle(page).click();
    await expect(selectBarCount(page)).toHaveText("Select sessions");
    await expect(cardCheckbox(page, "e24e-a1")).not.toBeChecked();
  } finally {
    await cleanup();
  }
});
