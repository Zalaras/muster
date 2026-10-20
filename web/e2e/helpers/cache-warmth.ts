// Setup and daemon-side oracles for plan rail-card-organise's prompt-cache warmth (#84).
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
//
// The DOM side — the timer, panel and header-timer locators and the tint, underline and colour
// oracles — is pure display and lives in the render tier's helper (web/render/helpers/usage.ts,
// where the lifetime properties re-levelled on 2026-10-20 read them); the journeys here reach
// it through this re-export so a locator is written once for both tiers.
import type { APIRequestContext, Page } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { envelopedStatusLineFull } from "./payloads";
import { envelopeOpts, type SessionObject } from "./session";

export {
  cardTimer,
  cardTip,
  colourDistance,
  expectTimerFade,
  expectUnderline,
  headerTimer,
  mixRgb,
  type Rgb,
  rgbOf,
  timerRgb,
  timerText,
  tokenRgb,
} from "../../render/helpers/usage";

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
