// usage — the display properties of plan rail-card-organise's prompt-cache warmth (#84:
// the card timer's tint, underline and hover panel, the group header's extra timer and the
// popover's row timers, REQ-1 to REQ-3 and REQ-24 to REQ-31), plan m3-gauges (the context
// gauge and the masthead bars, E1/E3/E4/E5/E12), plan masthead-indicators (the bracketed
// reset suffix, its hover and the dot-sized status, REQ-4/REQ-7/REQ-12), the masthead's
// width tiers (ADR usage-masthead-narrow-width-shrinks-bars, #52) and plan usage-model-bar's
// select (E2 and its two review regressions), re-levelled on 2026-10-20 from
// web/e2e/{cache-warmth,gauges,masthead-indicators,masthead-layout,usage-model}.spec.ts
// (plans/_audit/relevel/usage.md). Nothing here changes state: every cache, bucket, model
// window and view comes from the `cache-warmth-*`, `usage-*` scenarios' prefs and sessions.
//
// Time: the dashboard reads a cache's `expiresAt` and a bucket's `resetsAt` against the page
// clock. A fixture's instants are the epoch plus whole minutes (the normaliser's walk order,
// see internal/server/renderfix_scenarios_usage.go), so a test reads the remaining lifetime
// off the fixture (`remainingAtEpoch`) and pins the clock (`pinClock`) at the exact instants
// the plan's boundaries name — 585 s left, 60 s left, past expiry — or a day away from the
// resets for the other-day suffix. Hover text uses the plan's middle dot ("·").
import { railCardByTitle } from "./helpers/card-location";
import { groupCaret, groupHead, popover } from "./helpers/groups";
import {
  type Dashboard,
  expect,
  type Locator,
  loadFixture,
  type Page,
  type RenderFixture,
  settleFor,
  test,
} from "./helpers/harness";
import { liveTile, liveTileById, stripCard } from "./helpers/tiles";
import {
  cacheOf,
  cardContextHot,
  cardContextRow,
  cardContextTrack,
  cardTimer,
  cardTip,
  clockText,
  colourDistance,
  connectionStatus,
  EPOCH_MS,
  expectedResetsText,
  expectTimerFade,
  expectUnderline,
  groupNamed,
  headerTimer,
  knownBucket,
  mastheadBucket,
  mastheadBucketResets,
  mastheadBucketTrack,
  mastheadBucketWarn,
  mastheadModelSelect,
  mastheadModelWeek,
  mastheadModelWeekPercent,
  mastheadModelWeekResets,
  mastheadModelWeekTrack,
  pinClock,
  railCardExact,
  remainingAtEpoch,
  removedModelReadout,
  RESETS_OTHER_DAY,
  RESETS_SAME_DAY,
  sessionTitled,
  shortWeekday,
  tileContextInfo,
  tileContextTrack,
  timerRgb,
  timerText,
  TITLE_CONNECTED,
  tokenRgb,
  warmHover,
} from "./helpers/usage";

const DAY_S = 86_400;

/** A one-hour cache cools from nine minutes out (15% of 3600 s); a card the plan calls
 * warm at load must have more than that left. */
const COOLING_1H_S = 540;

/** A fixture session's rail card timer with the remaining lifetime the page clock starts
 * at, checked warm for a scenario that promised it so. */
function warmCard(
  page: Page,
  fixture: RenderFixture,
  title: string,
  ttlSeconds: number,
): { timer: Locator; remaining: number } {
  const cache = cacheOf(sessionTitled(fixture, title));
  expect(cache.ttlSeconds, `${title}'s lifetime`).toBe(ttlSeconds);
  const remaining = remainingAtEpoch(cache);
  expect(remaining, `${title} must be warm at load`).toBeGreaterThan(ttlSeconds * 0.15);
  return { timer: cardTimer(railCardExact(page, title)), remaining };
}

// --- prompt-cache warmth: the card timer (plan rail-card-organise E14, REQ-24 to REQ-28) ---

test("an idle session's timer is tinted and hovers as warm, turns cooling with a dotted underline in the last 15% of its lifetime and plain cold past expiry as the page clock advances with no new post (REQ-24, REQ-25, REQ-27, REQ-28, E14)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  await pinClock(page);
  const { timer, remaining } = warmCard(page, fixture, "bound-hour", 3600);

  await expect(timer).toHaveAttribute("aria-label", "time in state");
  await expect(timer).toHaveAttribute("data-cache", "warm");
  await expect(timer).toHaveAttribute("aria-description", warmHover(remaining));
  await expect(timer).not.toHaveAttribute("title");
  await expectTimerFade(page, timer, remaining / 3600);
  await expectUnderline(timer, false);

  // Later, no message sent: 480 s of 3600 s remain, 13.3%, inside the last 15%.
  await pinClock(page, remaining - 480);
  await expect(timer).toHaveAttribute("data-cache", "cooling");
  await expect(timer).toHaveAttribute("aria-description", "cache warm · cold in 8m");
  await expectTimerFade(page, timer, 480 / 3600);
  await expectUnderline(timer, true);

  // A minute past expiry: plain grey, no underline, the cold wording.
  await pinClock(page, remaining + 60);
  await expect(timer).toHaveAttribute("data-cache", "cold");
  await expect(timer).toHaveAttribute("aria-description", "cache cold");
  await expectTimerFade(page, timer, 0, 1);
  await expectUnderline(timer, false);
});

