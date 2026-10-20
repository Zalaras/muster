// Locators and page-side oracles for the usage feature: the masthead's two status-line
// buckets and the per-model window with their reset suffixes, the connection health dot,
// the card and tile context gauges, and the card timer's prompt-cache warmth (its tint,
// underline and hover panel) on rail cards, strip cards and group headers. Pure DOM — no
// daemon, no fixture knowledge beyond reading a loaded fixture's wire objects — so both
// tiers use it: the render spec here directly, the E2E journeys through
// `web/e2e/helpers/{gauges,masthead,cache-warmth}.ts`, which re-export it beside their own
// daemon-side setup (status posts, the fake usage API, the health recorder).
//
// Locators follow each plan's Testable UI Elements table: the pinned ids (`#usage-5h`,
// `#usage-7d`, `#usage-model-week`, `#connection-status`), the pinned accessible names
// ("Usage model", "Refresh usage") and the pinned class / data attribute where it names one.
import {
  expect,
  FIXTURE_EPOCH,
  type Locator,
  type Page,
  type RenderFixture,
  type Session,
} from "./harness";
import { tokenColor } from "./style";

export type Bucket = "5h" | "7d";

// --- the masthead's status-line buckets ---

/** The masthead usage-readout container for one bucket — the `#usage-5h` / `#usage-7d` ids. */
export function mastheadBucket(page: Page, bucket: Bucket): Locator {
  return page.locator(`#usage-${bucket}`);
}

/** The bucket's track-fill element (mockup: `.bar > i`) — present only when the bucket
 * is known; INV-3 requires zero track markup at all for a null bucket. */
export function mastheadBucketTrack(page: Page, bucket: Bucket): Locator {
  return mastheadBucket(page, bucket).locator("i");
}

/** Matches iff the bucket's gauge bar carries the >=60%-used `warn` class
 * (design-system §6, settled 2026-08-23) — checked on a nested `.bar`, a bare `.warn`
 * descendant, or the bucket container itself, whichever web-impl actually applies it to. */
export function mastheadBucketWarn(page: Page, bucket: Bucket): Locator {
  const b = mastheadBucket(page, bucket);
  return b
    .locator(".bar.warn")
    .or(b.locator(".warn"))
    .or(page.locator(`#usage-${bucket}.warn`));
}

/** The reset suffix of one status-line bucket readout (`#usage-5h` / `#usage-7d`). */
export function mastheadBucketResets(page: Page, bucket: Bucket): Locator {
  return page.locator(`#usage-${bucket} .resets`);
}

/** Every reset suffix anywhere in the masthead. */
export function allMastheadResets(page: Page): Locator {
  return page.locator(".masthead .resets");
}

/** The element plan masthead-indicators removed from the masthead (REQ-1). An attribute
 * selector, so the id is never written the way a locator for the live element would be. */
export function removedModelReadout(page: Page): Locator {
  return page.locator("[id=usage-model]");
}

// --- the card and tile context gauges ---

/** A rail/strip card's context row (`.r3`), which holds the track markup. */
export function cardContextRow(card: Locator): Locator {
  return card.locator(".r3");
}

/** The card context row's track-fill element (mockup: `.ctx > i`), present only when
 * context is known (INV-3). */
export function cardContextTrack(card: Locator): Locator {
  return cardContextRow(card).locator("i");
}

/** Matches iff the card's context track carries the >=60%-used `hot` class. */
export function cardContextHot(card: Locator): Locator {
  const row = cardContextRow(card);
  return row.locator(".ctx.hot").or(row.locator(".hot"));
}

/** A tile's context-info span (`.ctxinfo`), rendered like a card's `.r3` row. */
export function tileContextInfo(tile: Locator): Locator {
  return tile.locator(".ctxinfo");
}

/** The tile context-info's track-fill element. */
export function tileContextTrack(tile: Locator): Locator {
  return tileContextInfo(tile).locator("i");
}

// --- the per-model weekly window (plan usage-model-bar) ---
// This plan's Testable UI Elements table PINS the container id (`#usage-model-week`), the
// select's accessible name (`aria-label="Usage model"`) and the refresh button's accessible
// name ("Refresh usage") in its own markup snippet, so these are not hedged.

/** The model-week readout container (`#usage-model-week`, `.usage-readout`; gains `.stale`
 * when `modelScopedError` is non-null, INV-2/E5). */
export function mastheadModelWeek(page: Page): Locator {
  return page.locator("#usage-model-week");
}

/** The model-week readout's percent text (`.num`) — `"NN%"` or `"unknown"`. */
export function mastheadModelWeekPercent(page: Page): Locator {
  return mastheadModelWeek(page).locator(".num");
}

/** The model-week readout's track-fill element (`.bar > i`) — absent whenever `.num`
 * reads "unknown" (INV-2). */
export function mastheadModelWeekTrack(page: Page): Locator {
  return mastheadModelWeek(page).locator(".bar i");
}

