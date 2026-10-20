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
import { type APIRequestContext, expect, type Page, type ScratchDaemon } from "./fixtures";
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

// The header's `+N` suffix, its drawing oracle and the location panel's locator, hover
// path, text pattern and placement geometry are pure DOM and live in the render tier's
// helper (web/render/helpers/added-dirs.ts, where the panel's display properties
// re-levelled on 2026-10-20 read them); the journeys here reach them through this
// re-export.
export {
  addedCountSuffix,
  ANCHOR_GAP,
  EDGE_GAP,
  escapeRegExp,
  expectLocationPanel,
  folderLineEndingInPlus,
  headerFolderLine,
  hoverReadout,
  leaveReadout,
  locationPanel,
  nameEllipsized,
  type PanelExpectation,
  type PanelGeometry,
  panelGeometry,
  panelPattern,
  type PanelRow,
  suffixProblems,
} from "../../render/helpers/added-dirs";