test("the tint is a straight line from the bright foreground to the timer's usual grey over the lifetime, and an unknown or cold timer is that usual grey (REQ-24, REQ-26, REQ-28)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  await pinClock(page);
  const { timer: warm, remaining } = warmCard(page, fixture, "known-idle", 3600);
  const unknown = cardTimer(railCardExact(page, "unknown-idle"));
  const cold = cardTimer(railCardExact(page, "fade-cold"));
  expect(sessionTitled(fixture, "unknown-idle").cache).toBeNull();
  expect(remainingAtEpoch(cacheOf(sessionTitled(fixture, "fade-cold")))).toBeLessThanOrEqual(0);

  await expect(warm).toHaveAttribute("data-cache", "warm");
  await expect(unknown).toHaveAttribute("data-cache", "unknown");
  await expect(unknown).toHaveAttribute("aria-description", "cache unknown");
  await expect(cold).toHaveAttribute("data-cache", "cold");
  await expect(cold).toHaveAttribute("aria-description", "cache cold");

  // Today's plain timer is --fg-dim; unknown and cold both are exactly that, with no underline.
  const grey = await tokenRgb(page, "--fg-dim");
  expect(colourDistance(await timerRgb(page, unknown), grey)).toBeLessThanOrEqual(1);
  expect(colourDistance(await timerRgb(page, cold), grey)).toBeLessThanOrEqual(1);
  await expectUnderline(unknown, false);
  await expectUnderline(cold, false);

  // Three points on the line: the fixture's remaining fraction, then half and a quarter of it.
  await expectTimerFade(page, warm, remaining / 3600);
  await pinClock(page, remaining / 2);
  await expect(warm).toHaveAttribute("aria-description", warmHover(remaining / 2));
  await expectTimerFade(page, warm, remaining / 2 / 3600);
  await pinClock(page, (remaining * 3) / 4);
  await expect(warm).toHaveAttribute("aria-description", warmHover(remaining / 4));
  await expectTimerFade(page, warm, remaining / 4 / 3600);
  // The unknown card never moved with the clock.
  expect(colourDistance(await timerRgb(page, unknown), grey)).toBeLessThanOrEqual(1);
});

test("the underline starts at exactly 15% of the lifetime remaining, a 5m-ttl post carrying requests (a 3900 s lifetime) at 585 s, and the hover counts whole minutes up while a minute or more remains and seconds below it (REQ-25, REQ-27)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  await pinClock(page);
  // A 5m ttl post that carries `requests` is a keep-alive-regime post: the daemon predicts the
  // lifetime as ttl + 1 h, so the fixture holds 3900 s, not 300.
  const { timer: shortTimer, remaining: shortLeft } = warmCard(page, fixture, "bound-short", 3900);
  const { timer: hourTimer, remaining: hourLeft } = warmCard(page, fixture, "bound-hour", 3600);
  expect(shortLeft, "the boundary below needs 586 s to be still ahead").toBeGreaterThan(586);
  await expect(shortTimer).toHaveAttribute("aria-description", warmHover(shortLeft));

  // 586 s left of 3900: above 15% (585 s), so warm and plain; whole minutes while a minute or more remains.
  await pinClock(page, shortLeft - 586);
  await expect(shortTimer).toHaveAttribute("data-cache", "warm");
  await expect(shortTimer).toHaveAttribute("aria-description", "cache warm · cold in 10m");
  await expectUnderline(shortTimer, false);
  // 585 s left: exactly 15%, so cooling and underlined.
  await pinClock(page, shortLeft - 585);
  await expect(shortTimer).toHaveAttribute("data-cache", "cooling");
  await expect(shortTimer).toHaveAttribute("aria-description", "cache warm · cold in 10m");
  await expectUnderline(shortTimer, true);
  // Minute boundary on the predicted lifetime: 60 s reads 1m, 59 s reads 59s.
  await pinClock(page, shortLeft - 60);
  await expect(shortTimer).toHaveAttribute("aria-description", "cache warm · cold in 1m");
  await pinClock(page, shortLeft - 59);
  await expect(shortTimer).toHaveAttribute("data-cache", "cooling");
  await expect(shortTimer).toHaveAttribute("aria-description", "cache warm · cold in 59s");
  await pinClock(page, shortLeft - 1);
  await expect(shortTimer).toHaveAttribute("data-cache", "cooling");
  await expect(shortTimer).toHaveAttribute("aria-description", "cache warm · cold in 1s");
  // Nothing left: cold.
  await pinClock(page, shortLeft);
  await expect(shortTimer).toHaveAttribute("data-cache", "cold");
  await expect(shortTimer).toHaveAttribute("aria-description", "cache cold");
  await expectUnderline(shortTimer, false);

  // The hour-long cache around the minute boundary: 61 s left reads 2m, 60 s 1m, 59 s 59s.
  await pinClock(page, hourLeft - 61);
  await expect(hourTimer).toHaveAttribute("aria-description", "cache warm · cold in 2m");
  await pinClock(page, hourLeft - 60);
  await expect(hourTimer).toHaveAttribute("aria-description", "cache warm · cold in 1m");
  await pinClock(page, hourLeft - 59);
  await expect(hourTimer).toHaveAttribute("aria-description", "cache warm · cold in 59s");
  await expect(hourTimer).toHaveAttribute("data-cache", "cooling");
  await pinClock(page, hourLeft);
  await expect(hourTimer).toHaveAttribute("data-cache", "cold");
  await expect(hourTimer).toHaveAttribute("aria-description", "cache cold");
});

test("every state shows an unknown plain timer before a first reply and a tinted one once the cache is known, an ended card included (INV-2, REQ-24, REQ-26, E17)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  await pinClock(page);
  const states = ["started", "planning", "working", "needs", "failed", "idle", "ended"] as const;
  await expect(railCardExact(page, "unknown-planning")).toContainText(/planning/i);
  await expect(railCardExact(page, "known-planning")).toContainText(/planning/i);

  // Before any reply: unknown on every card, in every state.
  for (const state of states) {
    expect(sessionTitled(fixture, `unknown-${state}`).cache).toBeNull();
    const timer = cardTimer(railCardExact(page, `unknown-${state}`));
    await expect(timer).toHaveAttribute("data-cache", "unknown");
    await expect(timer).toHaveAttribute("aria-description", "cache unknown");
  }

  // Once the cache is known: warm on every card, in every state.
  for (const state of states) {
    const { timer, remaining } = warmCard(page, fixture, `known-${state}`, 3600);
    await expect(timer).toHaveAttribute("data-cache", "warm");
    await expect(timer).toHaveAttribute("aria-description", warmHover(remaining));
  }
  // E17: a working session's timer is tinted, part way along the ramp.
  const working = warmCard(page, fixture, "known-working", 3600);
  await expectTimerFade(page, working.timer, working.remaining / 3600);

  // Ended: the ended card keeps its tinted timer; one that never had a cache stays plain.
  const ended = warmCard(page, fixture, "known-ended", 3600);
  await expect(railCardExact(page, "known-ended")).toHaveClass(/ended/);
  await expect(railCardExact(page, "unknown-ended")).toHaveClass(/ended/);
  await expect(ended.timer).toHaveAttribute("data-cache", "warm");
  await expect(ended.timer).toHaveAttribute("aria-description", warmHover(ended.remaining));
  expect(await timerText(ended.timer)).toMatch(/^ended /);
  await expectTimerFade(page, ended.timer, ended.remaining / 3600);
  const unknownTimer = cardTimer(railCardExact(page, "unknown-ended"));
  await expect(unknownTimer).toHaveAttribute("data-cache", "unknown");
  await expect(unknownTimer).toHaveAttribute("aria-description", "cache unknown");
});

