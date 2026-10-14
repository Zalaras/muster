import { expect, type Locator, type Page, settleFor, test } from "./helpers/fixtures";
import {
  barButton,
  cardCheckbox,
  createGroupViaApi,
  deleteGroupViaApi,
  getGroupsState,
  type GroupsState,
  groupHead,
  launchTitled,
  routeGroupsFrames,
  sectionCardIds,
  selectBar,
  selectBarCount,
  selectToggle,
  UNGROUPED,
} from "./helpers/groups";
import { launchEndedSession, stateSession, trackMutationBodies } from "./helpers/rail-menu";
import { pinButton, pinViaApi, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";
import { scratchDirectory } from "./helpers/session";

// Plan rail-card-organise — dragging rail cards into groups in both sort orders (#77) and
// dragging a selection in Select mode. Acceptance E10-E13 with REQ-12 to REQ-18, REQ-20 and INV-4.
// Section headers still drag to reorder in both sort orders (REQ-19, E20): that is the existing
// groups.spec.ts spec, kept as it is.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// they assert rail order and group membership, which a neighbour's sessions on a shared daemon
// would corrupt.
//
// Every drag is `locator.dragTo`, which drives real HTML5 drag-and-drop in Chromium: mouse down,
// movement past the drag threshold, mouse up on the target. `selectOption` and `check` only set
// the sort order and the selection up.

type Sort = "manual" | "attention";

async function setSort(page: Page, sort: Sort): Promise<void> {
  await railSortSelect(page).selectOption(sort);
  await expect(railSortSelect(page)).toHaveValue(sort);
}

/** Every session's group, pin and position, by id: the "nothing else changed" oracle. */
function rowsOf(state: GroupsState): (number | boolean | null)[][] {
  return state.sessions
    .map((s) => [s.id, s.groupId, s.pinned, s.railPos])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
}

const sortedIds = (ids: number[]) => [...ids].sort((a, b) => a - b);

/**
 * A real drag that ends on the card it started on: press, move past the drag threshold inside the
 * card, release. `dragTo(card, card)` never moves, so it is the click that toggles the selection
 * (REQ-15). Returns once the browser has fired `dragstart`, so the drag is shown to have happened.
 */
async function dragWithin(page: Page, card: Locator): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, "__e2eDragStarts", 0);
    document.addEventListener(
      "dragstart",
      () =>
        Reflect.set(window, "__e2eDragStarts", Number(Reflect.get(window, "__e2eDragStarts")) + 1),
      { capture: true, once: true },
    );
  });
  const box = await card.boundingBox();
  if (!box) throw new Error("expected the card on screen");
  const x = box.x + 40;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 14, y, { steps: 4 });
  await page.mouse.move(x + 28, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__e2eDragStarts"))).toBe(1);
}

