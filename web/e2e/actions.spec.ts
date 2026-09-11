import { expect, fileDaemon, settleFor, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawNotification,
  rawUserPromptSubmit,
  sessionStartResume,
} from "./helpers/payloads";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  type SessionObject,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { TerminalSocketTracker, terminalRegion } from "./helpers/terminal";
import { resolvedCssVar } from "./helpers/theme";

// Plan m4-reconcile — REQ-5 through REQ-16 (End / Remove / Resume, dialogs, dead
// surface). Plan acceptance: E5-E15 (E2-E4 live in reconcile.spec.ts).
//
// Plan code-breakup's E2E split (plan.md UI Specifications → E2E split) moved this
// file's Tiles-footer tests to tiles.spec.ts and its keyboard/hover/re-sort rail-card
// tests to rail-cards.spec.ts; what remains below is End/Remove/Resume/dead-surface
// behaviour scoped to a single focused session or the mainhead.
//
// Daemon shape (docs/conventions.md §Testing): mixed. Most tests read the file-shared
// `sharedDaemon()` (one scratch daemon per file via fileDaemon()) — every assertion is
// scoped to its own session's title/card, and every test that mounts a terminal
// explicitly clicks its own card first rather than relying on Focus's
// auto-focus-top-of-sort (which is NOT this test's session once other tests in this file
// have launched their own — terminal.spec.ts's file header documents exactly this trap).
// Tests that need the daemon to hold exactly one session (INV-5), that check focus moves
// to "the top card" (E9), or that put the connection down (E14), destructure the `daemon`
// fixture instead — a fresh daemon per test, torn down by the fixture. They stay in file
// order rather than being grouped into a describe so no test is renamed or moved.

const sharedDaemon = fileDaemon();

