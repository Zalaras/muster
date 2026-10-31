// Helpers for plan stale-dirs-models-branches: scratch git checkouts the card's
// `repo / branch` readout can follow, the `↳` where-Claude-is blocks on the rail card,
// the Focus header and the tile header, and the hook posts that move Claude's reported
// working directory.
//
// Claude Code is faked: a move is a main-agent hook whose common `cwd` names another
// checkout (kb:fact/hook-payload-fields, kb:fact/cwd-follows-claude-mid-session,
// kb:fact/enter-worktree-moves-project-dir). The branch itself is moved by running real
// `git` in the scratch repo, because the daemon reads it from the checkout, not from a hook.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { APIRequestContext, ScratchDaemon, ScratchDaemonOptions } from "./fixtures";
import { rawUserPromptSubmit } from "./payloads";

// The DOM side — card, Focus-header and tile locators, and the header's fit oracles — is
// pure layout and lives in the render tier's helper; the journeys here reach it through
// this re-export so a locator is written once for both tiers.
export {
  cardBranch,
  cardFolder,
  cardMoved,
  cardMovedBranch,
  cardMovedFolder,
  cardMovedLead,
  mainheadBranch,
  mainheadClaudeAt,
  mainheadFitProblems,
  mainheadFolder,
  mainheadLoc,
  mainheadMeta,
  mainheadModel,
  mainheadTitleEllipsized,
  railCardByTitle,
  tileMoved,
  tileWhere,
} from "../../render/helpers/card-location";

const execFileAsync = promisify(execFile);

/** Every git call carries the identity per command — never `git config user.*`
 * (CLAUDE.md hard rule: worktrees share `.git/config`). */
const IDENTITY = ["-c", "user.name=bob", "-c", "user.email=bob@example.com"];

/** Runs real `git` in `cwd` and returns trimmed stdout. */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...IDENTITY, ...args], {
    cwd,
  });
  return stdout.trim();
}

export interface ScratchRepo {
  /** The launch directory, symlinks resolved (macOS tmpdir is `/var/…` -> `/private/var/…`). */
  path: string;
  /** `basename(path)` — what the daemon shows as `repo.name`. */
  name: string;
  /**
   * Removes the launch directory in one step. `rm -rf` is not atomic: a poll tick that lands
   * mid-removal finds a directory that still exists but is no longer a checkout, which reads
   * as "no repo" rather than as a deleted directory. A rename leaves no such window;
   * `cleanup` still removes what is left.
   */
  vanish: () => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * A scratch git checkout on `main` with one empty commit — the commit matters: an unborn
 * branch resolves to nothing (`rev-parse --abbrev-ref HEAD` errors), so the card would show
 * no branch at all. `folderName` makes the checkout's own folder that name (the long-name
 * tests), inside a fresh parent so the name is exactly what the test asked for.
 */
export async function scratchRepo(folderName?: string): Promise<ScratchRepo> {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "muster-e2e-loc-")));
  const path = folderName === undefined ? parent : join(parent, folderName);
  if (folderName !== undefined) await mkdir(path);
  await git(path, "init", "-b", "main");
  await git(path, "commit", "--allow-empty", "-m", "init");
  const vanished = `${parent}-vanished`;
  return {
    path,
    name: folderName ?? parent.slice(parent.lastIndexOf("/") + 1),
    vanish: async () => {
      await rename(parent, vanished);
    },
    cleanup: async () => {
      await rm(parent, { recursive: true, force: true });
      await rm(vanished, { recursive: true, force: true });
    },
  };
}

/** A scratch directory that is not inside any git checkout, symlinks resolved. */
export async function scratchPlainDir(): Promise<ScratchRepo> {
  const path = await realpath(await mkdtemp(join(tmpdir(), "muster-e2e-plain-")));
  const vanished = `${path}-vanished`;
  return {
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    vanish: async () => {
      await rename(path, vanished);
    },
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
      await rm(vanished, { recursive: true, force: true });
    },
  };
}

/**
 * `git worktree add -b worktree-<name> <repo>/.claude/worktrees/<name>` — the checkout
 * Claude's `EnterWorktree` makes (kb:fact/enter-worktree-moves-project-dir): inside the
 * launch path, yet its own top level. Returns the symlink-resolved worktree path, the
 * spelling Claude reports and the daemon resolves to.
 */
export async function addClaudeWorktree(
  repo: ScratchRepo,
  name: string,
): Promise<{ path: string; name: string; branch: string }> {
  const target = join(repo.path, ".claude", "worktrees", name);
  const branch = `worktree-${name}`;
  await mkdir(join(repo.path, ".claude", "worktrees"), { recursive: true });
  await git(repo.path, "worktree", "add", "-b", branch, target);
  return { path: await realpath(target), name, branch };
}

/** A subdirectory of the launch checkout — a `cd sub` stays in the same checkout. */
export async function addSubdirectory(repo: ScratchRepo, name: string): Promise<string> {
  const path = join(repo.path, name);
  await mkdir(path, { recursive: true });
  return await realpath(path);
}

/**
 * The scratch daemon every location spec starts: a short `-repo-poll` so a checkout shows
 * well inside the 15 s expect timeout (the daemon's own default is 5 s). `repoPoll`
 * overrides it, e.g. `"0"` for the timer-disabled run.
 */
export async function startLocationDaemon(
  startDaemon: (opts?: ScratchDaemonOptions) => Promise<ScratchDaemon>,
  repoPoll = "200ms",
): Promise<ScratchDaemon> {
  return await startDaemon({ repoPoll });
}

/**
 * Posts main-agent hooks that each carry `cwd` — the move report. Every call is a
 * `UserPromptSubmit` on a fresh `prompt_id`, so the straggler guard never discards it as
 * a late event for a closed turn (kb:adr/lifecycle-prompt-ordering-guards).
 */
export function hookMover(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  claudeSessionId: string,
): (cwd: string) => Promise<void> {
  let n = 0;
  return async (cwd: string) => {
    n += 1;
    const res = await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeSessionId, {
        promptId: `move-${n}`,
        cwd,
      }),
    });
    if (res.status() !== 200) throw new Error(`hook post failed: ${res.status()}`);
  };
}

/** The hover text of the plan's UI Specifications, lines joined with `\n`. */
export function hoverLines(opts: {
  repo: string;
  branch: string;
  directory: string;
  movedTo?: { directory: string; branch?: string };
}): string {
  const lines = [`${opts.repo} / ${opts.branch}`, opts.directory];
  if (opts.movedTo) {
    lines.push(`Claude is in ${opts.movedTo.directory}`);
    if (opts.movedTo.branch !== undefined) lines.push(`on ${opts.movedTo.branch}`);
  }
  return lines.join("\n");
}