test("in attention order dragging a pinned card onto another group's header changes only its group, keeps its pin, sits it in the new section's pinned block, and leaves a bystander's group and pin as they were (REQ-12, REQ-13, INV-4, E10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e10-p",
    "drag-e10-d",
    "drag-e10-b",
    "drag-e10-u",
  ]);
  try {
    const [p, d, b, u] = sessions;
    if (!p || !d || !b || !u) throw new Error("expected 4 sessions");
    const alpha = await createGroupViaApi(page, daemon, "alpha", [p.id, d.id]);
    const bravo = await createGroupViaApi(page, daemon, "bravo", [b.id]);
    await pinViaApi(page, daemon.baseURL, p.id, true);
    await pinViaApi(page, daemon.baseURL, d.id, true);
    await setSort(page, "attention");
    await expect.poll(() => sectionCardIds(page, alpha.id)).toEqual([p.id, d.id]);
    const net = trackMutationBodies(page);

    await railCard(page, "drag-e10-p").dragTo(groupHead(page, bravo.id));

    // The pinned card now leads the new section's pinned block, ahead of the unpinned member.
    await expect.poll(() => sectionCardIds(page, bravo.id)).toEqual([p.id, b.id]);
    expect(await sectionCardIds(page, alpha.id)).toEqual([d.id]);
    expect(net.requests()).toEqual([
      { method: "PUT", path: "/api/sessions/group", body: { ids: [p.id], groupId: bravo.id } },
    ]);
    const state = await getGroupsState(page, daemon);
    const row = (id: number) => state.sessions.find((s) => s.id === id);
    expect(row(p.id)).toMatchObject({ groupId: bravo.id, pinned: true });
    expect(row(d.id)).toMatchObject({ groupId: alpha.id, pinned: true });
    expect(row(b.id)).toMatchObject({ groupId: bravo.id, pinned: false });
    expect(row(u.id)).toMatchObject({ groupId: null, pinned: false });
    await expect(page.locator("article.card.dragging")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("in attention order a card dropped among another group's cards joins that group, and one dropped on or among Ungrouped's leaves its group, each through one group-only request (REQ-12, REQ-13)", async ({
  page,
  daemon,
}) => {
  // Four cards and three headers outgrow the 720 px viewport; a target below the fold makes
  // Playwright scroll the rail after the mouse is down, so the drag would start on another card.
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e11-x",
    "drag-e11-y",
    "drag-e11-z",
    "drag-e11-u",
  ]);
  try {
    const [x, y, z, u] = sessions;
    if (!x || !y || !z || !u) throw new Error("expected 4 sessions");
    const alpha = await createGroupViaApi(page, daemon, "alpha", [x.id]);
    const bravo = await createGroupViaApi(page, daemon, "bravo", [y.id, z.id]);
    await setSort(page, "attention");
    const net = trackMutationBodies(page);

    // Among another group's cards: onto z, a member of bravo.
    await railCard(page, "drag-e11-x").dragTo(railCard(page, "drag-e11-z"));
    await expect
      .poll(async () => sortedIds(await sectionCardIds(page, bravo.id)))
      .toEqual(sortedIds([x.id, y.id, z.id]));
    expect(await sectionCardIds(page, alpha.id)).toEqual([]);

    // Among Ungrouped's cards: onto u, ungrouped.
    await railCard(page, "drag-e11-y").dragTo(railCard(page, "drag-e11-u"));
    await expect
      .poll(async () => sortedIds(await sectionCardIds(page, UNGROUPED)))
      .toEqual(sortedIds([y.id, u.id]));

    // On Ungrouped's header.
    await railCard(page, "drag-e11-z").dragTo(groupHead(page, UNGROUPED));
    await expect
      .poll(async () => sortedIds(await sectionCardIds(page, UNGROUPED)))
      .toEqual(sortedIds([y.id, z.id, u.id]));

    expect(net.requests()).toEqual([
      { method: "PUT", path: "/api/sessions/group", body: { ids: [x.id], groupId: bravo.id } },
      { method: "PUT", path: "/api/sessions/group", body: { ids: [y.id], groupId: null } },
      { method: "PUT", path: "/api/sessions/group", body: { ids: [z.id], groupId: null } },
    ]);
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === x.id)?.groupId).toBe(bravo.id);
    expect(state.sessions.find((s) => s.id === y.id)?.groupId).toBeNull();
    expect(state.sessions.find((s) => s.id === z.id)?.groupId).toBeNull();
  } finally {
    await cleanup();
  }
});

test("in manual order a drop among a section's cards sends one order request carrying the target group, the section's cards with the dragged one in place and the pin count, and a drop on a header sends one group request to the end of the section (REQ-12, REQ-14)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e12-m1",
    "drag-e12-m2",
    "drag-e12-m3",
    "drag-e12-m4",
  ]);
  try {
    const [m1, m2, m3, m4] = sessions;
    if (!m1 || !m2 || !m3 || !m4) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "alpha", [m1.id]);
    const bravo = await createGroupViaApi(page, daemon, "bravo", [m2.id, m3.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");
    await expect.poll(() => sectionCardIds(page, bravo.id)).toEqual([m2.id, m3.id]);
    const net = trackMutationBodies(page);

    // Onto m3: directly before it.
    await railCard(page, "drag-e12-m1").dragTo(railCard(page, "drag-e12-m3"));
    await expect.poll(() => sectionCardIds(page, bravo.id)).toEqual([m2.id, m1.id, m3.id]);
    expect(net.requests()).toEqual([
      {
        method: "PUT",
        path: "/api/sessions/order",
        body: { ids: [m2.id, m1.id, m3.id], pinnedCount: 0, groupId: bravo.id },
      },
    ]);

    // Onto Ungrouped's header: the end of that section, the group left, through the group
    // endpoint as it does today.
    await railCard(page, "drag-e12-m3").dragTo(groupHead(page, UNGROUPED));
    await expect.poll(() => sectionCardIds(page, UNGROUPED)).toEqual([m4.id, m3.id]);
    const [, second] = net.requests();
    expect(second).toEqual({
      method: "PUT",
      path: "/api/sessions/group",
      body: { ids: [m3.id], groupId: null },
    });
    expect(net.requests()).toHaveLength(2);
  } finally {
    await cleanup();
  }
});