test("End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const sessionA = await launchSession(page, sharedDaemon(), {
      directory: dirA.path,
      title: "end-mainhead-a",
    });
    const sessionB = await launchSession(page, sharedDaemon(), {
      directory: dirB.path,
      title: "end-mainhead-b",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-a", {
        musterSession: sessionA.id,
      }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-b", {
        musterSession: sessionB.id,
      }),
    });

    const cardA = sessionCard(page, "end-mainhead-a");
    await cardA.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("end-mainhead-a");

    const bAttachedBefore = await sharedDaemon().tmuxDisplay(
      sessionB.tmuxTarget,
      "#{session_attached}",
    );

    // exact: true — sanctioned repair (plan ui-text-and-focus, REQ-13/Testable UI
    // Elements): the mainhead heading now also hosts a rename trigger whose accessible
    // name is the display title, and this test's own fixture title ("end-mainhead-a")
    // contains "end" as a substring, so a non-exact match is ambiguous.
    await mainhead.getByRole("button", { name: "End", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "End session?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("end-mainhead-a");
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog).toBeHidden();

    await expect(cardA).toHaveClass(/ended/, { timeout: 15_000 });
    await expect(cardA.getByText(/^ended /)).toBeVisible();

    // B is untouched: still alive, tmux session/pane intact, no attach-client change.
    expect(await sharedDaemon().tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
    const bAttachedAfter = await sharedDaemon().tmuxDisplay(
      sessionB.tmuxTarget,
      "#{session_attached}",
    );
    expect(bAttachedAfter).toBe(bAttachedBefore);
    const state = await getState(page, sharedDaemon());
    const foundB = findSession(state, sessionB.id);
    expect(foundB.alive).toBe(true);
    expect(foundB.state).toBe(sessionB.state);

    // A sorts after B (REQ-9: every ended session after every live one) — plan
    // order-sidebar's approved protocol delta (§3.3/§5.3) makes this an Attention-mode
    // guarantee only: REQ-5's default `railSort` is "manual", and REQ-7 says a state
    // change (ending A is one) never moves a card in manual mode. Switch to Attention,
    // then wait for the resulting resort before asserting the REQ-9 order.
    await page.locator("#rail-sort").selectOption("attention");
    await expect
      .poll(async () => {
        const cardTexts = await page.getByTestId("session-card").allInnerTexts();
        const idxA = cardTexts.findIndex((t) => t.includes("end-mainhead-a"));
        const idxB = cardTexts.findIndex((t) => t.includes("end-mainhead-b"));
        return idxA >= 0 && idxB >= 0 && idxB < idxA;
      })
      .toBe(true);
    const cardTexts = await page.getByTestId("session-card").allInnerTexts();
    const idxA = cardTexts.findIndex((t) => t.includes("end-mainhead-a"));
    const idxB = cardTexts.findIndex((t) => t.includes("end-mainhead-b"));
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeLessThan(idxA);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("Cancel and Escape close both End and Remove dialogs without sending any request (E10)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "cancel-escape-e10",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-cancel-escape-e10", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "cancel-escape-e10");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("cancel-escape-e10");

    let mutations = 0;
    page.on("request", (req) => {
      const method = req.method();
      if (method !== "POST" && method !== "DELETE") return;
      const path = new URL(req.url()).pathname;
      if (/^\/api\/sessions\/\d+(\/(end|resume))?$/.test(path)) mutations++;
    });

    const endDialog = page.getByRole("dialog", { name: "End session?" });
    await mainhead.getByRole("button", { name: "End" }).click();
    await expect(endDialog).toBeVisible();
    await endDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(endDialog).toBeHidden();

    await mainhead.getByRole("button", { name: "End" }).click();
    await expect(endDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(endDialog).toBeHidden();

    const removeDialog = page.getByRole("dialog", { name: "Remove session?" });
    await mainhead.getByRole("button", { name: "Remove" }).click();
    await expect(removeDialog).toBeVisible();
    await removeDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(removeDialog).toBeHidden();

    await mainhead.getByRole("button", { name: "Remove" }).click();
    await expect(removeDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(removeDialog).toBeHidden();

    const state = await getState(page, sharedDaemon());
    expect(findSession(state, session.id).alive).toBe(true);
    expect(mutations).toBe(0);
  } finally {
    await cleanup();
  }
});

test("a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "dead-surface-e6",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-dead-surface-e6", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "dead-surface-e6");
    await card.click();
    const region = terminalRegion(page, "dead-surface-e6");
    await expect(region).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);

    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    await expect(deadSurface.locator(".endbar")).toHaveText(/^ended /);
    const cap = deadSurface.locator(".endcap");
    await expect(cap).toContainText(/session ended/i);
    const resumeBtn = cap.getByRole("button", { name: "Resume" });
    await expect(resumeBtn).toBeVisible();

    // review m4-reconcile cycle-3 Critical 1 / Minor 2: `toBeVisible()` alone is
    // vacuous here — Playwright's actionability model does not treat `opacity: 0` as
    // hidden, which is exactly how the dead-surface cap's Resume button went blank
    // while this very assertion stayed green. Read the actual computed style instead:
    // both the button and its containing `.acts-row` must resolve to opacity 1 on
    // Focus's `#dead-surface` (the cap is the surface's one recovery affordance, never
    // a hover reveal — style.css's `.card .acts-row` scoping must not reach it).
    await expect(resumeBtn).toHaveCSS("opacity", "1");
    await expect(cap.locator(".acts-row")).toHaveCSS("opacity", "1");

    // The stub's own startup line is in the pane's scrollback, so a real capture-pane
    // snapshot carries it — a stale/empty snapshot would not.
    await expect(deadSurface.locator("pre.snapshot")).toContainText(
      "MUSTER-STUB-READY",
    );

    // The dashboard never opens a terminal socket for a dead session (REQ-13/INV-5).
    await expect(
      page.locator('[aria-label="Terminal: dead-surface-e6"]'),
    ).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// Fresh `daemon`, not the file's shared one: after End, Focus falls through to the next
