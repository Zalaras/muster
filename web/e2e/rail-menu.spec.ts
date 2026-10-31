import { expect, settleFor, test } from "./helpers/fixtures";
import {
  bulkRemoveDialog,
  bulkStopDialog,
  createGroupViaApi,
  driveToState,
  getGroupsState,
  launchTitled,
  removeSessionViaApi,
  sectionCardIds,
  sectionOrderOracle,
  selectBarCount,
  selectToggle,
  cardCheckbox,
  trackMutations,
  UNGROUPED,
} from "./helpers/groups";
import {
  bindClaude,
  cardMenu,
  cardMenuItem,
  launchEndedSession,
  menuItemLabels,
  openCardMenu,
  stateSession,
  trackMutationBodies,
} from "./helpers/rail-menu";
import { pinButton, pinViaApi, railCard } from "./helpers/railorder";
import { findSession, getState, scratchDirectory, stateBadge } from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";

// Rail card organise: the right-click menu on rail and Tiles strip cards (#56), the
// journeys where choosing an entry round-trips with the daemon: the Stop, Remove, Resume,
// Move to, Pin and bulk confirms, the daemon-down state, a remove from another page, and the
// keyboard-driven Move to. The display properties
// — which items each kind of card's menu offers, that no
// card renders an action button, how the menu opens at the pointer, closes and survives a
// render tick — are render tests in web/render/rail.spec.ts (plans/_audit/relevel/rail.md).
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// they assert group membership and pin changes, and the daemon-down test kills the daemon, which
// a shared one could not survive.
//
// Right-click is the pointer path a real user has; the ContextMenu key and Shift+F10 are the
// keyboard ones. Entries are located the way every existing menu's are (role `menuitem`, exact
// name), and a menu that must stay inert is asserted disabled, never merely absent.

test("Stop… opens the Stop confirm: cancelling sends nothing and leaves the session alive, confirming ends only that session and leaves its neighbour running (REQ-4, E5, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e6-a", "menu-e6-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    await bindClaude(request, daemon, a, "claude-menu-e6-a");
    await bindClaude(request, daemon, b, "claude-menu-e6-b");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e6-a"));
    await cardMenuItem(page, "Stop…").click();
    const dialog = page.getByRole("dialog", { name: "Stop session?" });
    await expect(dialog).toBeVisible();
    await expect(cardMenu(page)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await settleFor(page, 500);
    expect(net.requests()).toEqual([]);
    expect(findSession(await getState(page, daemon), a.id).alive).toBe(true);
    await expect(railCard(page, "menu-e6-a")).not.toHaveClass(/ended/);

    await openCardMenu(page, railCard(page, "menu-e6-a"));
    await cardMenuItem(page, "Stop…").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stop session" }).click();
    await expect(dialog).toBeHidden();
    await expect(railCard(page, "menu-e6-a")).toHaveClass(/ended/);

    const state = await getState(page, daemon);
    expect(findSession(state, a.id).alive).toBe(false);
    expect(findSession(state, b.id).alive).toBe(true);
    await expect(railCard(page, "menu-e6-b")).not.toHaveClass(/ended/);
    expect(await daemon.tmuxPaneExists(b.tmuxTarget)).toBe(true);
    expect(net.requests()).toEqual([`POST /api/sessions/${a.id}/end`]);
  } finally {
    await cleanup();
  }
});

