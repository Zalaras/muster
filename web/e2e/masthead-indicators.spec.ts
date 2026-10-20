import { listUsageSampleModels } from "./helpers/db";
import { expect, type Page, type ScratchDaemon, settleFor, test } from "./helpers/fixtures";
import { mastheadBucket } from "./helpers/gauges";
import {
  allMastheadResets,
  connectionBanner,
  connectionStatus,
  dotColour,
  type HealthSample,
  healthViolations,
  mastheadBucketResets,
  recordHealth,
  removedModelReadout,
  resolvedColours,
  TITLE_CONNECTED,
  TITLE_CONNECTING,
  TITLE_DOWN,
  TITLE_UPDATING,
} from "./helpers/masthead";
import { envelopedSessionStart, envelopedStatusLineFull } from "./helpers/payloads";
import { envelopeOpts, launchSession, scratchDirectory } from "./helpers/session";

// Plan masthead-indicators — REQ-1..REQ-12: the masthead drops its model readout (#85),
// every usage readout's reset becomes `(HH:MM)` / `(HH:MM Ddd)` (#80), and the connection
// text becomes a coloured health dot (#79). Claude Code is faked: every status post below
// is a synthesized `statusLineFull` (helpers/payloads.ts, from the measured captures)
// sent to the real `/ingest/<token>/status` endpoint of a scratch daemon, exactly as the
// real status-line script would. No real `claude` is launched (CLAUDE.md hard rule).
//
// Fixture plan: every test takes the per-test `daemon` fixture. Account usage (the
// masthead buckets, `usage_sample`) is daemon-global, and the connection tests kill or
// restart their daemon. The model-week window needs a fake usage endpoint whose port is
// computed in the test, so its journeys live in usage-model.spec.ts, which spawns its
// daemons through `startDaemon`.
//
// What the suffix and the dot look like for a given state — the `(HH:MM)` / `(HH:MM Ddd)`
// forms, the hover title, the dot-sized status (REQ-4, REQ-7, REQ-12) — is a render test in
// web/render/usage.spec.ts (re-levelled 2026-10-20, plans/_audit/relevel/usage.md). The
// dot's three colours stay here: the render harness has no way to withhold the hello or
// close the socket, so pending and down are only reachable against a daemon.

/** Launches a session on a fresh daemon, binds it with a SessionStart, and returns what a
 * test needs to post status lines to it. */
async function boundSession(page: Page, daemon: ScratchDaemon, title: string, claudeId: string) {
  const { path: dir, cleanup } = await scratchDirectory();
  await page.goto(daemon.dashboardUrl);
  const session = await launchSession(page, daemon, { directory: dir, title });
  await page.request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
  });
  return { session, cleanup };
}

test("a fresh daemon shows unknown buckets with no reset text, and a status post then brings the suffixes in (E3, REQ-5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
  await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
  await expect(allMastheadResets(page)).toHaveCount(0);
  await expect(mastheadBucket(page, "5h").locator("i")).toHaveCount(0);
  await expect(mastheadBucket(page, "7d").locator("i")).toHaveCount(0);

  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const session = await launchSession(page, daemon, { directory: dir, title: "mi-unknown" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mi-unknown", await envelopeOpts(session, daemon)),
    });
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-unknown", await envelopeOpts(session, daemon)),
    });
    // The locator is live: once the buckets are known the same selector finds both suffixes.
    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await expect(mastheadBucketResets(page, "5h")).toHaveCount(1);
    await expect(mastheadBucketResets(page, "7d")).toHaveCount(1);
  } finally {
    await cleanup();
  }
});

test("the masthead has no model readout before or after a status post carrying a model (E4, REQ-1, INV-2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect(connectionStatus(page)).toHaveText("connected");
  await expect(removedModelReadout(page)).toHaveCount(0);

  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const session = await launchSession(page, daemon, { directory: dir, title: "mi-no-model" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mi-no-model", await envelopeOpts(session, daemon)),
    });
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-no-model", {
        ...(await envelopeOpts(session, daemon)),
        model: { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" },
      }),
    });

    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await expect(removedModelReadout(page)).toHaveCount(0);
    await expect(page.locator(".masthead")).not.toContainText("Haiku 4.5");
  } finally {
    await cleanup();
  }
});