// live card and attaches a terminal to it — a legitimate second socket when a neighbour
// test's session exists, which would falsify "never reopens" for the wrong reason. INV-5
// is only observable when the ended session was the daemon's only one.
test("Ending a focused session closes its terminal socket and never reopens one while dead (INV-5)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const tracker = new TerminalSocketTracker(page);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "inv5-socket",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-inv5-socket", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "inv5-socket");
    await card.click();
    const region = terminalRegion(page, "inv5-socket");
    await expect(region).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });
    await expect.poll(() => tracker.liveCount).toBe(1);

    const endRes = await page.request.post(
      `${daemon.baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);

    await expect
      .poll(() => tracker.liveCount, {
        message: "waiting for the terminal socket to close (4001) after End",
      })
      .toBe(0);
    await expect(page.locator("#dead-surface")).toBeVisible({
      timeout: 15_000,
    });

    // Hold, then confirm no (incorrect) reattach attempt ever happened in that window.
    await settleFor(page, 1_000);
    expect(tracker.liveCount).toBe(0);
    expect(tracker.totalOpened).toBe(1);
  } finally {
    await cleanup();
  }
});

test("clicking Resume in the ended cap relaunches the session with the same claude id in its argv (E7)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "resume-e7",
    });
    const claudeId = "claude-resume-e7";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    const card = sessionCard(page, "resume-e7");
    await card.click();
    await expect(terminalRegion(page, "resume-e7")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    const cap = page.locator("#dead-surface .endcap");
    await expect(cap).toBeVisible({ timeout: 15_000 });

    await cap.getByRole("button", { name: "Resume" }).click();

    // No confirm dialog for Resume (User Flow 3).
    await expect(page.locator("#end-dialog")).not.toBeVisible();
    await expect(page.locator("#remove-dialog")).not.toBeVisible();

    await expect(card).not.toHaveClass(/ended/, { timeout: 15_000 });
    await expect(terminalRegion(page, "resume-e7")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );

    const state = await getState(page, sharedDaemon());
    const resumed = findSession(state, session.id);
    expect(resumed.alive).toBe(true);
    expect(resumed.endedAt).toBeNull();

    const paneCmd = await sharedDaemon().paneStartCommand(resumed.tmuxTarget);
    expect(paneCmd).toContain("--resume");
    expect(paneCmd).toContain(claudeId);
  } finally {
    await cleanup();
  }
});

test("the resume SessionStart lands the card in idle with no attention or failure carried over (E8, E15, INV-6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "resume-idle-e8",
    });
    const claudeId = "claude-resume-idle-e8";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });
    const card = sessionCard(page, "resume-idle-e8");
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    await expect(card.getByText(/needs your permission/i)).toBeVisible();

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const resumeRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/resume`,
    );
    expect(resumeRes.status()).toBe(200);
    const resumedBody = (await resumeRes.json()) as SessionObject;
    // "state is unchanged until the enveloped SessionStart(source:"resume") arrives"
    // (REQ-7's response contract) — still needs_input right after the POST.
    expect(resumedBody.state).toBe("needs_input");
    await expect(card).not.toHaveClass(/ended/, { timeout: 15_000 });

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: sessionStartResume(claudeId, { musterSession: session.id }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    // The attention note is gone from the card (E15) — not merely a different badge word.
    await expect(card.getByText(/needs your permission/i)).toHaveCount(0);

    const state = await getState(page, sharedDaemon());
    const found = findSession(state, session.id);
    expect(found.attention).toBeNull();
    expect(found.failure).toBeNull();
  } finally {
    await cleanup();
  }
});

test("a session with no captured snapshot shows 'no snapshot captured' under the ended cap (E13)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "no-snap-e13",
    });
    // Kill the window as fast as possible after launch — before the ~5s liveness/snapshot
    // poll tick can land any capture in between (plan Edge Case 13's own framing: "killed
    // before the first tick"). Best-effort by construction; the daemon-side race is the
    // plan's, not this spec's, to resolve.
    await sharedDaemon().killTmuxWindow(session.tmuxTarget);

    await page.reload();
    await sessionCard(page, "no-snap-e13").click();
    await expect(page.locator("#dead-surface .endcap")).toContainText(
      /no snapshot captured/i,
      { timeout: 15_000 },
    );
  } finally {
    await cleanup();
  }
});

