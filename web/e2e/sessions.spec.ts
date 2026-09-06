import { queryEvents } from "./helpers/db";
import { expect, fileDaemon, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  envelopedStatusLinePreFirstResponse,
  rawNotification,
  rawPostToolUse,
  rawPreCompact,
  rawSessionEnd,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import { getState, launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";

// REQ-7 through REQ-13, REQ-16, REQ-18 — the §7 state machine driven end-to-end through
// the real ingest endpoints, and the client-side sort. Plan acceptance: E3-E9, W6, W7,
// W9-W11. One scratch daemon per file via fileDaemon(): every test is title-scoped (its
// own session, its own card, only relative order asserted in the sort test). E10/W12
// (daemon restart / stale-rail-during-disconnect) is the exception — it restarts, so it
// takes the test-scoped `daemon` fixture (a fresh daemon of its own) in the block below.
//
// Every test launches its own session (a real POST /api/sessions, using the REQ-19 stub
// `claude` + per-run tmux socket) into its own scratch directory, then drives the state
// machine purely with synthesized hook POSTs — mirroring exactly what the real
// SessionStart wrapper / plain-HTTP hooks / status-line script would send. No real
// `claude` is ever launched.

const daemon = fileDaemon();

test("a fresh session renders 'untitled' and its context row as ctx unknown (W7)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir });
    expect(session.title).toBeNull();

    const card = sessionCard(page, "untitled");
    await expect(card).toBeVisible();
    await expect(stateBadge(card)).toHaveText(/started/i);
    await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("walks started -> working -> idle via SessionStart, turn-activity, then Stop, with lastActivity shown (E3)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e3" });
    const card = sessionCard(page, "walk-e3");
    await expect(stateBadge(card)).toHaveText(/started/i);

    const claudeId = "claude-e3-1";
    const startRes = await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    expect(startRes.status()).toBe(200);
    await expect(stateBadge(card)).toHaveText(/started/i);

    const promptRes = await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    expect(promptRes.status()).toBe(200);
    await expect(stateBadge(card)).toHaveText(/working/i);

    const stopRes = await request.post(daemon().ingestURL("hook"), {
      data: rawStop(claudeId, { lastAssistantMessage: "Fixed the flaky retry; running the suite" }),
    });
    expect(stopRes.status()).toBe(200);
    await expect(stateBadge(card)).toHaveText(/idle/i);
    await expect(card.getByText(/Fixed the flaky retry/)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a permission notification moves the card to needs input; a later Stop returns it to idle (E4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e4" });
    const card = sessionCard(page, "walk-e4");
    const claudeId = "claude-e4-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    await expect(card.getByText(/needs your permission/i)).toBeVisible();

    await request.post(daemon().ingestURL("hook"), { data: rawStop(claudeId) });
    await expect(stateBadge(card)).toHaveText(/idle/i);
  } finally {
    await cleanup();
  }
});

test("a StopFailure moves the card to failed showing the raw error token (E5)", async ({ page, request }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e5-fail" });
    const card = sessionCard(page, "walk-e5-fail");
    const claudeId = "claude-e5-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawStopFailure(claudeId, { error: "server_error" }),
    });
    await expect(stateBadge(card)).toHaveText(/failed/i);
    await expect(card.getByText(/server_error/)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a session seeded in plan mode shows planning on turn-activity instead of working (E5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), {
      directory: dir,
      title: "walk-e5-plan",
      permissionMode: "plan",
    });
    expect(session.permissionMode).toEqual({ value: "plan", source: "seed" });
    const card = sessionCard(page, "walk-e5-plan");
    const claudeId = "claude-e5-2";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    // SessionStart never carries permission_mode — the latch must still read "plan" from
    // the launch seed (REQ-9), which is what makes this turn-activity land on "planning".
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { permissionMode: "plan" }),
    });
    await expect(stateBadge(card)).toHaveText(/planning/i);
  } finally {
    await cleanup();
  }
});

test("a straggler turn-activity for an already-closed prompt does not move the card off idle (E6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e6" });
    const card = sessionCard(page, "walk-e6");
    const claudeId = "claude-e6-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon().ingestURL("hook"), { data: rawStop(claudeId) });
    await expect(stateBadge(card)).toHaveText(/idle/i);

    // A straggler tool event for the now-closed prompt id — the measured hazard
    // (canary-fields.md: tool events interleaving past a Stop). Wait for it to actually
    // be persisted (not just POSTed) before asserting nothing moved, so a slow ingest
    // worker can't make this pass vacuously. Four events precede this point for this
    // claude session id: SessionStart, UserPromptSubmit, Stop, then this straggler.
    await request.post(daemon().ingestURL("hook"), { data: rawPostToolUse(claudeId, { promptId: "p1" }) });
    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the straggler PostToolUse to be persisted",
      })
      .toBe(4);

    await expect(stateBadge(card)).toHaveText(/idle/i);
  } finally {
    await cleanup();
  }
});

