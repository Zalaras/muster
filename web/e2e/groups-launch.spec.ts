import { expect, test } from "./helpers/fixtures";
import {
  createGroupViaApi,
  deleteGroupViaApi,
  expectFocusAndNodeSurviveTick,
  filterButton,
  getGroupsState,
  groupHead,
  groupName,
  groupNameField,
  groupSelect,
  launchTitledInBrowseRoot,
  memberIdsOracle,
  optionLabels,
  pickBrowseDirectory,
  railInvariantProblems,
  railCount,
  routeGroupsFrames,
  sectionCardIds,
  sectionIds,
  sectionOrderOracle,
  selectedOptionLabel,
} from "./helpers/groups";
import { launchDialog, launchError, modelError, openLaunchDialog } from "./helpers/picker";
import { pinViaApi, railCard } from "./helpers/railorder";
import { launchPrimaryButton, newTab, pastSessionRow, resumeTab } from "./helpers/resume";
import { browseScratchDirectory } from "./helpers/session";

// Plan groups — the launch dialog's Group row on both tabs and the launch's effect on the rail:
// the default from the focused session, New group… created with the session or not at all, a
// launch landing at the end of its section, the filter flipping to All, and a group deleted while
// the dialog is open. Plan acceptance E17-E19, E22 (launch half), with REQ-11, REQ-1, I4 and the
// past-sessions Doc Delta (the Resume tab carries the same row).
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture.
// The launch default reads the sole focused session, and the filter-flip test asserts the
// `n of m` count, which a neighbour's launch on a shared daemon would corrupt.
//
// The dialog opens onto the most recent launch directory, so every setup launches into the
// browse root (`launchTitledInBrowseRoot`) and `pickBrowseDirectory` navigates from there.

const UNRECOGNIZED_MODEL = "muster-e2e-unrecognized-model";

test("the launch dialog's Group row defaults to the focused session's group and lists No group, each group and New group… (REQ-11, E17)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e17-a1",
    "e17-b1",
    "e17-u1",
  ]);
  try {
    const [a1, b1] = sessions;
    if (!a1 || !b1) throw new Error("expected 3 sessions");
    await createGroupViaApi(page, daemon, "Alpha", [a1.id]);
    await createGroupViaApi(page, daemon, "Bravo", [b1.id]);
    await expect(groupHead(page, "ungrouped")).toBeVisible();

    await railCard(page, "e17-a1").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e17-a1");
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
    await railCard(page, "e17-u1").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e17-u1");
    const reopened = await openLaunchDialog(page);
    await expect.poll(() => selectedOptionLabel(groupSelect(reopened))).toBe("No group");
    await expect(groupNameField(reopened)).toBeHidden();
  } finally {
    await cleanup();
  }
});

test("the Resume tab carries the same Group row with the same default (REQ-11, past-sessions, E17)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e17r-a1",
    "e17r-u1",
  ]);
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    await createGroupViaApi(page, daemon, "Alpha", [a1.id]);
    await railCard(page, "e17r-a1").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e17r-a1");

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
  } finally {
    await cleanup();
  }
});

test("a launch dialog opened from Tiles defaults the Group row to the focused session's group (edge case 27, E17)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e17t-a1",
    "e17t-u1",
  ]);
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    await createGroupViaApi(page, daemon, "Alpha", [a1.id]);
    await railCard(page, "e17t-a1").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e17t-a1");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Alt+Meta+KeyN");
    const dialog = launchDialog(page);
    await expect(dialog).toBeVisible();
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Alpha");
  } finally {
    await cleanup();
  }
});

