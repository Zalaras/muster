// Setup, locators and oracles for plan rail-card-organise's prompt-cache warmth (#84).
//
// The status line's `prompt_cache` block is synthesized from kb:fact/prompt-cache-status-shape
// (the 2.1.259-2.1.296 measurement, `ttl: "1h"`) and kb:fact/haiku-main-cache-ttl-5m-on-2-1-299
// (`ttl: "5m"`, 2.1.299): every key the facts list, `expires_at` in Unix seconds, `warm` true on
// every post because a flip to false has never been observed (the dashboard reads `expires_at`
// against its own clock, never `warm`). The block is added to the measured full status-line body
// of `helpers/payloads.ts`; a post without `prompt_cache` is that same body untouched, which is the
// measured "absent until a request" shape. Status posts arrive in close pairs
// (kb:fact/status-posts-arrive-in-pairs), so every post here is sent twice.
//
// Time: the dashboard compares `expiresAt` with its own clock, so a spec fixes the page's clock
// (`useWarmthClock`) instead of reading the wall clock. Fixed, not flowing: the remaining time is
// then exactly what the spec computed, and moving the clock is one `setFixedTime` the 1 s render
// tick picks up with no message arriving.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { envelopedStatusLineFull } from "./payloads";
import { envelopeOpts, type SessionObject } from "./session";
import { resolvedCssVar } from "./theme";

/** The fixed instant a warmth spec starts its page clock at, and the same in Unix seconds. */
export const WARMTH_NOW_MS = Date.UTC(2026, 9, 14, 12, 0, 0);
export const WARMTH_NOW_S = WARMTH_NOW_MS / 1000;

/** Fixes the page's clock at `WARMTH_NOW_MS` plus `afterSeconds`. Call before `page.goto` first. */
export async function useWarmthClock(page: Page, afterSeconds = 0): Promise<void> {
  await page.clock.setFixedTime(new Date(WARMTH_NOW_MS + afterSeconds * 1000));
}

/** `expires_at` for a cache that is `remaining` seconds from the fixed start instant. */
export function expiresIn(remaining: number): number {
  return WARMTH_NOW_S + remaining;
}

export interface PromptCacheOpts {
  /** `prompt_cache.expires_at`, Unix seconds. */
  expiresAt: number;
  /** `prompt_cache.ttl`: `"1h"` (2.1.259-2.1.296) or `"5m"` (2.1.299). Default `"1h"`. */
  ttl?: string;
}

function promptCacheBlock({ expiresAt, ttl = "1h" }: PromptCacheOpts): Record<string, unknown> {
  return {
    warm: true,
    ttl,
    expires_at: expiresAt,
    caching_observed: true,
    requests: 10,
    hit_ratio: 0.966,
    cache_write_tokens: 13797,
    recache_tokens_if_cold: 43899,
    misses: 0,
    miss_recache_tokens: 0,
    expected_rebuilds: 0,
    last_miss_at: null,
    last_miss_cause: null,
    miss_causes: {},
  };
}

/**
 * Posts one status line for `session` (the measured full body, enveloped to its real pane), twice
 * as a close pair. `cache` adds the `prompt_cache` block; `null` posts the body without it, the
 * shape every post has before the process's first request.
 */
export async function postStatus(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
  cache: PromptCacheOpts | null,
): Promise<void> {
  const body = envelopedStatusLineFull(claudeId, await envelopeOpts(session, daemon));
  if (cache !== null) {
    const payload = body.payload as Record<string, unknown>;
    payload.version = cache.ttl === "5m" ? "2.1.299" : "2.1.296";
    payload.prompt_cache = promptCacheBlock(cache);
  }
  await request.post(daemon.ingestURL("status"), { data: body });
  await request.post(daemon.ingestURL("status"), { data: body });
}

/** The wire `cache` the daemon is expected to hold for a post (kb:anchor/ws.session). */
export interface WireCache {
  expiresAt: string;
  ttlSeconds: number;
}

/** A Unix-seconds instant as the wire's whole-second RFC3339 UTC string. */
export function wireInstant(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
}

/** One session as `GET /api/state` returns it, with the `cache` key this plan adds. */
export async function wireCache(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<WireCache | null> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/state failed: ${res.status()} ${await res.text()}`);
  }
  const state = (await res.json()) as { sessions: { id: number; cache?: WireCache | null }[] };
  const found = state.sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in state snapshot`);
  if (!("cache" in found)) throw new Error(`session ${id} carries no cache key on the wire`);
  return found.cache ?? null;
}

/**
 * Every `sessionUpsert` frame the dashboard receives from now on, parsed. Attach before
 * `page.goto`: only sockets opened afterwards are seen.
 */
export function trackUpserts(page: Page): {
  forSession: (id: number) => { cache: WireCache | null }[];
} {
  const upserts: { id: number; cache: WireCache | null }[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      let message: { type?: string; session?: { id?: number; cache?: WireCache | null } };
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      if (message.type === "sessionUpsert" && message.session?.id !== undefined) {
        upserts.push({ id: message.session.id, cache: message.session.cache ?? null });
      }
    });
  });
  return { forSession: (id) => upserts.filter((u) => u.id === id) };
}

// --- locators ---

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
  return await rgbOf(page, await resolvedCssVar(page, token, "color"));
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

/** Asserts the timer carries the dotted underline (`on`) or no underline at all, by computed style. */
export async function expectUnderline(timer: Locator, on: boolean): Promise<void> {
  await expect(timer).toHaveCSS("text-decoration-line", on ? "underline" : "none");
  if (on) await expect(timer).toHaveCSS("text-decoration-style", "dotted");
}

/** The text of a timer element, read fresh. */
export async function timerText(timer: Locator): Promise<string> {
  return ((await timer.textContent()) ?? "").trim();
}