test("in attention order a drop inside the card's own section, on a sibling card or on its own header, changes nothing and sends nothing (REQ-13, E12)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e13-a1",
    "drag-e13-a2",
    "drag-e13-b1",
  ]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    const alpha = await createGroupViaApi(page, daemon, "alpha", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "bravo", [b1.id]);
    await pinViaApi(page, daemon.baseURL, a1.id, true);
    await setSort(page, "attention");
    const before = await getGroupsState(page, daemon);
    const orderBefore = await railOrderIds(page);
    const net = trackMutationBodies(page);
    // Draggable in attention order (REQ-12): a drag that sends nothing is only evidence when the
    // card can be dragged at all.
    await expect(railCard(page, "drag-e13-a2")).toHaveAttribute("draggable", "true");
    await expect(railCard(page, "drag-e13-a1")).toHaveAttribute("draggable", "true");

    await railCard(page, "drag-e13-a2").dragTo(railCard(page, "drag-e13-a1"));
    await railCard(page, "drag-e13-a1").dragTo(groupHead(page, alpha.id));
    await railCard(page, "drag-e13-a2").dragTo(groupHead(page, alpha.id));

    await settleFor(page, 800);
    expect(net.requests()).toEqual([]);
    expect(await railOrderIds(page)).toEqual(orderBefore);
    expect(rowsOf(await getGroupsState(page, daemon))).toEqual(rowsOf(before));
  } finally {
    await cleanup();
  }
});

test("outside Select mode a drag carries only the dragged card, even after a selection was made and left (REQ-17, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e14-a1",
    "drag-e14-a2",
    "drag-e14-c1",
  ]);
  try {
    const [a1, a2, c1] = sessions;
    if (!a1 || !a2 || !c1) throw new Error("expected 3 sessions");
    const alpha = await createGroupViaApi(page, daemon, "alpha", [a1.id, a2.id]);
    const charlie = await createGroupViaApi(page, daemon, "charlie", [c1.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");

    await selectToggle(page).click();
    await cardCheckbox(page, "drag-e14-a1").check();
    await cardCheckbox(page, "drag-e14-a2").check();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    await barButton(page, "Done").click();
    await expect(selectBar(page)).toBeHidden();
    await expect(railCard(page, "drag-e14-a1")).toHaveAttribute("draggable", "true");
    const net = trackMutationBodies(page);

    await railCard(page, "drag-e14-a1").dragTo(groupHead(page, charlie.id));

    await expect.poll(() => sectionCardIds(page, charlie.id)).toEqual([c1.id, a1.id]);
    expect(await sectionCardIds(page, alpha.id)).toEqual([a2.id]);
    const sent = net.requests();
    expect(sent).toHaveLength(1);
    // A header drop in manual order is one group request for the dragged card alone, as in the REQ-14 test above.
    expect(sent[0]).toEqual({
      method: "PUT",
      path: "/api/sessions/group",
      body: { ids: [a1.id], groupId: charlie.id },
    });
  } finally {
    await cleanup();
  }
});

