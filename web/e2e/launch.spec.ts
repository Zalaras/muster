import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "./helpers/fixtures";
import {
  childEntry,
  composedCrumbPath,
  crumbButton,
  crumbsNav,
  currentCrumb,
  launchDialog,
  launchError,
  launchTargetBranch,
  launchTargetPath,
  openLaunchDialog,
  recentButton,
  recentsSidebar,
} from "./helpers/picker";
import {
  browseScratchDirectory,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
  waitForNextClockSecond,
} from "./helpers/session";

const execFileAsync = promisify(execFile);

// Plan new-session-dialog: the launch dialog rebuilt as a Finder-style picker (recents
// sidebar + clickable breadcrumb + one child listing where the listed directory *is*
// the selection) with segmented Model/Start-in controls. This file replaces the M1
// Browse…/Up/Use-this-folder flow entirely — those controls no longer exist (REQ-2).
//
// REQ-1..18, INV-1..4. Plan acceptance: E1-E15.
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts): the recents list
// is daemon-global, and the dialog opens straight onto the most recent recent (REQ-8) —
// so even the browse-only tests assume "no recents, opened at the browse root", which a
// neighbour test's launch on a shared daemon would break. Order/count/pressed-state
// assertions on the sidebar need the same isolation.

test("opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed M1 controls (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);
  await expect(dialog).toBeVisible();

  // REQ-2: no Browse… button, no unfold panel, no Up button, no Use this folder
  // button, no raw path field survives the rebuild.
  await expect(dialog.getByRole("button", { name: "Browse…" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Up" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Use this folder" })).toHaveCount(0);
  for (const removedId of ["#browse-button", "#browse-panel", "#browse-up", "#use-this-folder", "#selected-directory"]) {
    await expect(dialog.locator(removedId)).toHaveCount(0);
  }

  // REQ-16: no recents -> sidebar empty state, no recent buttons at all.
  await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
  await expect(recentsSidebar(dialog).getByRole("button")).toHaveCount(0);

  // E2 / edge case 1: opened on the browse root — crumbs compose to it, footer echoes
  // it, and (implicitly, via the empty sidebar above) nothing is pressed.
  const rootName = basename(daemon.browseRoot);
  await expect(currentCrumb(dialog)).toHaveText(rootName);
  await expect(launchTargetPath(dialog)).toHaveText(daemon.browseRoot);
  // INV-1 (review cycle 1 Major 5): the composed ancestor chain, not just the crumb
  // bar's basename, must equal the readout — here, opened with no recents, at root.
  expect(await composedCrumbPath(dialog)).toBe(daemon.browseRoot);

  // Testable UI Elements: Title, Model group (5 options incl. fable), Start in group.
  await expect(dialog.getByLabel("Title")).toBeVisible();
  for (const model of ["sonnet", "opus", "haiku", "fable", "other…"]) {
    await expect(dialog.getByRole("radio", { name: model })).toBeVisible();
  }
  await expect(dialog.getByLabel("Custom model")).not.toBeVisible();
  await dialog.getByRole("radio", { name: "other…" }).check();
  await expect(dialog.getByLabel("Custom model")).toBeVisible();

  // REQ-1: renamed to Claude Code's own vocabulary, plus the new `auto` fourth radio,
  // in Shift+Tab cycle order.
  for (const mode of ["manual", "accept edits", "plan", "auto"]) {
    await expect(dialog.getByRole("radio", { name: mode })).toBeVisible();
  }

  await expect(dialog.getByRole("button", { name: "Launch" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("opening the dialog with two prior launches lists both recents, marks the most recent pressed, and restores its model/mode/branch (REQ-7, REQ-8, REQ-17, E1)", async ({
  page,
  daemon,
}) => {
  const older = await browseScratchDirectory(daemon, "muster-e2e-older-");
  const newer = await browseScratchDirectory(daemon, "muster-e2e-newer-");
  try {
    await execFileAsync("git", ["init"], { cwd: newer.path });
    // An unborn branch resolves to nothing (internal/gitutil.Branch: `rev-parse
    // --abbrev-ref HEAD` errors before any commit exists) — commit so the daemon can
    // read a real branch name, matching REQ-17's "never invent one" the other way:
    // this fixture must genuinely have a branch to show one.
    await execFileAsync(
      "git",
      ["-c", "user.email=e2e@muster.test", "-c", "user.name=muster-e2e", "commit", "--allow-empty", "-m", "init"],
      { cwd: newer.path },
    );
    // Independent oracle for REQ-17's exact value (review cycle 1 Major 2): the
    // fixture's own git checkout, not the daemon's rendering of it. A regex like
    // `/^ · \S+$/` would pass against an invented branch name just as happily.
    const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: newer.path,
    });
    const branch = branchOut.trim();

    await page.goto(daemon.dashboardUrl);
    const olderLaunch = await launchSession(page, daemon, {
      directory: older.path,
      title: "older-seed",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(olderLaunch.state).toBe("started");
    await waitForNextClockSecond();
    const newerLaunch = await launchSession(page, daemon, {
      directory: newer.path,
      title: "newer-seed",
      model: "opus",
      permissionMode: "acceptEdits",
    });
    expect(newerLaunch.state).toBe("started");

    const dialog = await openLaunchDialog(page);
    const newerName = basename(newer.path);
    const olderName = basename(older.path);

    const newerRecent = recentButton(dialog, newerName);
    const olderRecent = recentButton(dialog, olderName);
    await expect(newerRecent).toBeVisible();
    await expect(olderRecent).toBeVisible();
    await expect(newerRecent).toHaveAttribute("aria-pressed", "true");
    await expect(olderRecent).toHaveAttribute("aria-pressed", "false");

    // kb:anchor/repos.list: served `pinned DESC, lastLaunchedAt DESC` — the newer launch is
    // first in DOM order, not just present. Trim: the button's textContent carries the
    // template's own indentation whitespace before `.dir-name` (harmless in the
    // browser's accessible-name computation, which normalizes it, but not in raw
    // `textContent`).
    const recentTexts = await recentsSidebar(dialog)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
    expect(recentTexts[0]?.startsWith(newerName)).toBe(true);

    await expect(currentCrumb(dialog)).toHaveText(newerName);
    await expect(launchTargetPath(dialog)).toHaveText(newer.path);
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after open with recents.
    expect(await composedCrumbPath(dialog)).toBe(newer.path);
    await expect(launchTargetBranch(dialog)).toBeVisible();
    expect(await launchTargetBranch(dialog).innerText()).toBe(` · ${branch}`);

    await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    // REQ-1: was named for the old shorthand; the stored value is still `acceptEdits`.
    await expect(dialog.getByRole("radio", { name: "accept edits" })).toBeChecked();
  } finally {
    await older.cleanup();
    await newer.cleanup();
  }
});

test("clicking a child entry descends into it, updating the crumb bar and Launch in, and marks a git checkout (REQ-4, REQ-5, E3)", async ({
  page,
  daemon,
}) => {
  const parent = await browseScratchDirectory(daemon);
  try {
    const childName = "child-repo";
    const plainSiblingName = "plain-sibling";
    await mkdir(join(parent.path, childName));
    await mkdir(join(parent.path, plainSiblingName));
    await execFileAsync("git", ["init"], { cwd: join(parent.path, childName) });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);

    const parentName = basename(parent.path);
    await childEntry(dialog, parentName).click();
    await expect(currentCrumb(dialog)).toHaveText(parentName);
    await expect(launchTargetPath(dialog)).toHaveText(parent.path);
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after a child click.
    expect(await composedCrumbPath(dialog)).toBe(parent.path);

    // The entry's `.chev` glyph (›) is `aria-hidden` (Testable UI Elements) — it stays
    // in `textContent` regardless, so pin the git suffix via the computed accessible
    // name (which correctly excludes it) rather than `toHaveText`.
    const childButton = childEntry(dialog, childName);
    await expect(childButton).toHaveAccessibleName(`${childName} (git)`);
    // Negative half (review cycle 1 Major 3, restoring 3e76d66's regression coverage):
    // a plain subdirectory sitting right beside the git checkout must NOT be marked —
    // an implementation that appended "(git)" to every entry would otherwise pass.
    const plainSiblingButton = childEntry(dialog, plainSiblingName);
    await expect(plainSiblingButton).toHaveAccessibleName(plainSiblingName);
    await childButton.click();

    await expect(currentCrumb(dialog)).toHaveText(childName);
    await expect(crumbButton(dialog, parentName)).toBeVisible();
    await expect(launchTargetPath(dialog)).toHaveText(join(parent.path, childName));
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after a second descend.
    expect(await composedCrumbPath(dialog)).toBe(join(parent.path, childName));
  } finally {
    await parent.cleanup();
  }
});

test("clicking an ancestor crumb navigates up, and the previously-current directory reappears as an entry (REQ-5, E4)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    await childEntry(dialog, dirName).click();
    await expect(currentCrumb(dialog)).toHaveText(dirName);

    const rootName = basename(daemon.browseRoot);
    await crumbButton(dialog, rootName).click();

    await expect(currentCrumb(dialog)).toHaveText(rootName);
    await expect(childEntry(dialog, dirName)).toBeVisible();
    await expect(launchTargetPath(dialog)).toHaveText(daemon.browseRoot);
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after a crumb click.
    expect(await composedCrumbPath(dialog)).toBe(daemon.browseRoot);
  } finally {
    await dir.cleanup();
  }
});

test("Cmd+ArrowUp navigates to the parent, and is a no-op at the filesystem root (REQ-6, E5)", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    await childEntry(dialog, dirName).click();
    await expect(currentCrumb(dialog)).toHaveText(dirName);

    await page.keyboard.press("Meta+ArrowUp");
    const rootName = basename(daemon.browseRoot);
    await expect(currentCrumb(dialog)).toHaveText(rootName);
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after ⌘↑.
    expect(await composedCrumbPath(dialog)).toBe(daemon.browseRoot);

    // Jump straight to the filesystem root via its own crumb (always the first
    // ancestor, REQ-5) rather than pressing Cmd+Up once per remaining ancestor.
    await crumbButton(dialog, "/").click();
    await expect(currentCrumb(dialog)).toHaveText("/");
    await expect(crumbsNav(dialog).getByRole("button")).toHaveCount(0);
    expect(await composedCrumbPath(dialog)).toBe("/");

    await page.keyboard.press("Meta+ArrowUp");
    await expect(currentCrumb(dialog)).toHaveText("/");
    await expect(crumbsNav(dialog).getByRole("button")).toHaveCount(0);
    // ⌘↑'s no-op at root: composed path is still bare "/", not "//".
    expect(await composedCrumbPath(dialog)).toBe("/");
  } finally {
    await dir.cleanup();
  }
});

