import { expect, type Page, type ScratchDaemon, settleFor, test } from "./helpers/fixtures";
import {
  barButton,
  cardCheckbox,
  createGroupViaApi,
  deleteGroupDialog,
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
  newGroupModal,
  openGroupMenu,
  openMenu,
  putGroupsOrderViaApi,
  railCount,
  railInvariantProblems,
  sectionCardIds,
  selectToggle,
  bulkRemoveDialog,
  memberIdsOracle,
  trackMutations,
  updateGroupViaApi,
  visibleRailCardIds,
  setMainheadContentWidth,
  setMainheadWidth,
} from "./helpers/groups";
import {
  mainheadFitProblems,
  mainheadBranch,
  mainheadFolder,
  scratchRepo,
} from "./helpers/card-location";
import { expectedManualOrder, railCard, railSortSelect, stripOrderIds } from "./helpers/railorder";
import { launchSession } from "./helpers/session";
import { resolvedCssVar } from "./helpers/theme";
import { liveTile, tilesGridOrder } from "./helpers/terminal";

// Plan groups — the Focus header's group control, the keyboard chords over sections, and Tiles
// ignoring groups. Plan acceptance E20-E23, E26, E27, with REQ-10, REQ-19, REQ-25 and invariants
// I4, I5 and I7, plus the Focus feature's default-focus Doc Delta.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture.
// The chords index the whole displayed rail, the default-focus pick reads the sole focused session
// and Tiles membership is a function of the daemon's total sessions, all daemon-global. This file
// is an addition beside the plan's three named spec files (see the log's Handoff): it holds what
// is Focus-, shortcut- and Tiles-shaped, so no other file needs a view switch.

const mainheadName = (page: Page) => page.locator("#mainhead .name");

test("the Focus header shows the focused session's group between the name and the repo readout, and no group for an ungrouped one (REQ-10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["r10-a1", "r10-u1"]);
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    await createGroupViaApi(page, daemon, "Alpha", [a1.id]);

    await railCard(page, "r10-a1").click();
    await expect(mainheadName(page)).toHaveText("r10-a1");
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
    await expect(control).toHaveCSS(
      "border-top-color",
      await resolvedCssVar(page, "--line-control"),
    );
    await expect(control).toHaveCSS("color", await resolvedCssVar(page, "--fg-dim"));

    await railCard(page, "r10-u1").click();
    await expect(mainheadName(page)).toHaveText("r10-u1");
    await expect(control).toHaveAccessibleName("no group");
  } finally {
    await cleanup();
  }
});

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

test("the Focus header's group control keeps its node and its open menu across a render tick when opened from the keyboard (REQ-10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["tickh-one"]);
  try {
    await createGroupViaApi(page, daemon, "Header tick", [sessions[0]?.id ?? -1]);
    await railCard(page, "tickh-one").click();
    const control = mainheadGroupButton(page);
    await expect(control).toHaveAccessibleName("Header tick");

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
  } finally {
    await cleanup();
  }
});

// The Focus header at the four widths the plan names, measured on the header itself (the control's
// 640px rule is a container query on the header's own width, not the window's). A long title proves
// the title floor; a scratch repo gives the repo and branch readout something to keep whole.
const LONG_TITLE = "rework shift-swap approval for the weekend rostering rule changes";
const REPO_FOLDER = "muster-app";

async function titleFloorAndReadoutProblems(page: Page, repoName: string): Promise<string[]> {
  const problems: string[] = [];
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const title = await page.locator("#mainhead h2.name").boundingBox();
  if (!title || title.width < 6 * rem - 1) {
    problems.push(`title is ${title?.width ?? 0}px wide, under its ${6 * rem}px floor`);
  }
  for (const [label, line, text] of [
    ["folder", mainheadFolder(page), `${repoName} /`],
    ["branch", mainheadBranch(page), "main"],
  ] as const) {
    const whole = await line.evaluate((el) => el.scrollWidth <= el.clientWidth);
    const shown = (await line.textContent())?.trim();
    if (!whole) problems.push(`${label} text is truncated`);
    if (shown !== text)
      problems.push(`${label} reads ${JSON.stringify(shown)}, not ${JSON.stringify(text)}`);
  }
  return problems;
}

