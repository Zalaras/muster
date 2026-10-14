import {
  cardTimer,
  expectTimerFade,
  expectUnderline,
  expiresIn,
  headerTimer,
  postStatus,
  timerRgb,
  timerText,
  tokenRgb,
  trackUpserts,
  useWarmthClock,
  wireCache,
  wireInstant,
  colourDistance,
} from "./helpers/cache-warmth";
import { expect, type Locator, type Page, settleFor, test } from "./helpers/fixtures";
import {
  createGroupViaApi,
  driveToState,
  groupCaret,
  groupHead,
  launchTitled,
  popover,
  updateGroupViaApi,
} from "./helpers/groups";
import {
  envelopedSessionStart,
  rawPreCompact,
  rawSessionEnd,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import { railCard } from "./helpers/railorder";
import { bindClaude } from "./helpers/rail-menu";
import { envelopeOpts, waitForNextClockSecond } from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// Plan rail-card-organise — prompt-cache warmth (#84): the card timer's tint, underline and hover,
// what the daemon keeps and clears, the group header's extra timer and the popover's row timers.
// Acceptance E14-E19 with REQ-21 to REQ-32 and INV-2, INV-5.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// the restart criterion restarts the daemon, and the daemon-down one kills it.
//
// Time: the dashboard reads `expiresAt` against its own clock, so each test fixes the page's clock
// at a known instant (`useWarmthClock`, helpers/cache-warmth.ts) and posts caches that expire a
// computed number of seconds after it; moving the clock is one `setFixedTime` that the 1 s render
// tick picks up with no message arriving. Remaining times are therefore exact, boundaries included.
// The hover text uses the plan's middle dot ("·").

const WARM_1H = (remaining: number) => ({ expiresAt: expiresIn(remaining), ttl: "1h" });

test("an idle session's timer is tinted and hovers as warm, turns cooling with a dotted underline in the last 15% of its lifetime and plain cold past expiry as the page clock advances with no new post (REQ-24, REQ-25, REQ-27, REQ-28, E14)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["warm-e14"]);
  try {
    const [s] = sessions;
    if (!s) throw new Error("expected 1 session");
    await driveToState(request, daemon, s, "claude-warm-e14", "idle");
    await postStatus(request, daemon, s, "claude-warm-e14", WARM_1H(3600));
    const timer = cardTimer(railCard(page, "warm-e14"));

    // The daemon's own truth first: the expiry and lifetime the display below derives from.
    await expect
      .poll(() => wireCache(page, daemon, s.id))
      .toEqual({ expiresAt: wireInstant(expiresIn(3600)), ttlSeconds: 3600 });
    await expect(timer).toHaveAttribute("aria-label", "time in state");
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 60m");
    await expectTimerFade(page, timer, 1);
    await expectUnderline(timer, false);

    // 52 minutes on, no message sent: 480 s of 3600 s remain, 13.3%, inside the last 15%.
    await useWarmthClock(page, 52 * 60);
    await expect(timer).toHaveAttribute("data-cache", "cooling");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 8m");
    await expectTimerFade(page, timer, 480 / 3600);
    await expectUnderline(timer, true);

    // Past expiry: plain grey, no underline, the cold wording.
    await useWarmthClock(page, 61 * 60);
    await expect(timer).toHaveAttribute("data-cache", "cold");
    await expect(timer).toHaveAttribute("title", "cache cold");
    await expectTimerFade(page, timer, 0, 1);
    await expectUnderline(timer, false);
  } finally {
    await cleanup();
  }
});

