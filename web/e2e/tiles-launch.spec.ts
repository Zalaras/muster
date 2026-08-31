import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { childEntry, crumbButton, launchDialog } from "./helpers/picker";
import { browseScratchDirectory, launchSession } from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// TODO.md "Create new session from tile view": the Focus rail's New session button is
// hidden with the rail whenever Tiles is active, so Tiles gets its own button in the
// density toolbar, driving the same #launch-dialog, and a launch made from Tiles always
// lands as a live tile (promoting into a full grid) rather than in the strip.
//
// Grid membership depends on the EXACT total session count and prefs are global per
// daemon, so — like views.spec.ts — every test here gets a private scratch daemon.

async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon();
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

/** Tiles' New session button, scoped to `#view-tiles`: the view switch lands only after
 * the prefs round-trip, so an unscoped role query can resolve to the rail's still-visible
 * button and then wait forever on it once the rail hides (same trap `stripCard` documents). */
function newSessionButton(page: import("@playwright/test").Page) {
  return page.locator("#view-tiles").getByRole("button", { name: "New session" });
}

test("Tiles exposes a New session button that opens the launch modal", async ({ page }) => {
  await withDaemon(async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "Tiles" }).click();

    // The rail (and its button) is hidden with the Focus view; the toolbar one takes over.
    await expect(page.locator("#new-session-button")).toBeHidden();
    const button = page.locator("#tiles-new-session-button");
    await expect(button).toBeVisible();
    await expect(page.locator("#tiles-empty")).toContainText("New session");

    await newSessionButton(page).click();
    const dialog = page.getByRole("dialog", { name: "New session" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

test("a session launched from Tiles appears as a live tile", async ({ page }) => {
  await withDaemon(async (daemon) => {
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
});

test("launching from Tiles with a full 2×2 grid promotes the new session and demotes one tile", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
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
});