/** The one strip card of a five-session 2×2 Tiles fixture, with its remaining lifetime. */
async function strippedWarmCard(
  page: Page,
  fixture: RenderFixture,
): Promise<{ timer: Locator; remaining: number }> {
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article.tile")).toHaveCount(4);
  await expect(page.locator("#tiles-strip").getByTestId("session-card")).toHaveCount(1);
  const titles = fixture.snapshot.sessions.map((s) => s.title ?? "");
  const stripped: string[] = [];
  for (const title of titles) {
    if ((await liveTile(page, title).count()) === 0) stripped.push(title);
  }
  expect(stripped).toHaveLength(1);
  const title = stripped[0] ?? "";
  const cache = cacheOf(sessionTitled(fixture, title));
  const remaining = remainingAtEpoch(cache);
  expect(remaining, `${title} must be warm at load`).toBeGreaterThan(COOLING_1H_S);
  return { timer: cardTimer(stripCard(page, title)), remaining };
}

test("a Tiles strip card's timer carries the same warmth as its rail card (REQ-24)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth-strip");
  await pinClock(page);
  const { timer, remaining } = await strippedWarmCard(page, fixture);
  await expect(timer).toHaveAttribute("data-cache", "warm");
  await expect(timer).toHaveAttribute("aria-description", warmHover(remaining));
  await expectTimerFade(page, timer, remaining / 3600);

  await pinClock(page, remaining + 3500);
  await expect(timer).toHaveAttribute("data-cache", "cold");
  await expect(timer).toHaveAttribute("aria-description", "cache cold");
});

// --- the cache hover panel (plan rail-card-organise REQ-1 to REQ-3) ---

test("a pointer that leaves a card timer inside the popover delay opens no panel, even though it stays on the card (REQ-1, edge case 1)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  const card = railCardExact(page, "bound-hour");
  const { timer } = warmCard(page, fixture, "bound-hour", 3600);
  await expect(timer).toHaveAttribute("data-cache", "warm");
  // The card is the rail's last of seventeen: a hover would scroll to it, raw pointer
  // moves do not.
  await card.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);

  const timerBox = await timer.boundingBox();
  const cardBox = await card.boundingBox();
  if (!timerBox || !cardBox) throw new Error("the card or its timer has no box");
  // Onto the timer, then straight to the card's top-left corner: still on the card (so the card's
  // own mouseleave close cannot be what cancels the open), but off the timer, well inside 350 ms.
  await page.mouse.move(timerBox.x + timerBox.width / 2, timerBox.y + timerBox.height / 2);
  await page.mouse.move(cardBox.x + 2, cardBox.y + 2);
  expect(
    await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest(".timer") !== null,
      [cardBox.x + 2, cardBox.y + 2],
    ),
  ).toBe(false);

  // Past the 350 ms delay, with the pointer still on the card: no panel ever opens.
  await settleFor(page, 900);
  await expect(cardTip(page)).toHaveCount(0);
});

test("pressing on the card closes the open cache panel and it stays closed with the pointer still on the timer (REQ-2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth");
  await pinClock(page);
  const { timer, remaining } = warmCard(page, fixture, "bound-hour", 3600);
  await expect(timer).toHaveAttribute("data-cache", "warm");
  await page.mouse.move(0, 0);

  const tip = cardTip(page);
  await timer.hover();
  // Shortened from the config's 15 s on purpose: the plan's claim is that the panel is there
  // within a second of the pointer entering (it opens POPOVER_DELAY_MS, 350 ms, after).
  await expect(tip).toBeVisible({ timeout: 1000 });
  await expect(tip).toHaveText(warmHover(remaining));

  await page.mouse.down();
  try {
    await expect(tip).toHaveCount(0);
  } finally {
    await page.mouse.up();
  }
  // The pointer never left the timer, so nothing reopens it.
  await settleFor(page, 900);
  await expect(tip).toHaveCount(0);
});

test("a Tiles strip card's timer opens the same cache panel on hover and closes it when the pointer leaves the card (REQ-1)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth-strip");
  await pinClock(page);
  const { timer, remaining } = await strippedWarmCard(page, fixture);
  await expect(timer).toHaveAttribute("data-cache", "warm");
  await page.mouse.move(0, 0);

  const tip = cardTip(page);
  await expect(tip).toHaveCount(0);
  await timer.hover();
  await expect(tip).toBeVisible({ timeout: 1000 });
  await expect(tip).toHaveText(warmHover(remaining));

  // The open panel counts down with the page clock, as the rail's does.
  await pinClock(page, 120);
  await expect(tip).toHaveText(warmHover(remaining - 120));

  await page.mouse.move(1, 1);
  await expect(tip).toHaveCount(0);
});

// --- the group header's extra timer and the popover's row timers (REQ-29 to REQ-31, E18, E19) ---

/** `<warm> of <known> warm · next cold in …` for a header, from its waiting members' caches
 * `secondsOn` after the epoch — the plan's hover wording (REQ-30). */
function headerHover(remaining: number[], secondsOn = 0): string {
  const left = remaining.map((r) => r - secondsOn);
  const warm = left.filter((r) => r > 0);
  if (warm.length === 0) return `all ${left.length} cold`;
  return `${warm.length} of ${left.length} warm · ${warmHover(Math.min(...warm)).replace("cache warm · ", "next ")}`;
}

