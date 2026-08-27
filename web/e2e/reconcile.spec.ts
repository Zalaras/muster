import { expect, test } from "@playwright/test";
import { type ScratchDaemon, type ScratchDaemonOptions, startScratchDaemon } from "./helpers/daemon";
import { envelopedSessionStart, rawUserPromptSubmit } from "./helpers/payloads";
import { findSession, getState, launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";

// Plan m4-reconcile — REQ-1 (reconcile on start), REQ-2 (unknown panes reported, never
// adopted), REQ-3 (shutdown policy: ask/leave/kill). Plan acceptance: E2, E3, E4.
//
// Every test here restarts (kills + respawns) its own daemon, which would corrupt any
// concurrently-running test sharing that process (sessions.spec.ts's shared-daemon
// pattern is wrong here) — so, like views.spec.ts, every test gets its own private
// scratch daemon via `withDaemon()`, and tests that need a non-default `-on-exit` pass it
// through to `startScratchDaemon()`.

async function withDaemon<T>(opts: ScratchDaemonOptions, fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon(opts);
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

test("a session whose pane died while the daemon was down reconciles to ended and kept, then a later restart sweeps it for good (E2, INV-1, INV-3)", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await withDaemon({}, async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "reconcile-e2" });
      const claudeId = "claude-reconcile-e2";
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      const card = sessionCard(page, "reconcile-e2");
      await expect(stateBadge(card)).toHaveText(/started/i);

      // Kill the pane, then restart immediately — this exercises reconcile's
      // alive=1-but-pane-gone branch (REQ-1), not the live ~5s liveness poll that
      // sessions.spec.ts's E9 already covers.
      await daemon.killTmuxWindow(session.tmuxTarget);
      await daemon.restart();

      await page.reload();
      const endedCard = sessionCard(page, "reconcile-e2");
      await expect(endedCard).toHaveClass(/ended/, { timeout: 15_000 });
      await expect(endedCard.getByText(/^ended /)).toBeVisible();
      // State (the last-known badge word) must survive reconcile untouched — alive is
      // orthogonal to state (protocol §7.5).
      await expect(stateBadge(endedCard)).toHaveText(/started/i);

      const state1 = await getState(page, daemon);
      const found1 = findSession(state1, session.id);
      expect(found1.alive).toBe(false);
      expect(found1.endedAt).not.toBeNull();

      // REQ-1 kept the row (the user's resume chance) rather than deleting it on THIS
      // restart. Remove it explicitly, then restart a second time: only a row that was
      // already alive=0 at startup gets deleted by reconcile — so it must be gone from
      // this second lifetime's very first snapshot (INV-3, "removed stays removed",
      // including after a daemon restart).
      const delRes = await page.request.delete(`${daemon.baseURL}/api/sessions/${session.id}`);
      expect(delRes.status()).toBe(204);

      await daemon.restart();
      const state2 = await getState(page, daemon);
      expect(state2.sessions.some((s) => s.id === session.id)).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

test("a live session survives the default ask-on-exit policy under this harness's non-TTY stdin, terminal included (E3, survive policy)", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  // No onExit option -> the daemon's own default (`ask`); the harness's stdin is always
  // "ignore" (never a character device — see helpers/daemon.ts spawnAndWait), which per
  // REQ-3 makes `ask` behave as `leave`.
  await withDaemon({}, async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "survive-e3" });
      const claudeId = "claude-survive-e3";
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
      const card = sessionCard(page, "survive-e3");
      await expect(stateBadge(card)).toHaveText(/working/i);
      expect(await daemon.tmuxPaneExists(session.tmuxTarget)).toBe(true);

      await daemon.restart();

      // Survive policy: tmux itself was never touched.
      expect(await daemon.tmuxPaneExists(session.tmuxTarget)).toBe(true);

      await page.reload();
      const cardAfter = sessionCard(page, "survive-e3");
      await expect(stateBadge(cardAfter)).toHaveText(/working/i);
      expect(cardAfter).not.toHaveClass(/ended/);

      // "a working terminal" — focus it and prove the bridge still streams (tmux/the
      // stub process survived the daemon's own restart, a separate process).
      await cardAfter.click();
      const region = terminalRegion(page, "survive-e3");
      await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });
});

test("stopping the daemon with -on-exit=kill kills the tmux session and the next startup sweeps the row (E4)", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await withDaemon({ onExit: "kill" }, async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "kill-e4" });
      const claudeId = "claude-kill-e4";
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      expect(await daemon.tmuxPaneExists(session.tmuxTarget)).toBe(true);

      // restart() = SIGTERM then respawn on the same port/data dir/-on-exit. Under
      // -on-exit=kill, REQ-3 says the shutdown path itself kills the pane and sets
      // alive:false/endedAt BEFORE exit — so the row is already alive=0 when THIS
      // restart's own reconcile runs, and REQ-1 deletes alive=0 rows immediately (no
      // "kept one more lifecycle" grace, unlike E2's pane-died-while-down case).
      await daemon.restart();

      expect(await daemon.tmuxPaneExists(session.tmuxTarget)).toBe(false);
      expect(await daemon.tmuxSessions()).not.toContain(session.tmuxTarget);

      const state = await getState(page, daemon);
      expect(state.sessions.some((s) => s.id === session.id)).toBe(false);

      await page.reload();
      await expect(sessionCard(page, "kill-e4")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});

test("reconcile reports an unknown tmux session on the socket without creating a row for it (REQ-2)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await withDaemon({}, async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    const before = await getState(page, daemon);
    const beforeCount = before.sessions.length;

    // A tmux session on the daemon's own socket that musterd never launched — the exact
    // "muster-<n> with no row" shape REQ-2 says must be logged, never adopted.
    await daemon.createForeignTmuxSession("muster-99999-foreign");
    expect(await daemon.tmuxSessions()).toContain("muster-99999-foreign");

    await daemon.restart();

    // Reconcile ran again on this restart; the foreign session is untouched (never
    // killed — REQ-2 only says "never adopted", not "cleaned up") and still no row
    // exists for it.
    expect(await daemon.tmuxSessions()).toContain("muster-99999-foreign");
    const after = await getState(page, daemon);
    expect(after.sessions).toHaveLength(beforeCount);
  });
});
