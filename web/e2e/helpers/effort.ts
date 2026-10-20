// Locators, payload builders and oracles for plan effort: the launch dialog's Effort row, the
// Focus mainhead's bracketed effort (`.model .eff`) and the launch-mismatch warning strip.
//
// The status line's `effort` is synthesized from kb:fact/status-line-effort-key (2.1.286, re-checked
// 2.1.300): a top-level `effort: {"level": "<level>"}` present only while the model supports effort,
// absent on every post of a model without it (Haiku 4.5, Sonnet 4.5 — kb:fact/effort-levels-per-model).
// An effort-less post therefore pairs with Haiku 4.5 and a post carrying a level with Opus 4.5, the
// two shapes the facts measured; neither is a field the real status line never sends. Status posts
// arrive in close pairs (kb:fact/status-posts-arrive-in-pairs), so every post here is sent twice.
//
// What is NOT measured and so is flagged in the spec's handoff: an `effort.level` outside the five
// observed values (the contract calls it "an open string"), used by one test only.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { focusSession } from "../../render/helpers/focus";
import type { ScratchDaemon } from "./daemon";
import { envelopedSessionStart, envelopedStatusLineFull } from "./payloads";
import {
  envelopeOpts,
  type LaunchBody,
  launchSession,
  scratchDirectory,
  type SessionObject,
} from "./session";
import { parseSizenote } from "./terminal";
import { resolvedCssVar } from "./theme";

// The Focus mainhead's locators and colour oracles are pure DOM and live in the render
// tier's helper (web/render/helpers/focus.ts, where the display properties re-levelled on
// 2026-10-20 read them), as are the launch dialog's Effort row locators
// (web/render/helpers/launch.ts, where the dialog's static properties read them); the
// journeys here reach them through these re-exports.
export {
  amberHueBand,
  computed,
  effortStrip,
  effText,
  focusSession,
  headerEff,
  headerModel,
  hueOf,
  stripDismiss,
  stripSentence,
} from "../../render/helpers/focus";
export {
  EFFORT_LEVELS,
  effortRadio,
  effortRadiogroup,
  effortSegment,
  pickEffort,
} from "../../render/helpers/launch";

/** The status line's `model` for a model that offers effort and clamps `xhigh`/`max` to `high`
 * (kb:fact/effort-levels-per-model, Opus 4.5). */
export const OPUS_4_5 = { id: "claude-opus-4-5-20251101", displayName: "Opus 4.5" };

/** A model that keeps every one of the five levels as given, `max` included
 * (kb:fact/effort-levels-per-model: `opus` resolves to `claude-opus-5-5`). */
export const OPUS_5_5 = { id: "claude-opus-5-5", displayName: "Opus 5.5" };

/** The status line's `model` for a model with no effort setting: its key is absent on every post
 * (kb:fact/status-line-effort-key, kb:fact/effort-levels-per-model). */
export const HAIKU_4_5 = { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" };

// --- payloads ---

export interface EffortPost {
  /** `effort.level` to carry; `null` omits the `effort` key entirely (a model without effort). */
  level: string | null;
  /** Defaults to Opus 4.5 for a level and Haiku 4.5 for `null`, the shapes the facts measured. */
  model?: { id: string; displayName: string };
}

/**
 * Posts one status line for `session` — the measured full body, enveloped to its real pane — as a
 * close pair, carrying `effort.level` when `post.level` is a string.
 */
export async function postEffort(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
  post: EffortPost,
): Promise<void> {
  const model = post.model ?? (post.level === null ? HAIKU_4_5 : OPUS_4_5);
  const body = envelopedStatusLineFull(claudeId, {
    ...(await envelopeOpts(session, daemon)),
    model,
  });
  const payload = body.payload as Record<string, unknown>;
  payload.version = "2.1.300";
  if (post.level !== null) payload.effort = { level: post.level };
  const first = await request.post(daemon.ingestURL("status"), { data: body });
  expect(first.status()).toBe(200);
  const second = await request.post(daemon.ingestURL("status"), { data: body });
  expect(second.status()).toBe(200);
}

// --- setup ---

export interface EffortSession {
  session: SessionObject;
  claudeId: string;
  dir: { path: string; cleanup: () => Promise<void> };
}

/**
 * Launches a session through the real `POST /api/sessions` (with `effort` when given), binds it to
 * `claudeId` through a measured `SessionStart` (`opts.bindModel` null omits its optional `model`,
 * kb:fact/sessionstart-model-optional-string), and focuses it. The caller has already done
 * `page.goto(daemon.dashboardUrl)` — the launch endpoint needs the page's cookie.
 */
export async function launchBound(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  body: Omit<LaunchBody, "directory"> & { title: string; claudeId?: string },
  opts: { bindModel?: string | null } = {},
): Promise<EffortSession> {
  const dir = await scratchDirectory("muster-e2e-effort-");
  const claudeId = body.claudeId ?? `claude-${body.title}`;
  const { claudeId: _claudeId, ...launch } = body;
  const session = await launchSession(page, daemon, { ...launch, directory: dir.path });
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, {
      ...(await envelopeOpts(session, daemon)),
      ...(opts.bindModel !== undefined && { model: opts.bindModel }),
    }),
  });
  await focusSession(page, body.title);
  return { session, claudeId, dir };
}