test("clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6)", async ({ page, daemon }) => {
  const first = await browseScratchDirectory(daemon, "muster-e2e-first-");
  const second = await browseScratchDirectory(daemon, "muster-e2e-second-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: first.path,
      title: "first-seed",
      model: "haiku",
      permissionMode: "default",
    });
    await waitForNextClockSecond();
    await launchSession(page, daemon, {
      directory: second.path,
      title: "second-seed",
      model: "opus",
      permissionMode: "acceptEdits",
    });

    const dialog = await openLaunchDialog(page);
    const firstName = basename(first.path);
    const secondName = basename(second.path);

    // `second` is the most recent — pressed on open.
    await expect(recentButton(dialog, secondName)).toHaveAttribute("aria-pressed", "true");

    await recentButton(dialog, firstName).click();

    await expect(recentButton(dialog, firstName)).toHaveAttribute("aria-pressed", "true");
    await expect(recentButton(dialog, secondName)).toHaveAttribute("aria-pressed", "false");
    // INV-2 (review cycle 1 Minor 4): "at most one" pressed, properly — a count over
    // the whole sidebar, not just the two named buttons individually true/false.
    await expect(recentsSidebar(dialog).locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    // REQ-1: was named "default"; the stored value is still `default`.
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
    await expect(currentCrumb(dialog)).toHaveText(firstName);
    await expect(launchTargetPath(dialog)).toHaveText(first.path);
    // INV-1 (review cycle 1 Major 5): composed ancestor chain after a recent click.
    expect(await composedCrumbPath(dialog)).toBe(first.path);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

test("navigating to a child of the pressed recent clears every aria-pressed mark, and navigating back onto it via crumbs re-sets it (INV-2, E7)", async ({
  page,
  daemon,
}) => {
  const recentDir = await browseScratchDirectory(daemon, "muster-e2e-recent-");
  try {
    await mkdir(join(recentDir.path, "child-of-recent"));
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: recentDir.path, title: "recent-seed" });

    const dialog = await openLaunchDialog(page);
    const recentName = basename(recentDir.path);
    await expect(recentButton(dialog, recentName)).toHaveAttribute("aria-pressed", "true");
    // Opens straight onto the recent, so its own listing (its children) is showing.
    await expect(currentCrumb(dialog)).toHaveText(recentName);

    await childEntry(dialog, "child-of-recent").click();

    await expect(recentButton(dialog, recentName)).toHaveAttribute("aria-pressed", "false");
    await expect(recentsSidebar(dialog).locator('[aria-pressed="true"]')).toHaveCount(0);

    // INV-2's untested "may set" direction (review cycle 1 Minor 4): navigating back
    // *onto* the recent's own path via its ancestor crumb must re-set the mark —
    // "pressed iff path matches", not "pressed iff clicked directly".
    await crumbButton(dialog, recentName).click();
    await expect(currentCrumb(dialog)).toHaveText(recentName);
    await expect(recentButton(dialog, recentName)).toHaveAttribute("aria-pressed", "true");
    await expect(recentsSidebar(dialog).locator('[aria-pressed="true"]')).toHaveCount(1);
  } finally {
    await recentDir.cleanup();
  }
});

