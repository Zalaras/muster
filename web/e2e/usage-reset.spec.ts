import { expect, type Page, type ScratchDaemon, settleFor, test } from "./helpers/fixtures";
import {
  mastheadBucket,
  mastheadBucketTrack,
  mastheadModelWeek,
  mastheadModelWeekPercent,
  mastheadUsageRefreshButton,
} from "./helpers/gauges";
import { mastheadBucketResets } from "./helpers/masthead";
import { envelopedSessionStart, envelopedStatusLineFull } from "./helpers/payloads";
import { envelopeOpts, launchSession, scratchDirectory } from "./helpers/session";
import {
  credentialsFileContent,
  FAR_FUTURE_RESETS_AT,
  FakeUsageAPI,
  weeklyScopedUsageResponse,
} from "./helpers/usageapi";

// The 5h and 7d bars follow the usage call as well as
// the status line (the newest arrival wins per bucket), the daemon calls again at the instant
// a bar's reset passes, and a bar past its reset reads `unknown` until a fresh value arrives.
// Claude Code is faked twice over: status-line posts are synthesized from the measured shape
// (kb:fact/rate-limits-wire-shape — `resets_at` a Unix epoch integer, `used_percentage` a
// float), and `GET /api/oauth/usage` is the FakeUsageAPI (kb:fact/usage-api-oauth-shape —
// `five_hour`/`seven_day` as `{utilization, resets_at}`, RFC3339 with micros and an offset).
// Nothing launches a real `claude` or reaches api.anthropic.com.
//
// Fixture plan: `startDaemon` for every test — each computes `-usage-poll`, `-usage-api-url`
// and the fake endpoint's responses, and one test restarts its daemon. Account usage is
// daemon-global, so no test shares one.
//
// The reset-time journeys need a reset a few real seconds ahead of the daemon's own
// clock; that is the one wall-clock read here, taken once per test and offset by a fixed
// number of seconds. Every other value is fixed.

// A fixed, deterministic token — the file seam stands in for the Keychain.
const FAKE_TOKEN = "MUSTER-E2E-FAKE-OAUTH-TOKEN-8c3e51a7";

// Seconds between "the status post is sent" and the reset it carries. Long enough that the
// 100% reading is on screen before the reset passes, short enough to keep the journey quick.
const RESET_AHEAD_SECONDS = 8;

const FABLE_FAR = { displayName: "Fable", percent: 61, resetsAt: FAR_FUTURE_RESETS_AT } as const;

function fiveHourBody(pct: number, sevenDayPct: number): unknown {
  return weeklyScopedUsageResponse([FABLE_FAR], {
    fiveHour: { utilization: pct, resetsAt: FAR_FUTURE_RESETS_AT },
    sevenDay: { utilization: sevenDayPct, resetsAt: FAR_FUTURE_RESETS_AT },
  });
}

/**
 * Launches a session and posts the status line a real session would: a SessionStart hook
 * (so the session is bound), then the status post twice — the measured close pair
 * (kb:fact/status-posts-arrive-in-pairs; identical values, so one sample).
 */
async function postStatusBuckets(
  page: Page,
  daemon: ScratchDaemon,
  opts: {
    claudeId: string;
    title: string;
    directory: string;
    fiveHourPct: number;
    fiveHourResetsAt: number;
    sevenDayPct: number;
  },
): Promise<void> {
  const session = await launchSession(page, daemon, {
    directory: opts.directory,
    title: opts.title,
  });
  const envelope = await envelopeOpts(session, daemon);
  await page.request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(opts.claudeId, envelope),
  });
  const status = envelopedStatusLineFull(opts.claudeId, {
    ...envelope,
    fiveHourPct: opts.fiveHourPct,
    fiveHourResetsAt: opts.fiveHourResetsAt,
    sevenDayPct: opts.sevenDayPct,
  });
  for (let i = 0; i < 2; i++) {
    const res = await page.request.post(daemon.ingestURL("status"), { data: status });
    expect(res.status()).toBe(200);
  }
}