test("the usage object carries no model key in the snapshot, in GET /api/state and in every usage message, with null and with known buckets (D1, REQ-2, INV-2)", async ({
  page,
  daemon,
}) => {
  const frames: Array<{ type?: string; usage?: Record<string, unknown> }> = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      frames.push(JSON.parse(payload) as { type?: string; usage?: Record<string, unknown> });
    });
  });
  await page.goto(daemon.dashboardUrl);
  await expect(connectionStatus(page)).toHaveText("connected");

  const stateBefore = (await (await page.request.get(`${daemon.baseURL}/api/state`)).json()) as {
    usage: Record<string, unknown>;
  };
  expect(stateBefore.usage.fiveHour).toBeNull();
  expect(stateBefore.usage).not.toHaveProperty("model");
  const snapshot = frames.find((frame) => frame.type === "snapshot");
  expect(snapshot?.usage).toBeDefined();
  expect(snapshot?.usage).not.toHaveProperty("model");

  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const session = await launchSession(page, daemon, { directory: dir, title: "mi-wire" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mi-wire", await envelopeOpts(session, daemon)),
    });
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-wire", {
        ...(await envelopeOpts(session, daemon)),
        model: { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" },
      }),
    });
    await expect(mastheadBucket(page, "5h")).toContainText("61%");

    const known = frames.filter(
      (frame) => frame.type === "usage" && frame.usage?.fiveHour !== null,
    );
    expect(known.length).toBeGreaterThan(0);
    for (const frame of frames.filter((f) => f.type === "usage")) {
      expect(frame.usage).not.toHaveProperty("model");
    }
    const stateAfter = (await (await page.request.get(`${daemon.baseURL}/api/state`)).json()) as {
      usage: Record<string, unknown>;
    };
    expect(stateAfter.usage.fiveHour).not.toBeNull();
    expect(stateAfter.usage).not.toHaveProperty("model");
  } finally {
    await cleanup();
  }
});

test("a status post changing only the model still records a usage_sample row with that model (D2, REQ-3)", async ({
  page,
  daemon,
}) => {
  const { session, cleanup } = await boundSession(page, daemon, "mi-model-only", "claude-mi-mo");
  try {
    const opts = await envelopeOpts(session, daemon);
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-mo", {
        ...opts,
        model: { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" },
      }),
    });
    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await expect.poll(async () => (await listUsageSampleModels(daemon.dbPath)).length).toBe(1);

    // Same bucket values, a different model: history gets a second row carrying it.
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-mo", {
        ...opts,
        model: { id: "claude-opus-5", displayName: "Opus 5" },
      }),
    });
    await expect
      .poll(async () => await listUsageSampleModels(daemon.dbPath))
      .toEqual([
        { model_id: "claude-haiku-4-5-20251001", model_display_name: "Haiku 4.5" },
        { model_id: "claude-opus-5", model_display_name: "Opus 5" },
      ]);
  } finally {
    await cleanup();
  }
});