test("Remove… opens the Remove confirm: cancelling sends nothing and keeps the card, confirming removes only that session (REQ-4, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const ended = await launchEndedSession(page, request, daemon, dirA.path, "menu-e7-ended");
    const bystander = await launchEndedSession(page, request, daemon, dirB.path, "menu-e7-other");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e7-ended"));
    await cardMenuItem(page, "Remove…").click();
    const dialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await settleFor(page, 500);
    expect(net.requests()).toEqual([]);
    await expect(railCard(page, "menu-e7-ended")).toHaveCount(1);

    await openCardMenu(page, railCard(page, "menu-e7-ended"));
    await cardMenuItem(page, "Remove…").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(railCard(page, "menu-e7-ended")).toHaveCount(0);

    const ids = (await getState(page, daemon)).sessions.map((s) => s.id);
    expect(ids).toEqual([bystander.id]);
    expect(ids).not.toContain(ended.id);
    expect(net.requests()).toEqual([`DELETE /api/sessions/${ended.id}`]);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("Resume in the card menu resumes the ended session at once, with no confirm dialog, and leaves another ended session ended (REQ-4, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const target = await launchEndedSession(page, request, daemon, dirA.path, "menu-e8-target");
    const other = await launchEndedSession(page, request, daemon, dirB.path, "menu-e8-other");

    await openCardMenu(page, railCard(page, "menu-e8-target"));
    await cardMenuItem(page, "Resume").click();
    await expect(page.locator("#end-dialog")).not.toBeVisible();
    await expect(page.locator("#remove-dialog")).not.toBeVisible();

    await expect(railCard(page, "menu-e8-target")).not.toHaveClass(/ended/);
    const state = await getState(page, daemon);
    expect(findSession(state, target.id).alive).toBe(true);
    expect(findSession(state, target.id).endedAt).toBeNull();
    expect(findSession(state, other.id).alive).toBe(false);
    await expect(railCard(page, "menu-e8-other")).toHaveClass(/ended/);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("Move to a group, New group… and No group change the session's group as the Focus header's control does, leaving a bystander's group and pin untouched (REQ-5, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-e9-a",
    "menu-e9-b",
    "menu-e9-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    const review = await createGroupViaApi(page, daemon, "review", [a.id]);
    const docs = await createGroupViaApi(page, daemon, "docs", [b.id]);
    await pinViaApi(page, daemon.baseURL, c.id, true);
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e9-a"));
    await cardMenuItem(page, "docs").click();
    await expect.poll(() => sectionCardIds(page, docs.id)).toEqual([b.id, a.id]);
    expect(net.requests()).toEqual(["PUT /api/sessions/group"]);
    expect((await stateSession(page, daemon, a.id)).groupId).toBe(docs.id);
    expect(await sectionCardIds(page, review.id)).toEqual([]);

    await openCardMenu(page, railCard(page, "menu-e9-a"));
    await expect(cardMenuItem(page, "docs")).toHaveAttribute("aria-current", "true");
    await cardMenuItem(page, "No group").click();
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([c.id, a.id]);
    expect((await stateSession(page, daemon, a.id)).groupId).toBeNull();

    // New group… asks for a name in the existing dialog and the session joins the new group.
    await openCardMenu(page, railCard(page, "menu-e9-a"));
    await cardMenuItem(page, "New group…").click();
    const dialog = page.getByRole("dialog", { name: /^New group/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Group name" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await getGroupsState(page, daemon)).groups.map((g) => g.name)).toEqual([
      "review",
      "docs",
    ]);
    await openCardMenu(page, railCard(page, "menu-e9-a"));
    await cardMenuItem(page, "New group…").click();
    await expect(dialog).toBeVisible();
    await page.keyboard.type("fresh");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();

    const state = await getGroupsState(page, daemon);
    const fresh = state.groups.find((g) => g.name === "fresh");
    expect(fresh).toBeDefined();
    expect(sectionOrderOracle(state)).toContain(String(fresh?.id));
    expect(state.sessions.find((s) => s.id === a.id)?.groupId).toBe(fresh?.id);
    // The bystanders: b stays in docs, c stays ungrouped and pinned.
    expect(state.sessions.find((s) => s.id === b.id)).toMatchObject({
      groupId: docs.id,
      pinned: false,
    });
    expect(state.sessions.find((s) => s.id === c.id)).toMatchObject({
      groupId: null,
      pinned: true,
    });
  } finally {
    await cleanup();
  }
});

