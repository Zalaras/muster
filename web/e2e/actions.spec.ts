import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit, sessionStartResume } from "./helpers/payloads";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  type SessionObject,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { liveTile, stripCard, TerminalSocketTracker, terminalRegion } from "./helpers/terminal";

// Plan m4-reconcile — REQ-5 through REQ-16 (End / Remove / Resume, dialogs, dead
// surface, tiles). Plan acceptance: E5-E15 (E2-E4 live in reconcile.spec.ts).
//
// Focus-view tests below share one scratch daemon (sessions.spec.ts's pattern) — every
// assertion is scoped to its own session's title/card, and every test that mounts a
// terminal explicitly clicks its own card first rather than relying on Focus's
// auto-focus-top-of-sort (which is NOT this test's session once other tests in this file
// have launched their own — terminal.spec.ts's file header documents exactly this trap).
// Tests that depend on exact rail ORDER (E9's "focus moves to the top card") or on Tiles'
// grid density (E11/E12 — a function of the total session count, per views.spec.ts's file
// header) get their own private daemon instead.

let daemon: ScratchDaemon;

test.beforeAll(async () => {
  daemon = await startScratchDaemon();
});

test.afterAll(async () => {
  await daemon.teardown();
});

async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const isolated = await startScratchDaemon();
  try {
    return await fn(isolated);
  } finally {
    await isolated.teardown();
  }
}