test("a status post changing only the model broadcasts a usage whose wire content equals the previous one (edge case 2, REQ-2)", async ({
  page,
  daemon,
}) => {
  const frames: Array<{ type?: string; usage?: Record<string, unknown> }> = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      frames.push(JSON.parse(payload) as { type?: string; usage?: Record<string, unknown> });
    });
  });
  const { session, cleanup } = await boundSession(page, daemon, "mi-model-wire", "claude-mi-mw");
  try {
    const opts = await envelopeOpts(session, daemon);
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-mw", {
        ...opts,
        model: { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" },
      }),
    });
    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await page.request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-mi-mw", {
        ...opts,
        model: { id: "claude-opus-5", displayName: "Opus 5" },
      }),
    });

    const known = (): Array<{ usage?: Record<string, unknown> }> =>
      frames.filter((f) => f.type === "usage" && f.usage?.fiveHour != null);
    await expect.poll(() => known().length).toBeGreaterThanOrEqual(2);
    const sent = known();
    const latest = sent[sent.length - 1]?.usage ?? {};
    const previous = sent[sent.length - 2]?.usage ?? {};
    // sampledAt is stamped from the daemon's wall clock when the sample is recorded, so the two
    // posts can straddle a clock second; every other wire key must be identical.
    const { sampledAt: latestAt, ...latestRest } = latest;
    const { sampledAt: previousAt, ...previousRest } = previous;
    expect(latestRest).toEqual(previousRest);
    expect(Date.parse(String(latestAt))).toBeGreaterThanOrEqual(Date.parse(String(previousAt)));
    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await expect(removedModelReadout(page)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("connected, the dot reads ok with the connected word and title; a killed daemon turns it down with the banner; a restart turns it ok again (E5, REQ-6 to REQ-9, INV-1)", async ({
  page,
  daemon,
}) => {
  const samples = await recordHealth(page);
  await page.goto(daemon.dashboardUrl);

  const status = connectionStatus(page);
  await expect(page.getByRole("status")).toHaveText("connected");
  await expect(status).toHaveAttribute("data-health", "ok");
  await expect(status).toHaveText("connected");
  await expect(status).toHaveAttribute("title", TITLE_CONNECTED);
  await expect(connectionBanner(page)).toBeHidden();

  await daemon.kill();

  const banner = connectionBanner(page);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveText(/musterd unreachable/i);
  await expect(status).toHaveAttribute("data-health", "down");
  await expect(status).toHaveText("reconnecting…");
  await expect(status).toHaveAttribute("title", TITLE_DOWN);

  await daemon.restart();

  await expect(banner).toBeHidden({ timeout: 15_000 });
  await expect(status).toHaveAttribute("data-health", "ok");
  await expect(status).toHaveText("connected");
  await expect(status).toHaveAttribute("title", TITLE_CONNECTED);

  // INV-1 at every render of the run, not only at the moments asserted above.
  expect(samples.some((s: HealthSample) => s.health === "down")).toBe(true);
  expect(healthViolations(samples)).toEqual([]);
});

test("before the first hello the dot is pending with the connecting word and title and no banner, then ok once the hello lands (E5, REQ-6, INV-1 first load)", async ({
  page,
  daemon,
}) => {
  const samples = await recordHealth(page);
  // Withholds the dashboard's one /ws until the test releases it: the state "no hello has
  // ever arrived" without touching the daemon (resilience.spec.ts's pop-out test uses the
  // same technique). Only sockets created after this call are routed.
  const route: { connect: (() => void) | null } = { connect: null };
  await page.routeWebSocket("**/ws", (ws) => {
    route.connect = () => ws.connectToServer();
  });
  await page.goto(daemon.dashboardUrl);

  const status = connectionStatus(page);
  await expect(status).toHaveText("connecting…");
  await expect(status).toHaveAttribute("data-health", "pending");
  await expect(status).toHaveAttribute("title", TITLE_CONNECTING);
  // Held past any plausible transient render: still no banner (kb:adr/connection-banner-only-after-first-hello).
  await settleFor(page, 2000);
  await expect(status).toHaveAttribute("data-health", "pending");
  await expect(connectionBanner(page)).toBeHidden();

  if (!route.connect) throw new Error("expected the dashboard's WebSocket route to be active");
  route.connect();

  await expect(status).toHaveText("connected");
  await expect(status).toHaveAttribute("data-health", "ok");
  await expect(status).toHaveAttribute("title", TITLE_CONNECTED);
  expect(healthViolations(samples)).toEqual([]);
});

test("an update restart that outlasts the banner's 30 s window turns the dot from pending to red with the banner, and a reconnect returns it to ok (INV-1, edge case 7)", async ({
  page,
  daemon,
}) => {
  // The 30 s fallback is the banner's own clock (features/updaterestart.ts), so the page's
  // clock jumps past it instead of the test waiting it out.
  await page.clock.install();
  const samples = await recordHealth(page);
  const route: { sendToPage: ((raw: string) => void) | null } = { sendToPage: null };
  await page.routeWebSocket("**/ws", (ws) => {
    route.sendToPage = (raw) => ws.send(raw);
    const server = ws.connectToServer();
    server.onMessage((message) => ws.send(message));
    ws.onMessage((message) => server.send(message));
  });
  await page.goto(daemon.dashboardUrl);

  const status = connectionStatus(page);
  await expect(status).toHaveAttribute("data-health", "ok");

  // Arms the dashboard's restart record with a fully valid `update` broadcast whose apply
  // phase is `restarting` (kb:anchor/ws.update) — the one shape the record is armed from.
  if (!route.sendToPage) throw new Error("expected the dashboard's WebSocket route to be active");
  route.sendToPage(
    JSON.stringify({
      type: "update",
      update: {
        running: "0.1.0",
        install: "installer",
        remedy: null,
        canCheck: true,
        available: "0.2.0",
        checkedAt: null,
        installed: null,
        apply: { phase: "restarting", version: "0.2.0", error: null },
      },
    }),
  );

  await daemon.kill();

  const banner = connectionBanner(page);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveText(/^Updating musterd to v0\.2\.0/);
  await expect(status).toHaveAttribute("data-health", "pending");
  await expect(status).toHaveText("reconnecting…");
  await expect(status).toHaveAttribute("title", TITLE_UPDATING);

  await page.clock.fastForward(31_000);

  await expect(banner).toHaveText(/musterd unreachable/i);
  await expect(banner).not.toHaveText(/^Updating/);
  await expect(status).toHaveAttribute("data-health", "down");
  await expect(status).toHaveAttribute("title", TITLE_DOWN);

  await daemon.restart();

  // The held record reloads the window on the first hello (kb:adr/update-restart-reloads-dashboard).
  await expect(status).toHaveAttribute("data-health", "ok", { timeout: 15_000 });
  await expect(status).toHaveText("connected");
  await expect(status).toHaveAttribute("title", TITLE_CONNECTED);
  expect(healthViolations(samples)).toEqual([]);
});

test("the dot's pending, ok and down colours are three distinct colours, none of them a state token (E5, REQ-10)", async ({
  page,
  daemon,
}) => {
  const route: { connect: (() => void) | null } = { connect: null };
  await page.routeWebSocket("**/ws", (ws) => {
    route.connect = () => ws.connectToServer();
  });
  await page.goto(daemon.dashboardUrl);
  const status = connectionStatus(page);

  await expect(status).toHaveAttribute("data-health", "pending");
  const pending = await dotColour(page);

  if (!route.connect) throw new Error("expected the dashboard's WebSocket route to be active");
  route.connect();
  await expect(status).toHaveAttribute("data-health", "ok");
  const ok = await dotColour(page);

  await daemon.kill();
  await expect(status).toHaveAttribute("data-health", "down", { timeout: 15_000 });
  const down = await dotColour(page);

  for (const [name, colour] of [
    ["pending", pending],
    ["ok", ok],
    ["down", down],
  ] as const) {
    expect(colour, `the ${name} dot paints a colour`).not.toBe("");
  }
  expect(new Set([pending, ok, down]).size).toBe(3);

  const stateTokens = await resolvedColours(page, [
    "--amber",
    "--rose",
    "--teal",
    "--violet",
    "--idle",
  ]);
  for (const [token, colour] of Object.entries(stateTokens)) {
    for (const [name, dot] of [
      ["pending", pending],
      ["ok", ok],
      ["down", down],
    ] as const) {
      expect(dot, `the ${name} dot must not reuse ${token}`).not.toBe(colour);
    }
  }
});
