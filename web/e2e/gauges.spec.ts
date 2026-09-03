import { expect, test } from "@playwright/test";
import { countUsageSamples, queryEvents } from "./helpers/db";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import {
  cardContextHot,
  cardContextRow,
  cardContextTrack,
  mastheadBucket,
  mastheadBucketTrack,
  mastheadBucketWarn,
  mastheadModelReadout,
  tileContextInfo,
  tileContextTrack,
} from "./helpers/gauges";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  envelopedStatusLinePreFirstResponse,
  rawNotification,
  rawPreCompact,
  rawSessionEnd,
  rawStop,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import { findSession, getState, launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";
import { liveTile } from "./helpers/terminal";

// Plan m3-gauges — REQ-1 through REQ-14 driven end-to-end: per-session title/model/
// context refresh (`session.Manager.ApplyStatus`) and the account-level usage aggregator
// (`internal/usage`), both fed exclusively by synthesized status-line POSTs to the real
// `/ingest/<token>/status` endpoint — mirroring exactly what the real status-line script
// would send. No real `claude` is ever launched (CLAUDE.md hard rule). Plan acceptance:
// E1-E12.
//
// Every test gets its own private scratch daemon (`withDaemon`, views.spec.ts's pattern)
// rather than sessions.spec.ts's one-shared-daemon-per-file pattern: account usage (the
// masthead gauges, the `usage_sample` table) is daemon-global, so two tests sharing a
// daemon would stomp on each other's exact-value and exact-row-count assertions the
// moment they run concurrently (`fullyParallel: true`, playwright.config.ts).
async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon();
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

test("a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dir, title: "gauge-e1-fresh" });
      const card = sessionCard(page, "gauge-e1-fresh");

      await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
      await expect(cardContextTrack(card)).toHaveCount(0);

      await expect(mastheadBucket(page, "5h")).toContainText("5h");
      await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
      await expect(mastheadBucket(page, "7d")).toContainText("7d");
      await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
      await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);
      await expect(mastheadBucketTrack(page, "7d")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});

test("a pre-first-response status post leaves the unknown rendering unchanged — null is not 0% (E2)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e2-prefirst" });
      const card = sessionCard(page, "gauge-e2-prefirst");
      const claudeId = "claude-gauge-e2";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      const statusRes = await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLinePreFirstResponse(claudeId, { musterSession: session.id }),
      });
      expect(statusRes.status()).toBe(200);

      await expect
        .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length, {
          message: "waiting for the SessionStart and pre-first-response status posts to both persist",
        })
        .toBe(2);

      // A zero token count with a null percentage must never render as 0% (REQ-2).
      await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
      await expect(cardContextTrack(card)).toHaveCount(0);
      await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
      await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
      await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});

test("a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e3-full" });
      const card = sessionCard(page, "gauge-e3-full");
      const claudeId = "claude-gauge-e3";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          musterSession: session.id,
          contextUsedPct: 42,
          totalInputTokens: 84000,
        }),
      });

      const row = cardContextRow(card);
      await expect(row).toContainText("42%");
      await expect(row).toContainText("84k");
      await expect(cardContextTrack(card)).toHaveCount(1);
    } finally {
      await cleanup();
    }
  });
});

test("the same status data renders in the Tiles view's tile header (E4)", async ({ page, request }) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e4-tiles" });
      const claudeId = "claude-gauge-e4";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          musterSession: session.id,
          contextUsedPct: 42,
          totalInputTokens: 84000,
        }),
      });
      await expect(sessionCard(page, "gauge-e4-tiles")).toBeVisible();

      // exact: true — sanctioned repair (plan ui-text-and-focus, REQ-13/Testable UI
      // Elements): live tile headers now host a rename trigger whose accessible name
      // is the display title, and this test's own fixture title ("gauge-e4-tiles")
      // contains "tiles" as a substring, so a non-exact match on the view switcher's
      // "Tiles" button is ambiguous.
      await page.getByRole("button", { name: "Tiles", exact: true }).click();

      const tile = liveTile(page, "gauge-e4-tiles");
      await expect(tile).toBeVisible();
      const info = tileContextInfo(tile);
      await expect(info).toContainText("42%");
      await expect(info).toContainText("84k");
      await expect(tileContextTrack(tile)).toHaveCount(1);
    } finally {
      await cleanup();
    }
  });
});