test("End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "end-mainhead-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "end-mainhead-b" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-a", { musterSession: sessionA.id }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-b", { musterSession: sessionB.id }),
    });

    const cardA = sessionCard(page, "end-mainhead-a");
    await cardA.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("end-mainhead-a");

    const bAttachedBefore = await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{session_attached}");

    await mainhead.getByRole("button", { name: "End" }).click();
    const dialog = page.getByRole("dialog", { name: "End session?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("end-mainhead-a");
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog).toBeHidden();

    await expect(cardA).toHaveClass(/ended/, { timeout: 15_000 });
    await expect(cardA.getByText(/^ended /)).toBeVisible();

    // B is untouched: still alive, tmux session/pane intact, no attach-client change.
    expect(await daemon.tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
    const bAttachedAfter = await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{session_attached}");
    expect(bAttachedAfter).toBe(bAttachedBefore);
    const state = await getState(page, daemon);
    const foundB = findSession(state, sessionB.id);
    expect(foundB.alive).toBe(true);
    expect(foundB.state).toBe(sessionB.state);

    // A sorts after B (REQ-9: every ended session after every live one).
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

test("ended sessions sort after every live session, most recently ended first (REQ-9)", async ({ page, request }) => {
  const dirs = await Promise.all(Array.from({ length: 3 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = ["sort-req9-live", "sort-req9-ended-first", "sort-req9-ended-second"];
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }
    const [live, endedFirst, endedSecond] = sessions;
    if (!live || !endedFirst || !endedSecond) throw new Error("expected three sessions");

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-sort-req9-live", { musterSession: live.id }),
    });

    const endRes1 = await page.request.post(`${daemon.baseURL}/api/sessions/${endedFirst.id}/end`);
    expect(endRes1.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-first")).toHaveClass(/ended/, { timeout: 15_000 });

    // Force a real gap between the two `endedAt` timestamps regardless of the daemon's
    // clock resolution, so "most recently ended first" has an unambiguous answer.
    await page.waitForTimeout(1_100);

    const endRes2 = await page.request.post(`${daemon.baseURL}/api/sessions/${endedSecond.id}/end`);
    expect(endRes2.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-second")).toHaveClass(/ended/, { timeout: 15_000 });

    const cardTexts = await page.getByTestId("session-card").allInnerTexts();
    const indexOf = (label: string): number => cardTexts.findIndex((t) => t.includes(label));
    const liveIdx = indexOf("sort-req9-live");
    const firstEndedIdx = indexOf("sort-req9-ended-first");
    const secondEndedIdx = indexOf("sort-req9-ended-second");
    expect(liveIdx).toBeGreaterThanOrEqual(0);
    expect(liveIdx).toBeLessThan(firstEndedIdx);
    expect(liveIdx).toBeLessThan(secondEndedIdx);
    expect(secondEndedIdx).toBeLessThan(firstEndedIdx);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("Cancel and Escape close both End and Remove dialogs without sending any request (E10)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "cancel-escape-e10" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-cancel-escape-e10", { musterSession: session.id }),
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

    const state = await getState(page, daemon);
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "dead-surface-e6" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-dead-surface-e6", { musterSession: session.id }),
    });
    const card = sessionCard(page, "dead-surface-e6");
    await card.click();
    const region = terminalRegion(page, "dead-surface-e6");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
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
    await expect(deadSurface.locator("pre.snapshot")).toContainText("MUSTER-STUB-READY");

    // The dashboard never opens a terminal socket for a dead session (REQ-13/INV-5).
    await expect(page.locator('[aria-label="Terminal: dead-surface-e6"]')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("Ending a focused session closes its terminal socket and never reopens one while dead (INV-5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const tracker = new TerminalSocketTracker(page);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "inv5-socket" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-inv5-socket", { musterSession: session.id }),
    });
    const card = sessionCard(page, "inv5-socket");
    await card.click();
    const region = terminalRegion(page, "inv5-socket");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    await expect.poll(() => tracker.liveCount).toBe(1);

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);

    await expect
      .poll(() => tracker.liveCount, { message: "waiting for the terminal socket to close (4001) after End" })
      .toBe(0);
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    // Give any (incorrect) reattach attempt a moment, then confirm none ever happened.
    await page.waitForTimeout(1_000);
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "resume-e7" });
    const claudeId = "claude-resume-e7";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    const card = sessionCard(page, "resume-e7");
    await card.click();
    await expect(terminalRegion(page, "resume-e7")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    const cap = page.locator("#dead-surface .endcap");
    await expect(cap).toBeVisible({ timeout: 15_000 });

    await cap.getByRole("button", { name: "Resume" }).click();

    // No confirm dialog for Resume (User Flow 3).
    await expect(page.locator("#end-dialog")).not.toBeVisible();
    await expect(page.locator("#remove-dialog")).not.toBeVisible();

    await expect(card).not.toHaveClass(/ended/, { timeout: 15_000 });
    await expect(terminalRegion(page, "resume-e7")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const state = await getState(page, daemon);
    const resumed = findSession(state, session.id);
    expect(resumed.alive).toBe(true);
    expect(resumed.endedAt).toBeNull();

    const paneCmd = await daemon.paneStartCommand(resumed.tmuxTarget);
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "resume-idle-e8" });
    const claudeId = "claude-resume-idle-e8";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon.ingestURL("hook"), { data: rawNotification(claudeId, "p1", "permission_prompt") });
    const card = sessionCard(page, "resume-idle-e8");
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    await expect(card.getByText(/needs your permission/i)).toBeVisible();

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const resumeRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/resume`);
    expect(resumeRes.status()).toBe(200);
    const resumedBody = (await resumeRes.json()) as SessionObject;
    // "state is unchanged until the enveloped SessionStart(source:"resume") arrives"
    // (REQ-7's response contract) — still needs_input right after the POST.
    expect(resumedBody.state).toBe("needs_input");
    await expect(card).not.toHaveClass(/ended/, { timeout: 15_000 });

    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume(claudeId, { musterSession: session.id }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    // The attention note is gone from the card (E15) — not merely a different badge word.
    await expect(card.getByText(/needs your permission/i)).toHaveCount(0);

    const state = await getState(page, daemon);
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "no-snap-e13" });
    // Kill the window as fast as possible after launch — before the ~5s liveness/snapshot
    // poll tick can land any capture in between (plan Edge Case 13's own framing: "killed
    // before the first tick"). Best-effort by construction; the daemon-side race is the
    // plan's, not this spec's, to resolve.
    await daemon.killTmuxWindow(session.tmuxTarget);

    await page.reload();
    await sessionCard(page, "no-snap-e13").click();
    await expect(page.locator("#dead-surface .endcap")).toContainText(/no snapshot captured/i, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9)", async ({
  page,
  request,
}) => {
  test.setTimeout(30_000);
  await withDaemon(async (isolated) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(isolated.dashboardUrl);
      const sessionA = await launchSession(page, isolated, { directory: dirA.path, title: "remove-live-a" });
      const sessionB = await launchSession(page, isolated, { directory: dirB.path, title: "remove-live-b" });
      await request.post(isolated.ingestURL("hook"), {
        data: envelopedSessionStart("claude-remove-live-a", { musterSession: sessionA.id }),
      });
      await request.post(isolated.ingestURL("hook"), {
        data: envelopedSessionStart("claude-remove-live-b", { musterSession: sessionB.id }),
      });

      const cardA = sessionCard(page, "remove-live-a");
      await cardA.click();
      const mainhead = page.locator("#mainhead");
      await expect(mainhead).toContainText("remove-live-a");

      // Live cards carry only End (REQ-11) — Remove for a live session comes from the
      // mainhead only (REQ-10's "always enabled").
      await expect(cardA.getByRole("button", { name: "Remove" })).toHaveCount(0);

      await mainhead.getByRole("button", { name: "Remove" }).click();
      const dialog = page.getByRole("dialog", { name: "Remove session?" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/ends the session first/i);

      // review m4-reconcile Fix Attempt 3 (web-implementation.md): the confirm dialog's
      // destructive buttons were repointed from `--rose` (#E36A6A, reserved for the
      // Failed state per design-system §3) to a dedicated `--danger` family
      // (#C94F4F fill). Assert the computed background is the new danger colour and,
      // explicitly, not the old rose one — a same-family off-by-one token swap would
      // otherwise pass a same-name "it has a dark red background" check.
      const removeConfirmBtn = dialog.getByRole("button", { name: "Remove", exact: true });
      await expect(removeConfirmBtn).toHaveCSS("background-color", "rgb(201, 79, 79)");
      await expect(removeConfirmBtn).not.toHaveCSS("background-color", "rgb(227, 106, 106)");

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
      expect(await isolated.tmuxPaneExists(sessionA.tmuxTarget)).toBe(false);

      // Only A and B exist in this isolated daemon — focus must now be on B.
      await expect(mainhead).toContainText("remove-live-b", { timeout: 15_000 });
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("Tiles: End from a tile footer keeps the tile in its slot and leaves other tiles' geometry untouched (E11)", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await withDaemon(async (isolated) => {
    const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
    try {
      await page.goto(isolated.dashboardUrl);
      const titles = dirs.map((_, i) => `tile-end-${i}`);
      const sessions: SessionObject[] = [];
      for (const [i, dir] of dirs.entries()) {
        const session = await launchSession(page, isolated, { directory: dir.path, title: titles[i] ?? "" });
        sessions.push(session);
        await request.post(isolated.ingestURL("hook"), {
          data: envelopedSessionStart(`claude-tile-end-${i}`, { musterSession: session.id }),
        });
      }

      await page.getByRole("button", { name: "Tiles" }).click();
      await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

      const titleA = titles[0];
      const neighbourTitle = titles[1];
      const neighbourSession = sessions[1];
      if (!titleA || !neighbourTitle || !neighbourSession) throw new Error("expected at least two titles");

      const tileA = liveTile(page, titleA);
      await expect(tileA).toBeVisible();
      const neighbourWidthBefore = await isolated.tmuxDisplay(neighbourSession.tmuxTarget, "#{window_width}");
      const neighbourHeightBefore = await isolated.tmuxDisplay(neighbourSession.tmuxTarget, "#{window_height}");

      await tileA.locator(".tfoot").getByRole("button", { name: "End" }).click();
      const dialog = page.getByRole("dialog", { name: "End session?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "End session" }).click();
      await expect(dialog).toBeHidden();

      // Sticky grid membership (m2): the tile stays in its slot, not removed.
      await expect(tileA).toBeVisible({ timeout: 15_000 });
      await expect(tileA.locator(".marker")).toHaveText("stopped", { timeout: 15_000 });
      await expect(tileA.getByText(/^ended /)).toBeVisible();
      await expect(tileA.locator(".tfoot").getByRole("button", { name: "Resume" })).toBeVisible();
      await expect(tileA.locator(".tfoot").getByRole("button", { name: "Remove" })).toBeVisible();
      await expect(tileA.locator(".endcap")).toContainText(/session ended/i);

      // review m4-reconcile cycle-3 Critical 1 / Minor 2: the second of the two
      // dead-surface sites the Critical named — a dead tile's *cloned* `.dead-surface`
      // (`#dead-surface-template`), distinct from Focus's static `#dead-surface`
      // exercised by the E6 test. `toBeVisible()` alone would have stayed green through
      // the opacity-0 defect here too, so read the computed style: both the cap's
      // Resume button and its `.acts-row` must resolve to opacity 1.
      const tileResumeBtn = tileA.locator(".endcap").getByRole("button", { name: "Resume" });
      await expect(tileResumeBtn).toBeVisible();
      await expect(tileResumeBtn).toHaveCSS("opacity", "1");
      await expect(tileA.locator(".endcap .acts-row")).toHaveCSS("opacity", "1");

      const neighbourWidthAfter = await isolated.tmuxDisplay(neighbourSession.tmuxTarget, "#{window_width}");
      const neighbourHeightAfter = await isolated.tmuxDisplay(neighbourSession.tmuxTarget, "#{window_height}");
      expect(neighbourWidthAfter).toBe(neighbourWidthBefore);
      expect(neighbourHeightAfter).toBe(neighbourHeightBefore);
    } finally {
      await Promise.all(dirs.map((d) => d.cleanup()));
    }
  });
});