test("a group header shows one extra timer for the waiting member that entered its state last, hovering over the warm ones, and none for a section with no waiting member, collapsed or expanded (REQ-29, REQ-30, E18)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth-groups");
  await pinClock(page);
  const alpha = groupNamed(fixture, "alpha");
  const lonely = groupNamed(fixture, "lonely");
  // i1 entered idle last among the waiting members (n1, i2, i1): its (cold) timer stands for
  // the group. Known warmth is i2 (warm) and i1 (cold); n1 is unknown, the working and ended
  // ones are not in the set.
  const i1 = sessionTitled(fixture, "head-i1");
  const i2 = sessionTitled(fixture, "head-i2");
  const n1 = sessionTitled(fixture, "head-n1");
  expect(n1.cache).toBeNull();
  const i1Left = remainingAtEpoch(cacheOf(i1));
  const i2Left = remainingAtEpoch(cacheOf(i2));
  expect(i1Left).toBeLessThanOrEqual(0);
  expect(i2Left).toBeGreaterThan(0);
  for (const other of [i2, n1]) {
    expect(Date.parse(i1.stateSince)).toBeGreaterThan(Date.parse(other.stateSince));
  }

  const head = groupHead(page, alpha.id);
  const timer = headerTimer(head);
  await expect(timer).toHaveCount(1);
  await expect(timer).toHaveAttribute("data-cache", "cold");
  await expect(timer).toHaveAttribute("title", headerHover([i2Left, i1Left]));
  await expectUnderline(timer, false);
  const i1Timer = cardTimer(railCardByTitle(page, "head-i1"));
  await expect.poll(async () => (await timerText(timer)) === (await timerText(i1Timer))).toBe(true);
  const grey = await tokenRgb(page, "--fg-dim");
  expect(colourDistance(await timerRgb(page, timer), grey)).toBeLessThanOrEqual(1);

  // No waiting member: no extra timer.
  const lonelyHead = groupHead(page, lonely.id);
  await expect(headerTimer(lonelyHead)).toHaveCount(0);

  // Collapsed sections — the same groups, folded through the real PUT in the sibling
  // fixture: the one keeps its timer, the other still has none.
  const collapsed = await loadFixture("cache-warmth-groups-collapsed");
  expect(groupNamed(collapsed, "alpha").id).toBe(alpha.id);
  expect(groupNamed(collapsed, "lonely").id).toBe(lonely.id);
  dashboard.send(collapsed.snapshot);
  await expect(head).toHaveClass(/collapsed/);
  await expect(groupCaret(head)).toHaveAccessibleName(/^Expand /);
  await expect(headerTimer(head)).toHaveCount(1);
  await expect(headerTimer(head)).toHaveAttribute("data-cache", "cold");
  await expect(lonelyHead).toHaveClass(/collapsed/);
  await expect(headerTimer(lonelyHead)).toHaveCount(0);
});

test("a header's hover reads every warm, all cold or unknown by the known warmth of its waiting members, and the timer is tinted as the card's is (REQ-30)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth-hover");
  await pinClock(page);
  const unknown = groupNamed(fixture, "unknown");
  const cold = groupNamed(fixture, "cold");
  const warm = groupNamed(fixture, "warm");
  const wrmA = sessionTitled(fixture, "hover-wrm-a");
  const wrmB = sessionTitled(fixture, "hover-wrm-b");
  const aLeft = remainingAtEpoch(cacheOf(wrmA));
  const bLeft = remainingAtEpoch(cacheOf(wrmB));
  // wrmB entered its state last, so its timer stands for the group; both are warm at load,
  // and once wrmA's lifetime is out, wrmB's is inside its last 15%.
  expect(Date.parse(wrmB.stateSince)).toBeGreaterThan(Date.parse(wrmA.stateSince));
  expect(aLeft).toBeGreaterThan(COOLING_1H_S);
  expect(bLeft).toBeGreaterThan(COOLING_1H_S);
  expect(bLeft - aLeft).toBeGreaterThan(0);
  expect(bLeft - aLeft).toBeLessThanOrEqual(COOLING_1H_S);
  for (const title of ["hover-cld-a", "hover-cld-b"]) {
    expect(remainingAtEpoch(cacheOf(sessionTitled(fixture, title)))).toBeLessThanOrEqual(0);
  }

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
  await expect(warmTimer).toHaveAttribute("title", headerHover([aLeft, bLeft]));
  await expect(warmTimer).toHaveAttribute("data-cache", "warm");
  await expectTimerFade(page, warmTimer, bLeft / 3600);

  // The clock moves, the header follows: wrmA's cache is cold and the picked member's has
  // what is left of its last 15%.
  await pinClock(page, aLeft);
  await expect(warmTimer).toHaveAttribute("title", headerHover([aLeft, bLeft], aLeft));
  await expect(warmTimer).toHaveAttribute("data-cache", "cooling");
  await expectUnderline(warmTimer, true);
});

test("the header popover shows a state timer beside every session's title, carrying its warmth and the underline where it is known and no hover text of its own (REQ-31, E19)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("cache-warmth-hover");
  await pinClock(page);
  const group = groupNamed(fixture, "Popover");
  const { remaining: warmLeft } = warmCard(page, fixture, "pop-warm", 3600);
  const cooling = cacheOf(sessionTitled(fixture, "pop-cooling"));
  expect(remainingAtEpoch(cooling)).toBeGreaterThan(0);
  expect(remainingAtEpoch(cooling)).toBeLessThanOrEqual(cooling.ttlSeconds * 0.15);
  await expect(cardTimer(railCardByTitle(page, "pop-warm"))).toHaveAttribute("data-cache", "warm");
  await expect(cardTimer(railCardByTitle(page, "pop-cooling"))).toHaveAttribute(
    "data-cache",
    "cooling",
  );

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
  await expectTimerFade(page, rowTimer("pop-warm"), warmLeft / 3600);
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
        (await timerText(cardTimer(railCardByTitle(page, "pop-warm")))),
    )
    .toBe(true);
});

