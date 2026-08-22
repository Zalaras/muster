import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { getState, homeScratchDirectory, launchSession, scratchDirectory, sessionCard } from "./helpers/session";

const execFileAsync = promisify(execFile);

// REQ-3, REQ-4, REQ-5, REQ-6, REQ-14, REQ-17 — the launch modal, the folder browser, and
// the MRU/defaults flow. Plan acceptance: E1, E2, W4, W5, W9.
//
// One scratch daemon for the whole file (docs/conventions.md's "never attach to an
// existing server"); each test uses its own scratch directory so tests never depend on
// each other's `firstLaunchHere` / MRU side effects.

let daemon: ScratchDaemon;

test.beforeAll(async () => {
  daemon = await startScratchDaemon();
});

test.afterAll(async () => {
  await daemon.teardown();
});

test("New session opens a modal exposing every Testable UI Element (REQ-14, W4)", async ({ page }) => {
  await page.goto(daemon.dashboardUrl);

  await page.getByRole("button", { name: "New session" }).click();

  const dialog = page.getByRole("dialog", { name: "New session" });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("button", { name: "Browse…" })).toBeVisible();
  await expect(dialog.getByLabel("Title")).toBeVisible();

  for (const model of ["sonnet", "opus", "haiku", "other"]) {
    await expect(dialog.getByRole("radio", { name: model })).toBeVisible();
  }
  // Custom model input is visible only once "other" is selected (Testable UI Elements).
  await expect(dialog.getByLabel("Custom model")).not.toBeVisible();
  await dialog.getByRole("radio", { name: "other" }).check();
  await expect(dialog.getByLabel("Custom model")).toBeVisible();

  for (const mode of ["Claude Code default", "plan mode", "auto-accept"]) {
    await expect(dialog.getByRole("radio", { name: mode })).toBeVisible();
  }

  await expect(dialog.getByRole("button", { name: "Launch" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("Browse… into a fresh directory launches with the trust-prompt note and writes settings.local.json (E2, REQ-17)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await homeScratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });

    await dialog.getByRole("button", { name: "Browse…" }).click();

    const dirName = basename(dir);
    // Subdirectory entries carry an additive " (git)" suffix when they're a real git
    // checkout (Major 6 fix, render/launch.ts:149) — this fixture directory is a plain
    // mkdtemp'd dir, never a checkout, but the exact-name locator would silently break
    // the first time a test browses a real one, so match the name with an optional
    // suffix rather than pinning it exact (review m1-sessions cycle-2 Major 3).
    const dirButton = new RegExp(`^${dirName}( \\(git\\))?$`);
    // Drills one level from the default (home-directory) listing into our fresh dir,
    // then Up and back in again — exercising Up + Subdirectory entry + Use this folder
    // together, and Current browse path implicitly (we never navigate anywhere else).
    await dialog.getByRole("button", { name: dirButton }).click();
    await dialog.getByRole("button", { name: "Up" }).click();
    await expect(dialog.getByRole("button", { name: dirButton })).toBeVisible();
    await dialog.getByRole("button", { name: dirButton }).click();
    await dialog.getByRole("button", { name: "Use this folder" }).click();

    await dialog.getByLabel("Title").fill("fresh-dir-launch");
    await dialog.getByRole("button", { name: "Launch" }).click();

    await expect(dialog).toBeHidden();

    const card = sessionCard(page, "fresh-dir-launch");
    await expect(card).toBeVisible();
    await expect(card.getByText(/first launch here/i)).toBeVisible();

    // D7 / plan Implementation Notes: settings are written before the 201 response, so
    // this file must already exist by the time the modal has closed.
    await expect(access(join(dir, ".claude", "settings.local.json"))).resolves.toBeUndefined();
  } finally {
    await cleanup();
  }
});

test("selecting an MRU directory prefills model and start-in from that directory's last launch (E1, W5)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);

    // Seed the repo row's defaults with a real launch (opus / acceptEdits) — the launch
    // modal itself isn't exercised for this one; W5 is about what a SECOND open of the
    // modal prefills from GET /api/repos's lastModel/lastPermissionMode.
    const first = await launchSession(page, daemon, {
      directory: dir,
      title: "seed-launch",
      model: "opus",
      permissionMode: "acceptEdits",
    });
    expect(first.state).toBe("started");

    const reposRes = await page.request.get(`${daemon.baseURL}/api/repos`);
    expect(reposRes.status()).toBe(200);
    const repos = (await reposRes.json()) as Array<{
      path: string;
      branch: string | null;
      lastModel: string | null;
      lastPermissionMode: string | null;
    }>;
    const repo = repos.find((r) => r.path === dir);
    expect(repo, "the just-launched directory must appear in GET /api/repos").toBeTruthy();
    expect(repo?.branch).toBeNull(); // not a git checkout
    expect(repo?.lastModel).toBe("opus");
    expect(repo?.lastPermissionMode).toBe("acceptEdits");

    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });

    const dirName = basename(dir);
    await dialog.getByRole("button", { name: new RegExp(dirName) }).click();

    await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "auto-accept" })).toBeChecked();

    await dialog.getByLabel("Title").fill("second-launch-from-mru");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const card = sessionCard(page, "second-launch-from-mru");
    await expect(card).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (REQ-6)", async ({
  page,
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