test("Tiles: Removing a dead tile backfills its slot from the strip and broadcasts sessionRemoved (E12)", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await withDaemon(async (isolated) => {
    const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
    try {
      // Observe the actual `sessionRemoved` WS frame (review m4-reconcile cycle-2 Minor
      // 7 — previously this test only inferred the broadcast from its effect on a later
      // GET /api/state). Transparently proxy the dashboard's one WebSocket and record
      // every server-to-page text frame; must be registered before navigation
      // (Playwright: "only WebSockets created after this method was called will be
      // routed"). Setting `server.onMessage` disables the route's default forwarding, so
      // each captured message is re-sent to the page manually to keep the connection
      // transparent — same pattern the E14 test above uses for interception.
      const wsFrames: string[] = [];
      await page.routeWebSocket("**/ws", (ws) => {
        const server = ws.connectToServer();
        server.onMessage((message) => {
          if (typeof message === "string") wsFrames.push(message);
          ws.send(message);
        });
      });

      await page.goto(isolated.dashboardUrl);
      const titles = dirs.map((_, i) => `tile-remove-${i}`);
      const sessions: SessionObject[] = [];
      for (const [i, dir] of dirs.entries()) {
        const session = await launchSession(page, isolated, { directory: dir.path, title: titles[i] ?? "" });
        sessions.push(session);
        await request.post(isolated.ingestURL("hook"), {
          data: envelopedSessionStart(`claude-tile-remove-${i}`, { musterSession: session.id }),
        });
      }

      await page.getByRole("button", { name: "Tiles" }).click();
      await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

      // 5 sessions in a 2x2 grid: 4 live, 1 stripped.
      let strippedTitle: string | undefined;
      for (const t of titles) {
        if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
      }
      if (!strippedTitle) throw new Error("expected exactly one stripped title");
      const liveTitleToEnd = titles.find((t) => t !== strippedTitle);
      if (!liveTitleToEnd) throw new Error("expected a live title to end");
      const sessionToEnd = sessions[titles.indexOf(liveTitleToEnd)];
      if (!sessionToEnd) throw new Error("no session object for the title being ended");

      const endRes = await page.request.post(`${isolated.baseURL}/api/sessions/${sessionToEnd.id}/end`);
      expect(endRes.status()).toBe(200);
      const deadTile = liveTile(page, liveTitleToEnd);
      await expect(deadTile.locator(".marker")).toHaveText("stopped", { timeout: 15_000 });

      await deadTile.locator(".tfoot").getByRole("button", { name: "Remove" }).click();
      const dialog = page.getByRole("dialog", { name: "Remove session?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(dialog).toBeHidden();

      // The removed session's tile is gone; the previously-stripped session backfills the
      // slot (m2's "next by sort order" rule).
      await expect(liveTile(page, liveTitleToEnd)).toHaveCount(0);
      await expect(liveTile(page, strippedTitle)).toBeVisible({ timeout: 15_000 });
      await expect(stripCard(page, strippedTitle)).toHaveCount(0);

      const state = await getState(page, isolated);
      expect(state.sessions.some((s) => s.id === sessionToEnd.id)).toBe(false);

      // The WS broadcast itself, observed directly rather than inferred: exactly one
      // `sessionRemoved` frame for this session's id, matching docs/protocol.md §5.5's
      // shape (`{ "type": "sessionRemoved", "id": <number> }`).
      const removedFrames = wsFrames
        .map((raw) => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })
        .filter(
          (msg): msg is { type: string; id: number } =>
            msg !== null && typeof msg === "object" && (msg as { type?: unknown }).type === "sessionRemoved",
        );
      expect(removedFrames).toHaveLength(1);
      expect(removedFrames[0]).toEqual({ type: "sessionRemoved", id: sessionToEnd.id });
    } finally {
      await Promise.all(dirs.map((d) => d.cleanup()));
    }
  });
});