test("the tint is a straight line from the bright foreground to the timer's usual grey over the lifetime, and an unknown or cold timer is that usual grey (REQ-24, REQ-26, REQ-28)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "fade-warm",
    "fade-unknown",
    "fade-cold",
  ]);
  try {
    const [w, u, c] = sessions;
    if (!w || !u || !c) throw new Error("expected 3 sessions");
    await driveToState(request, daemon, w, "claude-fade-warm", "idle");
    await driveToState(request, daemon, u, "claude-fade-unknown", "idle");
    await driveToState(request, daemon, c, "claude-fade-cold", "idle");
    await postStatus(request, daemon, w, "claude-fade-warm", WARM_1H(3600));
    await postStatus(request, daemon, u, "claude-fade-unknown", null);
    await postStatus(request, daemon, c, "claude-fade-cold", WARM_1H(-10));
    const warm = cardTimer(railCard(page, "fade-warm"));
    const unknown = cardTimer(railCard(page, "fade-unknown"));
    const cold = cardTimer(railCard(page, "fade-cold"));

    await expect(warm).toHaveAttribute("data-cache", "warm");
    await expect(unknown).toHaveAttribute("data-cache", "unknown");
    await expect(unknown).toHaveAttribute("title", "cache unknown");
    await expect(cold).toHaveAttribute("data-cache", "cold");
    await expect(cold).toHaveAttribute("title", "cache cold");

    // Today's plain timer is --fg-dim; unknown and cold both are exactly that, with no underline.
    const grey = await tokenRgb(page, "--fg-dim");
    expect(colourDistance(await timerRgb(page, unknown), grey)).toBeLessThanOrEqual(1);
    expect(colourDistance(await timerRgb(page, cold), grey)).toBeLessThanOrEqual(1);
    await expectUnderline(unknown, false);
    await expectUnderline(cold, false);

    await expectTimerFade(page, warm, 1);
    await useWarmthClock(page, 1800);
    await expect(warm).toHaveAttribute("title", "cache warm · cold in 30m");
    await expectTimerFade(page, warm, 0.5);
    await useWarmthClock(page, 2700);
    await expect(warm).toHaveAttribute("title", "cache warm · cold in 15m");
    await expectTimerFade(page, warm, 0.25);
    // The unknown card never moved with the clock.
    expect(colourDistance(await timerRgb(page, unknown), grey)).toBeLessThanOrEqual(1);
  } finally {
    await cleanup();
  }
});

test("the underline starts at exactly 15% of the lifetime remaining, a 5-minute lifetime at 45 s, and the hover counts whole minutes up while a minute or more remains and seconds below it (REQ-25, REQ-27)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["bound-short", "bound-hour"]);
  try {
    const [short, hour] = sessions;
    if (!short || !hour) throw new Error("expected 2 sessions");
    await driveToState(request, daemon, short, "claude-bound-short", "idle");
    await driveToState(request, daemon, hour, "claude-bound-hour", "idle");
    await postStatus(request, daemon, short, "claude-bound-short", {
      expiresAt: expiresIn(300),
      ttl: "5m",
    });
    await postStatus(request, daemon, hour, "claude-bound-hour", WARM_1H(3600));
    const shortTimer = cardTimer(railCard(page, "bound-short"));
    const hourTimer = cardTimer(railCard(page, "bound-hour"));
    await expect
      .poll(() => wireCache(page, daemon, short.id))
      .toEqual({ expiresAt: wireInstant(expiresIn(300)), ttlSeconds: 300 });
    await expect(shortTimer).toHaveAttribute("title", "cache warm · cold in 5m");

    // 46 s left of 300: above 15%, so warm and plain.
    await useWarmthClock(page, 254);
    await expect(shortTimer).toHaveAttribute("data-cache", "warm");
    await expect(shortTimer).toHaveAttribute("title", "cache warm · cold in 46s");
    await expectUnderline(shortTimer, false);
    // 45 s left: exactly 15%, so cooling and underlined.
    await useWarmthClock(page, 255);
    await expect(shortTimer).toHaveAttribute("data-cache", "cooling");
    await expect(shortTimer).toHaveAttribute("title", "cache warm · cold in 45s");
    await expectUnderline(shortTimer, true);
    await useWarmthClock(page, 299);
    await expect(shortTimer).toHaveAttribute("data-cache", "cooling");
    await expect(shortTimer).toHaveAttribute("title", "cache warm · cold in 1s");
    // Nothing left: cold.
    await useWarmthClock(page, 300);
    await expect(shortTimer).toHaveAttribute("data-cache", "cold");
    await expect(shortTimer).toHaveAttribute("title", "cache cold");
    await expectUnderline(shortTimer, false);

    // The hour-long cache around the minute boundary: 61 s left reads 2m, 60 s 1m, 59 s 59s.
    await useWarmthClock(page, 3539);
    await expect(hourTimer).toHaveAttribute("title", "cache warm · cold in 2m");
    await useWarmthClock(page, 3540);
    await expect(hourTimer).toHaveAttribute("title", "cache warm · cold in 1m");
    await useWarmthClock(page, 3541);
    await expect(hourTimer).toHaveAttribute("title", "cache warm · cold in 59s");
    await expect(hourTimer).toHaveAttribute("data-cache", "cooling");
    await useWarmthClock(page, 3600);
    await expect(hourTimer).toHaveAttribute("data-cache", "cold");
    await expect(hourTimer).toHaveAttribute("title", "cache cold");
  } finally {
    await cleanup();
  }
});