// A long folder (`muster-app /`, 12 characters) is held to the repo block's floor rule, not to
// "reads whole": REQ-10 and E27 were amended 2026-10-05 (user decision,
// plans/groups/decisions/focus-header-floor-rule/decision.md, kb:adr/focus-repo-block-keeps-floor-beside-group-control).
// The block is present (never hidden) and its folder line is at least 8 characters wide, measured
// against a clone of the line itself so the font, and so the `ch` unit, is the line's own. The
// title keeps its 6rem floor exactly as before.
async function titleAndRepoFloorProblems(page: Page, repoName: string): Promise<string[]> {
  const problems: string[] = [];
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const title = await page.locator("#mainhead h2.name").boundingBox();
  if (!title || title.width < 6 * rem - 1) {
    problems.push(`title is ${title?.width ?? 0}px wide, under its ${6 * rem}px floor`);
  }
  const folder = mainheadFolder(page);
  if ((await folder.count()) !== 1) return [...problems, "the repo block's folder line is absent"];
  const measured = await folder.evaluate((el) => {
    const probe = el.cloneNode(false) as HTMLElement;
    probe.textContent = "";
    probe.style.maxWidth = "none";
    probe.style.width = "8ch";
    el.after(probe);
    const floor = probe.getBoundingClientRect().width;
    probe.remove();
    const box = el.getBoundingClientRect();
    return {
      width: box.width,
      floor,
      display: getComputedStyle(el).display,
      repoDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : "none",
    };
  });
  if (measured.display === "none" || measured.repoDisplay === "none") {
    problems.push("the repo block is hidden");
  }
  if (measured.floor <= 0) problems.push("the 8-character reference measured no width");
  if (measured.width < measured.floor - 1) {
    problems.push(
      `folder line is ${measured.width.toFixed(1)}px wide, under its 8-character floor of ${measured.floor.toFixed(1)}px`,
    );
  }
  const shown = (await folder.textContent())?.trim();
  if (shown !== `${repoName} /`) {
    problems.push(`folder reads ${JSON.stringify(shown)}, not ${JSON.stringify(`${repoName} /`)}`);
  }
  const branch = (await mainheadBranch(page).textContent())?.trim();
  if (branch !== "main") problems.push(`branch reads ${JSON.stringify(branch)}, not "main"`);
  return problems;
}

type FloorCheck = (page: Page, repoName: string) => Promise<string[]>;

// The repo block's floor is 8 characters (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow):
// `muster /` is exactly that, so it can never be truncated, where `muster-app /` (12) is
// ellipsized by the unchanged title-first layout at every width but 1140 (measured on the base
// commit 41a4469 with no group control in the tree).
const FLOOR_FOLDER = "muster";

async function expectHeaderAtWidth(
  page: Page,
  daemon: ScratchDaemon,
  folder: string,
  width: number,
  present: boolean,
  check: FloorCheck,
): Promise<void> {
  const repo = await scratchRepo(folder);
  try {
    await page.setViewportSize({ width: 1500, height: 800 });
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: repo.path,
      title: LONG_TITLE,
    });
    await createGroupViaApi(page, daemon, "Wide control", [session.id]);
    await railCard(page, LONG_TITLE).click();
    await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
    await expect(mainheadBranch(page)).toHaveText("main");
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Wide control");

    const settled = await setMainheadWidth(page, width);
    expect(Math.abs(settled - width)).toBeLessThanOrEqual(1);
    if (present) {
      await expect(mainheadGroupButton(page)).toBeVisible();
    } else {
      await expect(mainheadGroupButton(page)).toBeHidden();
      await expect(mainheadGroupButton(page)).toHaveCSS("display", "none");
    }
    await expect.poll(() => check(page, repo.name)).toEqual([]);
    await expect.poll(() => mainheadFitProblems(page)).toEqual([]);
  } finally {
    await repo.cleanup();
  }
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
    daemon,
  }) => {
    await expectHeaderAtWidth(page, daemon, REPO_FOLDER, width, present, titleAndRepoFloorProblems);
  });
}

for (const [width, present] of WIDTH_CASES) {
  test(`at a header width of ${width}px a folder within the repo block's floor reads whole beside the group control, which is ${present ? "present" : "absent"}, under a long title (REQ-10, E27)`, async ({
    page,
    daemon,
  }) => {
    await expectHeaderAtWidth(
      page,
      daemon,
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
    daemon,
  }) => {
    await page.setViewportSize({ width: 1500, height: 800 });
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, ["e27b-one"]);
    try {
      await createGroupViaApi(page, daemon, "Boundary", [sessions[0]?.id ?? -1]);
      await railCard(page, "e27b-one").click();
      await expect(mainheadGroupButton(page)).toHaveAccessibleName("Boundary");

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
    } finally {
      await cleanup();
    }
  });
}