test("action buttons are disabled while the daemon connection is down (E14)", async ({ page, request }) => {
  test.setTimeout(60_000);
  await withDaemon(async (isolated) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(isolated.dashboardUrl);
      const session = await launchSession(page, isolated, { directory: dir, title: "down-e14" });
      await request.post(isolated.ingestURL("hook"), {
        data: envelopedSessionStart("claude-down-e14", { musterSession: session.id }),
      });
      const card = sessionCard(page, "down-e14");
      await card.click();
      const mainhead = page.locator("#mainhead");
      await expect(mainhead).toContainText("down-e14");

      await isolated.kill();
      const banner = page.getByRole("alert");
      await expect(banner).toBeVisible({ timeout: 15_000 });

      await expect(mainhead.getByRole("button", { name: "End" })).toBeDisabled();
      await expect(mainhead.getByRole("button", { name: "Resume" })).toBeDisabled();
      await expect(mainhead.getByRole("button", { name: "Remove" })).toBeDisabled();
      await expect(card.getByRole("button", { name: "End" })).toBeDisabled();

      await isolated.restart();
      await expect(banner).toBeHidden({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });
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
  test.setTimeout(30_000);
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

    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "down-e14-dead" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-down-e14-dead", { musterSession: session.id }),
    });
    const card = sessionCard(page, "down-e14-dead");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("down-e14-dead");

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    const cap = deadSurface.locator(".endcap");

    // Sanity: while connected, a dead focused session has Resume/Remove enabled on the
    // mainhead and Resume enabled in the cap (End stays disabled — the session just
    // isn't alive, unrelated to connection state).
    await expect(mainhead.getByRole("button", { name: "End" })).toBeDisabled();
    await expect(mainhead.getByRole("button", { name: "Resume" })).toBeEnabled();
    await expect(mainhead.getByRole("button", { name: "Remove" })).toBeEnabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeEnabled();

    // Force-close the routed WebSocket rather than killing/restarting the daemon
    // process: REQ-1's reconcile sweep deletes any row already `alive:false` on the
    // very next startup ("rows already alive=0 ... are deleted" — plan Decisions),
    // which would remove this exact session out from under the test and is not what
    // this test is checking. Closing the client-side route fires the page's own
    // WebSocket `close` event the same way a real outage would, without touching the
    // daemon or its store — `page.context().setOffline` was tried first and does not
    // reliably close an already-open Chromium WebSocket, only new connection attempts.
    if (!wsRouteBox.close) throw new Error("expected the dashboard's WebSocket route to be active");
    await wsRouteBox.close();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // This dead session's mainhead/cap have no terminal socket at all (REQ-13/INV-5),
    // so nothing incidentally re-renders them — only `setStatus`'s own `render()` call
    // can be responsible for these flipping to disabled.
    await expect(mainhead.getByRole("button", { name: "End" })).toBeDisabled();
    await expect(mainhead.getByRole("button", { name: "Resume" })).toBeDisabled();
    await expect(mainhead.getByRole("button", { name: "Remove" })).toBeDisabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeDisabled();

    // No further action needed to "reconnect" — `wsRoute`'s own registration stays
    // active for the whole page lifetime, so the client's own backoff-driven retry
    // (ws.ts, 500ms-8s) opens a fresh WebSocket that is routed and proxied to the same
    // real (never-killed) daemon.
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(mainhead.getByRole("button", { name: "Resume" })).toBeEnabled();
    await expect(mainhead.getByRole("button", { name: "Remove" })).toBeEnabled();
    await expect(cap.getByRole("button", { name: "Resume" })).toBeEnabled();
  } finally {
    await cleanup();
  }
});

