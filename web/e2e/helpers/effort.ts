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
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { envelopedSessionStart, envelopedStatusLineFull } from "./payloads";
import { railCard } from "./railorder";
import {
  envelopeOpts,
  type LaunchBody,
  launchSession,
  mainheadRenameButton,
  scratchDirectory,
  type SessionObject,
} from "./session";
import { parseSizenote } from "./terminal";
import { resolvedCssVar } from "./theme";

/** The five levels `--effort` accepts and the dialog offers beyond `default`
 * (kb:fact/effort-flag-values). */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

/** The status line's `model` for a model that offers effort and clamps `xhigh`/`max` to `high`
 * (kb:fact/effort-levels-per-model, Opus 4.5). */
export const OPUS_4_5 = { id: "claude-opus-4-5-20251101", displayName: "Opus 4.5" };

/** A model that keeps every one of the five levels as given, `max` included
 * (kb:fact/effort-levels-per-model: `opus` resolves to `claude-opus-5-5`). */
export const OPUS_5_5 = { id: "claude-opus-5-5", displayName: "Opus 5.5" };

/** The status line's `model` for a model with no effort setting: its key is absent on every post
 * (kb:fact/status-line-effort-key, kb:fact/effort-levels-per-model). */
export const HAIKU_4_5 = { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5" };

// --- launch dialog ---

/** `<div role="radiogroup" aria-label="Effort">` — mandated like Model and Start in. */
export function effortRadiogroup(dialog: Locator): Locator {
  return dialog.getByRole("radiogroup", { name: "Effort" });
}

/** One Effort radio. `exact` matters: `high` is a substring of `xhigh`. */
export function effortRadio(dialog: Locator, name: "default" | (typeof EFFORT_LEVELS)[number]) {
  return effortRadiogroup(dialog).getByRole("radio", { name, exact: true });
}

/** The pointer target of one Effort segment: its `<label>`, which a real click lands on. */
export function effortSegment(dialog: Locator, name: string): Locator {
  return effortRadiogroup(dialog).locator("label", { hasText: new RegExp(`^\\s*${name}\\s*$`) });
}

/** Picks an Effort level through the dialog the way a developer does: a pointer click on its segment. */
export async function pickEffort(dialog: Locator, name: string): Promise<void> {
  await effortSegment(dialog, name).click();
}

// --- Focus mainhead ---

/** `#mainhead .meta .model` — the display name followed by the `.eff` bracket. */
export function headerModel(page: Page): Locator {
  return page.locator("#mainhead .meta .model");
}

/** `.eff` inside the model: ` (<level>)` or ` (…)`; absent when there are no brackets. */
export function headerEff(page: Page): Locator {
  return page.locator("#mainhead .meta .model .eff");
}

/** The warning strip: a `role="status"` element naming the requested level. The terminal notice,
 * the `session ended` pill and the drop notice are `status` too, so the sentence picks it out. */
export function effortStrip(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: /Asked for/ });
}

/** The strip's Dismiss button. */
export function stripDismiss(page: Page): Locator {
  return effortStrip(page).getByRole("button", { name: "Dismiss" });
}

/** The strip's sentence with the `aria-hidden` glyph and the button removed, whitespace collapsed. */
export async function stripSentence(page: Page): Promise<string | null> {
  const strip = effortStrip(page);
  if ((await strip.count()) !== 1) return null;
  return await strip.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const skip of copy.querySelectorAll("[aria-hidden], button")) skip.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/** The `.eff` node's raw textContent, leading space included (plan UI Specifications). */
export async function effText(page: Page): Promise<string | null> {
  const eff = headerEff(page);
  if ((await eff.count()) !== 1) return null;
  return await eff.evaluate((el) => el.textContent);
}

/** Clicks a session's rail card and waits for the Focus header to name it. */
export async function focusSession(page: Page, title: string): Promise<void> {
  await railCard(page, title).click();
  await expect(mainheadRenameButton(page)).toHaveText(title);
}

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

/**
 * An element's computed property. A node the renderer replaced between Playwright's resolve and
 * evaluate is detached and reads `""`; that is a miss to retry, never a value, so it throws.
 * Call it inside `expect.poll`.
 */
export async function computed(
  locator: Locator,
  prop: "color" | "background-color" | "border-bottom-color",
): Promise<string> {
  const value = await locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  if (value === "") throw new Error(`computed ${prop} read "" (node detached mid-read)`);
  return value;
}

/** The hue (0-360) of a `rgb(r, g, b)` string. */
export function hueOf(rgb: string): number {
  const [r = 0, g = 0, b = 0] = (rgb.match(/[\d.]+/g) ?? []).map(Number).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Amber's hue band as `web/scripts/contrast-pairs.json` pins it — the band `--warn` must stay outside. */
export async function amberHueBand(): Promise<{ min: number; max: number }> {
  const raw = await readFile(join(process.cwd(), "scripts", "contrast-pairs.json"), "utf-8");
  const pairs = JSON.parse(raw) as { hueBands: Record<string, { min: number; max: number }> };
  const band = pairs.hueBands["--amber"];
  if (!band) throw new Error("contrast-pairs.json has no --amber hue band");
  return band;
}