test("pressing Refresh usage makes the 5h and 7d readouts show the endpoint's percentages, not the last status post's (E1)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    api.setResponse(200, fiveHourBody(30, 40));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    // The start-up call is done once its model window shows: the status post below must be
    // the newer arrival, or the order this journey relies on is a race.
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    await postStatusBuckets(page, daemon, {
      claudeId: "claude-usage-e1",
      title: "usage-e1",
      directory: dir,
      fiveHourPct: 61,
      fiveHourResetsAt: 4070908800, // 2099-01-01T00:00:00Z
      sevenDayPct: 23,
    });
    await expect(mastheadBucket(page, "5h")).toContainText("61%");
    await expect(mastheadBucket(page, "7d")).toContainText("23%");

    // The endpoint now reports different values for all three bars.
    api.setResponse(
      200,
      weeklyScopedUsageResponse([{ ...FABLE_FAR, percent: 70 }], {
        fiveHour: { utilization: 38, resetsAt: FAR_FUTURE_RESETS_AT },
        sevenDay: { utilization: 52, resetsAt: FAR_FUTURE_RESETS_AT },
      }),
    );
    await mastheadUsageRefreshButton(page).click();

    await expect(mastheadBucket(page, "5h")).toContainText("38%");
    await expect(mastheadBucket(page, "7d")).toContainText("52%");
    await expect(mastheadModelWeekPercent(page)).toHaveText("70%");
    await expect(mastheadBucketResets(page, "5h")).toHaveCount(1);
  } finally {
    await cleanup();
    await api.stop();
  }
});

test("Refresh usage activated from the keyboard keeps focus on the same button node while the 5h and 7d readouts update and across a tick (E1, focus)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    api.setResponse(200, fiveHourBody(30, 40));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    await postStatusBuckets(page, daemon, {
      claudeId: "claude-usage-e1-focus",
      title: "usage-e1-focus",
      directory: dir,
      fiveHourPct: 61,
      fiveHourResetsAt: 4070908800,
      sevenDayPct: 23,
    });
    await expect(mastheadBucket(page, "5h")).toContainText("61%");

    api.setResponse(200, fiveHourBody(38, 52));
    const button = mastheadUsageRefreshButton(page);
    await button.focus();
    await button.evaluate((node) => {
      (node as unknown as { __tag: string }).__tag = "refresh-e1";
    });
    const activeIsTagged = (): Promise<boolean> =>
      page.evaluate(
        () =>
          (document.activeElement as unknown as { __tag?: string } | null)?.__tag === "refresh-e1",
      );
    expect(await activeIsTagged()).toBe(true);

    // A real key press on the focused button — not a programmatic click.
    await page.keyboard.press("Enter");

    await expect(mastheadBucket(page, "5h")).toContainText("38%");
    await expect(mastheadBucket(page, "7d")).toContainText("52%");

    // A tick (> 1 s) later the focused node is still the one focused and tagged.
    await settleFor(page, 1_500);
    expect(await activeIsTagged()).toBe(true);
    await expect(button).toBeFocused();
  } finally {
    await cleanup();
    await api.stop();
  }
});