test("a session with no prompt_cache shows an unknown plain timer, a later post without one changes nothing, and /clear returns a warm session to unknown (REQ-21, REQ-22, REQ-26, E16)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["clear-fresh", "clear-warm"]);
  try {
    const [fresh, warm] = sessions;
    if (!fresh || !warm) throw new Error("expected 2 sessions");
    const freshTimer = cardTimer(railCard(page, "clear-fresh"));
    const warmTimer = cardTimer(railCard(page, "clear-warm"));

    // Started, never replied: unknown on the card and null on the wire.
    await expect(freshTimer).toHaveAttribute("data-cache", "unknown");
    await expect(freshTimer).toHaveAttribute("title", "cache unknown");
    expect(await wireCache(page, daemon, fresh.id)).toBeNull();

    await driveToState(request, daemon, warm, "claude-clear-warm", "idle");
    await postStatus(request, daemon, warm, "claude-clear-warm", WARM_1H(1800));
    await expect(warmTimer).toHaveAttribute("data-cache", "warm");
    const held = { expiresAt: wireInstant(expiresIn(1800)), ttlSeconds: 3600 };
    await expect.poll(() => wireCache(page, daemon, warm.id)).toEqual(held);

    // A post without prompt_cache is "unknown for that post, never cold": the last value stays.
    await postStatus(request, daemon, warm, "claude-clear-warm", null);
    await settleFor(page, 800);
    expect(await wireCache(page, daemon, warm.id)).toEqual(held);
    await expect(warmTimer).toHaveAttribute("data-cache", "warm");

    // /clear: SessionEnd(clear) then the new conversation's SessionStart(clear) in the same pane.
    await request.post(daemon.ingestURL("hook"), {
      data: rawSessionEnd("claude-clear-warm", "clear"),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-clear-warm-2", {
        ...(await envelopeOpts(warm, daemon)),
        source: "clear",
      }),
    });
    await expect(warmTimer).toHaveAttribute("data-cache", "unknown");
    await expect(warmTimer).toHaveAttribute("title", "cache unknown");
    await expect.poll(() => wireCache(page, daemon, warm.id)).toBeNull();
    // The bystander never had one and still has none.
    expect(await wireCache(page, daemon, fresh.id)).toBeNull();

    // The new conversation's first reply refills it.
    await postStatus(request, daemon, warm, "claude-clear-warm-2", WARM_1H(1500));
    await expect(warmTimer).toHaveAttribute("data-cache", "warm");
    await expect(warmTimer).toHaveAttribute("title", "cache warm · cold in 25m");
  } finally {
    await cleanup();
  }
});

/** The rail card whose title is exactly `title`: `railCard` is a substring match, so `state-ended`
 * would also find `state-ended-unknown`; the card's label is its title plus `, unread` once it is. */
function exactCard(page: Page, title: string): Locator {
  return page
    .locator("#sessions")
    .getByTestId("session-card")
    .and(page.getByLabel(new RegExp(`^${title}(, unread)?$`)));
}