test("Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "remove-live-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "remove-live-b",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-remove-live-a", {
        musterSession: sessionA.id,
      }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-remove-live-b", {
        musterSession: sessionB.id,
      }),
    });

    const cardA = sessionCard(page, "remove-live-a");
    await cardA.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("remove-live-a");

    // Live cards carry only End (REQ-11) — Remove for a live session comes from the
    // mainhead only (REQ-10's "always enabled").
    await expect(cardA.getByRole("button", { name: "Remove" })).toHaveCount(
      0,
    );

    // exact: true — sanctioned repair (plan ui-text-and-focus, REQ-13/Testable UI
    // Elements): the mainhead's rename trigger's accessible name is the display
    // title, and this test's own fixture title ("remove-live-a") contains "remove"
    // as a substring, so a non-exact match is ambiguous.
    await mainhead.getByRole("button", { name: "Remove", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/ends the session first/i);

    // review m4-reconcile Fix Attempt 3 (web-implementation.md): the confirm dialog's
    // destructive buttons were repointed from `--rose` (reserved for the Failed state
    // per design-system §3) to a dedicated `--danger` family fill. Assert the computed
    // background against the live `--danger`/`--rose` tokens (not a hardcoded literal —
    // plan new-ui-design-colors REQ-2 adjusted `--danger`'s Instrument shade for AA, so
    // a hex literal here would silently drift out of sync with style.css) — explicitly
    // not `--rose` either, so a same-family off-by-one token swap would still fail.
    const removeConfirmBtn = dialog.getByRole("button", {
      name: "Remove",
      exact: true,
    });
    const dangerBg = await resolvedCssVar(page, "--danger", "background-color");
    const roseBg = await resolvedCssVar(page, "--rose", "background-color");
    await expect(removeConfirmBtn).toHaveCSS("background-color", dangerBg);
    await expect(removeConfirmBtn).not.toHaveCSS("background-color", roseBg);

    await removeConfirmBtn.click();
    // review m4-reconcile fix-cycle-1: `<dialog>.close()` runs synchronously on click,
    // strictly BEFORE `onConfirmRemove`'s async `DELETE` even starts (render/confirm.ts)
    // — `toBeHidden()` here proves nothing about whether the server-side kill has
    // completed. `cardA`'s removal, in contrast, only happens from `handleRemoved`,
    // which `doRemove` calls only after the `DELETE` response resolves `ok` — so wait
    // for that (already polling, `{ timeout: 15_000 }`) before treating the kill as
    // done. This card-gone wait is the same the pre-existing assertion already used;
    // reordering it first fixes a race that got tighter once Minor 1's fix added one
    // more synchronous `PaneExists` check inside `End`, not a weaker assertion.
    await expect(dialog).toBeHidden();
    await expect(cardA).toHaveCount(0, { timeout: 15_000 });
    expect(await daemon.tmuxPaneExists(sessionA.tmuxTarget)).toBe(false);

    // Only A and B exist in this isolated daemon — focus must now be on B.
    await expect(mainhead).toContainText("remove-live-b", {
      timeout: 15_000,
    });
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("action buttons are disabled while the daemon connection is down (E14)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "down-e14",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-down-e14", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "down-e14");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("down-e14");

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await expect(
      mainhead.getByRole("button", { name: "End" }),
    ).toBeDisabled();
    await expect(
      mainhead.getByRole("button", { name: "Resume" }),
    ).toBeDisabled();
    await expect(
      mainhead.getByRole("button", { name: "Remove" }),
    ).toBeDisabled();
    await expect(card.getByRole("button", { name: "End" })).toBeDisabled();

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

// review m4-reconcile fix-cycle-1 Major 4: E14 above only ever puts a LIVE focused
// session on screen, where End is disabled by `alive` regardless of connection and the
// incidental terminal-socket-close re-render masks Major 3's actual defect (a missing
// `render()` call from `onDisconnected`/`setStatus`). Mainhead Resume/Remove and the
// `.endcap` Resume only ever become *enabled* for a DEAD focused session, so only this
// case can prove the daemon-down disable (and reconnect re-enable) actually reaches them.
test("action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    // Route (transparently proxy) the dashboard's one WebSocket so the test can force a
    // close from outside, without touching the daemon process itself — must be
    // registered before navigation (Playwright: "only WebSockets created after this
    // method was called will be routed").
    const wsRouteBox: { close: (() => Promise<void>) | null } = { close: null };
    await page.routeWebSocket("**/ws", (ws) => {
      ws.connectToServer();
      wsRouteBox.close = () => ws.close();
      ws.onClose(() => {
        wsRouteBox.close = null;
      });
    });

    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "down-e14-dead",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-down-e14-dead", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "down-e14-dead");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("down-e14-dead");

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    const cap = deadSurface.locator(".endcap");

    // Sanity: while connected, a dead focused session has Resume/Remove enabled on the
    // mainhead and Resume enabled in the cap (End stays disabled — the session just
    // isn't alive, unrelated to connection state).
    await expect(mainhead.getByRole("button", { name: "End" })).toBeDisabled();
    await expect(
      mainhead.getByRole("button", { name: "Resume" }),
    ).toBeEnabled();
    await expect(
      mainhead.getByRole("button", { name: "Remove" }),
    ).toBeEnabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeEnabled();

    // Force-close the routed WebSocket rather than killing/restarting the daemon
    // process: REQ-1's reconcile sweep deletes any row already `alive:false` on the
    // very next startup ("rows already alive=0 ... are deleted" — plan Decisions),
    // which would remove this exact session out from under the test and is not what
    // this test is checking. Closing the client-side route fires the page's own
    // WebSocket `close` event the same way a real outage would, without touching the
    // daemon or its store — `page.context().setOffline` was tried first and does not
    // reliably close an already-open Chromium WebSocket, only new connection attempts.
    if (!wsRouteBox.close)
      throw new Error("expected the dashboard's WebSocket route to be active");
    await wsRouteBox.close();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // This dead session's mainhead/cap have no terminal socket at all (REQ-13/INV-5),
    // so nothing incidentally re-renders them — only `setStatus`'s own `render()` call
    // can be responsible for these flipping to disabled.
    await expect(mainhead.getByRole("button", { name: "End" })).toBeDisabled();
    await expect(
      mainhead.getByRole("button", { name: "Resume" }),
    ).toBeDisabled();
    await expect(
      mainhead.getByRole("button", { name: "Remove" }),
    ).toBeDisabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeDisabled();

    // No further action needed to "reconnect" — `wsRoute`'s own registration stays
    // active for the whole page lifetime, so the client's own backoff-driven retry
    // (ws.ts, 500ms-8s) opens a fresh WebSocket that is routed and proxied to the same
    // real (never-killed) daemon.
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(
      mainhead.getByRole("button", { name: "Resume" }),
    ).toBeEnabled();
    await expect(
      mainhead.getByRole("button", { name: "Remove" }),
    ).toBeEnabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeEnabled();
  } finally {
    await cleanup();
  }
});

