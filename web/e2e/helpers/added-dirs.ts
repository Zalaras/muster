// Helpers for plan see-added-dirs: the status-line post that reports a session's directory
// list, the wire oracle that reads `addedDirs` back, and the Focus header's `+N` suffix and
// location panel.
//
// Claude Code is faked. `workspace.added_dirs` is synthesized from kb:fact/added-dirs-in-status-line
// (probe instance 0, capture-0.jsonl): `workspace` is `{added_dirs, current_dir, project_dir}`,
// `project_dir` is the symlink-resolved launch directory and `added_dirs` is the live list led by
// the launch directory itself, as typed (`/tmp/…` where `project_dir` reads `/private/tmp/…`).
// The directories are real scratch checkouts, because the daemon reads each one's branch from
// disk (kb:adr/lifecycle-branch-refreshed-by-repo-poll); a branch is moved by real `git`.
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  type ScratchDaemon,
} from "./fixtures";
import { envelopedStatusLineFull } from "./payloads";
import { envelopeOpts, getState, type SessionObject } from "./session";

/** One entry of the wire's `addedDirs` (kb:anchor/ws.session, plan see-added-dirs). */
export interface AddedDirWire {
  directory: string;
  repo: { name: string; branch: string; isWorktree: boolean } | null;
}

/**
 * The spelling Claude reports the launch directory in: as typed, so macOS's `/private/tmp/…`
 * arrives as `/tmp/…` (kb:fact/added-dirs-in-status-line). A path that does not start with
 * `/private/` is returned unchanged.
 */
export function typedSpelling(resolved: string): string {
  return resolved.startsWith("/private/") ? resolved.slice("/private".length) : resolved;
}

export interface WorkspaceOpts {
  /** The launch directory, symlink-resolved: `workspace.project_dir` and `current_dir`. */
  launch: string;
  /** `workspace.added_dirs` verbatim; `null` omits the key (a post that does not carry it). */
  addedDirs: string[] | null;
  /** `session_name` — a visible, independent proof that a post that changes nothing else was read. */
  sessionName?: string;
}

/** A full status-line body whose `workspace` is the measured `{added_dirs, current_dir, project_dir}`. */
export function statusWithWorkspace(
  claudeId: string,
  env: { musterSession: number; tmuxPane: string },
  opts: WorkspaceOpts,
): Record<string, unknown> {
  const body = envelopedStatusLineFull(claudeId, {
    ...env,
    cwd: opts.launch,
    ...(opts.sessionName !== undefined ? { sessionName: opts.sessionName } : {}),
  });
  const payload = body["payload"] as Record<string, unknown>;
  payload["workspace"] = {
    ...(opts.addedDirs !== null ? { added_dirs: opts.addedDirs } : {}),
    current_dir: opts.launch,
    project_dir: opts.launch,
  };
  return body;
}

/**
 * Posts one status-line report, twice in a close pair as the real status line does
 * (kb:fact/status-posts-arrive-in-pairs).
 */
export async function postWorkspace(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
  opts: WorkspaceOpts,
): Promise<void> {
  const env = await envelopeOpts(session, daemon);
  for (let i = 0; i < 2; i += 1) {
    const res = await request.post(daemon.ingestURL("status"), {
      data: statusWithWorkspace(claudeId, env, opts),
    });
    expect(res.status()).toBe(200);
  }
}

