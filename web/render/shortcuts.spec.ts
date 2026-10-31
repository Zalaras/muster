// shortcuts — the display properties of the shortcuts (edge cases 2, 3,
// 4 and 6), re-levelled from web/e2e/shortcuts.spec.ts on 2026-10-20
// (plans/_audit/relevel/shortcuts-views-tiles.md): what a chord does to the page for a given
// snapshot — opens the launch dialog, moves the Focus header to the nth or the neediest card,
// promotes a strip card into the grid, leaves an all-ended rail alone — needs no daemon to
// falsify. The view and the rail's sort mode are prefs the dashboard adopts only from the
// broadcast, so each comes from its fixture (`empty-tiles`, `tiles-*`,
// `shortcuts-rail-attention`) rather than a click; a rail-card click moves focus client-side
// and touches no API. Every chord is a real key press by its physical code (`KeyN`,
// `Digit0`–`Digit9`), matching the binding table's event.code rule, and the page's clock is
// advanced after it so what is asserted is the settled state, not a transient. The one
// journey — ⌥⌘0 in Tiles promoting a session that became the neediest only after the grid
// was filled — stays in web/e2e/shortcuts.spec.ts.
import { railCardByTitle } from "./helpers/card-location";
import {
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  type Session,
  settleFor,
  test,
} from "./helpers/harness";
import { launchDialog, mainheadName, openLaunchDialog } from "./helpers/shortcuts";
import { activeElementInsideTerminal, terminalRegion } from "./helpers/surfaces";
import { liveTile, stripCard, tileStateDot, tilesGridOrder } from "./helpers/tiles";

/** The rail's cards (`#sessions`) in DOM order — the order ⌥⌘1 indexes into. */
function railCards(page: Page): Locator {
  return page.locator("#sessions").getByTestId("session-card");
}

/** The strip's cards (`#tiles-strip`) — every session without a live tile. */
function stripCards(page: Page): Locator {
  return page.locator("#tiles-strip").getByTestId("session-card");
}

/** The fixture session with this title. */
function titled(fixture: RenderFixture, title: string): Session {
  const session = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`fixture ${fixture.scenario} has no session titled ${title}`);
  return session;
}

/** Every fixture session's title — the scenarios here title each one. */
function titlesOf(fixture: RenderFixture): string[] {
  return fixture.snapshot.sessions.map((s) => {
    if (s.title === null)
      throw new Error(`fixture ${fixture.scenario}: session ${s.id} is untitled`);
    return s.title;
  });
}

/** The one title with no live tile in the grid. */
async function strippedTitle(page: Page, titles: readonly string[]): Promise<string> {
  const stripped: string[] = [];
  for (const t of titles) {
    if ((await liveTile(page, t).count()) === 0) stripped.push(t);
  }
  const [only] = stripped;
  if (stripped.length !== 1 || !only)
    throw new Error(`expected exactly one stripped title, got ${stripped.join(", ") || "none"}`);
  return only;
}

/** The render tick every second (`setInterval(render, 1000)`) runs under the installed
 * clock: advancing past one proves a chord's effect is the settled state. */
const ONE_TICK_MS = 1_100;

test("pressing Opt+Cmd+N in Focus opens the launch dialog (E1)", async ({ page, dashboard }) => {
  await dashboard.open("empty");
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(launchDialog(page)).toBeVisible();
  await settleFor(page, ONE_TICK_MS);
  await expect(launchDialog(page)).toBeVisible();
});

test("pressing Opt+Cmd+N in Tiles opens the launch dialog (E2, INV-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty-tiles");
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(launchDialog(page)).toBeVisible();
});

test("pressing Opt+Cmd+N with the dialog already open leaves it open and keeps the Title field (E3, edge case 2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
  const dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("still-here");

  await page.keyboard.press("Alt+Meta+KeyN");

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("still-here");
});