test("a full status post fills both masthead gauge bars with rounded percentages and reset suffixes, and shows the model readout (E5)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e5-masthead" });
      const claudeId = "claude-gauge-e5";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          musterSession: session.id,
          fiveHourPct: 45,
          sevenDayPct: 10,
          model: { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" },
        }),
      });

      await expect(mastheadBucket(page, "5h")).toContainText("5h");
      await expect(mastheadBucket(page, "5h")).toContainText("45%");
      // REQ-14: reset suffix is present whenever the bucket is known — client-side
      // formatting picks same-day-HH:MM vs. short-weekday, neither of which this test
      // depends on (no wall-clock assumption), only that a reset time renders at all.
      await expect(mastheadBucket(page, "5h")).toContainText(/resets/i);
      await expect(mastheadBucketTrack(page, "5h")).toHaveCount(1);

      await expect(mastheadBucket(page, "7d")).toContainText("7d");
      await expect(mastheadBucket(page, "7d")).toContainText("10%");
      await expect(mastheadBucket(page, "7d")).toContainText(/resets/i);
      await expect(mastheadBucketTrack(page, "7d")).toHaveCount(1);

      await expect(mastheadModelReadout(page)).toHaveText("Haiku 4.5");
    } finally {
      await cleanup();
    }
  });
});

test("two identical rapid status posts persist exactly one usage_sample row; a changed third posts a second (E6, INV-5)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e6-dedup" });
      const claudeId = "claude-gauge-e6";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });

      // The measured ~435ms close-pair cadence (canary-fields.md "Invocation cadence") —
      // two byte-identical posts (no options overridden, so both calls build the exact
      // same payload) must collapse to one usage_sample row.
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, { musterSession: session.id }),
      });

      // A third post with a genuinely different value. Wait for ITS distinct effect to
      // reach the UI before reading the sqlite oracle: the ingest worker processes posts
      // in submission order (R4), so once this one's value is visible the two identical
      // posts before it are guaranteed to have already been recorded (or deduped) —
      // no fixed sleep needed to "wait out" the earlier posts.
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, { musterSession: session.id, fiveHourPct: 75 }),
      });
      await expect(mastheadBucket(page, "5h")).toContainText("75%");

      expect(await countUsageSamples(daemon.dbPath)).toBe(2);
    } finally {
      await cleanup();
    }
  });
});

test("a status post's session name updates the card title and its model updates the masthead model readout (E7)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      // No launch-time title, so the session starts "untitled" — REQ-4's title refresh
      // must be the thing that names it.
      const session = await launchSession(page, daemon, { directory: dir });
      const claudeId = "claude-gauge-e7";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await expect(sessionCard(page, "untitled")).toBeVisible();

      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          musterSession: session.id,
          sessionName: "gauge-e7-status-title",
          model: { id: "claude-opus-5", displayName: "Opus 5" },
        }),
      });

      await expect(sessionCard(page, "gauge-e7-status-title")).toBeVisible();
      await expect(mastheadModelReadout(page)).toHaveText("Opus 5");
    } finally {
      await cleanup();
    }
  });
});

test("a status post sent while a session is needs_input leaves its state, stateSince, and attention untouched (E8, INV-1)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e8-needsinput" });
      const card = sessionCard(page, "gauge-e8-needsinput");
      const claudeId = "claude-gauge-e8";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
      await request.post(daemon.ingestURL("hook"), { data: rawNotification(claudeId, "p1", "permission_prompt") });
      await expect(stateBadge(card)).toHaveText(/needs input/i);

      const before = findSession(await getState(page, daemon), session.id);
      expect(before.state).toBe("needs_input");
      expect(before.attention).not.toBeNull();

      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, { musterSession: session.id }),
      });
      // Wait for the status post's own visible effect (the context row filling in)
      // before reading the state oracle, so ApplyStatus is guaranteed to have already run.
      await expect(cardContextRow(card)).toContainText("42%");

      const after = findSession(await getState(page, daemon), session.id);
      expect(after.state).toBe(before.state);
      expect(after.stateSince).toBe(before.stateSince);
      expect(after.attention).toEqual(before.attention);
      expect(after.alive).toBe(before.alive);
      await expect(stateBadge(card)).toHaveText(/needs input/i);
    } finally {
      await cleanup();
    }
  });
});

