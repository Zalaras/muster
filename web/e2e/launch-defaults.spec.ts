import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { effortRadio, pickEffort } from "./helpers/effort";
import { expect, type Locator, type Page, type ScratchDaemon, test } from "./helpers/fixtures";
import {
  childEntry,
  currentCrumb,
  launchError,
  launchTargetPath,
  openLaunchDialog,
  recentButton,
} from "./helpers/picker";
import { browseScratchDirectory, launchSession, waitForNextClockSecond } from "./helpers/session";

// Plan new-session-improvement (#28) — REQ-5, REQ-6, INV-5. Plan acceptance: E1, E2, E9,
// E10, E12.
//
// REQ-5: when there is nothing to restore, Start in falls back to auto (previously
// manual) — E1/E2 pin the fresh-dialog defaults. REQ-6: the dialog's initial restore
// (navigate to the most recent recent, then apply its model/mode) resolves
// asynchronously and must never clobber a user who acted before it lands — E9 covers a
// touched field surviving the race, E10 covers a superseding navigation winning outright,
// E12 covers a genuine failure (the recent's directory is simply gone) falling back to
// the browse root (REQ-6c). W6's amendment (plan.md, review cycle 1 maintainability
// Minor 1) removed the pure `openFallback` seam this used to be unit-testable through, so
// E12 is this path's only remaining coverage.
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts): the recents list
// and "opens onto the most recent recent" behaviour are daemon-global (launch.spec.ts's
// own rationale), which a neighbour test's launch on a shared daemon would corrupt —
// doubly so here, since E9/E10 depend on controlling exactly which GET /api/browse call
// is the dialog's own initial one.

test("a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(dialog.getByRole("radio", { name: "auto" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "sonnet" })).toBeChecked();
});

test("a model picked before the initial restore lands stays checked, and the untouched mode still restores from the recent (REQ-6, E9)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-race-model-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "race-model-seed",
      model: "haiku",
      permissionMode: "default",
    });

    // Holds back only the FIRST GET /api/browse this page ever makes — the dialog's own
    // initial restore navigate to `dir` (REQ-8, launch spec: it opens straight onto the
    // one recent). Every later browse call passes through untouched.
    let seenFirstBrowse = false;
    let releaseFirstBrowse: () => void = () => {};
    const firstBrowseGate = new Promise<void>((resolve) => {
      releaseFirstBrowse = resolve;
    });
    await page.route("**/api/browse*", async (route) => {
      if (!seenFirstBrowse) {
        seenFirstBrowse = true;
        await firstBrowseGate;
      }
      await route.continue();
    });

    const dialog = await openLaunchDialog(page);
    // The user's own choice, made while the held-back initial restore is still in flight.
    await dialog.getByRole("radio", { name: "opus" }).check();
    releaseFirstBrowse();

    await expect(currentCrumb(dialog)).toHaveText(basename(dir.path));
    // REQ-6(a): the touched model is kept, not overwritten by the recent's own stored
    // "haiku" once the delayed restore finally lands.
    await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    // REQ-6(a): the mode was never touched, so it still restores from the recent.
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
  } finally {
    await dir.cleanup();
  }
});

test("clicking a second Recent before the held-back initial browse lands leaves that Recent's directory listed, never the superseded one (REQ-6, E10)", async ({
  page,
  daemon,
}) => {
  const older = await browseScratchDirectory(daemon, "muster-e2e-race-older-");
  const newer = await browseScratchDirectory(daemon, "muster-e2e-race-newer-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: older.path,
      title: "race-recent-older",
      model: "haiku",
      permissionMode: "default",
    });
    await waitForNextClockSecond();
    await launchSession(page, daemon, {
      directory: newer.path,
      title: "race-recent-newer",
      model: "opus",
      permissionMode: "acceptEdits",
    });

    let seenFirstBrowse = false;
    let releaseFirstBrowse: () => void = () => {};
    const firstBrowseGate = new Promise<void>((resolve) => {
      releaseFirstBrowse = resolve;
    });
    await page.route("**/api/browse*", async (route) => {
      if (!seenFirstBrowse) {
        seenFirstBrowse = true;
        await firstBrowseGate;
      }
      await route.continue();
    });

    const dialog = await openLaunchDialog(page);
    const olderName = basename(older.path);
    const newerName = basename(newer.path);

    // The user's own navigation, fired while the initial restore's browse call (for
    // `newer`, REQ-8's "most recent recent") is still gated — REQ-6(b): this must
    // supersede the initial restore outright.
    await recentButton(dialog, olderName).click();
    // Now let the superseded request land; it must do nothing further — no model/mode
    // restore for `newer`, no browse-root fallback, and it must not clobber `older`'s
    // listing that the user's own click already produced.
    releaseFirstBrowse();

    await expect(currentCrumb(dialog)).toHaveText(olderName);
    await expect(launchTargetPath(dialog)).toHaveText(older.path);
    await expect(recentButton(dialog, olderName)).toHaveAttribute("aria-pressed", "true");
    await expect(recentButton(dialog, newerName)).toHaveAttribute("aria-pressed", "false");
    // The user's own click still restores its own directory's stored model/mode,
    // unchanged by this plan (Overview: "Clicking a Recent keeps restoring that
    // directory's model and mode, unchanged").
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
  } finally {
    await older.cleanup();
    await newer.cleanup();
  }
});