/** Matches iff the model-week bar carries the >=60%-used `warn` class (design-system
 * §6, reused here per REQ-9). */
export function mastheadModelWeekWarn(page: Page): Locator {
  return mastheadModelWeek(page).locator(".bar.warn");
}

/** The model-week readout's reset suffix (`.resets`) — present only when the selected
 * model is known. */
export function mastheadModelWeekResets(page: Page): Locator {
  return mastheadModelWeek(page).locator(".resets");
}

/** The model-choosing `<select>` (role `combobox`, accessible name "Usage model" via
 * `aria-label`; `disabled` when `modelScoped` is null/empty). */
export function mastheadModelSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Usage model" });
}

/** The refresh button beside the model-week readout (role `button`, accessible name
 * "Refresh usage"; `aria-busy="true"` while a refresh is pending). */
export function mastheadUsageRefreshButton(page: Page): Locator {
  return page.getByRole("button", { name: "Refresh usage" });
}

// --- the connection health dot (plan masthead-indicators REQ-6..10) ---

export type Health = "ok" | "pending" | "down";

/** `#connection-status` — `role="status"`, holds the dot and the screen-reader word. */
export function connectionStatus(page: Page): Locator {
  return page.locator("#connection-status");
}

/** The daemon-down / update-restart / confirmation banner (`role="alert"`). */
export function connectionBanner(page: Page): Locator {
  return page.getByRole("alert");
}

/** Testable UI Elements: `title` per health state. */
export const TITLE_CONNECTED = "Connected to musterd";
export const TITLE_CONNECTING = "Connecting to musterd…";
export const TITLE_UPDATING = "Restarting musterd for an update…";
export const TITLE_DOWN = "musterd unreachable — reconnecting…";

// --- the reset suffix (plan masthead-indicators REQ-4/REQ-12) ---

/** Testable UI Elements: reset suffix patterns. */
export const RESETS_SAME_DAY = /^\(\d{2}:\d{2}\)$/;
export const RESETS_OTHER_DAY = /^\(\d{2}:\d{2} [A-Za-z]{2,}\.?\)$/;

/**
 * REQ-4's rule, evaluated in the browser under test (so `undefined` locale, the zone and
 * the page's own — possibly pinned — clock are what decide) for a known instant: `(HH:MM)`
 * on the same local calendar day as now, `(HH:MM Ddd)` otherwise.
 */
export async function expectedResetsText(page: Page, when: Date): Promise<string> {
  return await page.evaluate((ms) => {
    const at = new Date(ms);
    const now = new Date();
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    if (at.toDateString() === now.toDateString()) return `(${hh}:${mm})`;
    return `(${hh}:${mm} ${at.toLocaleDateString(undefined, { weekday: "short" })})`;
  }, when.getTime());
}

/** The `HH:MM` of `when` in the page's zone, zero-padded 24-hour. */
export async function clockText(page: Page, when: Date): Promise<string> {
  return await page.evaluate((ms) => {
    const at = new Date(ms);
    return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  }, when.getTime());
}

/** The short weekday of `when` as `toLocaleDateString(undefined, { weekday: "short" })`. */
export async function shortWeekday(page: Page, when: Date): Promise<string> {
  return await page.evaluate(
    (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short" }),
    when.getTime(),
  );
}

// --- the card timer's prompt-cache warmth (plan rail-card-organise #84) ---

/** A rail or strip card's state timer (`.timer`, `aria-label="time in state"`). */
export function cardTimer(card: Locator): Locator {
  return card.locator(".timer");
}

/** The hover panel a card timer opens (`role="tooltip"`, appended to `document.body`). */
export function cardTip(page: Page): Locator {
  return page.getByRole("tooltip");
}

/** The extra timer a group header's summary carries, when the section has one. */
export function headerTimer(head: Locator): Locator {
  return head.locator(".gsum [data-cache]");
}

/** The rail card whose title is exactly `title`: a substring match would let `state-ended`
 * also find `state-ended-unknown`; the card's label is its title plus `, unread` once it is. */
export function railCardExact(page: Page, title: string): Locator {
  return page
    .locator("#sessions")
    .getByTestId("session-card")
    .and(page.getByLabel(new RegExp(`^${title}(, unread)?$`)));
}

/** The text of a timer element, read fresh. */
export async function timerText(timer: Locator): Promise<string> {
  return ((await timer.textContent()) ?? "").trim();
}

/** Asserts the timer carries the dotted underline (`on`) or no underline at all, by computed style. */
export async function expectUnderline(timer: Locator, on: boolean): Promise<void> {
  await expect(timer).toHaveCSS("text-decoration-line", on ? "underline" : "none");
  if (on) await expect(timer).toHaveCSS("text-decoration-style", "dotted");
}

// --- colour oracles ---

export type Rgb = [number, number, number];

/** Any CSS colour the browser can parse, as 8-bit sRGB (a canvas pixel). */
export async function rgbOf(page: Page, css: string): Promise<Rgb> {
  return await page.evaluate((value) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r ?? 0, g ?? 0, b ?? 0] as [number, number, number];
  }, css);
}