test("every state shows an unknown plain timer before a first reply and a tinted one once the cache is known, an ended card included (INV-2, REQ-24, REQ-26, E17)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const titles = [
    "state-started",
    "state-planning",
    "state-working",
    "state-needs",
    "state-failed",
    "state-idle",
    "state-ended",
    "state-ended-unknown",
  ];
  const { sessions, cleanup } = await launchTitled(page, daemon, titles);
  try {
    const [started, planning, working, needs, failed, idle, ended, endedUnknown] = sessions;
    if (
      !started ||
      !planning ||
      !working ||
      !needs ||
      !failed ||
      !idle ||
      !ended ||
      !endedUnknown
    ) {
      throw new Error("expected 8 sessions");
    }
    await driveToState(request, daemon, working, "claude-state-working", "working");
    await driveToState(request, daemon, needs, "claude-state-needs", "needs_input");
    await driveToState(request, daemon, failed, "claude-state-failed", "failed");
    await driveToState(request, daemon, idle, "claude-state-idle", "idle");
    await driveToState(request, daemon, ended, "claude-state-ended", "idle");
    await driveToState(request, daemon, endedUnknown, "claude-state-ended-unknown", "idle");
    await bindClaude(request, daemon, planning, "claude-state-planning");
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-state-planning", { permissionMode: "plan" }),
    });
    await expect(exactCard(page, "state-planning")).toContainText(/planning/i);

    // Before any reply: unknown on every card, in every state.
    for (const title of titles) {
      const timer = cardTimer(exactCard(page, title));
      await expect(timer).toHaveAttribute("data-cache", "unknown");
      await expect(timer).toHaveAttribute("title", "cache unknown");
    }

    const known = [
      [started, "claude-state-started"],
      [planning, "claude-state-planning"],
      [working, "claude-state-working"],
      [needs, "claude-state-needs"],
      [failed, "claude-state-failed"],
      [idle, "claude-state-idle"],
      [ended, "claude-state-ended"],
    ] as const;
    for (const [session, claudeId] of known) {
      await postStatus(request, daemon, session, claudeId, WARM_1H(1800));
    }
    for (const title of titles.slice(0, 7)) {
      await expect(cardTimer(exactCard(page, title))).toHaveAttribute("data-cache", "warm");
    }
    // E17: a working session's timer is tinted, half way along the ramp at 1800 s of 3600 s.
    await expectTimerFade(page, cardTimer(exactCard(page, "state-working")), 0.5);

    // Then Stop: the ended card keeps its tinted timer; one that never had a cache stays plain.
    for (const target of [ended, endedUnknown]) {
      const res = await page.request.post(`${daemon.baseURL}/api/sessions/${target.id}/end`);
      expect(res.status()).toBe(200);
    }
    const endedTimer = cardTimer(exactCard(page, "state-ended"));
    await expect(exactCard(page, "state-ended")).toHaveClass(/ended/);
    await expect(exactCard(page, "state-ended-unknown")).toHaveClass(/ended/);
    await expect(endedTimer).toHaveAttribute("data-cache", "warm");
    await expect(endedTimer).toHaveAttribute("title", "cache warm · cold in 30m");
    expect(await timerText(endedTimer)).toMatch(/^ended /);
    await expectTimerFade(page, endedTimer, 0.5);
    const unknownTimer = cardTimer(exactCard(page, "state-ended-unknown"));
    await expect(unknownTimer).toHaveAttribute("data-cache", "unknown");
    await expect(unknownTimer).toHaveAttribute("title", "cache unknown");
  } finally {
    await cleanup();
  }
});

test("a Tiles strip card's timer carries the same warmth as its rail card (REQ-24)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const titles = Array.from({ length: 5 }, (_, i) => `strip-warm-${i}`);
  const { sessions, cleanup } = await launchTitled(page, daemon, titles);
  try {
    for (const [i, session] of sessions.entries()) {
      await driveToState(request, daemon, session, `claude-strip-warm-${i}`, "idle");
      await postStatus(request, daemon, session, `claude-strip-warm-${i}`, WARM_1H(2400));
    }
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("article.tile")).toHaveCount(4);
    await expect(page.locator("#tiles-strip").getByTestId("session-card")).toHaveCount(1);

    const stripped: string[] = [];
    for (const title of titles) {
      if ((await liveTile(page, title).count()) === 0) stripped.push(title);
    }
    expect(stripped).toHaveLength(1);
    const timer = cardTimer(stripCard(page, stripped[0] ?? ""));
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 40m");
    await expectTimerFade(page, timer, 2400 / 3600);

    await useWarmthClock(page, 2400 + 3500);
    await expect(timer).toHaveAttribute("data-cache", "cold");
    await expect(timer).toHaveAttribute("title", "cache cold");
  } finally {
    await cleanup();
  }
});