async function expectSweepHolds(
  page: Page,
  daemon: ScratchDaemon,
  folder: string,
  check: FloorCheck,
): Promise<void> {
  const repo = await scratchRepo(folder);
  try {
    await page.setViewportSize({ width: 1500, height: 800 });
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: repo.path, title: LONG_TITLE });
    await createGroupViaApi(page, daemon, "Swept", [session.id]);
    await railCard(page, LONG_TITLE).click();
    await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
    await expect(mainheadGroupButton(page)).toHaveAccessibleName("Swept");

    const widths: number[] = [];
    for (let w = 900; w >= 480; w -= 20) widths.push(w);
    for (const width of [...widths, ...[...widths].reverse()]) {
      const settled = await setMainheadWidth(page, width);
      // A container query measures the content box, 28px inside the header's own box: the band
      // around 640 is the rule's own edge, so only widths clear of it assert presence or absence.
      if (settled >= 680) await expect(mainheadGroupButton(page), `at ${settled}px`).toBeVisible();
      if (settled <= 600) await expect(mainheadGroupButton(page), `at ${settled}px`).toBeHidden();
      await expect.poll(() => check(page, repo.name), { message: `at ${settled}px` }).toEqual([]);
      await expect
        .poll(() => mainheadFitProblems(page), { message: `at ${settled}px` })
        .toEqual([]);
    }
  } finally {
    await repo.cleanup();
  }
}

test("sweeping the header width from 900px down to 480px and back, the group control is present exactly while the header is wide, and the title floor and the repo block's 8-character floor hold at every step (REQ-10, E27)", async ({
  page,
  daemon,
}) => {
  await expectSweepHolds(page, daemon, REPO_FOLDER, titleAndRepoFloorProblems);
});

test("sweeping the header width from 900px down to 480px and back, a folder within the repo block's floor reads whole at every step beside a group control present exactly while the header is wide (REQ-10, E27)", async ({
  page,
  daemon,
}) => {
  await expectSweepHolds(page, daemon, FLOOR_FOLDER, titleFloorAndReadoutProblems);
});