test("Pin and Unpin in the menu act as the card's pin control does and touch no other session (REQ-5, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e10-a", "menu-e10-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e10-a"));
    await cardMenuItem(page, "Pin").click();
    await expect(pinButton(railCard(page, "menu-e10-a"))).toHaveAttribute("aria-pressed", "true");
    await expect(pinButton(railCard(page, "menu-e10-a"))).toHaveAccessibleName("Unpin");
    expect((await stateSession(page, daemon, a.id)).pinned).toBe(true);
    expect((await stateSession(page, daemon, b.id)).pinned).toBe(false);
    expect(net.requests()).toEqual([`PUT /api/sessions/${a.id}/pin`]);

    await openCardMenu(page, railCard(page, "menu-e10-a"));
    await expect(cardMenuItem(page, "Pin")).toHaveCount(0);
    await cardMenuItem(page, "Unpin").click();
    await expect(pinButton(railCard(page, "menu-e10-a"))).toHaveAttribute("aria-pressed", "false");
    expect((await stateSession(page, daemon, a.id)).pinned).toBe(false);
    expect((await stateSession(page, daemon, b.id)).pinned).toBe(false);
  } finally {
    await cleanup();
  }
});

test("with the daemon down the card menu still opens, every item disabled and clicking one sends nothing, and after a restart the items are enabled again (REQ-10, E6)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirEnded] = await Promise.all([scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e11-live"]);
    try {
      const [live] = sessions;
      if (!live) throw new Error("expected 1 session");
      await bindClaude(request, daemon, live, "claude-menu-e11-live");
      await launchEndedSession(page, request, daemon, dirEnded.path, "menu-e11-ended");
      await createGroupViaApi(page, daemon, "review", [live.id]);

      await daemon.kill();
      await expect(
        page.getByRole("alert").filter({ hasText: /musterd unreachable/i }),
      ).toBeVisible();

      const net = trackMutations(page);
      for (const title of ["menu-e11-live", "menu-e11-ended"]) {
        await openCardMenu(page, railCard(page, title));
        const items = cardMenu(page).getByRole("menuitem");
        expect(await items.count()).toBeGreaterThanOrEqual(5);
        for (const item of await items.all()) {
          await expect(item).toBeDisabled();
        }
        await items.first().click({ force: true });
        await page.keyboard.press("Escape");
        await expect(cardMenu(page)).toHaveCount(0);
      }
      await settleFor(page, 500);
      expect(net.requests()).toEqual([]);

      await daemon.restart();
      await expect(
        page.getByRole("alert").filter({ hasText: /musterd unreachable/i }),
      ).toBeHidden();
      await openCardMenu(page, railCard(page, "menu-e11-live"));
      await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
      await expect(cardMenuItem(page, "No group")).toBeEnabled();
      await expect(cardMenuItem(page, "Pin")).toBeEnabled();
      await expect(cardMenuItem(page, "Mark as read")).toBeEnabled();
      await expect(cardMenuItem(page, "Mark as unread")).toBeEnabled();
    } finally {
      await cleanup();
    }
  } finally {
    await dirEnded.cleanup();
  }
});

test("a click outside closes the card menu without choosing anything, and choosing an item closes it (REQ-8)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e13-a", "menu-e13-b"]);
  try {
    const [a] = sessions;
    if (!a) throw new Error("expected 2 sessions");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e13-a"));
    await page.locator("#mainhead").click({ position: { x: 4, y: 4 } });
    await expect(cardMenu(page)).toHaveCount(0);
    await settleFor(page, 300);
    expect(net.requests()).toEqual([]);

    await openCardMenu(page, railCard(page, "menu-e13-a"));
    await cardMenuItem(page, "Pin").click();
    await expect(cardMenu(page)).toHaveCount(0);
    expect((await stateSession(page, daemon, a.id)).pinned).toBe(true);
  } finally {
    await cleanup();
  }
});

test("a session removed from another page while its menu is open closes the menu (REQ-11, E8)", async ({
  page,
  context,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e15-a", "menu-e15-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    const other = await context.newPage();
    await other.goto(daemon.dashboardUrl);
    await expect(railCard(other, "menu-e15-a")).toHaveCount(1);

    await openCardMenu(page, railCard(page, "menu-e15-a"));
    await removeSessionViaApi(other, daemon, a.id);

    await expect(railCard(page, "menu-e15-a")).toHaveCount(0);
    await expect(cardMenu(page)).toHaveCount(0);
    // The neighbour is still there and its own menu still opens.
    await openCardMenu(page, railCard(page, "menu-e15-b"));
    await expect(cardMenuItem(page, "Stop…")).toBeVisible();
    await other.close();
  } finally {
    await cleanup();
  }
});