test("launching with no interaction after open relaunches the first recent's directory with its last model and mode (REQ-8, E8)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    const seed = await launchSession(page, daemon, {
      directory: dir.path,
      title: "seed-for-relaunch",
      model: "opus",
      permissionMode: "acceptEdits",
    });
    expect(seed.state).toBe("started");

    await page.keyboard.press("Alt+Meta+KeyN");
    const dialog = launchDialog(page);
    await expect(dialog).toBeVisible();
    await expect(recentButton(dialog, basename(dir.path))).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    // REQ-1: was named for the old shorthand; the stored value is still `acceptEdits`.
    await expect(dialog.getByRole("radio", { name: "accept edits" })).toBeChecked();
    await expect(launchTargetPath(dialog)).toHaveText(dir.path);

    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();

    // Oracle: GET /api/state (independent of the dialog's own rendering) — a second
    // session in the same directory, carrying the recent's last model/mode.
    const state = await getState(page, daemon);
    // review cycle 1 Minor 5: `.find()` would miss a spurious extra launch — assert
    // the count, not just that at least one match exists.
    const relaunchedMatches = state.sessions.filter((s) => s.directory === dir.path && s.id !== seed.id);
    expect(relaunchedMatches, "exactly one relaunch in the same directory, no spurious extra").toHaveLength(1);
    const [relaunched] = relaunchedMatches;
    if (!relaunched) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(relaunched.model?.id).toBe("opus");
    expect(relaunched.permissionMode.value).toBe("acceptEdits");
  } finally {
    await dir.cleanup();
  }
});