test("the /clear sequence rebinds the session to one card in started (E7)", async ({ page, request }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e7-clear" });
    const card = sessionCard(page, "walk-e7-clear");
    const originalClaudeId = "claude-e7-orig";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(originalClaudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(originalClaudeId) });
    await request.post(daemon().ingestURL("hook"), { data: rawStop(originalClaudeId) });
    await expect(stateBadge(card)).toHaveText(/idle/i);

    // SessionEnd(reason:"clear") is NOT a death hint — the card must not grey/change.
    await request.post(daemon().ingestURL("hook"), { data: rawSessionEnd(originalClaudeId, "clear") });
    await expect(stateBadge(card)).toHaveText(/idle/i);

    const newClaudeId = "claude-e7-new";
    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(newClaudeId, { musterSession: session.id, source: "clear" }),
    });
    await expect(stateBadge(card)).toHaveText(/started/i);

    const state = await getState(page, daemon());
    const matches = state.sessions.filter((s) => s.directory === dir);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(session.id);
    expect(matches[0]?.claudeSessionId).toBe(newClaudeId);
    expect(matches[0]?.state).toBe("started");
  } finally {
    await cleanup();
  }
});

test("cards sort needs-input first, then failed, then the active/started/idle groups (E8, REQ-16)", async ({
  page,
  request,
}) => {
  await page.goto(daemon().dashboardUrl);

  const [dirNeedsInput, dirFailed, dirWorking, dirStarted, dirIdle] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  const allDirs = [dirNeedsInput, dirFailed, dirWorking, dirStarted, dirIdle];
  try {
    const titles = {
      needsInput: "sort-needsinput",
      failed: "sort-failed",
      working: "sort-working",
      started: "sort-started",
      idle: "sort-idle",
    };

    const needsInput = await launchSession(page, daemon(), {
      directory: dirNeedsInput.path,
      title: titles.needsInput,
    });
    const failed = await launchSession(page, daemon(), { directory: dirFailed.path, title: titles.failed });
    const working = await launchSession(page, daemon(), { directory: dirWorking.path, title: titles.working });
    await launchSession(page, daemon(), { directory: dirStarted.path, title: titles.started });
    const idle = await launchSession(page, daemon(), { directory: dirIdle.path, title: titles.idle });

    async function bind(claudeId: string, sessionId: number): Promise<void> {
      await request.post(daemon().ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: sessionId }),
      });
    }

    await bind("claude-sort-needsinput", needsInput.id);
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit("claude-sort-needsinput") });
    await request.post(daemon().ingestURL("hook"), {
      data: rawNotification("claude-sort-needsinput", "p1", "permission_prompt"),
    });

    await bind("claude-sort-failed", failed.id);
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit("claude-sort-failed") });
    await request.post(daemon().ingestURL("hook"), { data: rawStopFailure("claude-sort-failed") });

    await bind("claude-sort-working", working.id);
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit("claude-sort-working") });

    await bind("claude-sort-idle", idle.id);
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit("claude-sort-idle") });
    await request.post(daemon().ingestURL("hook"), { data: rawStop("claude-sort-idle") });

    // Wait for every card to reach its target state before reading DOM order.
    await expect(stateBadge(sessionCard(page, titles.needsInput))).toHaveText(/needs input/i);
    await expect(stateBadge(sessionCard(page, titles.failed))).toHaveText(/failed/i);
    await expect(stateBadge(sessionCard(page, titles.working))).toHaveText(/working/i);
    await expect(stateBadge(sessionCard(page, titles.started))).toHaveText(/started/i);
    await expect(stateBadge(sessionCard(page, titles.idle))).toHaveText(/idle/i);

    const cardTexts = await page.getByTestId("session-card").allInnerTexts();
    const indexOf = (label: string): number => cardTexts.findIndex((t) => t.includes(label));
    const order = [titles.needsInput, titles.failed, titles.working, titles.started, titles.idle].map(indexOf);

    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    // Only the relative order of OUR five cards matters here — other sessions from
    // concurrently-running tests in this file may legitimately be interspersed.
    expect(order).toEqual([...order].sort((a, b) => a - b));
  } finally {
    await Promise.all(allDirs.map((d) => d.cleanup()));
  }
});