test("the cache is kept by Stop and Resume, by liveness death and by a compaction, and the ended card keeps its tinted timer (REQ-22, INV-5)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "kept-stop",
    "kept-death",
    "kept-compact",
  ]);
  try {
    const [stop, death, compact] = sessions;
    if (!stop || !death || !compact) throw new Error("expected 3 sessions");
    const held = { expiresAt: wireInstant(expiresIn(3000)), ttlSeconds: 3600 };
    const claudeIds = ["claude-kept-stop", "claude-kept-death", "claude-kept-compact"];
    for (const [i, session] of [stop, death, compact].entries()) {
      await driveToState(request, daemon, session, claudeIds[i] ?? "", "idle");
      await postStatus(request, daemon, session, claudeIds[i] ?? "", WARM_1H(3000));
      await expect.poll(() => wireCache(page, daemon, session.id)).toEqual(held);
    }

    // Stop, then Resume.
    const stopTimer = cardTimer(railCard(page, "kept-stop"));
    expect(
      (await page.request.post(`${daemon.baseURL}/api/sessions/${stop.id}/end`)).status(),
    ).toBe(200);
    await expect(railCard(page, "kept-stop")).toHaveClass(/ended/);
    await expect(stopTimer).toHaveAttribute("data-cache", "warm");
    await expect(stopTimer).toHaveAttribute("title", "cache warm · cold in 50m");
    expect(await wireCache(page, daemon, stop.id)).toEqual(held);
    const resumed = await page.request.post(`${daemon.baseURL}/api/sessions/${stop.id}/resume`);
    expect(resumed.status()).toBe(200);
    await expect(railCard(page, "kept-stop")).not.toHaveClass(/ended/);
    await expect(stopTimer).toHaveAttribute("data-cache", "warm");
    expect(await wireCache(page, daemon, stop.id)).toEqual(held);

    // Liveness death: the pane goes away with no Stop.
    await daemon.killTmuxWindow(death.tmuxTarget);
    await expect(railCard(page, "kept-death")).toHaveClass(/ended/);
    await expect(cardTimer(railCard(page, "kept-death"))).toHaveAttribute("data-cache", "warm");
    expect(await wireCache(page, daemon, death.id)).toEqual(held);

    // A compaction: PreCompact, then the compact SessionStart.
    await request.post(daemon.ingestURL("hook"), {
      data: rawPreCompact("claude-kept-compact", "p-compact"),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-kept-compact", {
        ...(await envelopeOpts(compact, daemon)),
        source: "compact",
        promptId: "p-compact",
      }),
    });
    await expect(railCard(page, "kept-compact")).toContainText(/idle/i);
    await expect(cardTimer(railCard(page, "kept-compact"))).toHaveAttribute("data-cache", "warm");
    expect(await wireCache(page, daemon, compact.id)).toEqual(held);
  } finally {
    await cleanup();
  }
});

test("a live session's warmth is the same after a daemon restart and after a dashboard reload, and the restarted daemon still reports the cache on the wire (REQ-22, REQ-32, E15)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["restart-warm", "restart-plain"]);
  try {
    const [warm, plain] = sessions;
    if (!warm || !plain) throw new Error("expected 2 sessions");
    await driveToState(request, daemon, warm, "claude-restart-warm", "idle");
    await postStatus(request, daemon, warm, "claude-restart-warm", WARM_1H(2400));
    const held = { expiresAt: wireInstant(expiresIn(2400)), ttlSeconds: 3600 };
    const timer = cardTimer(railCard(page, "restart-warm"));
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 40m");

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
    await daemon.restart();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
    await expect.poll(() => wireCache(page, daemon, warm.id)).toEqual(held);
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 40m");
    await expectTimerFade(page, timer, 2400 / 3600);
    expect(await wireCache(page, daemon, plain.id)).toBeNull();

    await page.reload();
    await useWarmthClock(page);
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 40m");
    await expectTimerFade(page, timer, 2400 / 3600);
    await expect(cardTimer(railCard(page, "restart-plain"))).toHaveAttribute(
      "data-cache",
      "unknown",
    );
  } finally {
    await cleanup();
  }
});