// review m4-reconcile fix-cycle-1 Major 5: card/strip action buttons nest real
// `<button>`s inside a card whose own `keydown` listener used to run
// `event.preventDefault()` for every bubbled key, cancelling the button's own Enter/Space
// activation — the fix guards that listener with `event.target !== card`. Verify the
// keyboard round-trip actually opens the dialog, across both Enter and Space, on the
// exact surface (a rail card's End button) the reviewer measured live.
test("a card's End button activates via keyboard Enter and Space, not just a mouse click (REQ-11, Major 5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "kbd-card-end" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-kbd-card-end", { musterSession: session.id }),
    });
    const card = sessionCard(page, "kbd-card-end");
    const dialog = page.getByRole("dialog", { name: "End session?" });

    // `renderSessions` rebuilds every card's DOM (`el.replaceChildren(...)`) on every 1s
    // render tick, so a focused button loses DOM focus within that window with no
    // automatic re-focus. `locator.press()` performs the focus-then-key as one
    // Playwright action instead of a separate `.focus()` call followed by a polling
    // assertion, so it isn't racing that tick the way the latter would be — the point
    // under test is that the key opens the dialog, not that focus survives a rebuild.
    await card.getByRole("button", { name: "End" }).press("Enter");
    // Before the fix: the card's own `keydown` listener called `event.preventDefault()`
    // for every bubbled key regardless of origin, so `endDialogOpen` stayed false and
    // focus was dropped to <body> instead of the button activating.
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await card.getByRole("button", { name: "End" }).press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const state = await getState(page, daemon);
    expect(findSession(state, session.id).alive).toBe(false);
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-2 Major 2: the keyboard test above uses `locator.press()`,
// which bundles the focus and the keypress into one fast Playwright action and so cannot
// observe cycle-2 Major 1 (the 1s render tick's unconditional `replaceChildren` dropping
// focus to `<body>` before the next keypress ever lands). This test performs the two
// steps separately with a real render tick in between: focus the button, confirm it's
// still focused after outliving at least one tick (>1.1s), then press Enter as a
// genuinely separate action. Before Major 1's fix this reproduced exactly what the
// reviewer measured live (`sameNodeAfter1.4s=false, activeTag=BODY`); the fix
// (`reconcileCards`/`reconcileActsRow` reconciling in place instead of rebuilding) is
// what makes this pass.
test("a card's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-11, Major 1, Major 2)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "kbd-tick-card-end" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-kbd-tick-card-end", { musterSession: session.id }),
    });
    const card = sessionCard(page, "kbd-tick-card-end");
    const endBtn = card.getByRole("button", { name: "End" });
    const dialog = page.getByRole("dialog", { name: "End session?" });

    await endBtn.focus();
    await expect(endBtn).toBeFocused();

    // Outlive at least one 1s render tick as a separate step from the focus above —
    // `page.waitForTimeout` is otherwise disfavoured in this suite, but here the render
    // tick itself (not a WS round-trip) is exactly what's under test, so there is no
    // visible-outcome signal to poll for instead.
    await page.waitForTimeout(1_400);
    // Re-resolves the locator against the live DOM: if the render tick had rebuilt the
    // button node (the pre-fix defect), the freshly-resolved element would not be
    // `document.activeElement` and this would fail regardless of node identity.
    await expect(endBtn).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-2 Major 2, tile-footer case: same defect, different
