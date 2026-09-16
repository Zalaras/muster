import { queryEvents } from "./helpers/db";
import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart } from "./helpers/payloads";
import {
  buildMarkdownFixtureTree,
  fileEntry,
  popOutLink,
  readerRegion,
  readerStatusLine,
  renderedBody,
} from "./helpers/reader";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
} from "./helpers/session";
import { mainheadSurfaceButton } from "./helpers/shell";
import { liveTile } from "./helpers/terminal";
import { htmlTheme, openSettingsDialog, themeRadio } from "./helpers/theme";

// Plan general-cleanup — REQ-7 (focus restore), REQ-8 (pop-out never shows unreachable
// before its first hello), REQ-9 (pop-out follows live theme), REQ-12 (envelope pane
// corroboration). Plan acceptance: E1-E5 (E6 = `make e2e`, E7 = plain-shell.spec.ts's own
// soak, both covered elsewhere). Authored against a tree with none of REQ-7/8/9/12 built
// yet — every test here is collection-only at authoring (`npx playwright test --list`);
// none was run live.
//
// Fixture plan (plan.md header): `daemon`, fresh per test — E1/E2 kill and restart their
// daemon, E4 asserts envelope routing that must not leak into a neighbour's session rows,
// and E5 flips `prefs.theme`, which is daemon-global. None of these tolerate a shared
// file daemon.

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
    const endBtn = mainhead.getByRole("button", { name: "End" });
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
    const endBtn = tile.locator(".tfoot").getByRole("button", { name: "End" });
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

test("an enveloped SessionStart with a mismatched pane persists unrouted; the same event with the real pane binds it (E4, REQ-12, INV-CORROBORATE)", async ({
  page,
  daemon,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "corroborate-e4" });
    const realPane = await daemon.tmuxPaneId(session.tmuxTarget);
    const claudeId = "claude-corroborate-e4";

    const mismatchRes = await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id, tmuxPane: "%999" }),
    });
    expect(mismatchRes.status()).toBe(200);

    // Ingest is async (CLAUDE.md: "return 200 immediately and process asynchronously") —
    // poll on the mismatched event's own persistence, never a fixed sleep, before
    // reading state back.
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length > 0, {
        message: "waiting for the mismatched-pane hook to be persisted",
      })
      .toBe(true);
    const afterMismatch = findSession(await getState(page, daemon), session.id);
    expect(afterMismatch.claudeSessionId).toBeNull();
    expect(afterMismatch.state).toBe("started");

    const matchRes = await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id, tmuxPane: realPane }),
    });
    expect(matchRes.status()).toBe(200);
    await expect
      .poll(async () => findSession(await getState(page, daemon), session.id).claudeSessionId)
      .toBe(claudeId);
  } finally {
    await cleanup();
  }
});

test("an open pop-out follows a live theme change without reload (E5, REQ-9)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    // decideInitialOpen has nothing to open in a directory with no plan and no files
    // (reader.spec.ts's E4), and popOutLink is null whenever openPath is null
    // (buildBarVM) — seed a file and open it so the pop-out link actually renders.
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "popout-theme-e5" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "popout-theme-e5");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });
    await expect(popOutLink(region)).toBeVisible({ timeout: 15_000 });

    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    await expect(readerRegion(popup, "popout-theme-e5")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => htmlTheme(popup)).toBe("instrument");

    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Dark").check();
    await expect.poll(() => htmlTheme(page)).toBe("dark");

    // No reload of the pop-out anywhere above — the broadcast alone must move it.
    await expect.poll(() => htmlTheme(popup)).toBe("dark");
  } finally {
    await cleanup();
  }
});