test("with two live sessions, a status post routed to one leaves the other's card and wire object unchanged while the masthead updates (E9, INV-4)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "gauge-e9-a" });
      const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "gauge-e9-b" });
      const cardA = sessionCard(page, "gauge-e9-a");
      const cardB = sessionCard(page, "gauge-e9-b");
      const claudeA = "claude-gauge-e9-a";
      const claudeB = "claude-gauge-e9-b";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeA, { musterSession: sessionA.id }),
      });
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeB, { musterSession: sessionB.id }),
      });
      await expect(cardA.getByText(/ctx\s+unknown/i)).toBeVisible();
      await expect(cardB.getByText(/ctx\s+unknown/i)).toBeVisible();

      const beforeA = findSession(await getState(page, daemon), sessionA.id);

      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeB, { musterSession: sessionB.id }),
      });

      // Wait for B's own visible effect, and the (account-global) masthead's, before
      // checking that A never moved.
      await expect(cardContextRow(cardB)).toContainText("42%");
      await expect(mastheadBucket(page, "5h")).toContainText("61%");

      await expect(cardA.getByText(/ctx\s+unknown/i)).toBeVisible();
      const afterA = findSession(await getState(page, daemon), sessionA.id);
      expect(afterA).toEqual(beforeA);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("/clear returns the context row to ctx unknown and resets the compaction counter (E10)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e10-clear" });
      const card = sessionCard(page, "gauge-e10-clear");
      const originalClaudeId = "claude-gauge-e10-orig";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(originalClaudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(originalClaudeId, { musterSession: session.id }),
      });
      await expect(cardContextRow(card)).toContainText("42%");

      await request.post(daemon.ingestURL("hook"), { data: rawPreCompact(originalClaudeId, "p1") });
      await expect(card.getByText(/⟳1\b/)).toBeVisible();

      // The /clear sequence (sessions.spec.ts's E7 pattern): a turn closes normally,
      // SessionEnd(reason:"clear") is not a death hint, then the new SessionStart
      // (source:"clear") rebinds this same card to a fresh claude_session_id.
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(originalClaudeId) });
      await request.post(daemon.ingestURL("hook"), { data: rawStop(originalClaudeId) });
      await request.post(daemon.ingestURL("hook"), { data: rawSessionEnd(originalClaudeId, "clear") });

      const newClaudeId = "claude-gauge-e10-new";
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(newClaudeId, { musterSession: session.id, source: "clear" }),
      });

      await expect(stateBadge(card)).toHaveText(/started/i);
      await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
      await expect(card.getByText(/⟳/)).toHaveCount(0);
      await expect(cardContextTrack(card)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});

test("after a daemon restart the masthead reads unknown until a fresh post, while the session card keeps its last-known context (E11)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e11-restart" });
      const card = sessionCard(page, "gauge-e11-restart");
      const claudeId = "claude-gauge-e11";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, { musterSession: session.id }),
      });
      await expect(cardContextRow(card)).toContainText("42%");
      await expect(mastheadBucket(page, "5h")).toContainText("61%");

      await daemon.restart();
      await page.reload();

      // REQ-7: no hydration — the aggregator (and therefore the masthead) is unknown
      // again until the next post-boot sample.
      await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
      await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
      await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);

      // The session's context, by contrast, lives on the session row and survives
      // (plan decision 2026-08-23: "Per-session context DOES survive restart").
      const reloadedCard = sessionCard(page, "gauge-e11-restart");
      await expect(reloadedCard).toBeVisible();
      await expect(cardContextRow(reloadedCard)).toContainText("42%");
      await expect(cardContextTrack(reloadedCard)).toHaveCount(1);
    } finally {
      await cleanup();
    }
  });
});

test("a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "gauge-e12-hot" });
      const card = sessionCard(page, "gauge-e12-hot");
      const claudeId = "claude-gauge-e12";

      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      await request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          musterSession: session.id,
          contextUsedPct: 61,
          fiveHourPct: 61,
          sevenDayPct: 23,
        }),
      });

      await expect(cardContextRow(card)).toContainText("61%");
      await expect(cardContextHot(card)).toHaveCount(1);

      await expect(mastheadBucket(page, "5h")).toContainText("61%");
      await expect(mastheadBucketWarn(page, "5h")).toHaveCount(1);
      // The 7d bucket stays under threshold — R1's honesty check: no surface renders a
      // threshold class it hasn't earned.
      await expect(mastheadBucketWarn(page, "7d")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