test("choosing New group…, naming it and launching creates the group and the session together, and the new card is its only member and is focused (REQ-1, REQ-11, E18)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, ["e18-a1", "e18-a2"]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-newgroup-");
  try {
    const [a1, a2] = sessions;
    if (!a1 || !a2) throw new Error("expected 2 sessions");
    const groupA = await createGroupViaApi(page, daemon, "PR reviews", [a1.id, a2.id]);
    await railCard(page, "e18-a1").click();

    await page.keyboard.press("Alt+Meta+KeyN");
    const dialog = launchDialog(page);
    await expect(dialog).toBeVisible();
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("PR reviews");
    await groupSelect(dialog).selectOption({ label: "New group…" });
    await groupNameField(dialog).fill("Hotfix");
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e18-hotfix-session");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const state = await getGroupsState(page, daemon);
    const hotfix = state.groups.find((g) => g.name === "Hotfix");
    expect(hotfix, "the launch created the group").toBeDefined();
    expect(state.groups).toHaveLength(2);
    const created = state.sessions.find((s) => s.title === "e18-hotfix-session");
    expect(created?.groupId).toBe(hotfix?.id);
    await expect(groupName(groupHead(page, hotfix?.id ?? -1))).toHaveText("Hotfix");
    await expect.poll(() => sectionCardIds(page, hotfix?.id ?? -1)).toEqual([created?.id]);
    await expect.poll(() => sectionIds(page)).toEqual(sectionOrderOracle(state));
    // The new session is the focused one.
    await expect(railCard(page, "e18-hotfix-session")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#mainhead .name")).toHaveText("e18-hotfix-session");
    // The group it was launched from is untouched.
    expect(await sectionCardIds(page, groupA.id)).toEqual([a1.id, a2.id]);
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("a refused launch with New group… creates neither the group nor the session, and a retry creates exactly one of each (REQ-11, edge case 11, E18)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitledInBrowseRoot(page, daemon, ["e18r-seed"]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-refused-");
  try {
    await expect(railCard(page, "e18r-seed")).toBeVisible();
    const before = (await getGroupsState(page, daemon)).sessions.length;

    const dialog = await openLaunchDialog(page);
    await groupSelect(dialog).selectOption({ label: "New group…" });
    await groupNameField(dialog).fill("Ghost");
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e18r-refused");
    await dialog.getByRole("radio", { name: "other…" }).check();
    await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
    await dialog.getByRole("button", { name: "Launch" }).click();

    await expect(modelError(dialog)).toBeVisible();
    await expect(dialog).toBeVisible();
    const refused = await getGroupsState(page, daemon);
    expect(refused.groups).toEqual([]);
    expect(refused.sessions).toHaveLength(before);
    await expect(page.locator("#sessions .ghead")).toHaveCount(0);
    await expect(page.getByTestId("session-card")).toHaveCount(before);

    // The retry with a recognised model, from the same open dialog, makes both.
    await dialog.getByRole("radio", { name: "sonnet" }).check();
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();
    const done = await getGroupsState(page, daemon);
    expect(done.groups.map((g) => g.name)).toEqual(["Ghost"]);
    expect(done.sessions).toHaveLength(before + 1);
    expect(done.sessions.find((s) => s.title === "e18r-refused")?.groupId).toBe(done.groups[0]?.id);
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("a session launched into an existing group lands at the end of that section, after its pinned block (REQ-11, REQ-23, E18)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e18e-a1",
    "e18e-a2",
    "e18e-u1",
  ]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-end-");
  try {
    const [a1, a2] = sessions;
    if (!a1 || !a2) throw new Error("expected 3 sessions");
    const group = await createGroupViaApi(page, daemon, "Landing", [a1.id, a2.id]);
    await pinViaApi(page, daemon.baseURL, a1.id, true);
    await railCard(page, "e18e-a1").click();

    const dialog = await openLaunchDialog(page);
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Landing");
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e18e-new");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const state = await getGroupsState(page, daemon);
    const created = state.sessions.find((s) => s.title === "e18e-new");
    expect(created?.groupId).toBe(group.id);
    await expect.poll(() => sectionCardIds(page, group.id)).toEqual([a1.id, a2.id, created?.id]);
    expect(memberIdsOracle(state, group.id)).toEqual([a1.id, a2.id, created?.id]);
    expect(railInvariantProblems(state)).toEqual([]);
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("choosing No group while a grouped session is focused launches into Ungrouped and creates no group (REQ-11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e18n-a1",
    "e18n-u1",
  ]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-nogroup-");
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Skipped", [a1.id]);
    await railCard(page, "e18n-a1").click();

    const dialog = await openLaunchDialog(page);
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Skipped");
    await groupSelect(dialog).selectOption({ label: "No group" });
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e18n-loose");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const state = await getGroupsState(page, daemon);
    expect(state.groups.map((g) => g.id)).toEqual([group.id]);
    expect(state.sessions.find((s) => s.title === "e18n-loose")?.groupId).toBeNull();
    await expect.poll(async () => (await sectionCardIds(page, "ungrouped")).length).toBe(2);
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("a session resumed from the Resume tab joins the group chosen there (REQ-11, past-sessions)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [
    "e18p-a1",
    "e18p-u1",
  ]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-resume-");
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Revived", [a1.id]);
    await daemon.writeTranscript(target.path, "claude-groups-resume-e18p", {
      title: "Past work to resume",
      lastPrompt: "carry on where we left off",
      model: "claude-opus-4-1-20250805",
      permissionMode: "plan",
    });
    await railCard(page, "e18p-u1").click();

    const dialog = await openLaunchDialog(page);
    await pickBrowseDirectory(dialog, daemon, target.path);
    await resumeTab(dialog).click();
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("No group");
    await groupSelect(dialog).selectOption({ label: "Revived" });
    await pastSessionRow(dialog, "Past work to resume").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const state = await getGroupsState(page, daemon);
    const resumed = state.sessions.find((s) => s.directory === target.path);
    expect(resumed?.groupId).toBe(group.id);
    await expect.poll(() => sectionCardIds(page, group.id)).toEqual([a1.id, resumed?.id]);
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("a group deleted while the dialog still shows it selected is refused as unknown group in the launch error, launches nothing, and the select drops it on the next render (REQ-11, edge case 28, E19)", async ({
  page,
  daemon,
}) => {
  // The dashboard learns of a delete from the `groups` frame; withholding it keeps the dialog's view
  // stale on purpose, so the refusal is deterministic rather than a race with the 1 s render tick.
  const frames = await routeGroupsFrames(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, ["e19-a1", "e19-u1"]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-gone-");
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    const group = await createGroupViaApi(page, daemon, "Soon gone", [a1.id]);
    await expect(groupName(groupHead(page, group.id))).toHaveText("Soon gone");
    await railCard(page, "e19-a1").click();

    const dialog = await openLaunchDialog(page);
    await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Soon gone");
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e19-never");

    frames.hold();
    await deleteGroupViaApi(page, daemon, group.id, { sessions: "ungroup" });
    expect((await getGroupsState(page, daemon)).groups).toEqual([]);
    expect(await optionLabels(groupSelect(dialog))).toContain("Soon gone");

    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(launchError(dialog)).toBeVisible();
    await expect(launchError(dialog)).toContainText(/unknown group/i);
    await expect(dialog).toBeVisible();
    const state = await getGroupsState(page, daemon);
    expect(state.sessions.find((s) => s.title === "e19-never")).toBeUndefined();
    expect(state.sessions).toHaveLength(2);

    // The next `groups` message corrects the dialog.
    frames.release();
    await expect.poll(() => optionLabels(groupSelect(dialog))).not.toContain("Soon gone");
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

test("launching an ungrouped session while the filter is Groups flips the filter to All, shows the plain total and focuses the new card (I4, E22)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, ["e22-a1", "e22-u1"]);
  const target = await browseScratchDirectory(daemon, "muster-e2e-groups-flip-");
  try {
    const [a1] = sessions;
    if (!a1) throw new Error("expected 2 sessions");
    await createGroupViaApi(page, daemon, "Only these", [a1.id]);
    await filterButton(page, "Groups").click();
    await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "true");
    await expect(railCount(page)).toHaveText("1 of 2");
    await railCard(page, "e22-a1").click();

    const dialog = await openLaunchDialog(page);
    await groupSelect(dialog).selectOption({ label: "No group" });
    await pickBrowseDirectory(dialog, daemon, target.path);
    await dialog.getByLabel("Title").fill("e22-new");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    await expect(filterButton(page, "All")).toHaveAttribute("aria-pressed", "true");
    await expect(filterButton(page, "Groups")).toHaveAttribute("aria-pressed", "false");
    await expect(railCount(page)).toHaveText("3");
    await expect(railCard(page, "e22-new")).toBeVisible();
    await expect(railCard(page, "e22-new")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#mainhead .name")).toHaveText("e22-new");
  } finally {
    await target.cleanup();
    await cleanup();
  }
});

for (const tab of ["New", "Resume"] as const) {
  test(`the ${tab} tab's Group select keeps focus, the same node and its choice across a render tick after typeahead (REQ-11)`, async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    const { sessions, cleanup } = await launchTitledInBrowseRoot(page, daemon, [`tickg-${tab}-a1`]);
    try {
      await createGroupViaApi(page, daemon, "Zed", [sessions[0]?.id ?? -1]);
      await createGroupViaApi(page, daemon, "Yarrow");
      const dialog = await openLaunchDialog(page);
      if (tab === "Resume") await resumeTab(dialog).click();
      await expect(groupSelect(dialog)).toBeVisible();

      // One typeahead key picks the option starting with it ("Yarrow"; the default was "Zed"). A
      // control rebuilt by the render tick loses focus and its choice together
      // (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
      await expectFocusAndNodeSurviveTick(page, groupSelect(dialog), "KeyY", async () => {
        await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Yarrow");
      });
      await expect.poll(() => selectedOptionLabel(groupSelect(dialog))).toBe("Yarrow");
    } finally {
      await cleanup();
    }
  });
}

test("the New group… name field keeps focus, its node and what was typed across a render tick (REQ-11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitledInBrowseRoot(page, daemon, ["tickn-one"]);
  try {
    await createGroupViaApi(page, daemon, "Existing");
    const dialog = await openLaunchDialog(page);
    await groupSelect(dialog).selectOption({ label: "New group…" });
    await expect(groupNameField(dialog)).toBeVisible();

    await expectFocusAndNodeSurviveTick(page, groupNameField(dialog), "KeyQ", async () => {
      await expect(groupNameField(dialog)).toHaveValue("q");
    });
    await expect(groupNameField(dialog)).toHaveValue("q");
    await expect(groupSelect(dialog)).toBeVisible();
    expect(await selectedOptionLabel(groupSelect(dialog))).toBe("New group…");
  } finally {
    await cleanup();
  }
});
