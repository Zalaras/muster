import { expect, settleFor, test } from "./helpers/fixtures";
import {
  createGroupViaApi,
  getGroupsState,
  launchTitled,
  menuItem,
  openRailMenu,
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
  CARD_ACTION_BUTTON,
  cardMenu,
  cardMenuItem,
  launchEndedSession,
  menuItemLabels,
  openCardMenu,
  stateSession,
  trackContextMenuEvents,
} from "./helpers/rail-menu";
import { pinButton, pinViaApi, railCard } from "./helpers/railorder";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
} from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// Plan rail-card-organise — the right-click menu on rail and Tiles strip cards (#56): what each
// kind of session's menu offers, that no card renders an action button any more, the confirm
// dialogs the entries open, Move to and Pin, the daemon-down state, closing, the keyboard way in,
// Select mode. Acceptance E1-E9 with REQ-1 to REQ-11 and INV-3, INV-4.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// they assert group membership and pin changes, and the daemon-down test kills the daemon, which
// a shared one could not survive.
//
// Right-click is the pointer path a real user has; the ContextMenu key and Shift+F10 are the
// keyboard ones. Entries are located the way every existing menu's are (role `menuitem`, exact
// name), and a menu that must stay inert is asserted disabled, never merely absent.

/** The group names in the order the daemon says the rail lists them (Move to's order). */
async function groupNamesInRailOrder(
  page: Parameters<typeof getGroupsState>[0],
  daemon: Parameters<typeof getGroupsState>[1],
): Promise<string[]> {
  const state = await getGroupsState(page, daemon);
  return [...state.groups].sort((a, b) => a.pos - b.pos).map((g) => g.name);
}

test("right-clicking a live rail card opens a menu at the pointer with Stop…, each group in rail order, New group…, No group and Pin, and no Resume or Remove…, and the browser's own menu is cancelled (REQ-1, REQ-2, E1)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "menu-e1-a",
    "menu-e1-b",
    "menu-e1-c",
  ]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "review", [a.id]);
    await createGroupViaApi(page, daemon, "docs", [b.id]);
    const names = await groupNamesInRailOrder(page, daemon);
    expect(names).toEqual(["review", "docs"]);
    const contextMenus = await trackContextMenuEvents(page);

    const card = railCard(page, "menu-e1-a");
    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error("the card has no layout box");
    const menu = await openCardMenu(page, card, { x: 24, y: 12 });

    expect(await menuItemLabels(page)).toEqual([
      "Stop…",
      ...names,
      "New group…",
      "No group",
      "Pin",
    ]);
    await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
    await expect(cardMenuItem(page, "Remove…")).toHaveCount(0);
    await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
    // The ticked entry is the session's own group; No group is not ticked while it is grouped.
    await expect(cardMenuItem(page, "review")).toHaveAttribute("aria-current", "true");
    await expect(cardMenuItem(page, "docs")).not.toHaveAttribute("aria-current", "true");
    await expect(cardMenuItem(page, "No group")).not.toHaveAttribute("aria-current", "true");

    // Opened at the pointer: the panel's corner sits within a small offset of where the button went down.
    const menuBox = await menu.boundingBox();
    if (!menuBox) throw new Error("the menu has no layout box");
    expect(Math.abs(menuBox.x - (cardBox.x + 24))).toBeLessThanOrEqual(40);
    expect(Math.abs(menuBox.y - (cardBox.y + 12))).toBeLessThanOrEqual(40);

    // The page's handler cancelled the browser's own menu.
    expect(await contextMenus()).toEqual([true]);
  } finally {
    await cleanup();
  }
});