// review m4-reconcile fix-cycle-1 Major 6: `formatEndedAge`'s sub-minute bucket is the
// literal string "now", and three call sites used to append " ago" unconditionally,
// producing "ended now ago" on the exact case you see immediately after ending a
// session. The fix (`formatEndedAgo`) special-cases "now" to stay bare. Assert the
// positive ("ended now") and the absence of the old defect ("now ago") on every surface
// the reviewer named: mainhead meta, `.endbar`, and `.endcap`.
test("ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "ended-now-copy",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-ended-now-copy", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "ended-now-copy");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("ended-now-copy");
    // Wait for real pane content before ending — an End captured against a genuinely
    // blank buffer (the very first capture, before the stub has printed anything) hits
    // the documented Minor 2 scope-note edge case (`storeSnapshot`'s diff-check
    // short-circuits "" == "" so `LastSnapshotAt` never gets set) and serves 404
    // `no_snapshot` instead of 200 text — same precondition E6/E7/INV-5 already rely on.
    await expect(terminalRegion(page, "ended-now-copy")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });

    const meta = mainhead.locator(".meta");
    await expect(meta).toContainText("ended now");
    await expect(meta).not.toContainText("now ago");

    const endbar = deadSurface.locator(".endbar");
    await expect(endbar).toContainText("ended now ·");
    await expect(endbar).not.toContainText("now ago");

    const cap = deadSurface.locator(".endcap");
    await expect(cap).toContainText("now · last state:");
    await expect(cap).not.toContainText("now ago");
  } finally {
    await cleanup();
  }
});

