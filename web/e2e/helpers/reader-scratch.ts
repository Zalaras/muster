// Helpers for the claude section's scratchpad journeys (plan claude-tmp-files).
//
// Claude Code names a session's scratchpad folder in `scratchpad_dir` on every hook of an
// interactive session: `<tmp>/claude-<uid>/<encoded cwd>/<session_id>/scratchpad`, the
// parent folder's name being the hook's own `session_id`; `/clear` moves it to the new id's
// folder and `-p` sends null (kb:fact/scratchpad-dir-per-session-id, measured 2.1.322). The
// builders below put that key on the payloads `helpers/payloads.ts` already synthesizes — those
// carry no key, or the malformed `/tmp/scratchpad` shape older captures held, which the daemon
// must ignore — and lay the folder out on disk in the measured shape.
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Locator, Page, ScratchDaemon } from "./fixtures";
import { expect } from "./fixtures";
import { envelopedSessionStart, rawUserPromptSubmit } from "./payloads";
import { readerNav } from "./reader";
import { envelopeOpts, launchSession, type SessionObject } from "./session";

// ── The folder on disk ──────────────────────────────────────────────────────────────────

export interface ScratchpadFixture {
  /** The Claude session id the folder is named for (its parent folder's name). */
  claudeSessionId: string;
  /** `<root>/claude-501/-e2e-encoded-cwd/<claudeSessionId>/scratchpad`, created empty. */
  dir: string;
  /** `<root>/claude-501/-e2e-encoded-cwd/<claudeSessionId>` — where `tasks/` sits beside `scratchpad/`. */
  sessionFolder: string;
  /** Writes `rel` under the scratchpad (parents created) and returns its absolute path. A
   * given `mtime` is set explicitly so ordering never rests on the clock. */
  write: (rel: string, body: string, mtime?: Date) => Promise<string>;
  /** Writes `rel` under the session folder, beside the scratchpad (the `tasks/` shape). */
  writeBeside: (rel: string, body: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

/** The measured shape, rooted in the resolved system temp dir so the verbatim string the
 * hook carries and the symlink-resolved path the daemon compares it with agree. */
export async function makeScratchpad(claudeSessionId: string): Promise<ScratchpadFixture> {
  const root = await mkdtemp(join(await realpath(tmpdir()), "muster-e2e-tmp-"));
  const sessionFolder = join(root, "claude-501", "-e2e-encoded-cwd", claudeSessionId);
  const dir = join(sessionFolder, "scratchpad");
  await mkdir(dir, { recursive: true });
  const put = async (base: string, rel: string, body: string, mtime?: Date): Promise<string> => {
    const path = join(base, ...rel.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    if (mtime) await utimes(path, mtime, mtime);
    return path;
  };
  return {
    claudeSessionId,
    dir,
    sessionFolder,
    write: (rel, body, mtime) => put(dir, rel, body, mtime),
    writeBeside: (rel, body) => put(sessionFolder, rel, body),
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

// ── Payloads ────────────────────────────────────────────────────────────────────────────

/** Sets `scratchpad_dir` on a hook payload — inside the envelope's `payload` when `hook` is an
 * enveloped event, on the body itself when it is raw. `null` is the `-p` shape. */
export function withScratchpad(
  hook: Record<string, unknown>,
  scratchpadDir: string | null,
): Record<string, unknown> {
  const inner = hook.payload;
  if (inner !== null && typeof inner === "object") {
    (inner as Record<string, unknown>).scratchpad_dir = scratchpadDir;
  } else {
    hook.scratchpad_dir = scratchpadDir;
  }
  return hook;
}

/** Wraps a raw hook body in the wrapper's envelope for a launched session, the way
 * `envelopedSessionStart` does for `SessionStart` — for a hook that must reach the session
 * by its envelope rather than by its Claude session id (a straggler from a left id). */
export async function envelopeHook(
  session: SessionObject,
  daemon: ScratchDaemon,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return { ...(await envelopeOpts(session, daemon)), payload };
}

export async function postHook(
  page: Page,
  daemon: ScratchDaemon,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.post(daemon.ingestURL("hook"), { data });
  if (!res.ok()) throw new Error(`hook post failed: ${res.status()} ${await res.text()}`);
}

/**
 * Launches a session and binds it to `claudeSessionId` with a `SessionStart` that names
 * `scratch`'s folder (or, with `scratch` null, carries no `scratchpad_dir` key at all).
 */
export async function launchWithScratchpad(
  page: Page,
  daemon: ScratchDaemon,
  opts: {
    directory: string;
    title: string;
    claudeSessionId: string;
    scratch: ScratchpadFixture | null;
    transcriptPath?: string;
  },
): Promise<SessionObject> {
  const session = await launchSession(page, daemon, {
    directory: opts.directory,
    title: opts.title,
  });
  const start = envelopedSessionStart(opts.claudeSessionId, {
    ...(await envelopeOpts(session, daemon)),
    ...(opts.transcriptPath !== undefined ? { transcriptPath: opts.transcriptPath } : {}),
  });
  await postHook(page, daemon, opts.scratch ? withScratchpad(start, opts.scratch.dir) : start);
  return session;
}

let markerSeq = 0;

/**
 * Posts a `UserPromptSubmit` for `claudeSessionId` and waits until the session's `lastPrompt`
 * shows it — by then every hook posted before it has been applied, so a "nothing changed"
 * assertion made next is about a processed event, not one still in flight.
 */
export async function awaitHooksApplied(
  page: Page,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeSessionId: string,
): Promise<void> {
  markerSeq += 1;
  const marker = `marker-${process.pid}-${markerSeq}`;
  await postHook(
    page,
    daemon,
    rawUserPromptSubmit(claudeSessionId, { promptId: `p-${marker}`, prompt: marker }),
  );
  await expect
    .poll(async () => (await getSessionRow(page, daemon, session.id)).lastPrompt)
    .toBe(marker);
}

// ── Oracles ─────────────────────────────────────────────────────────────────────────────

async function getSessionRow(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) throw new Error(`GET /api/state failed: ${res.status()}`);
  const { sessions } = (await res.json()) as { sessions: Record<string, unknown>[] };
  const row = sessions.find((s) => s.id === id);
  if (!row) throw new Error(`session ${id} not in the state snapshot`);
  return row;
}

/** The Session object's `scratchpadDir` as the daemon reports it. A required key
 * (kb:anchor/ws.session): an absent one comes back `undefined`, which no assertion on a
 * folder or on `null` accepts. */
export async function getScratchpadDir(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<string | null | undefined> {
  return (await getSessionRow(page, daemon, id)).scratchpadDir as string | null | undefined;
}

export interface ScratchListing {
  dir: string;
  files: { path: string; modifiedAt: string; writtenAt: string | null }[];
}

/** `GET /api/sessions/{id}/reader`'s `scratch` block: `null` when the session has no
 * scratchpad folder, `undefined` when the daemon sent no such key at all. */
export async function getScratchListing(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<ScratchListing | null | undefined> {
  const res = await page.request.get(`${daemon.baseURL}/api/sessions/${id}/reader`);
  if (res.status() !== 200) throw new Error(`GET .../reader failed: ${res.status()}`);
  return ((await res.json()) as { scratch?: ScratchListing | null }).scratch;
}

// ── Locators (the claude section — Testable UI Elements) ─────────────────────────────────

/** The summary row: a button named `Claude` carrying `aria-expanded`. */
export function claudeSummary(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Claude", exact: true });
}

/** The chip inside the summary row reading exactly `plan`. */
export function planChip(region: Locator): Locator {
  return claudeSummary(region).getByText("plan", { exact: true });
}

/** The dimmed chip inside the summary row reading exactly `no plan`. */
export function noPlanChip(region: Locator): Locator {
  return claudeSummary(region).getByText("no plan", { exact: true });
}

/** The scratch-count chip, `<n> tmp`; absent at 0. */
export function tmpChip(region: Locator): Locator {
  return claudeSummary(region).getByText(/^\d+ tmp$/);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A scratch file row by its relative path (`findings.md`, `notes/options.md`): a button whose
 * name contains the path. Only in the DOM while the section is unfolded. */
export function scratchRow(region: Locator, rel: string): Locator {
  return readerNav(region).getByRole("button", {
    name: new RegExp(`(^|\\s)${escapeRegExp(rel)}(\\s|$)`),
  });
}

/** Every scratch row of `scratchDir`, by the `title` that is the file's absolute path. */
export function scratchRows(region: Locator, scratchDir: string): Locator {
  return readerNav(region).locator(`button[title^="${scratchDir}/"]`);
}

/** The nav's rows in DOM order — `"plan"` for the plan row, the absolute path for a scratch row. */
export async function claudeRowOrder(region: Locator, scratchDir: string): Promise<string[]> {
  return readerNav(region)
    .locator(`.f.plan, button[title^="${scratchDir}/"]`)
    .evaluateAll((els) =>
      els.map((el) => (el.classList.contains("plan") ? "plan" : (el.getAttribute("title") ?? ""))),
    );
}

/** Opens the claude section if it is folded — idempotent, so a test that must see the plan row
 * does not depend on what the browser remembered. Not a substitute for asserting the fold. */
export async function unfoldClaudeSection(region: Locator): Promise<void> {
  const summary = claudeSummary(region);
  await expect(summary).toBeVisible();
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
}