test("right-clicking an ended resumable rail card offers Resume, Remove…, the Move to items and Pin or Unpin, and no Stop… (REQ-2, E2)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB, dirC] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchEndedSession(page, request, daemon, dirA.path, "menu-e2-plain");
    const pinned = await launchEndedSession(page, request, daemon, dirB.path, "menu-e2-pinned");
    await pinViaApi(page, daemon.baseURL, pinned.id, true);
    const carrier = await launchEndedSession(page, request, daemon, dirC.path, "menu-e2-group");
    await createGroupViaApi(page, daemon, "review", [carrier.id]);
    await expect(sessionCard(page, "menu-e2-plain")).toHaveClass(/ended/);

    await openCardMenu(page, railCard(page, "menu-e2-plain"));
    expect(await menuItemLabels(page)).toEqual([
      "Resume",
      "Remove…",
      "review",
      "New group…",
      "No group",
      "Pin",
    ]);
    await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
    await expect(cardMenuItem(page, "Resume")).toBeEnabled();
    await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
    // Ungrouped: No group carries the tick and the group does not.
    await expect(cardMenuItem(page, "No group")).toHaveAttribute("aria-current", "true");
    await expect(cardMenuItem(page, "review")).not.toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);

    await openCardMenu(page, railCard(page, "menu-e2-pinned"));
    expect((await menuItemLabels(page)).at(-1)).toBe("Unpin");
    await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup(), dirC.cleanup()]);
  }
});

test("an ended session with no Claude session id has no Resume item at all, not a disabled one, while its Remove… stays (REQ-3)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const unbound = await launchEndedSession(page, request, daemon, dirA.path, "menu-e3-unbound", {
      bindClaude: false,
    });
    await launchEndedSession(page, request, daemon, dirB.path, "menu-e3-bound");
    expect((await stateSession(page, daemon, unbound.id)).claudeSessionId).toBeNull();

    await openCardMenu(page, railCard(page, "menu-e3-unbound"));
    await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
    await expect(cardMenu(page).getByRole("menuitem", { name: /^Resume/ })).toHaveCount(0);
    await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
    expect((await menuItemLabels(page))[0]).toBe("Remove…");
    await page.keyboard.press("Escape");

    // The bound twin does offer it, so the absence above is the binding and nothing else.
    await openCardMenu(page, railCard(page, "menu-e3-bound"));
    await expect(cardMenuItem(page, "Resume")).toBeEnabled();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("no rail card renders a Stop, Resume or Remove button, live or ended, at rest, hovered, focused or current, and the pin control stays (REQ-6, INV-3, E3)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirLive, dirEnded, dirUnbound] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const live = await launchSession(page, daemon, {
      directory: dirLive.path,
      title: "menu-e4-live",
    });
    await bindClaude(request, daemon, live, "claude-menu-e4-live");
    await launchEndedSession(page, request, daemon, dirEnded.path, "menu-e4-ended");
    await launchEndedSession(page, request, daemon, dirUnbound.path, "menu-e4-unbound", {
      bindClaude: false,
    });

    for (const title of ["menu-e4-live", "menu-e4-ended", "menu-e4-unbound"]) {
      const card = railCard(page, title);
      await expect(card).toBeVisible();
      const noActions = async () => {
        await expect(card.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
        await expect(card.locator(".acts-row")).toHaveCount(0);
        await expect(pinButton(card)).toBeVisible();
      };
      await noActions();
      await card.hover();
      await noActions();
      await card.focus();
      await noActions();
    }

    // Current: the card the Focus pane shows, live and ended in turn.
    for (const title of ["menu-e4-live", "menu-e4-ended"]) {
      await railCard(page, title).click();
      await expect(railCard(page, title)).toHaveAttribute("aria-current", "true");
      await expect(
        railCard(page, title).getByRole("button", { name: CARD_ACTION_BUTTON }),
      ).toHaveCount(0);
      await expect(railCard(page, title).locator(".acts-row")).toHaveCount(0);
    }

    // A render tick later, with nothing hovered, still none anywhere on the rail.
    await page.mouse.move(0, 0);
    await settleFor(page, 1_300);
    await expect(
      page.locator("#sessions").getByTestId("session-card").getByRole("button", {
        name: CARD_ACTION_BUTTON,
      }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([dirLive.cleanup(), dirEnded.cleanup(), dirUnbound.cleanup()]);
  }
});