test("with the most recent Recent's directory deleted before the dialog opens, the opened dialog lists the browse root (REQ-6, E12)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-vanished-recent-");
  const dirName = basename(dir.path);
  try {
    await page.goto(daemon.dashboardUrl);
    // Seeded with a stored model/mode that differ from REQ-5's fallback defaults, so a
    // restore that wrongly slips through despite the failed navigation (rather than
    // genuinely falling back) would be caught below.
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "vanished-recent-seed",
      model: "haiku",
      permissionMode: "default",
    });

    // Gone before the dialog's own initial navigate ever runs — REQ-6c's "genuinely
    // failed initial navigation", distinct from E10's superseded-by-the-user case above.
    await rm(dir.path, { recursive: true, force: true });

    const dialog = await openLaunchDialog(page);

    await expect(currentCrumb(dialog)).toHaveText(basename(daemon.browseRoot));
    await expect(launchTargetPath(dialog)).toHaveText(daemon.browseRoot);
    // REQ-6c: the failed attempt's error is cleared by the successful browse-root
    // fallback that follows it (plan Overview, "as today").
    await expect(launchError(dialog)).toBeHidden();
    await expect(recentButton(dialog, dirName)).toHaveAttribute("aria-pressed", "false");
    // REQ-5: nothing restored, so Start in and Model land on the same fallback a
    // fresh dialog with no history would show — not the vanished recent's stored values.
    await expect(dialog.getByRole("radio", { name: "auto" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "sonnet" })).toBeChecked();
  } finally {
    await dir.cleanup();
  }
});

test("the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns (REQ-2)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-open-restore-");
  let releaseHeld: () => void = () => {};
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "open-restore-seed",
      model: "haiku",
      permissionMode: "default",
      effort: "high",
    });

    // Both routes pass every request through until `holding` flips; after that every GET is held
    // until `releaseHeld`, so only a list the controller already holds can supply the values.
    let holding = false;
    let heldRepos = 0;
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    await page.route("**/api/repos*", async (route) => {
      if (holding && route.request().method() === "GET") {
        heldRepos += 1;
        await held;
      }
      await route.continue();
    });
    await page.route("**/api/browse*", async (route) => {
      if (holding && route.request().method() === "GET") await held;
      await route.continue();
    });

    // Reload so the page's own load-time fetches (the controller's repos fetch at init) see the
    // seeded launch, and let them settle before the dialog opens.
    await page.reload();
    await page.waitForLoadState("networkidle");
    holding = true;

    const dialog = await openLaunchDialog(page);
    // The open's own GET /api/repos is on its way and held.
    await expect.poll(() => heldRepos).toBeGreaterThan(0);

    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
    await expect(effortRadio(dialog, "high")).toBeChecked();

    releaseHeld();
    await expect(currentCrumb(dialog)).toHaveText(basename(dir.path));
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
    await expect(effortRadio(dialog, "high")).toBeChecked();
  } finally {
    releaseHeld();
    await dir.cleanup();
  }
});