test("a 100% 5h bar reads unknown the moment its reset passes, then shows the endpoint's value from the reset-time call with no click (E2)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    api.setResponse(200, fiveHourBody(30, 40));
    // An hour's poll interval: nothing but the reset can cause the second call.
    const daemon = await startDaemon({
      usagePoll: "1h",
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    // The start-up call fills the bars with no status post.
    await expect(mastheadBucket(page, "5h")).toContainText("30%");
    await expect(mastheadBucket(page, "7d")).toContainText("40%");

    // From here the endpoint holds its answer, so the interval between the reset passing and
    // the call returning is observable instead of raced; the value it will return is lower.
    api.hold();
    api.setResponse(200, fiveHourBody(12, 41));

    const resetEpoch = Math.ceil(Date.now() / 1000) + RESET_AHEAD_SECONDS;
    await postStatusBuckets(page, daemon, {
      claudeId: "claude-usage-e2",
      title: "usage-e2",
      directory: dir,
      fiveHourPct: 100,
      fiveHourResetsAt: resetEpoch,
      sevenDayPct: 55,
    });
    await expect(mastheadBucket(page, "5h")).toContainText("100%");
    await expect(mastheadBucket(page, "7d")).toContainText("55%");
    const callsBeforeReset = api.requestCount;

    // With no daemon message, the bar turns unknown once the dashboard's clock passes
    // the reset — no track, no reset suffix — while the 7d bar (reset 2099) is untouched.
    await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
    await expect(mastheadBucket(page, "5h")).not.toContainText("100%");
    await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);
    await expect(mastheadBucketResets(page, "5h")).toHaveCount(0);
    await expect(mastheadBucket(page, "7d")).toContainText("55%");

    // The daemon itself made a call, at or after the reset instant.
    await expect
      .poll(() => api.requestCount, {
        message: "expected the daemon to call the usage endpoint when the 5h reset passed",
      })
      .toBeGreaterThan(callsBeforeReset);
    expect(api.requestTimes[callsBeforeReset]).toBeGreaterThanOrEqual(resetEpoch * 1000);

    api.release();

    await expect(mastheadBucket(page, "5h")).toContainText("12%");
    await expect(mastheadBucket(page, "5h")).not.toContainText("100%");
    await expect(mastheadBucket(page, "7d")).toContainText("41%");
    await expect(mastheadBucketTrack(page, "5h")).toHaveCount(1);
    await expect(mastheadBucketResets(page, "5h")).toHaveCount(1);
  } finally {
    await cleanup();
    await api.stop();
  }
});

test("when the reset-time call fails the 5h bar stays unknown and never goes back to 100%, and the 7d bar keeps its value (E3)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    api.setResponse(200, fiveHourBody(30, 40));
    const daemon = await startDaemon({
      usagePoll: "1h",
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadBucket(page, "5h")).toContainText("30%");

    // A server error — a fulfilled non-200, which the daemon reports as `unreachable`.
    api.setResponse(500, { error: "internal" });

    const resetEpoch = Math.ceil(Date.now() / 1000) + RESET_AHEAD_SECONDS;
    await postStatusBuckets(page, daemon, {
      claudeId: "claude-usage-e3",
      title: "usage-e3",
      directory: dir,
      fiveHourPct: 100,
      fiveHourResetsAt: resetEpoch,
      sevenDayPct: 55,
    });
    await expect(mastheadBucket(page, "5h")).toContainText("100%");
    const callsBeforeReset = api.requestCount;

    await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
    await expect
      .poll(() => api.requestCount, {
        message: "expected the daemon to call the usage endpoint when the 5h reset passed",
      })
      .toBeGreaterThan(callsBeforeReset);
    expect(api.requestTimes[callsBeforeReset]).toBeGreaterThanOrEqual(resetEpoch * 1000);

    // The failure has landed (the model readout is the call's failure display)…
    await expect(mastheadModelWeek(page)).toHaveAttribute("title", "unreachable");
    // …and the bar it could not refresh is still unknown, never the pre-reset percentage.
    await settleFor(page, 1_500);
    await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
    await expect(mastheadBucket(page, "5h")).not.toContainText("100%");
    await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);
    await expect(mastheadBucketResets(page, "5h")).toHaveCount(0);
    await expect(mastheadBucket(page, "7d")).toContainText("55%");
  } finally {
    await cleanup();
    await api.stop();
  }
});

test("a restarted daemon reads unknown until its start-up usage call answers, then shows the endpoint's 5h and 7d with no status post sent (E4)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, fiveHourBody(20, 30));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadBucket(page, "5h")).toContainText("20%");
    await expect(mastheadBucket(page, "7d")).toContainText("30%");

    // The restarted daemon's start-up call is held, so the interval before it answers can be
    // seen: nothing is read back from the history row the first run wrote (no hydration).
    const callsBeforeRestart = api.requestCount;
    api.hold();
    api.setResponse(200, fiveHourBody(44, 55));
    await daemon.restart();
    await page.reload();

    await expect
      .poll(() => api.requestCount, {
        message: "expected the restarted daemon to make its start-up usage call",
      })
      .toBeGreaterThan(callsBeforeRestart);
    await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
    await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
    await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);

    api.release();

    await expect(mastheadBucket(page, "5h")).toContainText("44%");
    await expect(mastheadBucket(page, "7d")).toContainText("55%");
  } finally {
    await api.stop();
  }
});
