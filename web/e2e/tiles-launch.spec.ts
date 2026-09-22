import { basename } from "node:path";
import { expect, test } from "./helpers/fixtures";
import { newSessionButton } from "./helpers/railcards";
import { childEntry, crumbButton, launchDialog } from "./helpers/picker";
import { browseScratchDirectory, launchSession } from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// TODO.md "Create new session from tile view": a launch made from Tiles always lands as
// a live tile (promoting into a full grid) rather than in the strip, driving the same
// #launch-dialog as everywhere else.
//
// Plan rail-card-improvements REQ-6 (kb:adr/launch-new-session-button-in-masthead)
// retired the Tiles toolbar's own `#tiles-new-session-button`: the single masthead
// `#new-session-button` (`helpers/railcards.ts`) now stays mounted and visible in both
// views, so this file no longer needs its own view-scoped locator.
//
// Grid membership depends on the EXACT total session count (`toHaveCount(4)` on the grid,
// the `#tiles-empty` state) and prefs are global per daemon, so — like views.spec.ts —
// every test here takes the per-test `daemon` fixture (helpers/fixtures.ts).

test("Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await page.getByRole("button", { name: "Tiles" }).click();

  // REQ-6/INV-3: one button total, visible in Tiles too — not hidden with the rail, and
  // the old Tiles-only toolbar button is gone.
  await expect(newSessionButton(page)).toBeVisible();
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);
  await expect(page.locator("#tiles-empty")).toContainText("New session");

  await newSessionButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New session" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("a session launched from Tiles appears as a live tile", async ({ page, daemon }) => {
  const { path: dir, cleanup } = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "Tiles" }).click();
    await newSessionButton(page).click();
    const dialog = launchDialog(page);

    // No prior launches on this fresh daemon, so the dialog opens directly on the
    // browse root — `dir` is a direct child of it (plan new-session-dialog: the
    // Browse…/Use this folder flow no longer exists; the listed directory is the
    // selection).
    await childEntry(dialog, basename(dir)).click();
    await dialog.getByLabel("Title").fill("from-tiles");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    await expect(liveTile(page, "from-tiles")).toBeVisible();
    await expect(stripCard(page, "from-tiles")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("launching from Tiles with a full 2×2 grid promotes the new session and demotes one tile", async ({
  page,
  daemon,
}) => {
  // All four seeds live under the daemon's browse root (not an arbitrary system tmp
  // dir, as a plain `scratchDirectory()` would give) so `browse.path` — reached below
  // via crumb navigation up to that shared root — is actually navigable from wherever
  // the most-recently-launched seed leaves the dialog open.
  const dirs = await Promise.all([1, 2, 3, 4].map(() => browseScratchDirectory(daemon)));
  const browse = await browseScratchDirectory(daemon);
  try {
    await page.goto(daemon.dashboardUrl);
    for (const [i, d] of dirs.entries()) {
      await launchSession(page, daemon, { directory: d.path, title: `seed-${i + 1}` });
    }
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
    await expect(page.locator("#tiles-strip [data-testid='session-card']")).toHaveCount(0);

    await newSessionButton(page).click();
    const dialog = launchDialog(page);

    // Four prior launches means the dialog opens on the most recently launched
    // directory (a sibling of `browse.path` under the same browse root) — go up one
    // crumb to the root, then descend into `browse.path`.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(browse.path)).click();
    await dialog.getByLabel("Title").fill("fifth");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    // The new session takes a grid slot; the grid stays at 4; exactly one seed moved
    // to the strip.
    await expect(liveTile(page, "fifth")).toBeVisible();
    await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
    await expect(page.locator("#tiles-strip [data-testid='session-card']")).toHaveCount(1);
    await expect(stripCard(page, "fifth")).toHaveCount(0);
  } finally {
    await browse.cleanup();
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
