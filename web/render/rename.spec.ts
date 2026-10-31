// rename — the display properties of the shared rename editor (#10) and the header's title fit,
// re-levelled on 2026-10-20 from
// web/e2e/rename.spec.ts (plans/_audit/relevel/misc-core.md): opening the mainhead's field
// and cancelling it with Escape touches no API (the request log proves no PUT was sent),
// and a 300-character title's clipping is header geometry for a given snapshot. Nothing
// here changes state: the titled session comes from `three-states` and the long one from
// `long-title`, whose title arrived the way a long one really can — as Claude's own session
// name on the status line, since the daemon caps an override at 100. The journeys — every
// commit (`PUT …/title`), the view switches (`PUT /api/prefs`), the restart — stay in
// web/e2e/rename.spec.ts.
import { railCardByTitle } from "./helpers/card-location";
import { focusSession, mainheadRenameButton } from "./helpers/focus";
import { expect, test } from "./helpers/harness";
import { mainheadRenameField } from "./helpers/rename";

test("pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("three-states");
  await focusSession(page, "Alpha");

  let titlePuts = 0;
  page.on("request", (req) => {
    if (req.method() !== "PUT") return;
    if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
  });

  await mainheadRenameButton(page).click();
  await mainheadRenameField(page).fill("this should never be sent");
  await page.keyboard.press("Escape");

  await expect(mainheadRenameField(page)).toHaveCount(0);
  await expect(mainheadRenameButton(page)).toHaveText("Alpha");
  await expect(railCardByTitle(page, "Alpha")).toBeVisible();
  expect(titlePuts).toBe(0);
});

test("a 300-character unbroken mainhead title ellipsises in place and never pushes the Session actions button out of view at 900px and 1400px", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("long-title");
  const [session] = fixture.snapshot.sessions;
  expect(fixture.snapshot.sessions).toHaveLength(1);
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  const longTitle = session.title;
  if (longTitle === null) throw new Error("long-title: the session is untitled");
  expect(longTitle).toHaveLength(300);
  expect(longTitle).toMatch(/^\S+$/);
  await expect(mainheadRenameButton(page)).toHaveText(longTitle);

  for (const width of [900, 1400]) {
    await page.setViewportSize({ width, height: 800 });
    const layout = await page.evaluate(() => {
      const mainhead = document.querySelector("#mainhead") as HTMLElement;
      const acts = document.querySelector("#mainhead .acts") as HTMLElement;
      const rename = document.querySelector("#mainhead .rename") as HTMLElement;
      return {
        actsRight: acts.getBoundingClientRect().right,
        paddingBoxRight:
          mainhead.getBoundingClientRect().right -
          Number.parseFloat(getComputedStyle(mainhead).paddingRight),
        viewportWidth: document.documentElement.clientWidth,
        // Every action button, the surface switch's segments left out: the header has one
        // Session actions button.
        buttons: [...acts.querySelectorAll<HTMLElement>("button")]
          .filter((button) => !button.closest(".surfseg"))
          .map((button) => ({
            label: button.getAttribute("aria-label") ?? "?",
            right: button.getBoundingClientRect().right,
          })),
        renameScrollWidth: rename.scrollWidth,
        renameClientWidth: rename.clientWidth,
      };
    });
    expect(
      layout.actsRight,
      `#mainhead .acts stays inside the mainhead's padding box at ${width}px`,
    ).toBeLessThanOrEqual(layout.paddingBoxRight + 0.5);
    expect(
      layout.buttons.map((button) => button.label),
      `the header's action buttons at ${width}px`,
    ).toEqual(["Session actions"]);
    for (const { label, right } of layout.buttons) {
      expect(right, `${label} button is in view at ${width}px`).toBeLessThanOrEqual(
        layout.viewportWidth,
      );
    }
    expect(
      layout.renameScrollWidth,
      `#mainhead .rename is really clipped at ${width}px`,
    ).toBeGreaterThan(layout.renameClientWidth);
  }
});
