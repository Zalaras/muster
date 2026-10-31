// issue — the display property of the issue capture (the masthead's Issue button
// in both views), re-levelled on 2026-10-20 from web/e2e/issue-capture.spec.ts
// (plans/_audit/relevel/misc-core.md). Nothing here opens the dialog: it fires
// `POST /api/issue/captures` the instant it opens, so every dialog-content and filing test
// needs the daemon and stays in web/e2e/issue-capture.spec.ts. The view is a pref the
// dashboard adopts only from the daemon's broadcast (web/src/features/views.ts), so Tiles
// is reached by pushing the `prefs` frame a `view: "tiles"` fixture recorded, not by the
// masthead click whose `PUT /api/prefs` the harness answers 404.
import { expect, loadFixture, test } from "./helpers/harness";
import { issueButton } from "./helpers/issue";

test("the Issue button is visible in both Focus and Tiles (REQ-1)", async ({ page, dashboard }) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.prefs.view).toBe("focus");

  await expect(issueButton(page)).toBeVisible();
  await expect(issueButton(page)).toHaveCSS("opacity", "1");

  const tiles = (await loadFixture("shell-idle-tiles")).snapshot.prefs;
  expect(tiles.view).toBe("tiles");
  dashboard.send({ type: "prefs", prefs: tiles });
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(issueButton(page)).toBeVisible();
  await expect(issueButton(page)).toHaveCSS("opacity", "1");
});