test("killing the scratch tmux window greys the card without changing its badge (E9)", async ({ page, request }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e9-kill" });
    const card = sessionCard(page, "walk-e9-kill");
    const claudeId = "claude-e9-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await daemon().killTmuxWindow(session.tmuxTarget);

    // Protocol §7.5: liveness is polled ~5s; allow up to the plan's ~10s ceiling.
    await expect
      .poll(
        async () => {
          const state = await getState(page, daemon());
          return state.sessions.find((s) => s.id === session.id)?.alive;
        },
        { message: "waiting for the liveness poll to notice the killed pane", timeout: 10_000 },
      )
      .toBe(false);

    // State is never changed by liveness (protocol §7.3) — the badge word must be
    // unchanged even though the session is now dead.
    await expect(stateBadge(card)).toHaveText(/working/i);

    // "ended" treatment is a pure visual cue (design-system --fg-dim, no pinned role/text)
    // — checked as reduced opacity rather than a guessed class/testid. Polled: the poll
    // above read /api/state, and the WS broadcast that dims the card may land a beat later.
    await expect
      .poll(async () => Number(await card.evaluate((el) => getComputedStyle(el).opacity)))
      .toBeLessThan(1);
  } finally {
    await cleanup();
  }
});

test("a status-line post persists, routes, and refreshes the title per M3 value semantics (REQ-4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-status-line" });
    const claudeId = "claude-status-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    const statusRes = await request.post(daemon().ingestURL("status"), {
      data: envelopedStatusLinePreFirstResponse(claudeId, {
        musterSession: session.id,
        sessionName: "a status-line-derived title",
      }),
    });
    expect(statusRes.status()).toBe(200);

    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the SessionStart and status-line posts to both persist",
      })
      .toBe(2);

    // M3 supersedes the M1 rule (protocol §5.3): the status line's session_name now
    // refreshes `title` whenever present (REQ-4). This is sanctioned protocol-delta
    // breakage of the old M1-era expectation, not an implementation defect — routing
    // and event persistence (asserted above) are unaffected and still the point of
    // this test. Polled: the title is applied by the async ingest worker.
    await expect
      .poll(async () => {
        const state = await getState(page, daemon());
        return state.sessions.find((s) => s.id === session.id)?.title;
      })
      .toBe("a status-line-derived title");
  } finally {
    await cleanup();
  }
});

test("two synthesized PreCompact hooks bump the rail card's compaction counter to circle-2 (E14, REQ-14)", async ({
  page,
  request,
}) => {
  // Plan m2-terminal, REQ-14: one of the two queued M1 follow-ups. Rendering has existed
  // since M1 (web/src/sessions/card.ts) — only the E2E test was missing.
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "walk-e14-compact" });
    const card = sessionCard(page, "walk-e14-compact");
    const claudeId = "claude-e14-1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();

    await request.post(daemon().ingestURL("hook"), { data: rawPreCompact(claudeId, "p1") });
    await expect(card.getByText(/ctx\s+unknown\s+⟳1\b/)).toBeVisible();

    await request.post(daemon().ingestURL("hook"), { data: rawPreCompact(claudeId, "p2") });
    await expect(card.getByText(/ctx\s+unknown\s+⟳2\b/)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test.describe("daemon restart and disconnect (E10, W12)", () => {
  // This test kills and restarts its daemon, so it takes the test-scoped `daemon` fixture
  // (shadowing the file accessor above) rather than the daemon shared by the rest of the file.
  test("keeps the stale rail visible during a disconnect and reloads the card from persistence after restart", async ({
    page,
    request,
    daemon,
  }) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "walk-e10-restart" });
      const claudeId = "claude-e10-1";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });

      const card = sessionCard(page, "walk-e10-restart");
      await expect(stateBadge(card)).toHaveText(/working/i);

      await daemon.kill();

      const banner = page.getByRole("alert");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      // W12: the rail keeps rendering the stale card while disconnected — not cleared.
      await expect(card).toBeVisible();
      await expect(stateBadge(card)).toHaveText(/working/i);

      await daemon.restart();
      await expect(banner).toBeHidden({ timeout: 15_000 });

      // E10: the fresh snapshot on reconnect reloads the session from persistence.
      await expect(stateBadge(sessionCard(page, "walk-e10-restart"))).toHaveText(/working/i);
    } finally {
      await cleanup();
    }
  });
});