// --- the context gauge and the masthead bars (plan m3-gauges) ---

/** The one session of a single-session fixture. */
function onlySession(fixture: RenderFixture): RenderFixture["snapshot"]["sessions"][number] {
  const [session] = fixture.snapshot.sessions;
  expect(fixture.snapshot.sessions).toHaveLength(1);
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

/** The context row's texts for a known context: the rounded percent and compact tokens. */
function contextTexts(session: RenderFixture["snapshot"]["sessions"][number]): {
  percent: string;
  tokens: string;
} {
  const { usedPct, totalInputTokens } = session.context;
  if (usedPct === null || totalInputTokens === null) {
    throw new Error(`fixture session ${session.id} has no known context`);
  }
  return { percent: `${Math.round(usedPct)}%`, tokens: `${Math.round(totalInputTokens / 1000)}k` };
}

test("a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("unbound-sessions");
  expect(fixture.snapshot.usage.fiveHour).toBeNull();
  expect(fixture.snapshot.usage.sevenDay).toBeNull();
  const card = railCardByTitle(page, "marker-a");

  await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
  await expect(cardContextTrack(card)).toHaveCount(0);

  await expect(mastheadBucket(page, "5h")).toContainText("5h");
  await expect(mastheadBucket(page, "5h")).toContainText(/unknown/i);
  await expect(mastheadBucket(page, "7d")).toContainText("7d");
  await expect(mastheadBucket(page, "7d")).toContainText(/unknown/i);
  await expect(mastheadBucketTrack(page, "5h")).toHaveCount(0);
  await expect(mastheadBucketTrack(page, "7d")).toHaveCount(0);
});

test("a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known");
  const { percent, tokens } = contextTexts(onlySession(fixture));
  const card = page.locator("#sessions").getByTestId("session-card");

  const row = cardContextRow(card);
  await expect(row).toContainText(percent);
  await expect(row).toContainText(tokens);
  await expect(cardContextTrack(card)).toHaveCount(1);
});

test("the same status data renders in the Tiles view's tile header (E4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known-tiles");
  const session = onlySession(fixture);
  const { percent, tokens } = contextTexts(session);
  expect(fixture.snapshot.prefs.view).toBe("tiles");

  const tile = liveTileById(page, session.id);
  await expect(tile).toBeVisible();
  const info = tileContextInfo(tile);
  await expect(info).toContainText(percent);
  await expect(info).toContainText(tokens);
  await expect(tileContextTrack(tile)).toHaveCount(1);
});

test("a full status post fills both masthead gauge bars with rounded percentages and bracketed reset suffixes, and shows no model readout (E5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known");
  const fiveHour = knownBucket(fixture, "fiveHour");
  const sevenDay = knownBucket(fixture, "sevenDay");

  await expect(mastheadBucket(page, "5h")).toContainText("5h");
  await expect(mastheadBucket(page, "5h")).toContainText(`${Math.round(fiveHour.usedPct)}%`);
  // REQ-14 / plan masthead-indicators REQ-4: the reset suffix is present whenever the
  // bucket is known, as `(HH:MM)` or `(HH:MM Ddd)`; which of the two is the page clock's
  // business and has its own tests below.
  await expect(mastheadBucketResets(page, "5h")).toHaveText(
    new RegExp(`${RESETS_SAME_DAY.source}|${RESETS_OTHER_DAY.source}`),
  );
  await expect(mastheadBucketTrack(page, "5h")).toHaveCount(1);

  await expect(mastheadBucket(page, "7d")).toContainText("7d");
  await expect(mastheadBucket(page, "7d")).toContainText(`${Math.round(sevenDay.usedPct)}%`);
  await expect(mastheadBucketResets(page, "7d")).toHaveText(
    new RegExp(`${RESETS_SAME_DAY.source}|${RESETS_OTHER_DAY.source}`),
  );
  await expect(mastheadBucketTrack(page, "7d")).toHaveCount(1);

  // Plan masthead-indicators REQ-1: the model the status line carried no longer shows
  // in the masthead at all.
  await expect(removedModelReadout(page)).toHaveCount(0);
});

test("a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-hot");
  const session = onlySession(fixture);
  expect(session.context.usedPct).toBeGreaterThanOrEqual(60);
  expect(knownBucket(fixture, "fiveHour").usedPct).toBeGreaterThanOrEqual(60);
  expect(knownBucket(fixture, "sevenDay").usedPct).toBeLessThan(60);
  const card = railCardByTitle(page, session.title ?? "");

  await expect(cardContextRow(card)).toContainText(contextTexts(session).percent);
  await expect(cardContextHot(card)).toHaveCount(1);

  await expect(mastheadBucket(page, "5h")).toContainText(
    `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
  );
  await expect(mastheadBucketWarn(page, "5h")).toHaveCount(1);
  // The 7d bucket stays under threshold — R1's honesty check: no surface renders a
  // threshold class it hasn't earned.
  await expect(mastheadBucketWarn(page, "7d")).toHaveCount(0);
});

// --- the reset suffix and the health dot (plan masthead-indicators REQ-4, REQ-7, REQ-12) ---

function resetsOf(fixture: RenderFixture, bucket: "fiveHour" | "sevenDay"): Date {
  return new Date(knownBucket(fixture, bucket).resetsAt);
}

test("a same-day reset renders as (HH:MM) on both status-line buckets, with no resets word or separator (E1, REQ-4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known");
  await pinClock(page);
  // Both resets fall within the hour after the epoch the clock sits at: today in any zone.
  const fiveHour = resetsOf(fixture, "fiveHour");
  const sevenDay = resetsOf(fixture, "sevenDay");

  await expect(mastheadBucket(page, "5h")).toContainText(
    `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
  );
  for (const [bucket, at] of [
    ["5h", fiveHour],
    ["7d", sevenDay],
  ] as const) {
    const expected = await expectedResetsText(page, at);
    expect(expected).toMatch(RESETS_SAME_DAY);
    await expect(mastheadBucketResets(page, bucket)).toHaveText(expected);
    await expect(mastheadBucketResets(page, bucket)).toHaveText(RESETS_SAME_DAY);
    // No `resets` word and no `·` separator anywhere in either readout.
    await expect(mastheadBucket(page, bucket)).not.toContainText(/resets|·/i);
  }
});