for (const sort of ["manual", "attention"] as const) {
  test(`⌥⌘1 and ⌥⌘2 count the cards as displayed in ${sort} sort, skipping a collapsed section (REQ-19, I5, E20)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, [
      `e20-${sort}-a1`,
      `e20-${sort}-a2`,
      `e20-${sort}-b1`,
      `e20-${sort}-u1`,
    ]);
    try {
      const [a1, a2, b1, u1] = sessions;
      if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
      const groupA = await createGroupViaApi(page, daemon, "First", [a1.id, a2.id]);
      await createGroupViaApi(page, daemon, "Second", [b1.id]);
      await railSortSelect(page).selectOption(sort);
      await expect(railSortSelect(page)).toHaveValue(sort);
      await groupCaret(groupHead(page, groupA.id)).click();
      await expect(groupBody(page, groupA.id)).toBeHidden();
      // Displayed: Second's card, then the ungrouped one. The first section's two are not.
      await expect.poll(() => visibleRailCardIds(page)).toEqual([b1.id, u1.id]);

      await railCard(page, `e20-${sort}-u1`).click();
      await expect(mainheadName(page)).toHaveText(`e20-${sort}-u1`);
      // The third card in DOM order is the first one displayed.
      await page.keyboard.press("Alt+Meta+Digit1");
      await expect(mainheadName(page)).toHaveText(`e20-${sort}-b1`);
      await page.keyboard.press("Alt+Meta+Digit2");
      await expect(mainheadName(page)).toHaveText(`e20-${sort}-u1`);
      // There is no third displayed card: the chord leaves the focus where it was.
      await page.keyboard.press("Alt+Meta+Digit3");
      await settleFor(page, 500);
      await expect(mainheadName(page)).toHaveText(`e20-${sort}-u1`);
    } finally {
      await cleanup();
    }
  });
}

test("with the filter on Groups ⌥⌘1 focuses the first grouped card and the chords never reach a filtered-out card (REQ-17, REQ-19, I5, E20)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "e20g-a1",
    "e20g-a2",
    "e20g-b1",
    "e20g-u1",
  ]);
  try {
    const [a1, a2, b1, u1] = sessions;
    if (!a1 || !a2 || !b1 || !u1) throw new Error("expected 4 sessions");
    await createGroupViaApi(page, daemon, "Grouped A", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "Grouped B", [b1.id]);
    await filterButton(page, "Groups").click();
    await expect(railCount(page)).toHaveText("3 of 4");
    await expect.poll(() => visibleRailCardIds(page)).toEqual([a1.id, a2.id, b1.id]);

    await railCard(page, "e20g-b1").click();
    await expect(mainheadName(page)).toHaveText("e20g-b1");
    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(mainheadName(page)).toHaveText("e20g-a1");
    await page.keyboard.press("Alt+Meta+Digit3");
    await expect(mainheadName(page)).toHaveText("e20g-b1");
    // The fourth card in DOM order is filtered out, so a fourth displayed card does not exist.
    await page.keyboard.press("Alt+Meta+Digit4");
    await settleFor(page, 500);
    await expect(mainheadName(page)).toHaveText("e20g-b1");
    await expect(railCard(page, "e20g-u1")).toBeHidden();
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

test("⌥⌘0 onto a grouped needs-input session while the filter is Ungrouped flips the filter to All (I4, E22)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["e22z-b1", "e22z-u1", "e22z-u2"]);
  try {
    const [b1] = sessions;
    if (!b1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Hidden", [b1.id]);
    await driveToState(request, daemon, b1, "claude-e22z-b1", "needs_input");
    await filterButton(page, "Ungrouped").click();
    await expect(railCount(page)).toHaveText("2 of 3");
    await railCard(page, "e22z-u1").click();
    await expect(mainheadName(page)).toHaveText("e22z-u1");

    await page.keyboard.press("Alt+Meta+Digit0");

    await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(railCount(page)).toHaveText("3");
    await expect(mainheadName(page)).toHaveText("e22z-b1");
    await expect(railCard(page, "e22z-b1")).toBeVisible();
    await expect(railCard(page, "e22z-b1")).toHaveAttribute("aria-current", "true");
  } finally {
    await cleanup();
  }
});

test("a page load lands default focus on the first displayed card when the first section is collapsed (focus Doc Delta)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["df-a1", "df-a2", "df-b1"]);
  try {
    const [a1, a2, b1] = sessions;
    if (!a1 || !a2 || !b1) throw new Error("expected 3 sessions");
    const groupA = await createGroupViaApi(page, daemon, "Tucked", [a1.id, a2.id]);
    await createGroupViaApi(page, daemon, "Shown", [b1.id]);
    await updateGroupViaApi(page, daemon, groupA.id, { collapsed: true });

    await page.reload();
    await expect(groupBody(page, groupA.id)).toBeHidden();
    await expect(mainheadName(page)).toHaveText("df-b1");
    await expect(railCard(page, "df-b1")).toHaveAttribute("aria-current", "true");
  } finally {
    await cleanup();
  }
});

const INERT_CASES = [
  "the Delete group dialog",
  "the New group from selection modal",
  "a bulk Remove dialog",
] as const;

for (const which of INERT_CASES) {
  test(`⌥⌘1 and ⌥⌘0 change nothing while ${which} is open (edge case 17, E26)`, async ({
    page,
    request,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitled(page, daemon, ["e26-a1", "e26-b1", "e26-u1"]);
    try {
      const [a1, b1] = sessions;
      if (!a1 || !b1) throw new Error("expected 3 sessions");
      const groupA = await createGroupViaApi(page, daemon, "Dialog A", [a1.id]);
      await createGroupViaApi(page, daemon, "Dialog B", [b1.id]);
      await driveToState(request, daemon, b1, "claude-e26-b1", "needs_input");
      await railCard(page, "e26-u1").click();
      await expect(mainheadName(page)).toHaveText("e26-u1");

      let dialog = page.getByRole("dialog");
      if (which === "the Delete group dialog") {
        await openGroupMenu(page, groupHead(page, groupA.id));
        await menuItem(page, "Delete group…").click();
        dialog = deleteGroupDialog(page, "Dialog A");
      } else if (which === "the New group from selection modal") {
        await selectToggle(page).click();
        await cardCheckbox(page, "e26-a1").check();
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
      await expect(mainheadName(page)).toHaveText("e26-u1");
      await expect(railCard(page, "e26-u1")).toHaveAttribute("aria-current", "true");
      expect(net.requests()).toEqual([]);
    } finally {
      await cleanup();
    }
  });
}

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