test("a changed cache is broadcast as exactly one session upsert and an unchanged or absent one as none (REQ-21, REQ-23)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  const upserts = trackUpserts(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["upsert-warm"]);
  try {
    const [s] = sessions;
    if (!s) throw new Error("expected 1 session");
    await driveToState(request, daemon, s, "claude-upsert-warm", "idle");

    await postStatus(request, daemon, s, "claude-upsert-warm", WARM_1H(3000));
    const first = wireInstant(expiresIn(3000));
    await expect
      .poll(() => upserts.forSession(s.id).some((u) => u.cache?.expiresAt === first))
      .toBe(true);
    await settleFor(page, 500);
    const afterFirst = upserts.forSession(s.id).length;

    // The same post again, as a pair: nothing to broadcast.
    await postStatus(request, daemon, s, "claude-upsert-warm", WARM_1H(3000));
    await settleFor(page, 800);
    expect(upserts.forSession(s.id)).toHaveLength(afterFirst);

    // A later expiry, everything else identical: exactly one upsert, carrying it.
    await postStatus(request, daemon, s, "claude-upsert-warm", WARM_1H(3060));
    const second = wireInstant(expiresIn(3060));
    await expect
      .poll(() => upserts.forSession(s.id).some((u) => u.cache?.expiresAt === second))
      .toBe(true);
    await settleFor(page, 500);
    expect(upserts.forSession(s.id)).toHaveLength(afterFirst + 1);
    expect(upserts.forSession(s.id).at(-1)?.cache).toEqual({
      expiresAt: second,
      ttlSeconds: 3600,
    });

    // A post without prompt_cache: no upsert, and the value on the wire is untouched.
    await postStatus(request, daemon, s, "claude-upsert-warm", null);
    await settleFor(page, 800);
    expect(upserts.forSession(s.id)).toHaveLength(afterFirst + 1);
    expect(await wireCache(page, daemon, s.id)).toEqual({ expiresAt: second, ttlSeconds: 3600 });
  } finally {
    await cleanup();
  }
});

test("the timer keeps fading from the last-known expiry while the daemon is down (REQ-28)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["down-warm"]);
  try {
    const [s] = sessions;
    if (!s) throw new Error("expected 1 session");
    await driveToState(request, daemon, s, "claude-down-warm", "idle");
    await postStatus(request, daemon, s, "claude-down-warm", WARM_1H(3600));
    const timer = cardTimer(railCard(page, "down-warm"));
    await expect(timer).toHaveAttribute("data-cache", "warm");

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
    await expect(timer).toHaveAttribute("data-cache", "warm");

    await useWarmthClock(page, 52 * 60);
    await expect(timer).toHaveAttribute("data-cache", "cooling");
    await expect(timer).toHaveAttribute("title", "cache warm · cold in 8m");
    await expectUnderline(timer, true);
    await expectTimerFade(page, timer, 480 / 3600);

    await useWarmthClock(page, 3600);
    await expect(timer).toHaveAttribute("data-cache", "cold");
    await expect(timer).toHaveAttribute("title", "cache cold");
    await expectUnderline(timer, false);
  } finally {
    await cleanup();
  }
});