test("launching into a fresh directory reached via crumbs and entries creates the session there (REQ-4, REQ-5, E9)", async ({
  page,
  daemon,
}) => {
  const parent = await browseScratchDirectory(daemon);
  try {
    const childName = "fresh-target";
    await mkdir(join(parent.path, childName));

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);

    await childEntry(dialog, basename(parent.path)).click();
    await childEntry(dialog, childName).click();
    await expect(launchTargetPath(dialog)).toHaveText(join(parent.path, childName));

    await dialog.getByLabel("Title").fill("fresh-via-picker");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const card = sessionCard(page, "fresh-via-picker");
    await expect(card).toBeVisible();
    await expect(card.getByText(/first launch here/i)).toBeVisible();

    const state = await getState(page, daemon);
    // review cycle 1 Minor 5: assert a count, not just find-the-first-match.
    const launchedMatches = state.sessions.filter((s) => s.title === "fresh-via-picker");
    expect(launchedMatches).toHaveLength(1);
    const [launched] = launchedMatches;
    if (!launched) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(launched.directory).toBe(join(parent.path, childName));

    // REQ-14: existing launch behaviour outside the dialog's internals is unchanged —
    // settings.local.json is still written before the 201 (D7, plan m1-sessions).
    await expect(access(join(parent.path, childName, ".claude", "settings.local.json"))).resolves.toBeUndefined();
  } finally {
    await parent.cleanup();
  }
});

test("choosing fable launches with model=fable (REQ-9, E10)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await dialog.getByRole("radio", { name: "fable" }).check();
  await dialog.getByLabel("Title").fill("fable-launch");
  await dialog.getByRole("button", { name: "Launch" }).click();
  await expect(dialog).toBeHidden();

  const state = await getState(page, daemon);
  // review cycle 1 Minor 5: assert a count, not just find-the-first-match.
  const launchedMatches = state.sessions.filter((s) => s.title === "fable-launch");
  expect(launchedMatches).toHaveLength(1);
  const [launched] = launchedMatches;
  if (!launched) throw new Error("unreachable: toHaveLength(1) just passed");
  expect(launched.model?.id).toBe("fable");
  // review cycle 1 Minor 6 (plan E10's named oracle): the fake-claude argv capture the
  // harness already records, proving `--model fable` reached the process itself — not
  // just that "fable" round-tripped through our own DB.
  expect(await daemon.paneStartCommand(launched.tmuxTarget)).toContain("--model fable");

  const reposRes = await page.request.get(`${daemon.baseURL}/api/repos`);
  expect(reposRes.status()).toBe(200);
  const repos = (await reposRes.json()) as Array<{ path: string; lastModel: string | null }>;
  const repo = repos.find((r) => r.path === daemon.browseRoot);
  expect(repo?.lastModel).toBe("fable");
});

test("other… reveals Custom model, blocks submit when empty, and submits the custom string verbatim (REQ-9, E11)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(dialog.getByLabel("Custom model")).not.toBeVisible();
  await dialog.getByRole("radio", { name: "other…" }).check();
  await expect(dialog.getByLabel("Custom model")).toBeVisible();

  await dialog.getByLabel("Title").fill("other-empty-blocked");
  await dialog.getByRole("button", { name: "Launch" }).click();
  await expect(launchError(dialog)).toBeVisible();
  await expect(launchError(dialog)).toHaveText("Enter a model.");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Custom model").fill("claude-opus-4-8");
  await dialog.getByRole("button", { name: "Launch" }).click();
  await expect(dialog).toBeHidden();

  const state = await getState(page, daemon);
  // review cycle 1 Minor 5: the whole point is that the blocked submit above must not
  // have fired a POST — `.find()` can't see a spurious extra session with the same
  // title, a count can.
  const launchedMatches = state.sessions.filter((s) => s.title === "other-empty-blocked");
  expect(launchedMatches, "the blocked submit must not have launched a session").toHaveLength(1);
  const [launched] = launchedMatches;
  if (!launched) throw new Error("unreachable: toHaveLength(1) just passed");
  expect(launched.model?.id).toBe("claude-opus-4-8");
});

test("a recent launched with a non-preset model preselects other… and fills Custom model (REQ-12)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "custom-seed",
      model: "claude-opus-4-8",
      permissionMode: "default",
    });

    const dialog = await openLaunchDialog(page);
    await expect(dialog.getByRole("radio", { name: "other…" })).toBeChecked();
    await expect(dialog.getByLabel("Custom model")).toBeVisible();
    await expect(dialog.getByLabel("Custom model")).toHaveValue("claude-opus-4-8");
  } finally {
    await dir.cleanup();
  }
});