test("in Select mode a click on an unselected card selects it, and dragging one of two selected cards, one of them ended and the two from different groups, onto a group's header moves both there in one group request while the mode and the selection stay (REQ-15, REQ-16, E11)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      "drag-e15-g1",
      "drag-e15-t1",
      "drag-e15-u1",
    ]);
    try {
      const [g1, t1, u1] = sessions;
      if (!g1 || !t1 || !u1) throw new Error("expected 3 sessions");
      const ended = await launchEndedSession(page, request, daemon, dir.path, "drag-e15-e1");
      const alpha = await createGroupViaApi(page, daemon, "alpha", [g1.id]);
      const bravo = await createGroupViaApi(page, daemon, "bravo", [ended.id]);
      const charlie = await createGroupViaApi(page, daemon, "charlie", [t1.id]);
      await setSort(page, "attention");

      await selectToggle(page).click();
      await expect(cardCheckbox(page, "drag-e15-g1")).not.toBeChecked();
      // A press released without moving selects, as before.
      await railCard(page, "drag-e15-g1").click();
      await expect(cardCheckbox(page, "drag-e15-g1")).toBeChecked();
      await cardCheckbox(page, "drag-e15-e1").check();
      await expect(selectBarCount(page)).toHaveText("2 selected");
      await expect(railCard(page, "drag-e15-g1")).toHaveAttribute("draggable", "true");
      await expect(railCard(page, "drag-e15-e1")).toHaveAttribute("draggable", "true");
      await expect(railCard(page, "drag-e15-u1")).toHaveAttribute("draggable", "false");
      const net = trackMutationBodies(page);

      await railCard(page, "drag-e15-g1").dragTo(groupHead(page, charlie.id));

      await expect
        .poll(async () => sortedIds(await sectionCardIds(page, charlie.id)))
        .toEqual(sortedIds([t1.id, g1.id, ended.id]));
      expect(await sectionCardIds(page, alpha.id)).toEqual([]);
      expect(await sectionCardIds(page, bravo.id)).toEqual([]);
      const sent = net.requests();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.method).toBe("PUT");
      expect(sent[0]?.path).toBe("/api/sessions/group");
      const body = sent[0]?.body as { ids: number[]; groupId: number | null };
      expect(sortedIds(body.ids)).toEqual(sortedIds([g1.id, ended.id]));
      expect(body.groupId).toBe(charlie.id);

      const state = await getGroupsState(page, daemon);
      const row = (id: number) => state.sessions.find((s) => s.id === id);
      expect(row(ended.id)).toMatchObject({ groupId: charlie.id, alive: false });
      expect(row(g1.id)?.groupId).toBe(charlie.id);
      expect(row(t1.id)?.groupId).toBe(charlie.id);
      expect(row(u1.id)?.groupId).toBeNull();

      // Select mode and the selection survive the drop.
      await expect(selectToggle(page)).toHaveAttribute("aria-pressed", "true");
      await expect(selectBar(page)).toBeVisible();
      await expect(selectBarCount(page)).toHaveText("2 selected");
      await expect(cardCheckbox(page, "drag-e15-g1")).toBeChecked();
      await expect(cardCheckbox(page, "drag-e15-e1")).toBeChecked();
      await expect(cardCheckbox(page, "drag-e15-u1")).not.toBeChecked();
    } finally {
      await cleanup();
    }
  } finally {
    await dir.cleanup();
  }
});

test("in manual order a selection dropped among a section's cards lands contiguously before the target in the cards' current display order, whichever order they were selected in (REQ-16)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "drag-e16-x",
    "drag-e16-y",
    "drag-e16-t1",
    "drag-e16-t2",
    "drag-e16-u",
  ]);
  try {
    const [x, y, t1, t2] = sessions;
    if (!x || !y || !t1 || !t2) throw new Error("expected 5 sessions");
    await createGroupViaApi(page, daemon, "alpha", [x.id]);
    await createGroupViaApi(page, daemon, "bravo", [y.id]);
    const charlie = await createGroupViaApi(page, daemon, "charlie", [t1.id, t2.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");
    // The display order the selection must keep: x sits above y.
    const display = await railOrderIds(page);
    expect(display.indexOf(x.id)).toBeLessThan(display.indexOf(y.id));

    await selectToggle(page).click();
    // y is selected first, x second: the landing order is the display order, not the click order.
    await railCard(page, "drag-e16-y").click();
    await railCard(page, "drag-e16-x").click();
    await expect(selectBarCount(page)).toHaveText("2 selected");
    const net = trackMutationBodies(page);

    await railCard(page, "drag-e16-y").dragTo(railCard(page, "drag-e16-t1"));

    await expect.poll(() => sectionCardIds(page, charlie.id)).toEqual([x.id, y.id, t1.id, t2.id]);
    expect(net.requests()).toEqual([
      {
        method: "PUT",
        path: "/api/sessions/order",
        body: { ids: [x.id, y.id, t1.id, t2.id], pinnedCount: 0, groupId: charlie.id },
      },
    ]);
    await expect(selectBarCount(page)).toHaveText("2 selected");
  } finally {
    await cleanup();
  }
});