// review m4-reconcile fix-cycle-1 Minor 9: while `GET /api/sessions/{id}/pane` is in
// flight, the cap used to render an empty string — indistinguishable from the confirmed
// negative "no snapshot captured". The fix renders "loading last screen…" for that
// in-flight state. Hold the real pane response with `page.route` (delaying the genuine
// network round-trip, not fabricating a payload) to make the otherwise sub-second window
// observable.
test("the dead surface shows a 'loading last screen…' interim state before the pane fetch resolves (REQ-13, Minor 9)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "dead-loading-minor9",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-dead-loading-minor9", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "dead-loading-minor9");
    await card.click();
    await expect(terminalRegion(page, "dead-loading-minor9")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );

    let releasePane: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePane = resolve;
    });
    await page.route(`**/api/sessions/${session.id}/pane`, async (route) => {
      await gate;
      await route.continue();
    });

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);

    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    const cap = deadSurface.locator(".endcap");
    await expect(cap).toContainText(/loading last screen/i);
    await expect(cap).not.toContainText(/no snapshot captured/i);
    await expect(deadSurface.locator("pre.snapshot")).toHaveText("");

    releasePane();
    await expect(deadSurface.locator("pre.snapshot")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );
    await expect(cap).not.toContainText(/loading last screen/i);
  } finally {
    await cleanup();
  }
});

// review m4-reconcile fix-cycle-1 Major 1 (daemon-impl): `applyBind`'s `KindResumeBind`
// branch used to set `sess.Alive = true` from the hook payload itself, breaking INV-1
// (tmux pane existence is the sole authority for `alive`). Measured repro: End a session
// (tmux pane really gone), then post a queued/late `SessionStart(source:"resume")` for
// the SAME claude id with no `/resume` call ever made — the daemon must not revive it.
// This is a daemon-side fix but its only observable surface is exactly what INV-5/REQ-13
// already gate: the dashboard must never open a terminal socket for what it (correctly)
// still renders as a dead session.
test("a late resume SessionStart hook after End does not revive the session or open a terminal socket (INV-1, Major 1)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const tracker = new TerminalSocketTracker(page);
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "inv1-stray-resume",
    });
    const claudeId = "claude-inv1-stray-resume";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    const card = sessionCard(page, "inv1-stray-resume");
    await card.click();
    await expect(terminalRegion(page, "inv1-stray-resume")).toContainText(
      "MUSTER-STUB-READY",
      { timeout: 15_000 },
    );
    await expect.poll(() => tracker.liveCount).toBe(1);

    const endRes = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${session.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    await expect
      .poll(() => tracker.liveCount, {
        message: "waiting for the terminal socket to close (4001) after End",
      })
      .toBe(0);
    await expect(page.locator("#dead-surface")).toBeVisible({
      timeout: 15_000,
    });

    // The late/queued resume hook — no `/resume` endpoint call precedes it.
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: sessionStartResume(claudeId, { musterSession: session.id }),
    });

    // Give ingest (asynchronous by design) a moment to apply the bind if the bug were
    // still present, then confirm the session STAYED dead — a hold, not a wait.
    await settleFor(page, 1_000);

    const state = await getState(page, sharedDaemon());
    const found = findSession(state, session.id);
    expect(found.alive).toBe(false);
    expect(found.endedAt).not.toBeNull();

    await expect(page.locator("#dead-surface")).toBeVisible();
    await expect(
      page.locator('[aria-label="Terminal: inv1-stray-resume"]'),
    ).toHaveCount(0);
    expect(tracker.liveCount).toBe(0);
    expect(tracker.totalOpened).toBe(1);
  } finally {
    await cleanup();
  }
});