test.describe("in the UTC zone, where the fixture's resets fall minutes after midnight", () => {
  test.use({ timezoneId: "UTC" });

  test("an other-day reset renders as (HH:MM Ddd), including just after local midnight and a week out on today's weekday (E1, REQ-4, edge cases 3-4)", async ({
    page,
    dashboard,
  }) => {
    const fixture = await dashboard.open("usage-known");
    // The clock sits a week before the resets, at the same hour: every reset is a week out,
    // on the clock's own weekday, and (in this zone) minutes after that day's midnight.
    const weekBefore = -7 * DAY_S;
    await pinClock(page, weekBefore);
    const now = new Date(EPOCH_MS + weekBefore * 1000);
    const fiveHour = resetsOf(fixture, "fiveHour");
    const sevenDay = resetsOf(fixture, "sevenDay");

    await expect(mastheadBucket(page, "5h")).toContainText(
      `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
    );
    await expect(mastheadBucketResets(page, "5h")).toHaveText(
      await expectedResetsText(page, fiveHour),
    );
    await expect(mastheadBucketResets(page, "5h")).toHaveText(RESETS_OTHER_DAY);
    await expect(mastheadBucketResets(page, "5h")).toHaveText(
      new RegExp(`^\\(00:0\\d ${await shortWeekday(page, fiveHour)}\\)$`),
    );
    await expect(mastheadBucketResets(page, "7d")).toHaveText(
      await expectedResetsText(page, sevenDay),
    );
    await expect(mastheadBucketResets(page, "7d")).toHaveText(
      new RegExp(`^\\(${await clockText(page, sevenDay)} ${await shortWeekday(page, now)}\\)$`),
    );
    await expect(mastheadBucket(page, "7d")).not.toContainText(/resets|·/i);
  });
});

test("a stale resetsAt already in the past renders verbatim in the other-day form (REQ-4, edge case 5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known");
  // Three days after the resets: both are in the past, on another day in any zone.
  await pinClock(page, 3 * DAY_S);

  await expect(mastheadBucket(page, "5h")).toContainText(
    `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
  );
  for (const [bucket, at] of [
    ["5h", resetsOf(fixture, "fiveHour")],
    ["7d", resetsOf(fixture, "sevenDay")],
  ] as const) {
    const expected = await expectedResetsText(page, at);
    expect(expected).toMatch(RESETS_OTHER_DAY);
    await expect(mastheadBucketResets(page, bucket)).toHaveText(expected);
  }
});

test("each reset suffix carries a title with the weekday, date and the HH:MM it shows (E8, REQ-12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-known");
  await pinClock(page);
  const fiveHour = resetsOf(fixture, "fiveHour");
  const sevenDay = resetsOf(fixture, "sevenDay");

  await expect(mastheadBucket(page, "5h")).toContainText(
    `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
  );
  // A same-day suffix hides the weekday, so its hover is the only place the full date
  // shows: weekday + date + time, the time being exactly the one on screen.
  for (const [bucket, at] of [
    ["5h", fiveHour],
    ["7d", sevenDay],
  ] as const) {
    await expect(mastheadBucketResets(page, bucket)).toHaveText(RESETS_SAME_DAY);
    await expect(mastheadBucketResets(page, bucket)).toHaveAttribute(
      "title",
      new RegExp(await clockText(page, at)),
    );
    await expect(mastheadBucketResets(page, bucket)).toHaveAttribute(
      "title",
      new RegExp(await shortWeekday(page, at)),
    );
    await expect(mastheadBucketResets(page, bucket)).toHaveAttribute("title", /\d{1,2}/);
  }
});

test("the connection readout is a status whose word is visually hidden, leaving only a dot-sized box (REQ-7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("usage-known");

  const status = page.getByRole("status");
  await expect(status).toHaveText("connected");
  await expect(connectionStatus(page)).toHaveAttribute("role", "status");
  await expect
    .poll(async () => {
      const box = await connectionStatus(page).boundingBox();
      return box === null ? null : Math.max(box.width, box.height);
    })
    .toBeLessThanOrEqual(24);
  // The word is still in the accessibility tree: the dot's title is the only visible text
  // channel left, and the status keeps announcing the word.
  await expect(connectionStatus(page)).toHaveAttribute("title", TITLE_CONNECTED);
});

// --- the masthead's width tiers (ADR usage-masthead-narrow-width-shrinks-bars, #52) ---

/**
 * Asserts `locator` renders on exactly one text line. Compares the element's *content*
 * height (its border-box height minus its own padding and border — `#new-session-button`
 * and the `.btn`-styled controls carry real vertical padding/border that isn't text, so
 * comparing the raw border-box height against a line-height would flag a padded
 * single-line button as "wrapped") against its own computed line-height (falling back to
 * the CSS-recommended ~1.2x font-size when the engine reports `line-height: normal` as
 * something `parseFloat` can't read) rather than a hardcoded pixel figure, so the check
 * survives a font-metrics change. A wrapped readout is not a little taller than one line —
 * the `.resets` suffix wrapping (this bug's actual pre-fix symptom, measured 46px -> 63px
 * for the *whole masthead* across three wrapped readouts) multiplies a single element's
 * own content height by 2-3x — so a 1.6x line-height ceiling has slack for
 * descender/leading rounding while still catching any real wrap.
 */
async function expectSingleLine(locator: Locator, label: string): Promise<void> {
  const metrics = await locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    let lineHeight = Number.parseFloat(cs.lineHeight);
    if (Number.isNaN(lineHeight)) {
      lineHeight = Number.parseFloat(cs.fontSize) * 1.2;
    }
    const verticalPadding = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
    const verticalBorder =
      Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
    const contentHeight = el.getBoundingClientRect().height - verticalPadding - verticalBorder;
    return { contentHeight, lineHeight };
  });
  expect(metrics.contentHeight, `${label} should render on a single text line`).toBeLessThanOrEqual(
    metrics.lineHeight * 1.6,
  );
}

/** The selected model's window in the fixture's per-model list. */
function selectedWindow(fixture: RenderFixture): { usedPct: number; resetsAt: string } {
  const name = fixture.snapshot.prefs.usageModel;
  const found = fixture.snapshot.usage.modelScoped?.find((w) => w.displayName === name);
  if (!found) throw new Error(`fixture ${fixture.scenario} has no window for ${name}`);
  return found;
}

/** Opens `usage-model` with the page clock a day before its resets, so every bar's suffix
 * is the widest realistic one: an other-day reset, which carries the weekday. */
async function openWidestMasthead(
  page: Page,
  dashboard: Dashboard,
): Promise<{ fixture: RenderFixture; expected: string }> {
  const fixture = await dashboard.open("usage-model");
  await pinClock(page, -DAY_S);
  const expected = await expectedResetsText(page, resetsOf(fixture, "fiveHour"));
  expect(expected).toMatch(RESETS_OTHER_DAY);
  return { fixture, expected };
}

// 1280 is the width browser review cycle 3 found the readout's reserved width pushing
// #connection-status off-screen at, with every gauge known (plan REQ-5).
for (const width of [1512, 1440, 1280]) {
  test(`at ${width}px with every gauge known, the model-week selector showing and other-day resets on all three bars, the masthead is one row with no wrapped text and no model readout (E7, REQ-11, issue #52)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width, height: 982 });
    const { fixture, expected } = await openWidestMasthead(page, dashboard);
    const fiveHour = knownBucket(fixture, "fiveHour");
    const sevenDay = knownBucket(fixture, "sevenDay");
    const model = selectedWindow(fixture);
    // Worst case, not a middling one: 5h at its widest number (100%).
    expect(fiveHour.usedPct).toBe(100);

    // Realistic connection state before measuring layout — a verified Claude Code version,
    // as in normal operation, not the pre-hello "connecting…" + "Claude installation
    // unknown" combination.
    await expect(connectionStatus(page)).toHaveText("connected");
    await expect(page.locator("#claude-version")).toHaveText(
      `claude ${fixture.hello.claudeCode.installed}`,
    );

    // Every readout known: both buckets with reset suffixes, the model-week bar and
    // its selector (all preconditions for the layout below).
    await expect(mastheadBucket(page, "5h")).toContainText("100%");
    await expect(mastheadBucketResets(page, "5h")).toHaveText(expected);
    await expect(mastheadBucket(page, "7d")).toContainText(`${Math.round(sevenDay.usedPct)}%`);
    await expect(mastheadBucketResets(page, "7d")).toHaveText(
      await expectedResetsText(page, resetsOf(fixture, "sevenDay")),
    );
    await expect(mastheadBucketResets(page, "7d")).toHaveText(RESETS_OTHER_DAY);
    await expect(mastheadModelWeek(page)).toContainText(`${Math.round(model.usedPct)}%`);
    await expect(mastheadModelWeekResets(page)).toHaveText(
      await expectedResetsText(page, new Date(model.resetsAt)),
    );
    await expect(mastheadModelWeekResets(page)).toHaveText(RESETS_OTHER_DAY);
    await expect(mastheadModelSelect(page)).toBeVisible();
    await expect(removedModelReadout(page)).toHaveCount(0);

    // No horizontal overflow - but `.masthead`'s own scrollWidth/clientWidth is
    // blind to up to 16px of `.masthead-right` spilling into `.masthead`'s own
    // right padding (padding is inside the border box, not inside
    // `.masthead-right`'s box, so `.masthead-right` can overflow into it without
    // `.masthead` itself ever reporting a wider scrollWidth). Check
    // `.masthead-right` doesn't overflow itself, and directly measure its last
    // visible child's right edge against `.masthead`'s padding box.
    const layout = await page.evaluate(() => {
      const masthead = document.querySelector(".masthead") as HTMLElement;
      const right = document.querySelector(".masthead-right") as HTMLElement;
      const conn = document.querySelector("#connection-status") as HTMLElement;
      const mastheadRect = masthead.getBoundingClientRect();
      const connRect = conn.getBoundingClientRect();
      const paddingRight = Number.parseFloat(getComputedStyle(masthead).paddingRight);
      return {
        mastheadScrollWidth: masthead.scrollWidth,
        mastheadClientWidth: masthead.clientWidth,
        rightScrollWidth: right.scrollWidth,
        rightClientWidth: right.clientWidth,
        connRight: connRect.right,
        viewportWidth: document.documentElement.clientWidth,
        paddingBoxRight: mastheadRect.right - paddingRight,
      };
    });
    // The connection dot is fully on-screen, not merely inside the masthead's own
    // padding box (the masthead can itself overflow the viewport).
    expect(
      layout.connRight,
      `#connection-status should sit fully inside the ${width}px viewport`,
    ).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.connRight).toBeGreaterThan(0);

    expect(
      layout.mastheadScrollWidth,
      `masthead scrollWidth should not exceed its clientWidth at ${width}px`,
    ).toBeLessThanOrEqual(layout.mastheadClientWidth + 1);
    expect(
      layout.rightScrollWidth,
      `.masthead-right scrollWidth should not exceed its own clientWidth at ${width}px`,
    ).toBeLessThanOrEqual(layout.rightClientWidth + 1);
    expect(
      layout.connRight,
      "#connection-status's right edge should sit inside the masthead's padding box, not spill into its right padding",
    ).toBeLessThanOrEqual(layout.paddingBoxRight + 1);

    // Nothing wraps - the pre-fix symptom (ADR context) was each gauge's reset suffix
    // and the New session/claude-version readouts going onto multiple lines, growing
    // the masthead from 46px to 63px.
    await expectSingleLine(page.locator("#usage-5h"), "#usage-5h");
    await expectSingleLine(page.locator("#usage-7d"), "#usage-7d");
    await expectSingleLine(page.locator("#usage-model-week"), "#usage-model-week");
    await expectSingleLine(mastheadBucketResets(page, "5h"), "#usage-5h .resets");
    await expectSingleLine(mastheadBucketResets(page, "7d"), "#usage-7d .resets");
    await expectSingleLine(mastheadModelWeekResets(page), "#usage-model-week .resets");
    await expectSingleLine(page.locator("#new-session-button"), "#new-session-button");
    await expectSingleLine(page.locator("#claude-version"), "#claude-version");

    // One row, measured against the same masthead where it certainly is one: the
    // height at this width equals the height at a width far above the 1840px tier.
    const mastheadHeight = async (): Promise<number> =>
      (await page.locator(".masthead").boundingBox())?.height ?? 0;
    const narrowHeight = await mastheadHeight();
    expect(narrowHeight).toBeGreaterThan(0);
    await page.setViewportSize({ width: 2400, height: 982 });
    await expect.poll(mastheadHeight).toBeCloseTo(narrowHeight, 0);
  });
}