test("the same menu opens on Tiles strip cards, live and ended, and no strip card renders a Stop, Resume or Remove button (REQ-1, REQ-6, INV-3, E4)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 6 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `menu-e5-${i}`);
    const { sessions, cleanup } = await launchTitled(page, daemon, titles);
    try {
      for (const [i, session] of sessions.entries()) {
        await bindClaude(request, daemon, session, `claude-menu-e5-${i}`);
      }
      await page.getByRole("button", { name: "Tiles", exact: true }).click();
      await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

      const stripped: { title: string; id: number }[] = [];
      for (const [i, title] of titles.entries()) {
        if ((await liveTile(page, title).count()) === 0) {
          stripped.push({ title, id: sessions[i]?.id ?? -1 });
        }
      }
      expect(stripped).toHaveLength(2);
      const [liveStrip, endedStrip] = stripped;
      if (!liveStrip || !endedStrip) throw new Error("expected two strip cards");

      const end = await page.request.post(`${daemon.baseURL}/api/sessions/${endedStrip.id}/end`);
      expect(end.status()).toBe(200);
      await expect(stripCard(page, endedStrip.title)).toHaveClass(/ended/);

      for (const { title } of stripped) {
        const strip = stripCard(page, title);
        await expect(strip).toBeVisible();
        await expect(strip.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
        await strip.hover();
        await expect(strip.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
        await expect(strip.locator(".acts-row")).toHaveCount(0);
      }

      await openCardMenu(page, stripCard(page, liveStrip.title));
      await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
      await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
      await expect(cardMenuItem(page, "Remove…")).toHaveCount(0);
      await expect(cardMenuItem(page, "No group")).toBeVisible();
      await expect(cardMenuItem(page, "Pin")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(cardMenu(page)).toHaveCount(0);

      await openCardMenu(page, stripCard(page, endedStrip.title));
      await expect(cardMenuItem(page, "Resume")).toBeEnabled();
      await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
      await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

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

test("Resume resumes the ended session at once as the Focus header's Resume does, with no confirm dialog, and leaves another ended session ended (REQ-4, INV-4)", async ({
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
    } finally {
      await cleanup();
    }
  } finally {
    await dirEnded.cleanup();
  }
});

test("Escape closes the card menu and returns focus to the card, and right-clicking a second card replaces the first menu (REQ-8, E7)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirEnded] = await Promise.all([scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e12-live"]);
    try {
      const [live] = sessions;
      if (!live) throw new Error("expected 1 session");
      await bindClaude(request, daemon, live, "claude-menu-e12-live");
      await launchEndedSession(page, request, daemon, dirEnded.path, "menu-e12-ended");

      await openCardMenu(page, railCard(page, "menu-e12-live"));
      await page.keyboard.press("Escape");
      await expect(cardMenu(page)).toHaveCount(0);
      await expect(railCard(page, "menu-e12-live")).toBeFocused();

      // The menu opens at the pointer and covers the cards below it, so the second right-click
      // lands on the ended card beside the open menu, as a user's would.
      const firstMenu = await openCardMenu(page, railCard(page, "menu-e12-live"), { x: 8, y: 8 });
      await expect(cardMenuItem(page, "Stop…")).toBeVisible();
      const menuBox = await firstMenu.boundingBox();
      const endedBox = await railCard(page, "menu-e12-ended").boundingBox();
      if (!menuBox || !endedBox) throw new Error("expected the menu and the ended card on screen");
      const beside = menuBox.x + menuBox.width + 6 - endedBox.x;
      expect(beside).toBeLessThan(endedBox.width - 6);
      await railCard(page, "menu-e12-ended").click({
        button: "right",
        position: { x: beside, y: 8 },
      });
      await expect(cardMenu(page)).toHaveCount(1);
      await expect(cardMenuItem(page, "Resume")).toBeVisible();
      await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);

      await page.keyboard.press("Escape");
      await expect(cardMenu(page)).toHaveCount(0);
      await expect(railCard(page, "menu-e12-ended")).toBeFocused();
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

test("right-clicking a card while the rail's ⋯ menu is open closes that menu and opens the card's (REQ-8, edge case 13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["menu-e14-a", "menu-e14-b"]);
  try {
    const [a] = sessions;
    if (!a) throw new Error("expected 2 sessions");
    await createGroupViaApi(page, daemon, "review", [a.id]);
    await openRailMenu(page);
    await expect(menuItem(page, "Collapse all groups")).toBeVisible();

    await railCard(page, "menu-e14-b").click({ button: "right" });
    await expect(cardMenu(page)).toHaveCount(1);
    await expect(cardMenuItem(page, "Pin")).toBeVisible();
    await expect(cardMenuItem(page, "Stop…")).toBeVisible();
    await expect(menuItem(page, "Collapse all groups")).toHaveCount(0);
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

    // Stop…, review, docs: two arrows to docs, Enter to choose.
    await page.keyboard.press("ArrowDown");
    await expect(cardMenuItem(page, "review")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(cardMenuItem(page, "docs")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(cardMenu(page)).toHaveCount(0);
    await expect.poll(() => sectionCardIds(page, docs.id)).toEqual([b.id, a.id]);
    expect(await sectionCardIds(page, review.id)).toEqual([]);

    await card.focus();
    await page.keyboard.press("Shift+F10");
    await expect(cardMenuItem(page, "Stop…")).toBeFocused();
    // Stop…, review, docs, New group…, No group: four arrows.
    for (const next of ["review", "docs", "New group…", "No group"]) {
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

test("the card keeps its node and focus through opening and closing its menu from the keyboard, and the open menu keeps its focused item across a render tick (REQ-9, REQ-8)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["menu-e17-a", "menu-e17-b"]);
  try {
    const card = railCard(page, "menu-e17-a");
    await card.focus();
    await card.evaluate((el) => {
      Reflect.set(el, "__e2eNode", "card");
    });
    const cardTagged = () =>
      page.evaluate(() => Reflect.get(document.activeElement ?? {}, "__e2eNode") === "card");
    expect(await cardTagged()).toBe(true);

    await page.keyboard.press("Shift+F10");
    await expect(cardMenuItem(page, "Stop…")).toBeFocused();
    await cardMenuItem(page, "Stop…").evaluate((el) => {
      Reflect.set(el, "__e2eNode", "item");
    });
    const itemTagged = () =>
      page.evaluate(() => Reflect.get(document.activeElement ?? {}, "__e2eNode") === "item");
    expect(await itemTagged()).toBe(true);

    // Past one 1 s render tick: the menu is neither rebuilt nor closed and the item holds focus.
    await settleFor(page, 1_300);
    await expect(cardMenu(page)).toBeVisible();
    expect(await itemTagged()).toBe(true);

    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);
    expect(await cardTagged()).toBe(true);
    await settleFor(page, 1_300);
    await expect(card).toBeFocused();
    expect(await cardTagged()).toBe(true);
  } finally {
    await cleanup();
  }
});

test("right-clicking a card in Select mode opens the same single-session menu and the selection stays as it was (REQ-7)", async ({
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
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "review", [a.id, b.id]);
    await selectToggle(page).click();
    await cardCheckbox(page, "menu-e18-a").check();
    await cardCheckbox(page, "menu-e18-b").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");

    // An unselected card: its own menu, nothing selected by the click.
    await openCardMenu(page, railCard(page, "menu-e18-c"));
    expect(await menuItemLabels(page)).toEqual([
      "Stop…",
      "review",
      "New group…",
      "No group",
      "Pin",
    ]);
    await page.keyboard.press("Escape");
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "menu-e18-c")).not.toBeChecked();

    // A selected card: the menu still acts on that one session only.
    await openCardMenu(page, railCard(page, "menu-e18-a"));
    expect(await menuItemLabels(page)).toEqual([
      "Stop…",
      "review",
      "New group…",
      "No group",
      "Pin",
    ]);
    await cardMenuItem(page, "No group").click();
    await expect.poll(async () => (await stateSession(page, daemon, a.id)).groupId).toBeNull();
    expect((await stateSession(page, daemon, b.id)).groupId).not.toBeNull();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await expect(cardCheckbox(page, "menu-e18-a")).toBeChecked();
    await expect(cardCheckbox(page, "menu-e18-b")).toBeChecked();
  } finally {
    await cleanup();
  }
});