test("a browse 404 shows the daemon's error and leaves crumbs, listing, Launch in and the pressed recent unchanged (INV-3, E12)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const vanishingName = "to-vanish";
    await mkdir(join(dir.path, vanishingName));
    const survivorName = "survivor";
    await mkdir(join(dir.path, survivorName));

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir.path, title: "recent-seed" });

    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    await expect(currentCrumb(dialog)).toHaveText(dirName); // opened straight onto the recent

    const before = {
      crumbs: await crumbsNav(dialog).innerText(),
      // review cycle 1 Minor 3: plan E12 says listing *count* unchanged — snapshot the
      // whole listing (including the entry about to vanish) so its disappearance from
      // the DOM, not just the survivor's continued presence, would fail this.
      dirs: await dialog.locator("#browse-dirs").innerText(),
      launchTarget: await launchTargetPath(dialog).innerText(),
      pressed: await recentButton(dialog, dirName).getAttribute("aria-pressed"),
    };
    // INV-1 (review cycle 1 Major 5): composed ancestor chain equals the readout
    // before the failure — combined with the byte-identical crumbs check below, this
    // proves the composed chain is also unchanged after.
    expect(await composedCrumbPath(dialog)).toBe(before.launchTarget);

    const vanishing = childEntry(dialog, vanishingName);
    await expect(vanishing).toBeVisible();
    await rm(join(dir.path, vanishingName), { recursive: true, force: true });
    await vanishing.click();

    await expect(launchError(dialog)).toBeVisible();
    await expect(launchError(dialog)).toHaveText("directory does not exist or is not a directory");

    expect(await crumbsNav(dialog).innerText()).toBe(before.crumbs);
    expect(await dialog.locator("#browse-dirs").innerText()).toBe(before.dirs);
    expect(await launchTargetPath(dialog).innerText()).toBe(before.launchTarget);
    expect(await recentButton(dialog, dirName).getAttribute("aria-pressed")).toBe(before.pressed);
    await expect(childEntry(dialog, survivorName)).toBeVisible(); // stale listing unchanged
    // The vanished entry's own listing row is still there too — INV-3's "stale
    // listing" point, not just the survivor.
    await expect(childEntry(dialog, vanishingName)).toBeVisible();

    // A subsequent successful navigation clears the error.
    await childEntry(dialog, survivorName).click();
    await expect(launchError(dialog)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("the dialog's bounding height is unchanged after open, a child click, a crumb click and a recent click, even with an overflowing listing (INV-4, E13)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const childName = "height-child";
    await mkdir(join(dir.path, childName));
    // review cycle 1 Major 1: enough siblings to overflow the picker's 300px-tall
    // `.entries` region (`overflow: auto`, style.css) — without this the listing was a
    // 1-entry <-> 0-entry toggle, so overflow was never actually exercised.
    for (let i = 0; i < 24; i++) {
      await mkdir(join(dir.path, `sibling-${String(i).padStart(2, "0")}`));
    }

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir.path, title: "height-seed" });

    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    // review cycle 1 Major 1: opens straight onto the recent, but `navigate()`
    // (launch.ts) synchronously swaps the listing for `loading…` before its fetch
    // resolves — wait for the settled destination (a retrying assertion), not just
    // "the dialog is visible", before ever measuring a bounding box.
    await expect(currentCrumb(dialog)).toHaveText(dirName);
    await expect(childEntry(dialog, childName)).toBeVisible();

    // review cycle 1 Major 1's "worth also" fixture-overflow suggestion, made
    // concrete: with 25 entries the listing must actually stay *inside* its 300px
    // picker via `#browse-dirs`'s own internal scroll (`overflow: auto`, style.css),
    // per REQ-1 ("panes scroll internally") and INV-4's "fixed 300px grid... listing
    // and sidebar are internally scrollable" — not visually spill out past it. See
    // this run's E2E Implementation Bugs entry: `.browse` (style.css:1384) has no
    // `min-height: 0`, so its content blows out past the grid row instead of
    // shrinking to let `.entries` actually scroll.
    const entriesRegion = dialog.locator("#browse-dirs");
    await expect
      .poll(async () => entriesRegion.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);

    const afterOpen = await dialog.boundingBox();
    expect(afterOpen).not.toBeNull();

    await childEntry(dialog, childName).click();
    await expect(currentCrumb(dialog)).toHaveText(childName);
    const afterChild = await dialog.boundingBox();
    expect(afterChild?.height).toBe(afterOpen?.height);

    await crumbButton(dialog, dirName).click();
    await expect(currentCrumb(dialog)).toHaveText(dirName);
    await expect(childEntry(dialog, childName)).toBeVisible();
    const afterCrumb = await dialog.boundingBox();
    expect(afterCrumb?.height).toBe(afterOpen?.height);

    await recentButton(dialog, dirName).click();
    await expect(currentCrumb(dialog)).toHaveText(dirName);
    await expect(childEntry(dialog, childName)).toBeVisible();
    const afterRecent = await dialog.boundingBox();
    expect(afterRecent?.height).toBe(afterOpen?.height);
  } finally {
    await dir.cleanup();
  }
});

test("a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13)", async ({ page, daemon }) => {
  await page.route("**/api/repos", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "repos unavailable" } }),
    }),
  );

  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
  await expect(launchError(dialog)).toBeVisible();
  await expect(launchError(dialog)).toHaveText("repos unavailable");
  // The browse pane is unaffected — GET /api/browse itself was never intercepted.
  await expect(currentCrumb(dialog)).toHaveText(basename(daemon.browseRoot));
});