test("pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card, in manual and attention modes (E4)", async ({
  page,
  dashboard,
}) => {
  // Manual mode: rail order is launch order [a, b, c] — Opt+Cmd+1 must land on a.
  const manual = await dashboard.open("shortcuts-rail");
  expect(manual.snapshot.prefs.railSort).toBe("manual");
  const a = titled(manual, "rail-a");
  await expect(railCards(page)).toHaveCount(3);
  await expect(railCards(page).first()).toHaveAttribute("data-session-id", String(a.id));

  await railCardByTitle(page, "rail-b").click();
  await expect(mainheadName(page)).toHaveText("rail-b");

  await page.keyboard.press("Alt+Meta+Digit1");
  await expect(mainheadName(page)).toHaveText("rail-a");
  await settleFor(page, ONE_TICK_MS);
  await expect(mainheadName(page)).toHaveText("rail-a");

  // Attention mode with c the neediest — the rail's first card is now c, not a (decision
  // cmd-n-ordering Option A: the shortcut follows orderRail's CURRENT order). The sort
  // mode is a pref the page adopts only from the broadcast, so it is the fixture's.
  const attention = await dashboard.open("shortcuts-rail-attention");
  expect(attention.snapshot.prefs.railSort).toBe("attention");
  const c = titled(attention, "rail-c");
  expect(c.state).toBe("needs_input");
  await expect(railCards(page)).toHaveCount(3);
  await expect(railCards(page).first()).toHaveAttribute("data-session-id", String(c.id));

  await railCardByTitle(page, "rail-a").click();
  await expect(mainheadName(page)).toHaveText("rail-a");

  await page.keyboard.press("Alt+Meta+Digit1");
  await expect(mainheadName(page)).toHaveText("rail-c");
  await settleFor(page, ONE_TICK_MS);
  await expect(mainheadName(page)).toHaveText("rail-c");
});

test("pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session into the grid (E5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("tiles-five-pinned");
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  const titles = titlesOf(fixture);
  expect(titles).toHaveLength(5);
  await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
  const stripped = await strippedTitle(page, titles);

  // The stripped session is the pinned one, so it is the rail's displayed first card
  // (orderRail: pinned block first) while it stays stripped from the grid — the case
  // Opt+Cmd+1 must actually promote, not merely re-select an already-live tile.
  expect(titled(fixture, stripped).pinned).toBe(true);
  await expect(stripCard(page, stripped).getByRole("button", { name: "Unpin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("Alt+Meta+Digit1");

  await expect(liveTile(page, stripped)).toBeVisible();
  await expect(stripCard(page, stripped)).toHaveCount(0);
  await settleFor(page, ONE_TICK_MS);
  await expect(liveTile(page, stripped)).toBeVisible();
  await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
});

test("pressing Opt+Cmd+0 focuses the longest-blocked needs-input session, ignoring a pinned session ahead of it in manual mode (E6, INV-4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("shortcuts-rail-pinned");
  expect(fixture.snapshot.prefs.railSort).toBe("manual");
  const a = titled(fixture, "rail-a");
  const c = titled(fixture, "rail-c");
  // a — a DIFFERENT session than the one that needs input — is pinned, so the rail's
  // actual first displayed card (what Opt+Cmd+1 would pick) is deliberately not c.
  expect(a.pinned).toBe(true);
  expect(c.state).toBe("needs_input");
  await expect(railCards(page)).toHaveCount(3);
  await expect(railCards(page).first()).toHaveAttribute("data-session-id", String(a.id));
  await expect(railCards(page).last()).toHaveAttribute("data-session-id", String(c.id));

  await railCardByTitle(page, "rail-b").click();
  await expect(mainheadName(page)).toHaveText("rail-b");

  await page.keyboard.press("Alt+Meta+Digit0");
  await expect(mainheadName(page)).toHaveText("rail-c");
  await settleFor(page, ONE_TICK_MS);
  await expect(mainheadName(page)).toHaveText("rail-c");

  // Contrast, same setup: Opt+Cmd+1 (the rail's actual first card) reaches the
  // pinned a, not c — the exact case Opt+Cmd+0 exists to bypass.
  await railCardByTitle(page, "rail-b").click();
  await expect(mainheadName(page)).toHaveText("rail-b");
  await page.keyboard.press("Alt+Meta+Digit1");
  await expect(mainheadName(page)).toHaveText("rail-a");
});

test("pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live (edge case 6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("tiles-four");
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  const titles = titlesOf(fixture);
  expect(titles).toHaveLength(4);
  for (const t of titles) {
    await expect(liveTile(page, t)).toBeVisible();
  }
  await expect(stripCards(page)).toHaveCount(0);

  const blocked = fixture.snapshot.sessions.filter((s) => s.state === "needs_input");
  const [target] = blocked;
  if (blocked.length !== 1 || !target?.title) throw new Error("expected one needs-input session");
  // A live tile never renders the state word as visible text (that's rail/strip-card-only,
  // via sessions/card.ts's BADGE_TEXT) — a live tile carries state only via the `.sdot`
  // dot's `title` attribute.
  await expect(tileStateDot(page, target.title)).toHaveAttribute("title", /needs input/i);
  const orderBefore = await tilesGridOrder(page);
  expect(orderBefore).toHaveLength(4);

  await page.keyboard.press("Alt+Meta+Digit0");
  await settleFor(page, ONE_TICK_MS);

  // Every tile that was live stays live — nothing was demoted to make room for a
  // session that already had a slot (edge case 6) — and the grid never re-sorts itself.
  for (const t of titles) {
    await expect(liveTile(page, t)).toBeVisible();
  }
  await expect(stripCards(page)).toHaveCount(0);
  expect(await tilesGridOrder(page)).toEqual(orderBefore);
});