test("a launch made through the dialog refreshes what the next open restores, with no reload in between (REQ-2)", async ({
  page,
  daemon,
}) => {
  const seeded = await browseScratchDirectory(daemon, "muster-e2e-refresh-seed-");
  const childName = "refresh-target";
  let releaseHeld: () => void = () => {};
  try {
    await mkdir(join(seeded.path, childName));
    // What the page's load-time repos fetch will know: one recent, opus / acceptEdits / low.
    // Seeded after the first goto (the launch endpoint needs the page's cookie), then reloaded.
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: seeded.path,
      title: "refresh-seed",
      model: "opus",
      permissionMode: "acceptEdits",
      effort: "low",
    });
    await waitForNextClockSecond();

    await page.reload();
    await page.waitForLoadState("networkidle");

    // The dialog's own first open restores what the init fetch knew.
    const first = await openLaunchDialog(page);
    await expect(currentCrumb(first)).toHaveText(basename(seeded.path));
    await expect(first.getByRole("radio", { name: "opus" })).toBeChecked();

    // Launch through the dialog (New tab) into a directory whose remembered level differs
    // from everything the page has fetched so far: haiku / manual / max.
    await childEntry(first, childName).click();
    await expect(launchTargetPath(first)).toHaveText(join(seeded.path, childName));
    await first.getByRole("radio", { name: "haiku" }).check();
    await first.getByRole("radio", { name: "manual" }).check();
    await pickEffort(first, "max");
    await expect(effortRadio(first, "max")).toBeChecked();
    await first.getByLabel("Title").fill("refresh-via-dialog");

    // The refresh the launch triggers is the one GET /api/repos that must get through.
    const refreshed = page.waitForResponse(
      (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/repos",
    );
    await first.getByRole("button", { name: "Launch" }).click();
    await expect(first).toBeHidden();
    await refreshed;

    // From here every GET is held: only a list the controller already holds can supply the
    // values the reopened dialog shows. The page is never reloaded.
    let heldRepos = 0;
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    await page.route("**/api/repos*", async (route) => {
      if (route.request().method() === "GET") {
        heldRepos += 1;
        await held;
      }
      await route.continue();
    });
    await page.route("**/api/browse*", async (route) => {
      if (route.request().method() === "GET") await held;
      await route.continue();
    });

    const dialog = await openLaunchDialog(page);
    await expect.poll(() => heldRepos).toBeGreaterThan(0);

    // opus / acceptEdits / low is what the page's init fetch knew; only the launch's refresh
    // can make these haiku / manual / max.
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
    await expect(effortRadio(dialog, "max")).toBeChecked();

    releaseHeld();
    await expect(currentCrumb(dialog)).toHaveText(childName);
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
    await expect(effortRadio(dialog, "max")).toBeChecked();
  } finally {
    releaseHeld();
    await seeded.cleanup();
  }
});

// REQ-3's `failed` branch: the open shows the first recent's held values, and when that recent's
// directory has vanished the controller's `failed` outcome (`applyRestore(defaultRestore(touched))`
// in `initOpen`) returns them to the defaults. E12 above cannot pin that reset: it seeds after the
// page's load-time fetch, so the controller holds no list at its open and the defaults are already
// on screen. These two seed first, reload so the init fetch knows the recent, delete the directory
// and hold only GET /api/browse (the open's navigate), so the held values are observable and then
// the reset. Without the reset the held haiku / manual / high would stay checked.
async function openOntoVanishedRecent(
  page: Page,
  daemon: ScratchDaemon,
  prefix: string,
): Promise<{
  dialog: Locator;
  browseHeld: () => number;
  release: () => void;
  cleanup: () => Promise<void>;
}> {
  const dir = await browseScratchDirectory(daemon, prefix);
  let release: () => void = () => {};
  let holding = false;
  let heldBrowse = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto(daemon.dashboardUrl);
  await launchSession(page, daemon, {
    directory: dir.path,
    title: `${prefix}seed`,
    model: "haiku",
    permissionMode: "default",
    effort: "high",
  });
  await page.route("**/api/browse*", async (route) => {
    if (holding && route.request().method() === "GET") {
      heldBrowse += 1;
      await held;
    }
    await route.continue();
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await rm(dir.path, { recursive: true, force: true });
  holding = true;

  const dialog = await openLaunchDialog(page);
  // The open's own navigate to the vanished directory is on its way and held.
  await expect.poll(() => heldBrowse).toBeGreaterThan(0);
  await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
  await expect(effortRadio(dialog, "high")).toBeChecked();
  return {
    dialog,
    browseHeld: () => heldBrowse,
    release,
    cleanup: dir.cleanup,
  };
}

test("a vanished first recent's held model, mode and effort return to the defaults once its directory fails to open (REQ-3, E3)", async ({
  page,
  daemon,
}) => {
  const open = await openOntoVanishedRecent(page, daemon, "muster-e2e-vanished-held-");
  try {
    open.release();
    await expect(currentCrumb(open.dialog)).toHaveText(basename(daemon.browseRoot));
    await expect(open.dialog.getByRole("radio", { name: "sonnet" })).toBeChecked();
    await expect(open.dialog.getByRole("radio", { name: "auto" })).toBeChecked();
    await expect(effortRadio(open.dialog, "default")).toBeChecked();
  } finally {
    open.release();
    await open.cleanup();
  }
});

test("a vanished first recent resets only the fields the user did not touch while its directory was still opening (REQ-3, E3, E4)", async ({
  page,
  daemon,
}) => {
  const open = await openOntoVanishedRecent(page, daemon, "muster-e2e-vanished-touched-");
  try {
    // The user's own pick, made while the open's navigate is still held.
    await open.dialog.getByRole("radio", { name: "opus" }).check();
    open.release();

    await expect(currentCrumb(open.dialog)).toHaveText(basename(daemon.browseRoot));
    await expect(open.dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    await expect(open.dialog.getByRole("radio", { name: "auto" })).toBeChecked();
    await expect(effortRadio(open.dialog, "default")).toBeChecked();
  } finally {
    open.release();
    await open.cleanup();
  }
});
