import {
  cardTimer,
  cardTip,
  expectTimerFade,
  expectUnderline,
  expiresIn,
  postStatus,
  trackUpserts,
  useWarmthClock,
  wireCache,
  wireInstant,
} from "./helpers/cache-warmth";
import { expect, settleFor, test } from "./helpers/fixtures";
import { driveToState, launchTitled } from "./helpers/groups";
import {
  envelopedSessionStart,
  rawPreCompact,
  rawSessionEnd,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import { railCard, railOrderIds } from "./helpers/railorder";
import { envelopeOpts } from "./helpers/session";

// Prompt-cache warmth (#84), the journeys: what the daemon keeps and
// clears (/clear, Stop and Resume, liveness death, compaction, a restart), what it broadcasts, and
// what the display does while the daemon is down or a card above the hovered timer changes height.
// The display properties — the tint, underline and hover for a given cache as the page
// clock advances, every state's timer, the strip card, the group header's extra timer and
// the popover's row timers — are render tests in web/render/usage.spec.ts
// (re-levelled 2026-10-20, plans/_audit/relevel/usage.md).
//
// Daemon shape: every test takes the per-test `daemon` fixture —
// the restart criterion restarts the daemon, and the daemon-down one kills it.
//
// Time: the dashboard reads `expiresAt` against its own clock, so each test fixes the page's clock
// at a known instant (`useWarmthClock`, helpers/cache-warmth.ts) and posts caches that expire a
// computed number of seconds after it; moving the clock is one `setFixedTime` that the 1 s render
// tick picks up with no message arriving. Remaining times are therefore exact, boundaries included.
// The hover text uses the plan's middle dot ("·").

const WARM_1H = (remaining: number) => ({ expiresAt: expiresIn(remaining), ttl: "1h" });

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
    await expect(freshTimer).toHaveAttribute("aria-description", "cache unknown");
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
    await expect(warmTimer).toHaveAttribute("aria-description", "cache unknown");
    await expect.poll(() => wireCache(page, daemon, warm.id)).toBeNull();
    // The bystander never had one and still has none.
    expect(await wireCache(page, daemon, fresh.id)).toBeNull();

    // The new conversation's first reply refills it.
    await postStatus(request, daemon, warm, "claude-clear-warm-2", WARM_1H(1500));
    await expect(warmTimer).toHaveAttribute("data-cache", "warm");
    await expect(warmTimer).toHaveAttribute("aria-description", "cache warm · cold in 25m");
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
    await expect(stopTimer).toHaveAttribute("aria-description", "cache warm · cold in 50m");
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
    await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 40m");

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
    await daemon.restart();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
    await expect.poll(() => wireCache(page, daemon, warm.id)).toEqual(held);
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 40m");
    await expectTimerFade(page, timer, 2400 / 3600);
    expect(await wireCache(page, daemon, plain.id)).toBeNull();

    await page.reload();
    await useWarmthClock(page);
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 40m");
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
    await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 8m");
    await expectUnderline(timer, true);
    await expectTimerFade(page, timer, 480 / 3600);

    await useWarmthClock(page, 3600);
    await expect(timer).toHaveAttribute("data-cache", "cold");
    await expect(timer).toHaveAttribute("aria-description", "cache cold");
    await expectUnderline(timer, false);
  } finally {
    await cleanup();
  }
});

