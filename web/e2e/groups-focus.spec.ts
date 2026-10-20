import { expect, type Page, settleFor, test } from "./helpers/fixtures";
import {
  createGroupViaApi,
  driveToState,
  endSessionViaApi,
  filterButton,
  getGroupsState,
  groupCaret,
  groupHead,
  groupBody,
  groupNameInput,
  launchTitled,
  mainheadGroupButton,
  menuItem,
  openMenu,
  putGroupsOrderViaApi,
  railInvariantProblems,
  sectionCardIds,
  memberIdsOracle,
  trackMutations,
} from "./helpers/groups";
import { expectedManualOrder, railCard, railSortSelect, stripOrderIds } from "./helpers/railorder";
import { liveTile, tilesGridOrder } from "./helpers/terminal";

// Plan groups — the Focus header's group control's moves, the chords and view switches that
// reach the daemon, and Tiles ignoring groups. Plan acceptance E21, E23, with REQ-10, REQ-19,
// REQ-1, W11 and invariant I7.
//
// Re-levelled 2026-10-20 (plans/_audit/relevel/groups.md): what the display shows for a given
// state — the group control's place, tokens and keyboard-opened menu, its presence at every header
// width beside the title and repo floors (E27), the chords indexing displayed cards under a
// collapsed section or the filter (E20), ⌥⌘0's filter flip (E22), the page load's default focus
// and the chords' inertness under a dialog (E26) — lives in `web/render/groups.spec.ts` against
// the `groups-titled*`, `groups-needs-input` and `groups-focus-header` fixtures. What stays here
// needs the daemon: a move or a new group committed from the header's menu, ⌥⌘0 expanding a
// collapsed section (a PUT the daemon's `collapsed` answers for), ⌥⌘G's POST, and every view
// switch (the dashboard adopts `view` only from the prefs broadcast).
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture.
// The chords index the whole displayed rail and Tiles membership is a function of the daemon's
// total sessions, all daemon-global. This file is an addition beside the plan's three named spec
// files (see the log's Handoff): it holds what is Focus-, shortcut- and Tiles-shaped, so no other
// file needs a view switch.

const mainheadName = (page: Page) => page.locator("#mainhead .name");

test("the Focus header's control opens Move to with the groups, New group… and No group, and choosing a group moves the focused session to the end of it (REQ-10, flow 8)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["f8-a1", "f8-a2", "f8-b1"]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "PR reviews", [a1.id, a2.id]);
    const groupB = await createGroupViaApi(page, daemon, "Validation", [b1.id]);
    await railCard(page, "f8-a1").click();
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("PR reviews");

    await mainheadGroupButton(page).click();
    await expect(openMenu(page)).toBeVisible();
    for (const name of ["PR reviews", "Validation", "New group…", "No group"]) {
      await expect(menuItem(page, name)).toBeVisible();
    }
    // The mainhead's menu says No group, not Ungrouped.
    await expect(menuItem(page, "Ungrouped")).toHaveCount(0);
    const net = trackMutations(page);
    await menuItem(page, "Validation").click();

    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Validation");
    await expect.poll(() => sectionCardIds(page, groupB.id)).toEqual([b1.id, a1.id]);
    expect(net.requests()).toEqual(["PUT /api/sessions/group"]);
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === a1.id)?.groupId).toBe(groupB.id);
    expect(memberIdsOracle(state, groupB.id)).toEqual([b1.id, a1.id]);
    expect(railInvariantProblems(state)).toEqual([]);
    // Moving never changes which session is focused.
    await expect(mainheadName(page)).toHaveText("f8-a1");

    await mainheadGroupButton(page).click();
    await menuItem(page, "No group").click();
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("no group");
    await expect
      .poll(
        async () =>
          (await getGroupsState(page, daemon)).sessions.find((s) => s.id === a1.id)?.groupId,
      )
      .toBeNull();
  } finally {
    await cleanup();
  }
});

test("New group… in the Focus header's menu names a group that the focused session joins (REQ-1, REQ-10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["f9-one", "f9-two"]);
  try {
    const [one] = sessions;
    if (!one) throw new Error("expected 2 sessions");
    await railCard(page, "f9-one").click();
    await expect(mainheadName(page)).toHaveText("f9-one");

    await mainheadGroupButton(page).click();
    await menuItem(page, "New group…").click();
    // The plan pins no surface for this entry: a name field, wherever it is, takes the name.
    const field = page.getByRole("textbox", { name: "Group name" });
    await expect(field.first()).toBeFocused();
    await page.keyboard.type("From the header");
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name))
      .toEqual(["From the header"]);
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.id === one.id)?.groupId).toBe(state.groups[0]?.id);
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("From the header");
  } finally {
    await cleanup();
  }
});

test("⌥⌘0 with the neediest session in a collapsed section expands that section and focuses the session (REQ-19, E21)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e21-a1", "e21-b1", "e21-u1"]);
  try {
    const [a1, b1, u1] = sessions;
    if (!a1 || !b1 || !u1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Calm", [a1.id]);
    const groupB = await createGroupViaApi(page, daemon, "Busy", [b1.id]);
    await groupCaret(groupHead(page, groupB.id)).click();
    await expect(groupBody(page, groupB.id)).toBeHidden();
    await driveToState(request, daemon, b1, "claude-e21-b1", "needs_input");
    await expect(
      page.locator(
        `#sessions .ghead[data-group-id="${groupB.id}"] .gsum .st[data-state="needs_input"]`,
      ),
    ).toHaveText("1");
    await railCard(page, "e21-u1").click();
    await expect(mainheadName(page)).toHaveText("e21-u1");

    await page.keyboard.press("Alt+Meta+Digit0");

    await expect(mainheadName(page)).toHaveText("e21-b1");
    await expect(groupBody(page, groupB.id)).toBeVisible();
    await expect(groupCaret(groupHead(page, groupB.id))).toHaveAccessibleName("Collapse Busy");
    await expect(railCard(page, "e21-b1")).toHaveAttribute("aria-current", "true");
    await expect
      .poll(
        async () =>
          (await getGroupsState(page, daemon)).groups.find((g) => g.id === groupB.id)?.collapsed,
      )
      .toBe(false);
  } finally {
    await cleanup();
  }
});