test("a card for a known (non-first-launch) directory shows the no-signal note after ~10s (REQ-17)", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);

    // First launch seeds the repo row so the SECOND launch below has firstLaunchHere:false.
    const seed = await launchSession(page, daemon, { directory: dir, title: "no-signal-seed" });
    expect(seed.firstLaunchHere).toBe(true);

    const second = await launchSession(page, daemon, { directory: dir, title: "no-signal-second" });
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
    await cleanup();
  }
});

// review m1-sessions cycle-2 Major 3: four fix-wave behaviours (launch-error line,
// the (git) subdirectory marker, the MRU path span, and Cmd+N) had zero E2E assertions.

test("Browse into a directory removed mid-session shows the daemon's error inline and keeps the stale listing (Edge Case 14, Launch error line)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await homeScratchDirectory();
  try {
    const vanishingName = "to-vanish";
    await mkdir(join(dir, vanishingName));

    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });

    await dialog.getByRole("button", { name: "Browse…" }).click();
    const dirName = basename(dir);
    await dialog.getByRole("button", { name: new RegExp(`^${dirName}( \\(git\\))?$`) }).click();

    const vanishingButton = dialog.getByRole("button", { name: vanishingName, exact: true });
    await expect(vanishingButton).toBeVisible();

    // Remove the subdirectory between the listing render and the click — the exact
    // race the plan's Edge Case 14 describes ("Browse into an unreadable/removed
    // directory").
    await rm(join(dir, vanishingName), { recursive: true, force: true });
    await vanishingButton.click();

    // Testable UI Elements: "Launch error line — daemon error.message text — inline in
    // modal". The daemon's real GET /api/browse 404 body (internal/server/browse.go).
    const launchError = dialog.locator("#launch-error");
    await expect(launchError).toBeVisible();
    await expect(launchError).toHaveText("directory does not exist or is not a directory");

    // "the browser UI shows the error and stays where it was" — the dialog is still
    // open, still showing the PARENT listing it had before the failed click (the stale
    // button itself is still rendered; renderBrowse is never called with the 404).
    await expect(dialog).toBeVisible();
    await expect(vanishingButton).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a real git checkout in the folder browser is marked (git) and a plain subdirectory is not (Major 6)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await homeScratchDirectory();
  try {
    const gitDirName = "git-subdir";
    const plainDirName = "plain-subdir";
    await mkdir(join(dir, gitDirName));
    await mkdir(join(dir, plainDirName));
    await execFileAsync("git", ["init"], { cwd: join(dir, gitDirName) });

    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });

    await dialog.getByRole("button", { name: "Browse…" }).click();
    const dirName = basename(dir);
    await dialog.getByRole("button", { name: new RegExp(`^${dirName}( \\(git\\))?$`) }).click();

    // The button's accessible name still contains the directory's own name (Testable
    // UI Elements: "Subdirectory entry"), with the git marker as an additive suffix
    // (render/launch.ts:149: `${dir.name} (git)` vs plain `dir.name`).
    await expect(dialog.getByRole("button", { name: `${gitDirName} (git)`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: plainDirName, exact: true })).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("MRU entry's path span shows the directory's full absolute path, not just its name (Major 5)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);

    const launched = await launchSession(page, daemon, { directory: dir, title: "mru-path-check" });
    expect(launched.state).toBe("started");

    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });

    const dirName = basename(dir);
    const mruEntry = dialog.getByRole("button", { name: new RegExp(dirName) });
    await expect(mruEntry).toBeVisible();
    // The `.dir-name` span carries just the basename; `.dir-path` carries the full
    // absolute path — the field that distinguishes a repo from a linked worktree
    // (render/launch.ts:118-125, plan UI spec "name, path, branch or —, relative age").
    await expect(mruEntry.locator(".dir-name")).toHaveText(dirName);
    await expect(mruEntry.locator(".dir-path")).toHaveText(dir);
  } finally {
    await cleanup();
  }
});

test("Cmd+N opens the launch modal from anywhere in the shell (REQ-22)", async ({ page }) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = page.getByRole("dialog", { name: "New session" });
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Meta+n");

  await expect(dialog).toBeVisible();
});