/** Ends a session through the real `POST /api/sessions/{id}/end`. */
export async function endSession(page: Page, daemon: ScratchDaemon, id: number): Promise<void> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions/${id}/end`);
  expect(res.status()).toBe(200);
}

/** The level a pane's start command passed as `--effort`, or `null` when it carries none. */
export function effortArg(startCommand: string): string | null {
  return /--effort\s+'?([^\s']+)'?/.exec(startCommand)?.[1] ?? null;
}

// --- wire oracles ---

export interface EffortWire {
  effort: SessionObject["effort"];
  effortWarning: SessionObject["effortWarning"];
}

/** One session's `effort` and `effortWarning` as `GET /api/state` serves them. */
export async function wireEffort(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<EffortWire> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) throw new Error(`GET /api/state failed: ${res.status()}`);
  const state = (await res.json()) as { sessions: (Partial<EffortWire> & { id: number })[] };
  const found = state.sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in state snapshot`);
  if (!("effort" in found) || !("effortWarning" in found)) {
    throw new Error(`session ${id} carries no effort/effortWarning keys on the wire`);
  }
  return { effort: found.effort ?? null, effortWarning: found.effortWarning ?? null };
}

/** The fields INV-E5 says a status post never changes, read from one session's wire object. */
export function untouchedByStatus(s: SessionObject): unknown {
  return {
    state: s.state,
    stateSince: s.stateSince,
    attention: s.attention,
    failure: s.failure,
    alive: s.alive,
    permissionMode: s.permissionMode,
    compactions: s.context.compactions,
  };
}

/** Every `sessionUpsert` frame the page receives from now on, reduced to the effort keys. Attach
 * before `page.goto`: only sockets opened afterwards are seen. */
export function trackEffortUpserts(page: Page): {
  forSession: (id: number) => EffortWire[];
} {
  const upserts: (EffortWire & { id: number })[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      let message: { type?: string; session?: Partial<EffortWire> & { id?: number } };
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      if (message.type === "sessionUpsert" && message.session?.id !== undefined) {
        upserts.push({
          id: message.session.id,
          effort: message.session.effort ?? null,
          effortWarning: message.session.effortWarning ?? null,
        });
      }
    });
  });
  return { forSession: (id) => upserts.filter((u) => u.id === id) };
}

// --- raw requests ---

/** `POST /api/sessions` with an arbitrary body, returning the status and parsed body whatever they are. */
export async function postLaunchRaw(
  page: Page,
  daemon: ScratchDaemon,
  body: Record<string, unknown>,
): Promise<{ status: number; body: { error?: { code: string; message: string } } }> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions`, { data: body });
  return { status: res.status(), body: await res.json() };
}

/** `DELETE /api/sessions/{id}/effort-warning` with the page's cookie. */
export async function deleteWarning(page: Page, daemon: ScratchDaemon, id: number) {
  return await page.request.delete(`${daemon.baseURL}/api/sessions/${id}/effort-warning`);
}

// --- geometry ---

/** The Focus size note's row count — what the dashboard says its terminal has. */
export async function sizenoteRows(page: Page): Promise<number> {
  const text = (await page.locator("#sizenote").textContent()) ?? "";
  return Number(parseSizenote(text).rows);
}

/**
 * Waits until the size note's rows equal tmux's `#{window_height}` — both sides re-read on every
 * retry, so a stale display times out instead of passing — and returns that settled row count.
 */
export async function settledRows(
  page: Page,
  daemon: ScratchDaemon,
  tmuxTarget: string,
): Promise<number> {
  let rows = 0;
  await expect
    .poll(
      async () => {
        rows = await sizenoteRows(page);
        return rows === Number(await daemon.tmuxDisplay(tmuxTarget, "#{window_height}"));
      },
      { message: "the size note's rows and tmux's window height converge" },
    )
    .toBe(true);
  return rows;
}

// --- colour oracles ---

/** A CSS colour as the browser's normalized `rgb(...)` string, resolved through a probe element. */
export async function resolvedColour(page: Page, css: string): Promise<string> {
  return await page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.color = value;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, css);
}

/** A `:root` token resolved against the live theme, as the browser's `rgb(...)` string. */
export async function tokenColour(page: Page, token: string): Promise<string> {
  return await resolvedCssVar(page, token, "color");
}