for (const sort of ["manual", "attention"] as const) {
  test(`in ${sort} order an unselected card in Select mode is not draggable, and a drag released where it started, outside the rail or by an unselected card sends nothing and leaves the selection (REQ-15, REQ-18, E12)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `drag-e17-${sort}-a1`,
      `drag-e17-${sort}-b1`,
      `drag-e17-${sort}-u1`,
    ]);
    try {
      const [a1, b1] = sessions;
      if (!a1 || !b1) throw new Error("expected 3 sessions");
      await createGroupViaApi(page, daemon, "alpha", [a1.id]);
      const bravo = await createGroupViaApi(page, daemon, "bravo", [b1.id]);
      await setSort(page, sort);

      await selectToggle(page).click();
      await cardCheckbox(page, `drag-e17-${sort}-u1`).check();
      await expect(selectBarCount(page)).toHaveText("1 selected");
      // Selected: draggable, with the pin control hidden. Unselected: neither.
      await expect(railCard(page, `drag-e17-${sort}-u1`)).toHaveAttribute("draggable", "true");
      await expect(railCard(page, `drag-e17-${sort}-a1`)).toHaveAttribute("draggable", "false");
      await expect(railCard(page, `drag-e17-${sort}-b1`)).toHaveAttribute("draggable", "false");
      await expect(pinButton(railCard(page, `drag-e17-${sort}-u1`))).toBeHidden();

      const before = await getGroupsState(page, daemon);
      const orderBefore = await railOrderIds(page);
      const net = trackMutationBodies(page);

      // An unselected card does not drag.
      await railCard(page, `drag-e17-${sort}-a1`).dragTo(groupHead(page, bravo.id));
      await railCard(page, `drag-e17-${sort}-a1`).dragTo(railCard(page, `drag-e17-${sort}-b1`));
      // A selected card released where it started, and outside the rail.
      await dragWithin(page, railCard(page, `drag-e17-${sort}-u1`));
      await railCard(page, `drag-e17-${sort}-u1`).dragTo(page.locator("#mainhead"));

      await settleFor(page, 800);
      expect(net.requests()).toEqual([]);
      expect(await railOrderIds(page)).toEqual(orderBefore);
      expect(rowsOf(await getGroupsState(page, daemon))).toEqual(rowsOf(before));
      await expect(selectBarCount(page)).toHaveText("1 selected");
      await expect(cardCheckbox(page, `drag-e17-${sort}-u1`)).toBeChecked();
      await expect(cardCheckbox(page, `drag-e17-${sort}-a1`)).not.toBeChecked();

      // Leaving the mode makes every card draggable again.
      await barButton(page, "Done").click();
      await expect(railCard(page, `drag-e17-${sort}-a1`)).toHaveAttribute("draggable", "true");
      await expect(pinButton(railCard(page, `drag-e17-${sort}-u1`))).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test(`in ${sort} order a drop onto a group deleted meanwhile shows the daemon's refusal in the action-error line and leaves every card where it was (REQ-20, E13)`, async ({
    page,
    daemon,
  }) => {
    // The dashboard learns of the delete from the `groups` frame; withholding it keeps the stale
    // header on screen deterministically, so the drop reaches the daemon and is refused there.
    const frames = await routeGroupsFrames(page);
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `drag-e18-${sort}-a1`,
      `drag-e18-${sort}-c1`,
      `drag-e18-${sort}-u1`,
    ]);
    try {
      const [a1, c1] = sessions;
      if (!a1 || !c1) throw new Error("expected 3 sessions");
      const alpha = await createGroupViaApi(page, daemon, "alpha", [a1.id]);
      const doomed = await createGroupViaApi(page, daemon, "doomed", [c1.id]);
      await setSort(page, sort);
      await expect(groupHead(page, doomed.id)).toHaveCount(1);

      frames.hold();
      await deleteGroupViaApi(page, daemon, doomed.id, { sessions: "ungroup" });
      expect((await getGroupsState(page, daemon)).groups.map((g) => g.id)).toEqual([alpha.id]);
      await expect(groupHead(page, doomed.id)).toHaveCount(1);
      const before = await getGroupsState(page, daemon);

      const net = trackMutationBodies(page);
      await railCard(page, `drag-e18-${sort}-a1`).dragTo(groupHead(page, doomed.id));

      // The drop reached the daemon: the refusal below is its 404, not a drop that never happened.
      await expect.poll(() => net.requests()).toHaveLength(1);
      expect(net.requests()[0]?.body).toMatchObject({ groupId: doomed.id });
      const actionError = page.locator("#action-error");
      await expect(actionError).toBeVisible();
      await expect(actionError).not.toHaveText("");
      const after = await getGroupsState(page, daemon);
      expect(rowsOf(after)).toEqual(rowsOf(before));
      expect(await sectionCardIds(page, alpha.id)).toEqual([a1.id]);
      expect((await stateSession(page, daemon, a1.id)).groupId).toBe(alpha.id);
      frames.release();
    } finally {
      await cleanup();
    }
  });
}