// surface — `renderTileFooterActions` also unconditionally rebuilt every 1s tick before
// the Major 1 fix. Uses a private daemon (Tiles density is session-count-sensitive, per
// this file's header) with a single live session so the tile renders at 1x1 with no
// strip involved.
test("a tile footer's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-12, Major 1, Major 2)", async ({
  page,
  request,
}) => {
  test.setTimeout(30_000);
  await withDaemon(async (isolated) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(isolated.dashboardUrl);
      const session = await launchSession(page, isolated, { directory: dir, title: "kbd-tick-tile-end" });
      await request.post(isolated.ingestURL("hook"), {
        data: envelopedSessionStart("claude-kbd-tick-tile-end", { musterSession: session.id }),
      });

      await page.getByRole("button", { name: "Tiles" }).click();
      await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

      const tile = liveTile(page, "kbd-tick-tile-end");
      await expect(tile).toBeVisible();
      const endBtn = tile.locator(".tfoot").getByRole("button", { name: "End" });
      const dialog = page.getByRole("dialog", { name: "End session?" });

      await endBtn.focus();
      await expect(endBtn).toBeFocused();

      await page.waitForTimeout(1_400);
      await expect(endBtn).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await cleanup();
    }
  });
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "ended-now-copy" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-ended-now-copy", { musterSession: session.id }),
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
    await expect(terminalRegion(page, "ended-now-copy")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "dead-loading-minor9" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-dead-loading-minor9", { musterSession: session.id }),
    });
    const card = sessionCard(page, "dead-loading-minor9");
    await card.click();
    await expect(terminalRegion(page, "dead-loading-minor9")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    let releasePane: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePane = resolve;
    });
    await page.route(`**/api/sessions/${session.id}/pane`, async (route) => {
      await gate;
      await route.continue();
    });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);

    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    const cap = deadSurface.locator(".endcap");
    await expect(cap).toContainText(/loading last screen/i);
    await expect(cap).not.toContainText(/no snapshot captured/i);
    await expect(deadSurface.locator("pre.snapshot")).toHaveText("");

    releasePane();
    await expect(deadSurface.locator("pre.snapshot")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
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
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "inv1-stray-resume" });
    const claudeId = "claude-inv1-stray-resume";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    const card = sessionCard(page, "inv1-stray-resume");
    await card.click();
    await expect(terminalRegion(page, "inv1-stray-resume")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    await expect.poll(() => tracker.liveCount).toBe(1);

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect
      .poll(() => tracker.liveCount, { message: "waiting for the terminal socket to close (4001) after End" })
      .toBe(0);
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    // The late/queued resume hook — no `/resume` endpoint call precedes it.
    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume(claudeId, { musterSession: session.id }),
    });

    // Give ingest (asynchronous by design) a moment to apply the bind if the bug were
    // still present, then confirm the session stayed dead.
    await page.waitForTimeout(1_000);

    const state = await getState(page, daemon);
    const found = findSession(state, session.id);
    expect(found.alive).toBe(false);
    expect(found.endedAt).not.toBeNull();

    await expect(page.locator("#dead-surface")).toBeVisible();
    await expect(page.locator('[aria-label="Terminal: inv1-stray-resume"]')).toHaveCount(0);
    expect(tracker.liveCount).toBe(0);
    expect(tracker.totalOpened).toBe(1);
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 2/3 (e2e-specs, web-implementation.md Fix Attempt
// 3): the review's Critical 1 fix scoped the hover-reveal opacity rule to `.card
// .acts-row`, leaving the dead-surface cap unconditionally visible while live rail
// cards stay hover/focus-only, per Damian's cycle-3 sign-off. `toBeVisible()` cannot
// see either half of this (Playwright's actionability model treats `opacity: 0` as
// visible) — this test reads the computed style directly, at rest and revealed by
// both mouse hover and keyboard `:focus-within`.
test("a live rail card's action row sits at opacity 0 until hover or focus-within reveals it (REQ-11, Minor 2/3)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "hover-reveal-acts-row" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-hover-reveal-acts-row", { musterSession: session.id }),
    });
    const card = sessionCard(page, "hover-reveal-acts-row");
    await expect(card).toBeVisible();
    const actsRow = card.locator(".acts-row");

    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.hover();
    await expect(actsRow).toHaveCSS("opacity", "1");

    // Move the pointer well away from the card so hover no longer explains any
    // visibility, confirming the row drops back before checking focus independently.
    await page.mouse.move(0, 0);
    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.getByRole("button", { name: "End" }).focus();
    await expect(actsRow).toHaveCSS("opacity", "1");
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 1 (web-implementation.md Fix Attempt 3):
// `reconcileCards`'s reorder loop calls `container.insertBefore` on an already-mounted
// card when a genuine priority change moves it, which detaches the node before
// reattaching it — Chrome blurs a focused descendant on detach even though the reattach
// is synchronous. Distinct from cycle-2 Major 1 (the per-tick rebuild, covered by the
// existing "survives a render tick" tests above): this needs an actual sort-order
// change, not a clock tick. Reproduces the review's own measurement (`SORT-CHANGE
// focus: before=true after=false active=BODY`) against the pre-fix build.
test("a focused card action button survives a rail re-sort triggered by a real priority change (REQ-11, Minor 1)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "resort-focus-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "resort-focus-b" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-resort-focus-a", { musterSession: sessionA.id }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-resort-focus-b", { musterSession: sessionB.id }),
    });

    const cardA = sessionCard(page, "resort-focus-a");
    const cardB = sessionCard(page, "resort-focus-b");
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    // Both sessions land in the same live priority band with no state change yet, so
    // they sort by launch order: A before B.
    const titlesBefore = await page.getByTestId("session-card").allInnerTexts();
    const idxABefore = titlesBefore.findIndex((t) => t.includes("resort-focus-a"));
    const idxBBefore = titlesBefore.findIndex((t) => t.includes("resort-focus-b"));
    expect(idxABefore).toBeGreaterThanOrEqual(0);
    expect(idxBBefore).toBeGreaterThanOrEqual(0);
    expect(idxABefore).toBeLessThan(idxBBefore);

    const endBtnB = cardB.getByRole("button", { name: "End" });
    await endBtnB.focus();
    await expect(endBtnB).toBeFocused();

    // A genuine priority change (REQ-9's `needs_input` band sorts first), not a render
    // tick: this is what actually drives `insertBefore` to move B's card node.
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-resort-focus-b") });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification("claude-resort-focus-b", "p1", "permission_prompt"),
    });
    await expect(stateBadge(cardB)).toHaveText(/needs input/i, { timeout: 15_000 });

    const titlesAfter = await page.getByTestId("session-card").allInnerTexts();
    const idxAAfter = titlesAfter.findIndex((t) => t.includes("resort-focus-a"));
    const idxBAfter = titlesAfter.findIndex((t) => t.includes("resort-focus-b"));
    expect(idxBAfter).toBeLessThan(idxAAfter);

    // Focus must have survived the reorder — Playwright's own focus assertion, not
    // just a dataset probe. Before the fix this measured `active=BODY`.
    await expect(endBtnB).toBeFocused();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});