test("⌥⌘G in Focus opens a new group in the rail with a focused name field that Enter keeps, and ⌘G or ⌥⇧⌘G alone do nothing (REQ-1, W11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["g1-one", "g1-two"]);
  try {
    await expect(railCard(page, "g1-one")).toBeVisible();
    const field = groupNameInput(page.locator("#sessions"));

    await page.keyboard.press("Meta+KeyG");
    await page.keyboard.press("Alt+Shift+Meta+KeyG");
    await settleFor(page, 500);
    await expect(field).toHaveCount(0);

    await page.keyboard.press("Alt+Meta+KeyG");
    await expect(field).toBeFocused();
    await page.keyboard.type("By chord");
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await getGroupsState(page, daemon)).groups.map((g) => g.name))
      .toEqual(["By chord"]);
    await expect(field).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("⌥⌘G is inert in Tiles: no name field appears, nothing is created, and Focus shows no pending group on return (REQ-1, W11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["g2-one", "g2-two"]);
  try {
    await expect(railCard(page, "g2-one")).toBeVisible();
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.keyboard.press("Alt+Meta+KeyG");
    await settleFor(page, 600);
    await expect(page.getByRole("textbox", { name: "Group name" })).toHaveCount(0);
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);

    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("textbox", { name: "Group name" })).toHaveCount(0);
    await expect(page.locator("#sessions .ghead")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

for (const sort of ["manual", "attention"] as const) {
  test(`Tiles renders the grid and the strip in the flat ${sort} order with no header, section or checkbox, with groups present, one collapsed and the filter set (REQ-21, I7, E23)`, async ({
    page,
    request,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const titles = [
      "t23-n1",
      "t23-n2",
      "t23-f1",
      "t23-f2",
      "t23-work",
      "t23-start",
      "t23-dead",
    ].map((t) => `${t}-${sort}`);
    const { sessions, cleanup } = await launchTitled(page, daemon, titles);
    try {
      const [n1, n2, f1, f2, work, start, dead] = sessions;
      if (!n1 || !n2 || !f1 || !f2 || !work || !start || !dead)
        throw new Error("expected 7 sessions");
      await driveToState(request, daemon, n1, `claude-t23-n1-${sort}`, "needs_input");
      await driveToState(request, daemon, n2, `claude-t23-n2-${sort}`, "needs_input");
      await driveToState(request, daemon, f1, `claude-t23-f1-${sort}`, "failed");
      await driveToState(request, daemon, f2, `claude-t23-f2-${sort}`, "failed");
      await driveToState(request, daemon, work, `claude-t23-work-${sort}`, "working");
      await endSessionViaApi(page, daemon, dead.id);

      // Sections that disagree with the flat order: the strip's sessions sit in two groups whose
      // section order is the reverse of their positions.
      const groupA = await createGroupViaApi(page, daemon, "T23 A", [dead.id, start.id]);
      const groupB = await createGroupViaApi(page, daemon, "T23 B", [work.id]);
      await putGroupsOrderViaApi(page, daemon, [groupB.id, 0, groupA.id]);
      await railSortSelect(page).selectOption(sort);
      await expect(railSortSelect(page)).toHaveValue(sort);
      await groupCaret(groupHead(page, groupA.id)).click();
      await expect(groupBody(page, groupA.id)).toBeHidden();
      await filterButton(page, "Groups").click();
      await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("button", { name: "Tiles" }).click();
      await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
      // The grid holds the four sessions that outrank everything else; a filter or a collapsed
      // section never takes a tile away.
      expect((await tilesGridOrder(page)).slice().sort()).toEqual(
        [n1, n2, f1, f2].map((s) => titles[sessions.indexOf(s)] ?? "").sort(),
      );
      for (const s of [n1, n2, f1, f2])
        await expect(liveTile(page, titles[sessions.indexOf(s)] ?? "")).toBeVisible();

      // The strip: every remaining session, in the rail's flat order. Manual: pinned then position,
      // from the daemon's own fields. Attention: started, then working, then the ended one last.
      // Neither is the sections' order (Busy first, then First), which is what a wrongly sectioned
      // strip would show.
      const state = await getGroupsState(page, daemon);
      const stripIds = new Set([work.id, start.id, dead.id]);
      const expected =
        sort === "manual"
          ? expectedManualOrder(state.sessions).filter((id) => stripIds.has(id))
          : [start.id, work.id, dead.id];
      if (sort === "manual") expect(expected).toEqual([dead.id, start.id, work.id]);
      await expect.poll(() => stripOrderIds(page)).toEqual(expected);

      // No section furniture anywhere in Tiles.
      for (const selector of [".ghead", ".gbody", ".gsum", "#select-bar"]) {
        await expect(page.locator(`#view-tiles ${selector}`)).toHaveCount(0);
      }
      await expect(page.locator("#view-tiles").getByRole("checkbox")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
}