/** The timer's computed `color` as sRGB. */
export async function timerRgb(page: Page, timer: Locator): Promise<Rgb> {
  const css = await timer.evaluate((el) => getComputedStyle(el).color);
  return await rgbOf(page, css);
}

/** A `:root` colour token resolved against the live theme, as sRGB. */
export async function tokenRgb(page: Page, token: string): Promise<Rgb> {
  return await rgbOf(page, await tokenColor(page, token));
}

/** The largest per-channel difference between two colours. */
export function colourDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** `to + (from - to) * f`: the colour `f` of the way from `to` back to `from`, per channel. */
export function mixRgb(from: Rgb, to: Rgb, f: number): Rgb {
  return [0, 1, 2].map((i) => (to[i] ?? 0) + ((from[i] ?? 0) - (to[i] ?? 0)) * f) as Rgb;
}

/**
 * Asserts the timer's colour is `f` of the way from the timer's usual grey (`--fg-dim`, f = 0) to
 * the bright foreground (`--fg`, f = 1), within `tolerance` 8-bit channel levels, re-reading the
 * colour on every retry so a stale paint times out instead of passing.
 */
export async function expectTimerFade(
  page: Page,
  timer: Locator,
  f: number,
  tolerance = 3,
): Promise<void> {
  const bright = await tokenRgb(page, "--fg");
  const grey = await tokenRgb(page, "--fg-dim");
  const want = mixRgb(bright, grey, f);
  await expect
    .poll(async () => colourDistance(await timerRgb(page, timer), want), {
      message: `timer colour is ${f} of the way from --fg-dim to --fg`,
    })
    .toBeLessThanOrEqual(tolerance);
}

// --- time, read off the fixture ---

/** `FIXTURE_EPOCH` in epoch milliseconds — where the page clock starts, and the instant
 * every fixture timestamp is counted from. */
export const EPOCH_MS = Date.parse(FIXTURE_EPOCH);

/**
 * Fixes the page's clock at `FIXTURE_EPOCH` plus `afterSeconds`. The harness installs a
 * clock that starts at the epoch and then ticks in real time; a warmth assertion is about an
 * exact remaining lifetime (585 s is cooling, 586 s is not), so, as the E2E tier's
 * `useWarmthClock` did, the spec fixes `Date` at a chosen instant instead — timers keep
 * running, so the 1 s render tick picks the new instant up with no frame arriving, and the
 * hover panel's open delay still elapses. Call after `dashboard.open`, which installs the clock.
 */
export async function pinClock(page: Page, afterSeconds = 0): Promise<void> {
  await page.clock.setFixedTime(new Date(EPOCH_MS + afterSeconds * 1000));
}

/** A fixture session's cache, which the scenario promised it has. */
export function cacheOf(session: Session): { expiresAt: string; ttlSeconds: number } {
  if (!session.cache)
    throw new Error(`fixture session "${session.title ?? session.id}" has no cache`);
  return session.cache;
}

/** Whole seconds from `FIXTURE_EPOCH` to the cache's expiry — what remains of its lifetime
 * the instant the page clock starts (`pinClock(page)`); negative once past. */
export function remainingAtEpoch(cache: { expiresAt: string }): number {
  return Math.round((Date.parse(cache.expiresAt) - EPOCH_MS) / 1000);
}

/** The plan's hover wording for a warm cache with `seconds` left: whole minutes, counted
 * up, while a minute or more remains, and seconds below it (UI Specifications, REQ-27). */
export function warmHover(seconds: number): string {
  const whole = Math.ceil(seconds);
  return `cache warm · cold in ${whole >= 60 ? `${Math.ceil(whole / 60)}m` : `${whole}s`}`;
}

/** The fixture session carrying exactly this title. */
export function sessionTitled(fixture: RenderFixture, title: string): Session {
  const found = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!found) throw new Error(`fixture ${fixture.scenario} has no session titled "${title}"`);
  return found;
}

/** The fixture group carrying exactly this name. */
export function groupNamed(fixture: RenderFixture, name: string): { id: number; name: string } {
  const found = fixture.snapshot.groups.find((g) => g.name === name);
  if (!found) throw new Error(`fixture ${fixture.scenario} has no group named "${name}"`);
  return found;
}

/** One known status-line bucket of the fixture's usage object. */
export function knownBucket(
  fixture: RenderFixture,
  bucket: "fiveHour" | "sevenDay",
): { usedPct: number; resetsAt: string } {
  const found = fixture.snapshot.usage[bucket];
  if (!found) throw new Error(`fixture ${fixture.scenario} has no known ${bucket} bucket`);
  return found;
}