test("Shift+F10 and the ContextMenu key open the focused card's menu with its first item focused, and the keys alone move it with Move to, leaving a third session's group untouched (REQ-9, E9, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-e16-a",
    "menu-e16-b",
    "menu-e16-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    const review = await createGroupViaApi(page, daemon, "review", [a.id]);
    const docs = await createGroupViaApi(page, daemon, "docs", [b.id]);
    const card = railCard(page, "menu-e16-a");

    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(cardMenu(page)).toBeVisible();
    await expect(cardMenuItem(page, "Stop…")).toBeFocused();
    // Opened at the card for the keyboard: beside the card, not at some pointer position.
    const cardBox = await card.boundingBox();
    const menuBox = await cardMenu(page).boundingBox();
    if (!cardBox || !menuBox) throw new Error("expected layout boxes");
    expect(menuBox.x).toBeGreaterThanOrEqual(cardBox.x - 8);
    expect(menuBox.x).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(menuBox.y).toBeGreaterThanOrEqual(cardBox.y - 8);
    expect(menuBox.y).toBeLessThanOrEqual(cardBox.y + cardBox.height + 40);

    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);
    await expect(card).toBeFocused();
    await page.keyboard.press("ContextMenu");
    await expect(cardMenu(page)).toBeVisible();
    await expect(cardMenuItem(page, "Stop…")).toBeFocused();

    // Stop…, Remove…, review, docs: three arrows to docs, Enter to choose.
    for (const next of ["Remove…", "review", "docs"]) {
      await page.keyboard.press("ArrowDown");
      await expect(cardMenuItem(page, next)).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(cardMenu(page)).toHaveCount(0);
    await expect.poll(() => sectionCardIds(page, docs.id)).toEqual([b.id, a.id]);
    expect(await sectionCardIds(page, review.id)).toEqual([]);

    await card.focus();
    await page.keyboard.press("Shift+F10");
    await expect(cardMenuItem(page, "Stop…")).toBeFocused();
    // Stop…, Remove…, review, docs, New group…, No group: five arrows.
    for (const next of ["Remove…", "review", "docs", "New group…", "No group"]) {
      await page.keyboard.press("ArrowDown");
      await expect(cardMenuItem(page, next)).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([c.id, a.id]);

    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === b.id)?.groupId).toBe(docs.id);
    expect(state.sessions.find((s) => s.id === c.id)?.groupId).toBeNull();
  } finally {
    await cleanup();
  }
});

test("right-clicking a selected card in Select mode applies the menu's action to the whole selection, and an unselected card keeps its own single-card menu (REQ-3, REQ-4, #97)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-e18-a",
    "menu-e18-b",
    "menu-e18-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "review", [a.id, b.id]);
    await selectToggle(page).click();
    await cardCheckbox(page, "menu-e18-a").check();
    await cardCheckbox(page, "menu-e18-b").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");

    // An unselected card: its own single-card menu, nothing selected by the click.
    await openCardMenu(page, railCard(page, "menu-e18-c"));
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for menu-e18-c");
    expect(await menuItemLabels(page)).toEqual([
      "Stop…",
      "Remove…",
      "review",
      "New group…",
      "No group",
      "Pin",
      "Mark as read",
      "Mark as unread",
    ]);
    await page.keyboard.press("Escape");
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "menu-e18-c")).not.toBeChecked();

    // A selected card: the menu is the selection's, named by its count, with no Pin or Resume;
    // Remove… is offered over two live sessions, and the mark entries sit after Move to.
    await openCardMenu(page, railCard(page, "menu-e18-a"));
    await expect.soft(cardMenu(page)).toHaveAccessibleName("Actions for 2 sessions");
    expect
      .soft(await menuItemLabels(page))
      .toEqual([
        "Stop…",
        "Remove…",
        "review",
        "New group…",
        "No group",
        "Mark as read",
        "Mark as unread",
      ]);
    await cardMenuItem(page, "No group").click();
    await expect.poll(async () => (await stateSession(page, daemon, a.id)).groupId).toBeNull();
    await expect.poll(async () => (await stateSession(page, daemon, b.id)).groupId).toBeNull();
    // Select mode and both selections stay on; the bystander is untouched.
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "menu-e18-a")).toBeChecked();
    await expect(cardCheckbox(page, "menu-e18-b")).toBeChecked();
    await expect(cardCheckbox(page, "menu-e18-c")).not.toBeChecked();
    expect((await stateSession(page, daemon, c.id)).groupId).toBeNull();
  } finally {
    await cleanup();
  }
});