// review cycle 2 Critical 1: `web/src/api.ts`'s functions used to call `fetch` unguarded,
// so a connection-level failure (daemon down, connection refused, sleep/wake, an aborted
// request — REQ-13's `network` mode) propagated out as an uncaught rejection instead of
// the documented `{ ok: false, error }` result. web-impl Fix Attempt 3 added a `safeFetch`
// choke point (`api.ts`) that catches the rejection and returns a `network_error`
// `ApiResult`. The two tests below exercise that path with a real `page.route(...).abort()`
// — a genuine network-layer failure, not a decodable HTTP error body like the 404/500
// tests above — which is exactly the gap cycle 1's tests missed (both of its REQ-13 probes
// returned real HTTP responses that decode fine).
test("a route.abort() on GET /api/repos shows the network error and the sidebar's empty state (REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.route("**/api/repos", (route) => route.abort("failed"));

  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
  await expect(launchError(dialog)).toBeVisible();
  await expect(launchError(dialog)).toHaveText("Could not reach musterd.");
  // The browse pane is unaffected — GET /api/browse itself was never intercepted, and
  // still reaches the daemon's real browse root even though /api/repos failed at the
  // network layer (not merely with a decodable error body).
  await expect(currentCrumb(dialog)).toHaveText(basename(daemon.browseRoot));
});

test("a route.abort() on GET /api/browse during navigation shows the network error and leaves crumbs, listing and Launch in unchanged, and a later success clears it (REQ-13, INV-3)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const abortedName = "aborted-child";
    await mkdir(join(dir.path, abortedName));
    const survivorName = "survivor";
    await mkdir(join(dir.path, survivorName));

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir.path, title: "recent-seed" });

    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    await expect(currentCrumb(dialog)).toHaveText(dirName); // opened straight onto the recent

    const before = {
      crumbs: await crumbsNav(dialog).innerText(),
      dirs: await dialog.locator("#browse-dirs").innerText(),
      launchTarget: await launchTargetPath(dialog).innerText(),
      pressed: await recentButton(dialog, dirName).getAttribute("aria-pressed"),
    };
    expect(await composedCrumbPath(dialog)).toBe(before.launchTarget);

    // Abort only the browse request for the entry we're about to click — every other
    // request (repos, the dialog's own initial browse onto the recent) passes through
    // untouched, so this isolates the one navigation's failure the same way the 404
    // test above isolates a single vanished directory.
    const abortedPath = join(dir.path, abortedName);
    await page.route("**/api/browse*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("path") === abortedPath) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await childEntry(dialog, abortedName).click();

    await expect(launchError(dialog)).toBeVisible();
    await expect(launchError(dialog)).toHaveText("Could not reach musterd.");
    // Not left on the `loading…` placeholder `navigate()` shows while the request is
    // in flight — on failure `renderListing()` restores the previous (unchanged)
    // listing instead of leaving the loading paragraph in place forever.
    await expect(dialog.locator("#browse-dirs .loading")).toHaveCount(0);

    expect(await crumbsNav(dialog).innerText()).toBe(before.crumbs);
    expect(await dialog.locator("#browse-dirs").innerText()).toBe(before.dirs);
    expect(await launchTargetPath(dialog).innerText()).toBe(before.launchTarget);
    expect(await recentButton(dialog, dirName).getAttribute("aria-pressed")).toBe(before.pressed);
    await expect(childEntry(dialog, survivorName)).toBeVisible();
    await expect(childEntry(dialog, abortedName)).toBeVisible(); // stale listing unchanged

    // A subsequent successful navigation clears the error.
    await page.unroute("**/api/browse*");
    await childEntry(dialog, survivorName).click();
    await expect(launchError(dialog)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("the child listing shows No subdirectories for an empty directory (REQ-16)", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await expect(dialog.locator("#browse-dirs").getByText("No subdirectories")).toBeVisible();
  } finally {
    await dir.cleanup();
  }
});

test("Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form (REQ-14, E15)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  let dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("should-not-persist");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  dialog = await openLaunchDialog(page);
  await expect(dialog.getByLabel("Title")).toHaveValue(""); // fresh reset on reopen
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("still-here");
  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("still-here");
});

// review cycle 1 Major 4: this regression test (card rendering, not the picker's
// internals) was dropped by the rewrite and existed nowhere in web/e2e/ — restored
// verbatim from 84551d5's launch.spec.ts (pre-rebuild), adapted only to this file's
// per-test `daemon` fixture and `scratchDirectory` helper. REQ-14 promises every existing
// launch behaviour outside the dialog's internals is unchanged; this is the one E2E
// proof that a card for a known directory still reaches the "no signal yet" state.
test("a card for a known (non-first-launch) directory still shows the no-signal note after ~10s (REQ-14 regression)", async ({
  page,
  daemon,
}) => {
  const dir = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);

    // First launch seeds the repo row so the SECOND launch below has firstLaunchHere:false.
    const seed = await launchSession(page, daemon, { directory: dir.path, title: "no-signal-seed" });
    expect(seed.firstLaunchHere).toBe(true);

    const second = await launchSession(page, daemon, { directory: dir.path, title: "no-signal-second" });
    expect(second.firstLaunchHere).toBe(false);
    expect(second.claudeSessionId).toBeNull();

    const state = await getState(page, daemon);
    const found = state.sessions.find((s) => s.id === second.id);
    expect(found?.firstLaunchHere).toBe(false);

    await page.goto(daemon.dashboardUrl);
    const card = sessionCard(page, "no-signal-second");
    await expect(card).toBeVisible();
    await expect(card.getByText(/no signal yet/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await dir.cleanup();
  }
});