test("a group header shows one extra timer for the waiting member that entered its state last, hovering over the warm ones, and none for a section with no waiting member, collapsed or expanded (REQ-29, REQ-30, E18)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "head-i2",
    "head-n1",
    "head-i1",
    "head-w1",
    "head-e1",
    "head-solo",
  ]);
  try {
    const [i2, n1, i1, w1, e1, solo] = sessions;
    if (!i2 || !n1 || !i1 || !w1 || !e1 || !solo) throw new Error("expected 6 sessions");
    const alpha = await createGroupViaApi(page, daemon, "alpha", [
      i2.id,
      n1.id,
      i1.id,
      w1.id,
      e1.id,
    ]);
    const lonely = await createGroupViaApi(page, daemon, "lonely", [solo.id]);

    // Distinct stateSince seconds: i2, then n1, then i1 enter their states in that order.
    await driveToState(request, daemon, e1, "claude-head-e1", "idle");
    await postStatus(request, daemon, e1, "claude-head-e1", WARM_1H(900));
    await waitForNextClockSecond();
    await driveToState(request, daemon, i2, "claude-head-i2", "idle");
    await postStatus(request, daemon, i2, "claude-head-i2", WARM_1H(1800));
    await waitForNextClockSecond();
    await driveToState(request, daemon, n1, "claude-head-n1", "needs_input");
    await waitForNextClockSecond();
    await driveToState(request, daemon, i1, "claude-head-i1", "idle");
    await postStatus(request, daemon, i1, "claude-head-i1", WARM_1H(-60));
    await waitForNextClockSecond();
    await driveToState(request, daemon, w1, "claude-head-w1", "working");
    await postStatus(request, daemon, w1, "claude-head-w1", WARM_1H(600));
    await driveToState(request, daemon, solo, "claude-head-solo", "working");
    await postStatus(request, daemon, solo, "claude-head-solo", WARM_1H(600));
    const ended = await page.request.post(`${daemon.baseURL}/api/sessions/${e1.id}/end`);
    expect(ended.status()).toBe(200);
    await expect(railCard(page, "head-e1")).toHaveClass(/ended/);

    const head = groupHead(page, alpha.id);
    const timer = headerTimer(head);
    // i1 entered idle last among the waiting members: its (cold) timer stands for the group.
    await expect(timer).toHaveCount(1);
    await expect(timer).toHaveAttribute("data-cache", "cold");
    // Known warmth is i2 (warm) and i1 (cold); n1 is unknown, the working and ended ones are not in the set.
    await expect(timer).toHaveAttribute("title", "1 of 2 warm · next cold in 30m");
    await expectUnderline(timer, false);
    const i1Timer = cardTimer(railCard(page, "head-i1"));
    await expect
      .poll(async () => (await timerText(timer)) === (await timerText(i1Timer)))
      .toBe(true);
    const grey = await tokenRgb(page, "--fg-dim");
    expect(colourDistance(await timerRgb(page, timer), grey)).toBeLessThanOrEqual(1);

    // A collapsed section keeps its timer.
    await groupCaret(head).click();
    await expect(head).toHaveClass(/collapsed/);
    await expect(headerTimer(head)).toHaveCount(1);

    // No waiting member: no extra timer, expanded or collapsed.
    const lonelyHead = groupHead(page, lonely.id);
    await expect(headerTimer(lonelyHead)).toHaveCount(0);
    await updateGroupViaApi(page, daemon, lonely.id, { collapsed: true });
    await expect(lonelyHead).toHaveClass(/collapsed/);
    await expect(headerTimer(lonelyHead)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a header's hover reads every warm, all cold or unknown by the known warmth of its waiting members, and the timer is tinted as the card's is (REQ-30)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "hover-unk",
    "hover-cld-a",
    "hover-cld-b",
    "hover-wrm-a",
    "hover-wrm-b",
  ]);
  try {
    const [unk, cldA, cldB, wrmA, wrmB] = sessions;
    if (!unk || !cldA || !cldB || !wrmA || !wrmB) throw new Error("expected 5 sessions");
    const unknown = await createGroupViaApi(page, daemon, "unknown", [unk.id]);
    const cold = await createGroupViaApi(page, daemon, "cold", [cldA.id, cldB.id]);
    const warm = await createGroupViaApi(page, daemon, "warm", [wrmA.id, wrmB.id]);
    await driveToState(request, daemon, unk, "claude-hover-unk", "idle");
    await driveToState(request, daemon, cldA, "claude-hover-cld-a", "idle");
    await driveToState(request, daemon, cldB, "claude-hover-cld-b", "needs_input");
    await driveToState(request, daemon, wrmA, "claude-hover-wrm-a", "idle");
    // Distinct stateSince seconds: wrmB entered its state last, so its timer stands for the group.
    await waitForNextClockSecond();
    await driveToState(request, daemon, wrmB, "claude-hover-wrm-b", "failed");
    await postStatus(request, daemon, cldA, "claude-hover-cld-a", WARM_1H(-30));
    await postStatus(request, daemon, cldB, "claude-hover-cld-b", WARM_1H(-90));
    await postStatus(request, daemon, wrmA, "claude-hover-wrm-a", WARM_1H(1800));
    await postStatus(request, daemon, wrmB, "claude-hover-wrm-b", WARM_1H(3000));

    // Only unknown warmth: the plain timer says so.
    const unknownTimer = headerTimer(groupHead(page, unknown.id));
    await expect(unknownTimer).toHaveAttribute("data-cache", "unknown");
    await expect(unknownTimer).toHaveAttribute("title", "cache unknown");
    // Every known one cold.
    const coldTimer = headerTimer(groupHead(page, cold.id));
    await expect(coldTimer).toHaveAttribute("data-cache", "cold");
    await expect(coldTimer).toHaveAttribute("title", "all 2 cold");
    // Both warm: the soonest expiry names when the next goes cold.
    const warmTimer = headerTimer(groupHead(page, warm.id));
    await expect(warmTimer).toHaveAttribute("title", "2 of 2 warm · next cold in 30m");
    await expect(warmTimer).toHaveAttribute("data-cache", "warm");
    await expectTimerFade(page, warmTimer, 3000 / 3600);

    // The clock moves, the header follows: 2500 s on, the 1800 s cache is cold and the picked
    // member's 3000 s one has 500 s left, 13.9% of its lifetime.
    await useWarmthClock(page, 2500);
    await expect(warmTimer).toHaveAttribute("title", "1 of 2 warm · next cold in 9m");
    await expect(warmTimer).toHaveAttribute("data-cache", "cooling");
    await expectUnderline(warmTimer, true);
  } finally {
    await cleanup();
  }
});