test("right-clicking the one selected card names its menu for one session, not 'sessions' (REQ-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["menu-e18b-a", "menu-e18b-b"]);
  try {
    await selectToggle(page).click();
    await cardCheckbox(page, "menu-e18b-a").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");

    await openCardMenu(page, railCard(page, "menu-e18b-a"));
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for 1 session");
    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);

    // A second selection moves the same menu to the plural form.
    await cardCheckbox(page, "menu-e18b-b").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await openCardMenu(page, railCard(page, "menu-e18b-a"));
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for 2 sessions");
  } finally {
    await cleanup();
  }
});

test("Stop… from a selected card in Select mode opens the count confirm and ends every selected session in one batch, leaving the unselected card alive and Select mode on (REQ-3, REQ-4, #97)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-e19-a",
    "menu-e19-b",
    "menu-e19-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    for (const [s, title] of [
      [a, "menu-e19-a"],
      [b, "menu-e19-b"],
      [c, "menu-e19-c"],
    ] as const) {
      await bindClaude(request, daemon, s, `claude-${title}`);
    }
    await selectToggle(page).click();
    await cardCheckbox(page, "menu-e19-a").check();
    await cardCheckbox(page, "menu-e19-b").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-e19-a"));
    await cardMenuItem(page, "Stop…").click();
    const dialog = bulkStopDialog(page, 2);
    await expect(dialog).toBeVisible();
    await expect(cardMenu(page)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Stop 2", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(railCard(page, "menu-e19-a")).toHaveClass(/ended/);
    await expect(railCard(page, "menu-e19-b")).toHaveClass(/ended/);
    await expect(railCard(page, "menu-e19-c")).not.toHaveClass(/ended/);
    const state = await getState(page, daemon);
    expect(findSession(state, a.id).alive).toBe(false);
    expect(findSession(state, b.id).alive).toBe(false);
    expect(findSession(state, c.id).alive).toBe(true);
    expect(await daemon.tmuxPaneExists(c.tmuxTarget)).toBe(true);
    expect(net.requests().filter((r) => r.endsWith("/end"))).toEqual(["POST /api/sessions/end"]);
    // Select mode and the selection stay on after the batch.
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "menu-e19-a")).toBeChecked();
    await expect(cardCheckbox(page, "menu-e19-b")).toBeChecked();
  } finally {
    await cleanup();
  }
});

// Mark as read / Mark as unread (#103) and
// Remove… on a live session (#104). `unread` is the daemon's own per-session flag
// (set when a turn closes into idle with nobody attached, cleared on attach and on leaving
// idle); the menu entries are the one other way to set or clear it, through
// `PUT /api/sessions/{id}/unread`. A watched session is one whose terminal is attached: the
// first-launched session is the default Focus, so waiting for its terminal to be ready is the
// file's proof that it is attached before its turn closes (rail-unread.spec.ts), while a second
// session nobody focuses stays unwatched and is marked unread by the turn close itself.