test("pressing Opt+Cmd+0 with sessions present but none alive stays on the explicitly focused session, never falling through to the most-recently-ended one (edge case 4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("ended-pair");
  const older = titled(fixture, "ended-old");
  const newer = titled(fixture, "ended-new");
  expect(fixture.snapshot.sessions.every((s) => !s.alive)).toBe(true);
  if (!older.endedAt || !newer.endedAt)
    throw new Error("ended-pair: an ended session has no endedAt");
  expect(Date.parse(newer.endedAt)).toBeGreaterThan(Date.parse(older.endedAt));
  await expect(railCardByTitle(page, "ended-new")).toHaveClass(/ended/);
  await expect(railCardByTitle(page, "ended-old")).toHaveClass(/ended/);

  // Explicitly focus the OLDER (not-most-recently-ended) session, so a wrong
  // fallback to "most recently ended" — exactly what `sortSessions` would hand back
  // for an all-dead store — is distinguishable from a true no-op.
  await railCardByTitle(page, "ended-old").click();
  await expect(mainheadName(page)).toHaveText("ended-old");

  await page.keyboard.press("Alt+Meta+Digit0");
  await settleFor(page, ONE_TICK_MS);

  await expect(mainheadName(page)).toHaveText("ended-old");
});

test("pressing Opt+Cmd+0 with no sessions is a silent no-op (E7, edge case 3)", async ({
  page,
  dashboard,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await dashboard.open("empty");
  await expect(page.locator("#main-empty")).toBeVisible();

  await page.keyboard.press("Alt+Meta+Digit0");
  await settleFor(page, ONE_TICK_MS);

  await expect(page.locator("#main-empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("pressing Opt+Cmd+N with focus inside a session's terminal opens the dialog without leaking the keystroke to the terminal (E8, INV-3)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("shortcuts-rail");

  // The harness answers every terminal socket itself and keeps it silent; a route
  // registered after it wins for the sockets opened from here on, so focusing a second
  // card below opens the one socket whose outbound frames this test records.
  const sentFrames: string[] = [];
  await page.routeWebSocket(/\/ws\/terminal\/\d+$/, (ws) => {
    ws.onMessage((frame) => {
      sentFrames.push(String(frame));
    });
  });

  await railCardByTitle(page, "rail-b").click();
  const region = terminalRegion(page, "rail-b");
  await expect(region).toBeVisible();
  // The surface fits itself to the mounted pane and sends its geometry the moment the
  // socket opens — proof the recorder sees this socket's frames, so the empty check below
  // cannot pass vacuously.
  await expect.poll(() => sentFrames.length).toBeGreaterThan(0);

  await region.click();
  expect(await activeElementInsideTerminal(page, "rail-b")).toBe(true);

  // Only frames sent as a direct result of the shortcut itself count — clear
  // whatever the connection handshake/focus click already produced.
  sentFrames.length = 0;

  await page.keyboard.press("Alt+Meta+KeyN");

  await expect(launchDialog(page)).toBeVisible();
  await settleFor(page, ONE_TICK_MS);
  expect(sentFrames).toEqual([]);
});

test("pressing Opt+Cmd+1 with focus inside the launch dialog's Title field does not insert a digit into it (INV-3)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
  const dialog = await openLaunchDialog(page);
  const title = dialog.getByLabel("Title");
  await title.fill("no-leak");
  await title.focus();

  await page.keyboard.press("Alt+Meta+Digit1");

  await expect(title).toHaveValue("no-leak");
  await expect(title).toBeFocused();
});

test("the Focus and Tiles empty placeholders name the new Opt+Cmd+N chord (E9)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
  await expect(page.locator("#main-empty")).toHaveText("No sessions yet — ⌥⌘N to launch");

  // The view is a pref the page adopts only from the broadcast: the Tiles placeholder is
  // read off the same daemon state recorded under `view: "tiles"`.
  await dashboard.open("empty-tiles");
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#tiles-empty")).toHaveText(
    "No sessions yet — New session or ⌥⌘N to launch",
  );
});

test("the launch dialog heading names ⌥⌘N via its kbd chip, excluded from the accessible name (E10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
  const dialog = await openLaunchDialog(page);

  // Testable UI Elements: the `.kbd` chip is `aria-hidden`, so the heading's accessible
  // name stays "New session" rather than "New session ⌥⌘N".
  await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();
  await expect(dialog.locator("#launch-dialog-title .kbd")).toHaveText("⌥⌘N");
});