test("the header popover shows a state timer beside every session's title, carrying its warmth and the underline where it is known and no hover text of its own (REQ-31, E19)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "pop-warm",
    "pop-cooling",
    "pop-working",
    "pop-started",
  ]);
  try {
    const [warm, cooling, working, started] = sessions;
    if (!warm || !cooling || !working || !started) throw new Error("expected 4 sessions");
    const group = await createGroupViaApi(
      page,
      daemon,
      "Popover",
      sessions.map((s) => s.id),
    );
    await driveToState(request, daemon, warm, "claude-pop-warm", "idle");
    await driveToState(request, daemon, cooling, "claude-pop-cooling", "idle");
    await driveToState(request, daemon, working, "claude-pop-working", "working");
    await postStatus(request, daemon, warm, "claude-pop-warm", WARM_1H(1800));
    await postStatus(request, daemon, cooling, "claude-pop-cooling", WARM_1H(300));
    await expect(cardTimer(railCard(page, "pop-warm"))).toHaveAttribute("data-cache", "warm");
    await expect(cardTimer(railCard(page, "pop-cooling"))).toHaveAttribute("data-cache", "cooling");

    await page.mouse.move(0, 0);
    await groupHead(page, group.id).hover();
    const tip = popover(page);
    await expect(tip).toBeVisible();
    const rowTimer = (title: string) =>
      tip.locator(".pl").filter({ hasText: title }).locator("[data-cache]");

    await expect(rowTimer("pop-warm")).toHaveAttribute("data-cache", "warm");
    await expect(rowTimer("pop-cooling")).toHaveAttribute("data-cache", "cooling");
    await expect(rowTimer("pop-working")).toHaveAttribute("data-cache", "unknown");
    await expect(rowTimer("pop-started")).toHaveAttribute("data-cache", "unknown");
    // Tinted and underlined as on the card; the popover timer has no title of its own.
    await expectTimerFade(page, rowTimer("pop-warm"), 0.5);
    await expectUnderline(rowTimer("pop-warm"), false);
    await expectUnderline(rowTimer("pop-cooling"), true);
    await expectUnderline(rowTimer("pop-started"), false);
    for (const title of ["pop-warm", "pop-cooling", "pop-working", "pop-started"]) {
      await expect(rowTimer(title)).not.toHaveAttribute("title", /.+/);
    }
    // It is the member's own state timer: the same text as on its card, read on both sides.
    await expect
      .poll(
        async () =>
          (await timerText(rowTimer("pop-warm"))) ===
          (await timerText(cardTimer(railCard(page, "pop-warm")))),
      )
      .toBe(true);
  } finally {
    await cleanup();
  }
});
