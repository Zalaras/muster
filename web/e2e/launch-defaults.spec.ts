import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { expect, test } from "./helpers/fixtures";
import {
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