test("at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width (issue #52)", async ({
  page,
  dashboard,
}) => {
  // Measure the narrow (<=1840px) case first, same page, then widen — deterministic
  // before/after on the identical DOM.
  await page.setViewportSize({ width: 1512, height: 982 });
  const fixture = await dashboard.open("usage-known");
  await expect(mastheadBucket(page, "5h")).toContainText(
    `${Math.round(knownBucket(fixture, "fiveHour").usedPct)}%`,
  );

  const narrowBar = page.locator("#usage-5h .bar");
  await expect(narrowBar).toHaveCSS("width", "40px");

  // Above the 1840px tier.
  await page.setViewportSize({ width: 1900, height: 982 });
  const wideBar = page.locator("#usage-5h .bar");
  await expect(wideBar).toHaveCSS("width", "96px");
});

// --- the per-model window's select (plan usage-model-bar E2 and its review regressions) ---

test("before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup (E2)", async ({
  page,
  dashboard,
}) => {
  // No poll has recorded a list: `modelScoped` is null, exactly the state a held first
  // fetch leaves the daemon in.
  const fixture = await dashboard.open("usage-known");
  expect(fixture.snapshot.usage.modelScoped).toBeNull();

  await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
  await expect(mastheadModelWeekTrack(page)).toHaveCount(0);
  await expect(mastheadModelWeekResets(page)).toHaveCount(0);
  // UI Specifications > States, "No data yet": select still exists, disabled,
  // single option reading the current pref (default "Fable").
  await expect(mastheadModelSelect(page)).toBeDisabled();
  await expect(mastheadModelSelect(page).locator("option")).toHaveCount(1);
  await expect(mastheadModelSelect(page)).toHaveValue(fixture.snapshot.prefs.usageModel);
});