test("Mark as unread on an idle read card marks it unread, and Mark as read clears it, leaving another session's unread flag alone (REQ-1, REQ-2, #103)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["mark-e1-a", "mark-e1-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    await expect(terminalRegion(page, "mark-e1-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });
    await driveToState(request, daemon, a, "claude-mark-e1-a", "idle");
    await driveToState(request, daemon, b, "claude-mark-e1-b", "idle");
    const cardA = railCard(page, "mark-e1-a");
    const cardB = railCard(page, "mark-e1-b");
    await expect(stateBadge(cardA)).toHaveText(/idle/i);
    await expect(stateBadge(cardB)).toHaveText(/idle/i);
    // B's turn closed unwatched, so the daemon marked it; A's closed watched, so A is read.
    await expect(cardB).toHaveAttribute("data-unread", "true");
    await expect(cardA).not.toHaveAttribute("data-unread", "true");
    expect(findSession(await getState(page, daemon), a.id).unread).toBe(false);
    const net = trackMutationBodies(page);

    await openCardMenu(page, cardA);
    await cardMenuItem(page, "Mark as unread").click();
    await expect(cardMenu(page)).toHaveCount(0);
    await expect(cardA).toHaveAttribute("data-unread", "true");
    await expect
      .poll(async () => findSession(await getState(page, daemon), a.id).unread)
      .toBe(true);
    expect(net.requests()).toEqual([
      { method: "PUT", path: `/api/sessions/${a.id}/unread`, body: { unread: true } },
    ]);
    // A hand-set unread outlives a render tick: only an attach or leaving idle clears it.
    await settleFor(page, 1_400);
    await expect(cardA).toHaveAttribute("data-unread", "true");

    await openCardMenu(page, cardA);
    await cardMenuItem(page, "Mark as read").click();
    await expect(cardMenu(page)).toHaveCount(0);
    await expect(cardA).not.toHaveAttribute("data-unread", "true");
    await expect
      .poll(async () => findSession(await getState(page, daemon), a.id).unread)
      .toBe(false);
    expect(net.requests()).toEqual([
      { method: "PUT", path: `/api/sessions/${a.id}/unread`, body: { unread: true } },
      { method: "PUT", path: `/api/sessions/${a.id}/unread`, body: { unread: false } },
    ]);
    // The other session was never addressed and keeps the flag its own turn close set.
    await expect(cardB).toHaveAttribute("data-unread", "true");
    expect(findSession(await getState(page, daemon), b.id).unread).toBe(true);
  } finally {
    await cleanup();
  }
});

test("Mark as read and Mark as unread from a selected card's menu send one request per selected session and change only those sessions (REQ-2, #103)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "mark-sel-a",
    "mark-sel-b",
    "mark-sel-c",
    "mark-sel-d",
  ]);
  try {
    const [a, b, c, d] = sessions;
    if (!a || !b || !c || !d) throw new Error("expected 4 sessions");
    await expect(terminalRegion(page, "mark-sel-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });
    for (const [s, title] of [
      [a, "mark-sel-a"],
      [b, "mark-sel-b"],
      [c, "mark-sel-c"],
      [d, "mark-sel-d"],
    ] as const) {
      await driveToState(request, daemon, s, `claude-${title}`, "idle");
      await expect(stateBadge(railCard(page, title))).toHaveText(/idle/i);
    }
    // A is watched (read); B, C and D closed their turns unwatched (unread).
    const unreadOf = async (id: number) => findSession(await getState(page, daemon), id).unread;
    await expect.poll(async () => unreadOf(b.id)).toBe(true);
    await expect.poll(async () => unreadOf(d.id)).toBe(true);

    await selectToggle(page).click();
    await cardCheckbox(page, "mark-sel-b").check();
    await cardCheckbox(page, "mark-sel-c").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    const net = trackMutationBodies(page);
    const unreadPuts = () =>
      net
        .requests()
        .filter((r) => r.path.endsWith("/unread"))
        .sort((x, y) => x.path.localeCompare(y.path));

    await openCardMenu(page, railCard(page, "mark-sel-b"));
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for 2 sessions");
    await cardMenuItem(page, "Mark as read").click();
    await expect.poll(async () => unreadOf(b.id)).toBe(false);
    await expect.poll(async () => unreadOf(c.id)).toBe(false);
    await expect(railCard(page, "mark-sel-b")).not.toHaveAttribute("data-unread", "true");
    await expect(railCard(page, "mark-sel-c")).not.toHaveAttribute("data-unread", "true");
    expect(unreadPuts()).toEqual(
      [b, c].map((s) => ({
        method: "PUT",
        path: `/api/sessions/${s.id}/unread`,
        body: { unread: false },
      })),
    );
    // The unselected unread session and the watched read one are untouched.
    expect(await unreadOf(d.id)).toBe(true);
    expect(await unreadOf(a.id)).toBe(false);
    await expect(railCard(page, "mark-sel-d")).toHaveAttribute("data-unread", "true");

    await openCardMenu(page, railCard(page, "mark-sel-c"));
    await cardMenuItem(page, "Mark as unread").click();
    await expect.poll(async () => unreadOf(b.id)).toBe(true);
    await expect.poll(async () => unreadOf(c.id)).toBe(true);
    await expect(railCard(page, "mark-sel-b")).toHaveAttribute("data-unread", "true");
    await expect(railCard(page, "mark-sel-c")).toHaveAttribute("data-unread", "true");
    expect(unreadPuts().filter((r) => JSON.stringify(r.body) === '{"unread":true}')).toEqual(
      [b, c].map((s) => ({
        method: "PUT",
        path: `/api/sessions/${s.id}/unread`,
        body: { unread: true },
      })),
    );
    expect(unreadPuts()).toHaveLength(4);
    expect(await unreadOf(a.id)).toBe(false);
    // Select mode and both selections stay on after the batch of per-session calls.
    await expect(selectBarCount(page)).toHaveText("2 selected");
  } finally {
    await cleanup();
  }
});

