// harness.spec.ts — the render tier's smoke proof: the built bundle, fed a generated
// fixture over a faked `/ws`, renders the rail from that snapshot alone. Each test asserts
// only what its fixture carries; nothing here changes a pref or launches anything, since
// a PUT to `/api/prefs` would meet the harness's deliberate 404.
import { expect, type Locator, type Page, test } from "./helpers/harness";

function sessionCards(page: Page): Locator {
  return page.getByTestId("session-card");
}

/** The state word inside a card, lowercase in the DOM (web/e2e/helpers/session.ts). */
function stateBadge(card: Locator): Locator {
  return card.getByText(/^\s*(started|planning|working|needs input|failed|idle)\s*$/i);
}

test("(R-smoke) three-states: one rail card per fixture session, each wearing its state word", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const sessions = fixture.snapshot.sessions;
  expect(sessions).toHaveLength(3);

  const cards = sessionCards(page);
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(stateBadge(cards.nth(i))).toBeVisible();
  }
  const expectedWords = sessions.map((s) => s.state.replace("_", " ")).sort();
  await expect
    .poll(async () => {
      const words: string[] = [];
      for (let i = 0; i < 3; i++) {
        words.push((await stateBadge(cards.nth(i)).innerText()).trim().toLowerCase());
      }
      return words.sort();
    })
    .toEqual(expectedWords);
});

test("(R-smoke) three-states: the rail density is the snapshot's pref, not a default", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  await expect(page.locator("body")).toHaveAttribute(
    "data-rail-density",
    fixture.snapshot.prefs.railDensity,
  );
  await expect(page.locator("#rail-density .seg-btn[aria-pressed='true']")).toHaveCount(1);
});

test("(R-smoke) moved-to-worktree: the card whose Claude is in another checkout shows the ↳ block", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("moved-to-worktree");
  const moved = fixture.snapshot.sessions.filter((s) => s.claudeLocation !== null);
  expect(moved.length).toBeGreaterThan(0);

  const cards = sessionCards(page);
  await expect(cards).toHaveCount(fixture.snapshot.sessions.length);
  const shown = cards.locator(".r2c:not([hidden])");
  await expect(shown).toHaveCount(moved.length);
  await expect(shown.first().locator(".lead")).toHaveText("↳");
  await expect(shown.first().locator(".rf")).not.toBeEmpty();
});

test("(R-smoke) hello: the masthead reads the Claude Code version the fixture's hello carries", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const installed = fixture.hello.claudeCode.installed;
  const readout = page.locator("#claude-version");
  if (installed === null) {
    await expect(readout).toHaveText(/claude unknown/i);
  } else {
    await expect(readout).toContainText(installed);
  }
});