/** The session's `addedDirs` as `GET /api/state` reports it; throws while the key is missing. */
export async function wireAddedDirs(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<AddedDirWire[]> {
  const state = await getState(page, daemon);
  const found = state.sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in the state snapshot`);
  const dirs = (found as SessionObject & { addedDirs?: AddedDirWire[] }).addedDirs;
  if (!Array.isArray(dirs)) throw new Error(`session ${id} has no addedDirs array on the wire`);
  return dirs;
}

/** A symlink to `target` in a fresh scratch directory (the "same directory twice" entry). */
export async function scratchSymlinkTo(
  target: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "muster-e2e-link-")));
  const path = join(parent, "via-link");
  await symlink(target, path);
  return { path, cleanup: async () => await rm(parent, { recursive: true, force: true }) };
}

/** A fresh empty directory inside `parent`, symlinks resolved. */
export async function makeSubdirectory(parent: string, name: string): Promise<string> {
  const path = join(parent, name);
  await mkdir(path, { recursive: true });
  return await realpath(path);
}

// --- The header's `+N` suffix. ---

/** The folder line `.repo .rf` of the Focus header. */
export function headerFolderLine(page: Page): Locator {
  return page.locator("#mainhead .meta .loc .repo .rf");
}

/** The `+N` span: the last child of the folder line (plan Testable UI Elements). */
export function addedCountSuffix(page: Page): Locator {
  return headerFolderLine(page).locator(":scope > span:last-child");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The folder line ends in `+N` right after the folder name (an optional ` /` may sit between). */
export function folderLineEndingInPlus(folder: string, n: number): RegExp {
  return new RegExp(`^${escapeRegExp(folder)}[ /]*\\+${n}$`);
}

// --- The location panel. ---

/** The panel is the page's one `role="tooltip"`, appended to `document.body` while open. */
export function locationPanel(page: Page): Locator {
  return page.getByRole("tooltip");
}

/** The header readout the panel hangs off. */
function readout(page: Page): Locator {
  return page.locator("#mainhead .meta .loc");
}

/** Moves the mouse off everything, then rests it on the readout (a real pointer path). */
export async function hoverReadout(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await readout(page).hover();
}

export async function leaveReadout(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

export interface PanelRow {
  folder: string;
  /** `null`: the row shows the folder and the path alone. */
  branch: string | null;
  path: string;
}

export interface PanelExpectation {
  /** The launch checkout's row. */
  launch: PanelRow;
  /** The `↳` row, present only while Claude is elsewhere. */
  moved?: PanelRow;
  /** The added directories in wire order; empty means no `Added directories` section at all. */
  added: PanelRow[];
}

function rowPattern(row: PanelRow): string {
  const branch = row.branch === null ? "" : ` · ${escapeRegExp(row.branch)}`;
  // `textContent` has no whitespace between the folder line and the path line, so adjacency
  // is `\s*`; a row with a branch the test did not expect would not match a null-branch row.
  return `${escapeRegExp(row.folder)}${branch}\\s*${escapeRegExp(row.path)}`;
}

/**
 * The panel's whole text as one anchored pattern: the `Location` heading, the launch row, the
 * `↳` row when moved, then `Added directories · N` and one row per directory in wire order.
 * Anchored at both ends, so an extra section, a row out of order or a stray branch fails it.
 */
export function panelPattern(expected: PanelExpectation): RegExp {
  let source = `^\\s*Location\\s*${rowPattern(expected.launch)}\\s*`;
  if (expected.moved) source += `↳\\s*${rowPattern(expected.moved)}\\s*`;
  if (expected.added.length > 0) {
    source += `Added directories · ${expected.added.length}\\s*`;
    for (const row of expected.added) source += `${rowPattern(row)}\\s*`;
  }
  return new RegExp(`${source}$`);
}

/**
 * Opens the panel with the mouse and asserts its content, retrying the whole hover so a panel
 * that was opened before the data arrived is closed and opened again rather than read stale.
 * Leaves the mouse off the readout, so the panel is closed on return.
 */
export async function expectLocationPanel(page: Page, expected: PanelExpectation): Promise<void> {
  await expect(async () => {
    await hoverReadout(page);
    // Shortened from the 15 s default on purpose: each toPass attempt re-hovers, so a panel
    // showing stale text is replaced by the next attempt instead of waited on.
    await expect(locationPanel(page)).toHaveText(panelPattern(expected), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await leaveReadout(page);
  await expect(locationPanel(page)).toHaveCount(0);
}

// --- The panel's placement. ---

export interface PanelGeometry {
  viewportHeight: number;
  readout: { top: number; bottom: number };
  panel: { top: number; bottom: number; height: number };
  /** Every `.dr` row of the open panel, top to bottom. */
  rows: { top: number; bottom: number }[];
}

/** The open panel's and the readout's boxes, measured in one evaluation so they share a frame. */
export async function panelGeometry(page: Page): Promise<PanelGeometry> {
  return await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const panel = document.querySelector('[role="tooltip"]');
    const readout = document.querySelector("#mainhead .meta .loc");
    if (!panel || !readout) throw new Error("the panel or the readout is not in the page");
    return {
      viewportHeight: window.innerHeight,
      readout: box(readout),
      panel: box(panel),
      rows: [...panel.querySelectorAll(".dr")].map(box),
    };
  });
}