test("Remove… from a live card's menu opens the remove confirm that ends the session first: cancelling sends nothing, confirming removes only that session and its pane (REQ-3, #104)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-live-a", "menu-live-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    await bindClaude(request, daemon, a, "claude-menu-live-a");
    await bindClaude(request, daemon, b, "claude-menu-live-b");
    const net = trackMutations(page);

    await openCardMenu(page, railCard(page, "menu-live-a"));
    expect((await menuItemLabels(page)).slice(0, 2)).toEqual(["Stop…", "Remove…"]);
    await cardMenuItem(page, "Remove…").click();
    const dialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/ends the session first/i);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await settleFor(page, 500);
    expect(net.requests()).toEqual([]);
    expect(findSession(await getState(page, daemon), a.id).alive).toBe(true);

    await openCardMenu(page, railCard(page, "menu-live-a"));
    await cardMenuItem(page, "Remove…").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(railCard(page, "menu-live-a")).toHaveCount(0);

    const state = await getState(page, daemon);
    expect(state.sessions.map((s) => s.id)).toEqual([b.id]);
    expect(findSession(state, b.id).alive).toBe(true);
    expect(await daemon.tmuxPaneExists(a.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(b.tmuxTarget)).toBe(true);
    expect(net.requests()).toEqual([`DELETE /api/sessions/${a.id}`]);
  } finally {
    await cleanup();
  }
});

test("Remove… from a selected card's menu over live sessions opens the count confirm and removes every selected session, leaving the unselected live one running (REQ-3, #104)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-rm-a",
    "menu-rm-b",
    "menu-rm-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    for (const [s, title] of [
      [a, "menu-rm-a"],
      [b, "menu-rm-b"],
      [c, "menu-rm-c"],
    ] as const) {
      await bindClaude(request, daemon, s, `claude-${title}`);
    }
    await selectToggle(page).click();
    await cardCheckbox(page, "menu-rm-a").check();
    await cardCheckbox(page, "menu-rm-b").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");

    await openCardMenu(page, railCard(page, "menu-rm-a"));
    await cardMenuItem(page, "Remove…").click();
    const dialog = bulkRemoveDialog(page, 2);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove 2", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(railCard(page, "menu-rm-a")).toHaveCount(0);
    await expect(railCard(page, "menu-rm-b")).toHaveCount(0);
    await expect(railCard(page, "menu-rm-c")).toHaveCount(1);
    const state = await getState(page, daemon);
    expect(state.sessions.map((s) => s.id)).toEqual([c.id]);
    expect(findSession(state, c.id).alive).toBe(true);
    expect(await daemon.tmuxPaneExists(a.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(b.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(c.tmuxTarget)).toBe(true);
  } finally {
    await cleanup();
  }
});