test("a recent's title attribute is its full absolute path (REQ-18)", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir.path, title: "title-attr-seed" });

    const dialog = await openLaunchDialog(page);
    await expect(recentButton(dialog, basename(dir.path))).toHaveAttribute("title", dir.path);
  } finally {
    await dir.cleanup();
  }
});

test("keyboard traversal: Enter descends into a focused child entry (REQ-15)", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const childName = "kbd-child";
    await mkdir(join(dir.path, childName));

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();

    const entry = childEntry(dialog, childName);
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(currentCrumb(dialog)).toHaveText(childName);
  } finally {
    await dir.cleanup();
  }
});

// web-impl Fix Attempt 2 (review cycle 1 Minor 1): ArrowRight-descend used to fire
// `document.activeElement?.click()` then move on — the click handler's own re-render
// (`renderAll()`/`replaceChildren`) destroyed the node that had focus, dropping it to
// `<body>`, so a *following* ArrowDown/ArrowUp/ArrowLeft did nothing. The fix chains
// `focusFirstEntry()` onto the settled navigation for both the ArrowRight and ArrowLeft
// listing-keydown paths, re-anchoring on the new listing's first entry. This test drives
// two full descend/ascend round trips with real keyboard input (`.focus()` + `press`,
// never `.click()`) so a regression back to one-shot traversal would fail it, not just a
// single keystroke.
test("keyboard traversal: descending and ascending re-anchors focus on the first entry, so arrow keys keep working across round trips (REQ-15, review cycle 1 Minor 1)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const branchName = "branch-a";
    const leafA = "leaf-a";
    const leafB = "leaf-b";
    await mkdir(join(dir.path, branchName));
    await mkdir(join(dir.path, branchName, leafA));
    await mkdir(join(dir.path, branchName, leafB));

    await page.goto(daemon.dashboardUrl);
    // Launching straight into `dir.path` (rather than clicking through) means the
    // dialog opens directly onto it (REQ-8), whose only child is `branch-a`.
    await launchSession(page, daemon, { directory: dir.path, title: "kbd-continuity-seed" });

    const dialog = await openLaunchDialog(page);
    const dirName = basename(dir.path);
    await expect(currentCrumb(dialog)).toHaveText(dirName);

    const branchEntry = childEntry(dialog, branchName);
    await branchEntry.focus();
    await expect(branchEntry).toBeFocused();

    // --- Round trip 1: descend into branch-a, traverse its two children, ascend ---
    await page.keyboard.press("ArrowRight");
    await expect(currentCrumb(dialog)).toHaveText(branchName);
    // `focusFirstEntry()` lands on the alphabetically-first entry (`internal/server/
    // browse.go` sorts by name) — not `<body>`.
    const leafAEntry1 = childEntry(dialog, leafA);
    await expect(leafAEntry1).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(childEntry(dialog, leafB)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(childEntry(dialog, leafA)).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(currentCrumb(dialog)).toHaveText(dirName);
    // Back in the parent listing, whose only entry is branch-a itself — focus is
    // re-anchored there too, not lost.
    await expect(childEntry(dialog, branchName)).toBeFocused();

    // --- Round trip 2: prove continuity past the very first descend/ascend, not a
    // special case that only survives once ---
    await page.keyboard.press("ArrowRight");
    await expect(currentCrumb(dialog)).toHaveText(branchName);
    await expect(childEntry(dialog, leafA)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(childEntry(dialog, leafB)).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(currentCrumb(dialog)).toHaveText(dirName);
    await expect(childEntry(dialog, branchName)).toBeFocused();
  } finally {
    await dir.cleanup();
  }
});