test("a card timer's cache hover opens within the popover delay and stays open, counting down, while a card above it changes height (REQ-1, REQ-2, REQ-3)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["hover-above", "hover-below"]);
  try {
    const [above, below] = sessions;
    if (!above || !below) throw new Error("expected 2 sessions");
    await driveToState(request, daemon, above, "claude-hover-above", "working");
    await driveToState(request, daemon, below, "claude-hover-below", "idle");
    await postStatus(request, daemon, below, "claude-hover-below", WARM_1H(3600));
    const timer = cardTimer(railCard(page, "hover-below"));
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect.poll(() => railOrderIds(page)).toEqual([above.id, below.id]);

    const tip = cardTip(page);
    await expect(tip).toHaveCount(0);
    await timer.hover();
    // Shortened from the config's 15 s on purpose: the plan's claim is that the panel is there
    // within a second of the pointer entering (it opens POPOVER_DELAY_MS, 350 ms, after).
    await expect(tip).toBeVisible({ timeout: 1000 });
    await expect(tip).toHaveText("cache warm · cold in 60m");

    // The pointer stays still while the upper card's activity line is rewritten with prompts of
    // different lengths, which changes its height and slides the lower card.
    const startBox = await timer.boundingBox();
    if (!startBox) throw new Error("the lower card's timer has no box");
    const longPrompt = "keep the hover readable while this card grows ".repeat(8);
    let n = 0;
    await expect
      .poll(
        async () => {
          n += 1;
          await request.post(daemon.ingestURL("hook"), {
            data: rawUserPromptSubmit("claude-hover-above", {
              promptId: `hover-p${n}`,
              prompt: n % 2 === 1 ? longPrompt : "short",
            }),
          });
          const box = await timer.boundingBox();
          return box ? Math.abs(box.y - startBox.y) : 0;
        },
        { message: "the lower card's timer moved under the still pointer" },
      )
      .toBeGreaterThan(8);

    await expect(tip).toBeVisible();
    await expect(tip).toHaveText("cache warm · cold in 60m");
    // Re-reading both boxes on every retry: the panel sits just under the timer where it is now.
    await expect
      .poll(async () => {
        const timerBox = await timer.boundingBox();
        const tipBox = await tip.boundingBox();
        if (!timerBox || !tipBox) return Number.NaN;
        return tipBox.y - (timerBox.y + timerBox.height);
      })
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const timerBox = await timer.boundingBox();
        const tipBox = await tip.boundingBox();
        if (!timerBox || !tipBox) return Number.NaN;
        return tipBox.y - (timerBox.y + timerBox.height);
      })
      .toBeLessThanOrEqual(5);

    // Fifty minutes on, no message sent: the open panel counts down.
    await useWarmthClock(page, 50 * 60);
    await expect(tip).toHaveText("cache warm · cold in 10m");
    await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 10m");

    // Off the card: gone.
    await page.mouse.move(1, 1);
    await expect(tip).toBeHidden();
  } finally {
    await cleanup();
  }
});

test("a cache panel opened while the daemon is down stays open, counting down, across reconnect attempts while the pointer stays on the card (REQ-2)", async ({
  page,
  request,
  daemon,
}) => {
  await useWarmthClock(page);
  // Each reconnect attempt opens a fresh `/ws` socket, even when it fails: count them.
  let attempts = 0;
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname === "/ws") attempts += 1;
  });
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["hover-down"]);
  try {
    const [s] = sessions;
    if (!s) throw new Error("expected 1 session");
    await driveToState(request, daemon, s, "claude-hover-down", "idle");
    await postStatus(request, daemon, s, "claude-hover-down", WARM_1H(3600));
    const timer = cardTimer(railCard(page, "hover-down"));
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await page.mouse.move(0, 0);

    await daemon.kill();
    await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();

    const tip = cardTip(page);
    await timer.hover();
    await expect(tip).toBeVisible({ timeout: 2000 });
    await expect(tip).toHaveText("cache warm · cold in 60m");

    // At least two more attempts, the pointer not moving; the panel must be there at every look.
    const before = attempts;
    let vanished = false;
    await expect
      .poll(
        async () => {
          if ((await tip.count()) === 0) vanished = true;
          return attempts - before;
        },
        {
          message: "reconnect attempts while the pointer rests on the card timer",
          intervals: [100],
        },
      )
      .toBeGreaterThanOrEqual(2);
    expect(vanished, "the panel closed during a reconnect attempt").toBe(false);
    await expect(tip).toBeVisible();

    await useWarmthClock(page, 50 * 60);
    await expect(tip).toHaveText("cache warm · cold in 10m");
  } finally {
    await cleanup();
  }
});
