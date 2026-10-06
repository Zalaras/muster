import { countMigrations } from "./helpers/db";
import { expect, settleFor, test } from "./helpers/fixtures";
import { readerStatusLine } from "./helpers/reader";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";
import { liveTile } from "./helpers/terminal";

// REQ-2, REQ-9, REQ-17, REQ-19, REQ-20 — daemon-down banner + reconnect, restart
// behaviour (token/migration persistence). Every test kills or restarts its daemon, so
// each takes the test-scoped `daemon` fixture (a fresh scratch daemon per test); the
// three are independent scenarios, so nothing here needs to run in sequence.
test.describe("daemon resilience", () => {
  test("shows the daemon-down banner when the scratch daemon is killed, and clears it on restart", async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    await expect(page.getByRole("status")).toHaveText(/connected/i);

    await daemon.kill();

    // Testable UI Elements: mandated role="alert" full-width banner.
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveText(/musterd unreachable/i);

    await daemon.restart();

    // REQ-17: the banner clears when `hello` arrives again — no page reload needed (E12).
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("status")).toHaveText(/connected/i);
  });

  test("a steady daemon-down produces no #banner mutations for its role=alert to re-announce", async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    await expect(page.getByRole("status")).toHaveText(/connected/i);

    const banner = page.getByRole("alert");

    await daemon.kill();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveText(/musterd unreachable/i);

    // connection.ts's render phase re-evaluates the banner on every 1 s tick
    // (main.ts's `setInterval(app.render)`) even while nothing has changed, so a
    // regression back to an unconditional write shows up here as repeated mutations to
    // an `#banner` whose text, class and `hidden` are already settled. The observer is
    // attached only once the down-transition itself has settled (above), so its own
    // mutations aren't counted.
    await page.evaluate(() => {
      const el = document.getElementById("banner");
      if (!el) throw new Error("no #banner element");
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(el, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
      (window as unknown as { __bannerMutationCount: () => number }).__bannerMutationCount = () =>
        count;
    });

    await settleFor(page, 5_000);

    expect(
      await page.evaluate(() =>
        (window as unknown as { __bannerMutationCount: () => number }).__bannerMutationCount(),
      ),
    ).toBe(0);

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
  });

  test("keeps the same UI and ingest tokens across a restart on the same data dir", async ({
    request,
    daemon,
  }) => {
    const uiTokenBefore = daemon.uiToken;
    const ingestTokenBefore = daemon.ingestToken;

    await daemon.restart();

    expect(daemon.uiToken).toBe(uiTokenBefore);
    expect(daemon.ingestToken).toBe(ingestTokenBefore);

    const res = await request.get(`${daemon.baseURL}/healthz`);
    expect(res.status()).toBe(200);
  });

  test("does not re-apply migrations on a second startup against the same data dir", async ({
    daemon,
  }) => {
    const before = await countMigrations(daemon.dbPath);
    expect(before).toBeGreaterThan(0);

    await daemon.restart();

    const after = await countMigrations(daemon.dbPath);
    expect(after).toBe(before);
  });
});

// Plan general-cleanup — REQ-7 (focus restore across a drop and reconnect) and REQ-8 (a
// pop-out never shows unreachable before its first hello). Each test kills or routes its own
// daemon's socket, so each takes the test-scoped `daemon` fixture.

test("focus returns to the mainhead End button by node identity after a daemon drop and reconnect (E1, REQ-7, INV-FOCUS)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "focus-restore-e1" });
    await sessionCard(page, "focus-restore-e1").click();

    const mainhead = page.locator("#mainhead");
    const endBtn = mainhead.getByRole("button", { name: "Stop" });
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    // Node identity, not merely a re-resolved locator match (docs/conventions.md
    // §Testing / kb:lesson/select-rebuilt-every-tick-passed-selectoption): the render
    // that re-enables the button on reconnect must hand focus back to this exact DOM
    // node, not a same-role-and-name replacement.
    const endHandle = await endBtn.elementHandle();
    if (!endHandle) throw new Error("mainhead End button not found");

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(endBtn).toBeDisabled();

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(endBtn).toBeEnabled();
    expect(await page.evaluate((n) => document.activeElement === n, endHandle)).toBe(true);
  } finally {
    await cleanup();
  }
});

test("focus returns to a tile's End button by node identity after a daemon drop and reconnect (E2, REQ-7, INV-FOCUS)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "focus-restore-e2" });
    await page.getByRole("button", { name: "Tiles" }).click();

    const tile = liveTile(page, "focus-restore-e2");
    await expect(tile).toBeVisible();
    const endBtn = tile.locator(".tfoot").getByRole("button", { name: "Stop" });
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    const endHandle = await endBtn.elementHandle();
    if (!endHandle) throw new Error("tile End button not found");

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(endBtn).toBeDisabled();

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(endBtn).toBeEnabled();
    expect(await page.evaluate((n) => document.activeElement === n, endHandle)).toBe(true);
  } finally {
    await cleanup();
  }
});

test("a pop-out that has never connected shows connecting…, never musterd unreachable, until its first hello (E3, REQ-8, INV-POPOUT-CONNECTING)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "popout-e3" });

    // The plan's own E3 acceptance criterion names `daemon.kill()` before the pop-out's
    // own navigation, but a genuinely killed daemon has no listener left to serve
    // `/doc.html` at all — there is no HTTP response to assert a status line against.
    // Routing (transparently proxying) the pop-out's OWN WebSocket and simply
    // withholding `connectToServer()` reproduces the exact same observable state INV-
    // POPOUT-CONNECTING names ("daemon down before load" — no hello has ever arrived)
    // without that contradiction; it is the same technique actions.spec.ts's E14/Major 4
    // test already uses to force a connection outage without touching the daemon
    // process. Registered before the pop-out's navigation (Playwright: only sockets
    // created after this call are routed).
    const wsRouteBox: { connect: (() => void) | null } = { connect: null };
    await page.routeWebSocket("**/ws", (ws) => {
      wsRouteBox.connect = () => ws.connectToServer();
    });

    // Still-authed navigation on the SAME page (the dashboardUrl visit above already
    // set the cookie) — a hand-built pop-out URL is fine here, unlike reader.spec.ts's
    // "must go through the real link" pop-out-layout test: that note is about a page
    // that never visited the dashboard at all, not this one.
    await page.goto(
      `${daemon.baseURL}/doc.html?session=${session.id}&path=${encodeURIComponent("does-not-exist.md")}`,
    );

    const statusLine = readerStatusLine(page.locator("#reader-host"));
    await expect(statusLine).toHaveText(/connecting…/i, { timeout: 15_000 });
    // Prove absence, held past any plausible transient render (settleFor — a
    // stays-unchanged check per docs/conventions.md §Testing, never a wait).
    await settleFor(page, 2000);
    await expect(statusLine).not.toHaveText(/unreachable/i);

    if (!wsRouteBox.connect) {
      throw new Error("expected the pop-out's WebSocket route to be active");
    }
    wsRouteBox.connect();
    await expect(statusLine).not.toHaveText(/connecting…/i, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});