// web-impl Fix Attempt 3 (review cycle 2 Minor 1): `navigateUp()` now returns `null` (not
// a `navigate()` call) when `#browse-crumbs` has no ancestor `button[data-path]` — i.e.
// there is truly nowhere to ascend to — and the listing's `ArrowLeft` handler only calls
// `focusFirstEntry()` when the result isn't `null`. Before the fix, a no-op ascend at the
// filesystem root still unconditionally re-anchored focus onto the (unchanged) first
// entry, measured by the reviewer jumping focus from the 4th real entry to the 1st. This
// test reaches the real root the same way the Cmd+ArrowUp test does, focuses something
// other than the first entry, and asserts the exact same node is still focused afterward
// — not merely that "some" entry is focused, which the pre-fix behaviour would also
// satisfy trivially if the first entry happened to be re-selected.
test("ArrowLeft at the filesystem root is a genuine no-op and does not move focus (REQ-15, review cycle 2 Minor 1)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  // Jump straight to the filesystem root via its own crumb (same technique the
  // Cmd+ArrowUp test uses) — no ancestor crumbs remain, so there is nothing to ascend to.
  await crumbButton(dialog, "/").click();
  await expect(currentCrumb(dialog)).toHaveText("/");
  await expect(crumbsNav(dialog).getByRole("button")).toHaveCount(0);

  const entries = dialog.locator("#browse-dirs button.entry");
  const entryCount = await entries.count();
  // Need at least 2 real entries under "/" to tell "focus didn't move" apart from
  // "focus moved to the first entry, which is also this one" — the real filesystem
  // root always has more than one top-level directory on this platform.
  expect(entryCount).toBeGreaterThan(1);

  const target = entries.nth(1); // anything but the first entry
  await target.focus();
  // Node-identity check, not just "a button with this name is focused": tag the exact
  // DOM node so a re-render (which would replace it with a freshly built button of the
  // same name) is distinguishable from the genuine no-op the fix produces.
  await target.evaluate((el) => el.setAttribute("data-e2e-kept-focus", "1"));
  await expect(target).toBeFocused();

  await page.keyboard.press("ArrowLeft");

  await expect(page.locator('[data-e2e-kept-focus="1"]')).toBeFocused();
  await expect(target).toBeFocused();
  // The listing itself is untouched too — a genuine no-op never called navigate().
  await expect(currentCrumb(dialog)).toHaveText("/");
});

// web-impl Fix Attempt 2 (review cycle 1 Minor 2): a fresh `renderCrumbs()` used to leave
// `#browse-crumbs`'s own `scrollLeft` at 0, so on a deep path the current-directory
// segment and the ⌘↑ hint were the two things scrolled out of view behind the leading
// ancestors. Fix: `renderCrumbs` now ends with `nav.scrollLeft = nav.scrollWidth`. This
// test forces genuine horizontal overflow (12 long segments) and checks it both
// numerically (scrollLeft snapped to the true end, which the browser clamps) and
// visually (the current crumb and the kbd hint's own bounding boxes fall inside the
// nav's visible viewport) — not just that the elements exist in the DOM.
test("opening on a deep path scrolls the crumb bar to its right edge, keeping the current directory and the ⌘↑ hint on screen (REQ-6, review cycle 1 Minor 2)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon);
  try {
    const segments = Array.from({ length: 12 }, (_, i) => `a-fairly-long-segment-name-number-${i}`);
    const deepPath = join(dir.path, ...segments);
    await mkdir(deepPath, { recursive: true });

    await page.goto(daemon.dashboardUrl);
    // Launching straight into the deep path means the dialog opens directly onto it
    // (REQ-8) — exactly the "fresh open" moment review cycle 1 Minor 2 measured
    // (`scrollLeft: 0` immediately after render).
    await launchSession(page, daemon, { directory: deepPath, title: "deep-crumb-seed" });

    const dialog = await openLaunchDialog(page);
    const lastSegment = segments.at(-1);
    if (!lastSegment) {
      throw new Error("segments must be non-empty");
    }
    await expect(currentCrumb(dialog)).toHaveText(lastSegment);

    const metrics = await crumbsNav(dialog).evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // Sanity: the fixture genuinely overflows the pane — otherwise the equality below
    // would hold trivially at scrollLeft=0 and this test would prove nothing.
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    // The browser clamps `scrollLeft = scrollWidth` to the true maximum
    // (`scrollWidth - clientWidth`), so this holds exactly once scrolled to the end.
    expect(metrics.scrollLeft + metrics.clientWidth).toBe(metrics.scrollWidth);

    // The current-directory segment and the ⌘↑ hint are the two elements Minor 2
    // named as scrolled out of view — confirm both actually fall inside the nav's own
    // visible (post-scroll) bounding box, not merely present somewhere in the DOM.
    const navBox = await crumbsNav(dialog).boundingBox();
    const currentBox = await currentCrumb(dialog).boundingBox();
    const kbdBox = await dialog.locator("#browse-crumbs .kbd").boundingBox();
    expect(navBox).not.toBeNull();
    expect(currentBox).not.toBeNull();
    expect(kbdBox).not.toBeNull();
    expect(currentBox!.x).toBeGreaterThanOrEqual(navBox!.x - 1);
    expect(currentBox!.x + currentBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
    expect(kbdBox!.x).toBeGreaterThanOrEqual(navBox!.x - 1);
    expect(kbdBox!.x + kbdBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
  } finally {
    await dir.cleanup();
  }
});

test("GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (kb:anchor/browse.get, unchanged)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl); // authenticate this request context

  const badRelative = await page.request.get(`${daemon.baseURL}/api/browse?path=not/absolute`);
  expect(badRelative.status()).toBe(400);
  const badRelativeBody = (await badRelative.json()) as { error: { code: string } };
  expect(badRelativeBody.error.code).toBe("invalid_request");

  const missing = await page.request.get(
    `${daemon.baseURL}/api/browse?path=${encodeURIComponent("/no/such/directory/muster-e2e")}`,
  );
  expect(missing.status()).toBe(404);
  const missingBody = (await missing.json()) as { error: { code: string } };
  expect(missingBody.error.code).toBe("not_found");
});