// review usage-model-bar cycle 1, Major 1 / Critical 1 regression test: a `selectOption`
// sets the value programmatically and never touches focus or the native popup, so it could
// not see the defect the review measured (the select being destroyed and rebuilt by the 1s
// render tick, dropping focus to <body> and killing any open dropdown). This test focuses
// the live node instead, waits past a full render tick, and asserts both that focus survived
// and that the exact same DOM node instance is still in the tree — not merely that *some*
// select happens to be focused afterwards.
test("the model select keeps focus and the same node instance across a render tick (Critical 1 regression)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-model");
  const model = selectedWindow(fixture);
  await expect(mastheadModelWeekPercent(page)).toHaveText(`${Math.round(model.usedPct)}%`);

  const select = mastheadModelSelect(page);
  await select.focus();
  await expect(select).toBeFocused();

  // Tag the live node itself (not a Playwright-side reference) so that after the
  // wait below we can tell "this exact node is still attached and focused" apart
  // from "a freshly-built replacement select that happens to also be focused".
  await select.evaluate((node) => {
    (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag = "original-select";
  });

  // main.ts's render loop ticks every 1s; advance past more than one full tick. Before
  // the fix, `renderModelWeek` rebuilt a brand-new <select> unconditionally on
  // every pass (`el.replaceChildren(select, num)`), which detaches the focused
  // node — the reviewer measured `document.activeElement` going SELECT -> BODY and
  // the tagged node vanishing within 1.6s.
  await settleFor(page, 1600);

  await expect(select).toBeFocused();
  const stillTagged = await select.evaluate(
    (node) => (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag === "original-select",
  );
  expect(stillTagged).toBe(true);

  // The steady-state reuse path only touches `select.value`/`select.disabled` in
  // place (masthead.ts), so the value set before the wait must still read correctly
  // too — not just "focused", but still the same functioning control.
  await expect(select).toHaveValue(fixture.snapshot.prefs.usageModel);
});

// web-implementation.md Fix Attempt 1, Minor 3 fix: a pref naming a model absent from a
// non-null list used to leave `select.value` unmatched (selectedIndex -1, rendering
// blank) beside the honest "unknown" percent. The fix prepends a disabled placeholder
// option carrying the pref name so the control shows that name instead of going blank.
test("a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank (Minor 3 fix)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("usage-model-absent");
  const pref = fixture.snapshot.prefs.usageModel;
  const listed = (fixture.snapshot.usage.modelScoped ?? []).map((w) => w.displayName);
  expect(listed.length).toBeGreaterThan(0);
  expect(listed).not.toContain(pref);

  // INV-2 still holds: the honest "unknown" reading with zero track markup, even
  // though the underlying list is non-null and non-empty.
  await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
  await expect(mastheadModelWeekTrack(page)).toHaveCount(0);
  await expect(mastheadModelWeekResets(page)).toHaveCount(0);

  // The select itself shows the pref name via a prepended, disabled placeholder
  // option — not a blank control (selectedIndex -1) and not silently falling back
  // to the first real option.
  const select = mastheadModelSelect(page);
  await expect(select).toHaveValue(pref);
  const options = select.locator("option");
  await expect(options).toHaveCount(listed.length + 1);
  await expect(options.nth(0)).toHaveText(pref);
  await expect(options.nth(0)).toHaveAttribute("disabled", "");
  for (const [i, name] of listed.entries()) {
    await expect(options.nth(i + 1)).toHaveText(name);
  }
});
