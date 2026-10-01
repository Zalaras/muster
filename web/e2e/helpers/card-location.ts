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
import type {
  APIRequestContext,
  Locator,
  Page,
  ScratchDaemon,
  ScratchDaemonOptions,
} from "./fixtures";
import { rawUserPromptSubmit } from "./payloads";

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
   * as "no repo" rather than as a deleted directory (REQ-2). A rename leaves no such window;
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

// --- Locators. The rail card and the strip card share one template (helpers/terminal.ts
// `stripCard`), so every card locator here is scoped to its host. ---

/** A rail card (`#sessions`), never the Tiles strip's copy of the same session. */
export function railCardByTitle(page: Page, title: string): Locator {
  return page.locator("#sessions").getByTestId("session-card").filter({ hasText: title });
}

/** `.r2 .rf` — the folder line, `<repo> /` (the basename alone when `repo` is null). */
export function cardFolder(card: Locator): Locator {
  return card.locator(".r2 .rf");
}

/** `.r2 .rb` — the branch line, `<branch>` or `<branch> (worktree)`. */
export function cardBranch(card: Locator): Locator {
  return card.locator(".r2 .rb");
}

/** `.r2c` — the `↳` Claude-location block, hidden unless Claude is in another checkout. */
export function cardMoved(card: Locator): Locator {
  return card.locator(".r2c");
}

export function cardMovedFolder(card: Locator): Locator {
  return card.locator(".r2c .rf");
}

export function cardMovedBranch(card: Locator): Locator {
  return card.locator(".r2c .rb");
}

export function cardMovedLead(card: Locator): Locator {
  return card.locator(".r2c .lead");
}

/** `#mainhead .meta` — the Focus header's meta row. */
export function mainheadMeta(page: Page): Locator {
  return page.locator("#mainhead .meta");
}

/** `#mainhead .meta .loc` — the location group that carries the hover `title`. */
export function mainheadLoc(page: Page): Locator {
  return page.locator("#mainhead .meta .loc");
}

export function mainheadFolder(page: Page): Locator {
  return page.locator("#mainhead .meta .loc .repo .rf");
}

export function mainheadBranch(page: Page): Locator {
  return page.locator("#mainhead .meta .loc .repo .rb");
}

/** `#mainhead .meta .loc .claude-at` — hidden unless moved. */
export function mainheadClaudeAt(page: Page): Locator {
  return page.locator("#mainhead .meta .loc .claude-at");
}

/** `#mainhead .meta .model` — the masthead has its own `.model`; this one is scoped. */
export function mainheadModel(page: Page): Locator {
  return page.locator("#mainhead .meta .model");
}

/** `.thead .wh` — the tile header's one-line `<repo> / <branch>`. */
export function tileWhere(tile: Locator): Locator {
  return tile.locator(".thead .wh");
}

/** `.thead .wh-claude` — the bare `↳` glyph plus visually hidden `Claude is in <dir>`. */
export function tileMoved(tile: Locator): Locator {
  return tile.locator(".thead .wh-claude");
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

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
interface FitLine {
  name: string;
  box: Rect;
  block: Rect;
}
interface FitBlock {
  name: string;
  box: Rect;
  /** The block's computed `margin-right`: the room its trailing `.sep` is drawn in. */
  marginRight: number;
}
interface FitSnapshot {
  vw: number;
  vh: number;
  head: Rect;
  meta: Rect;
  loc: Rect;
  /** `.loc > .repo`, null when it has no box (hidden or absent). */
  repo: Rect | null;
  /** `--floor` (8ch) resolved to pixels in `.loc`'s own font. */
  floor: number;
  /** The repo block's widest line at its natural width: a folder line under the floor is
   * drawn whole at its own width rather than padded out to the floor. */
  repoNatural: number;
  blocks: FitBlock[];
  /** The title's `.rename` button: ellipsized when scrollWidth > clientWidth. */
  title: { scrollWidth: number; clientWidth: number } | null;
  model: Rect & { scrollWidth: number; clientWidth: number };
  seps: Rect[];
  lines: FitLine[];
  items: { name: string; box: Rect }[];
  buttons: { label: string; box: Rect }[];
}

const EPS = 0.5;
const span = (b: Rect) => `${b.left.toFixed(1)}-${b.right.toFixed(1)}`;
const xOverlap = (a: Rect, b: Rect) => a.left < b.right - EPS && b.left < a.right - EPS;
const yOverlap = (a: Rect, b: Rect) => a.top < b.bottom - EPS && b.top < a.bottom - EPS;
const inside = (inner: Rect, outer: Rect) =>
  inner.left >= outer.left - EPS && inner.right <= outer.right + EPS;

/** Reads the header's boxes as plain data (laid-out elements only; a `.sep` counts only if
 * its drawn glyph, not its zero-width box, is what is measured). */
async function readFitSnapshot(page: Page): Promise<FitSnapshot | null> {
  return await page.evaluate(() => {
    const one = (sel: string) => document.querySelector<HTMLElement>(sel);
    const rect = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const laidOut = (el: Element) => el.getClientRects().length > 0;
    const head = one("#mainhead");
    const meta = one("#mainhead .meta");
    const loc = one("#mainhead .meta .loc");
    const model = one("#mainhead .meta .model");
    const acts = one("#mainhead .acts");
    if (!head || !meta || !loc || !model || !acts) return null;

    const seps = [...loc.querySelectorAll<HTMLElement>(":scope > .sep")]
      .filter(laidOut)
      .map((sep) => {
        const range = document.createRange();
        range.selectNodeContents(sep);
        return rect(range as unknown as Element);
      });
    const blockEls = [
      ...loc.querySelectorAll<HTMLElement>(":scope > .repo, :scope > .claude-at"),
    ].filter(laidOut);
    const blocks = blockEls.map((block) => ({
      name: block.className,
      box: rect(block),
      marginRight: Number.parseFloat(getComputedStyle(block).marginRight) || 0,
    }));
    const repoEl = loc.querySelector<HTMLElement>(":scope > .repo");
    // `ch` only resolves inside an element with `.loc`'s font: measure 8ch with a throwaway
    // absolutely positioned probe (not a flex item, so it moves nothing) and remove it.
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;width:8ch;height:0";
    loc.appendChild(probe);
    const floor = probe.getBoundingClientRect().width;
    probe.remove();
    const titleEl = one("#mainhead .name .rename");
    const lines = blockEls.flatMap((block) =>
      [...block.querySelectorAll<HTMLElement>(".rf, .rb")].map((line) => ({
        name: `${block.className} ${line.className}`,
        box: rect(line),
        block: rect(block),
      })),
    );
    const items = [
      { name: "name", el: one("#mainhead .name") },
      { name: "model", el: model },
      { name: "surface switch", el: one("#mainhead .surfseg") },
      { name: "actions", el: acts },
    ]
      .filter((item): item is { name: string; el: HTMLElement } => !!item.el && laidOut(item.el))
      .map((item) => ({ name: item.name, box: rect(item.el) }));
    const buttons = [...acts.querySelectorAll<HTMLElement>("button")].map((button) => ({
      label: button.textContent?.trim() ?? "?",
      box: rect(button),
    }));
    return {
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      head: rect(head),
      meta: rect(meta),
      loc: rect(loc),
      repo: repoEl && laidOut(repoEl) ? rect(repoEl) : null,
      floor,
      repoNatural: Math.max(
        0,
        ...[...(repoEl?.querySelectorAll<HTMLElement>(".rf, .rb") ?? [])].map((l) => l.scrollWidth),
      ),
      blocks,
      title: titleEl
        ? { scrollWidth: titleEl.scrollWidth, clientWidth: titleEl.clientWidth }
        : null,
      model: {
        ...rect(model),
        scrollWidth: model.scrollWidth,
        clientWidth: model.clientWidth,
      },
      seps,
      lines,
      items,
      buttons,
    };
  });
}

function modelProblems(s: FitSnapshot): string[] {
  const out: string[] = [];
  if (s.model.scrollWidth > s.model.clientWidth) {
    out.push(
      `model clipped: scrollWidth ${s.model.scrollWidth} > clientWidth ${s.model.clientWidth}`,
    );
  }
  if (!inside(s.model, s.meta))
    out.push(`model ${span(s.model)} is not inside .meta ${span(s.meta)}`);
  if (s.model.right > s.vw + EPS)
    out.push(`model right ${s.model.right.toFixed(1)} is past ${s.vw}`);
  return out;
}

function lineProblems(s: FitSnapshot): string[] {
  const out: string[] = [];
  // A block that wrapped to the clipped second line is below `.loc`'s first line.
  const firstLine = (b: Rect) => yOverlap(b, s.loc);
  const visibleSeps = s.seps.filter(firstLine);
  for (const line of s.lines) {
    if (!inside(line.box, line.block)) {
      out.push(`${line.name} ${span(line.box)} extends past its block ${span(line.block)}`);
    }
    if (!inside(line.box, s.loc)) {
      out.push(`${line.name} ${span(line.box)} extends past .loc ${span(s.loc)}`);
    }
    if (!firstLine(line.box)) continue;
    if (xOverlap(line.box, s.model)) {
      out.push(`${line.name} ${span(line.box)} overlaps the model ${span(s.model)}`);
    }
    for (const sep of visibleSeps.filter((sep) => xOverlap(line.box, sep))) {
      out.push(`${line.name} ${span(line.box)} overlaps a .sep glyph ${span(sep)}`);
    }
  }
  return out;
}

/**
 * kb:adr/focus-mainhead-wraps-to-second-row-when-narrow (outcome B): a session that has a repo
 * always shows it, on `.loc`'s first (visible) line and at no less than its 8-character floor
 * (or its own natural width, when its lines are shorter than the floor).
 * Narrowing the window wraps the header, it never hides the repo block, so it can never come
 * back at a narrower width either.
 */
function repoProblems(s: FitSnapshot): string[] {
  if (!s.repo) return ["the repo block has no box"];
  const out: string[] = [];
  if (!yOverlap(s.repo, s.loc)) {
    out.push(
      `the repo block (top ${s.repo.top.toFixed(1)}) is below .loc's first line (${s.loc.top.toFixed(1)}-${s.loc.bottom.toFixed(1)}), clipped away`,
    );
  }
  if (!inside(s.repo, s.loc)) {
    out.push(`the repo block ${span(s.repo)} extends past .loc ${span(s.loc)}`);
  }
  const floor = Math.min(s.floor, s.repoNatural);
  if (s.repo.right - s.repo.left < floor - 1) {
    out.push(
      `the repo block is ${(s.repo.right - s.repo.left).toFixed(1)}px wide, under its ${floor.toFixed(1)}px floor`,
    );
  }
  return out;
}

/**
 * At every width `.loc` holds no more room than its visible blocks and their separators (1 px
 * tolerance): no room kept for a `↳` block that gave way, none for a folder line under the
 * floor, so the model follows the location text and a clipped title never sits beside blank.
 * Both sides are read in one snapshot, so a stale layout times out in the caller's poll instead
 * of passing.
 */
function blankProblems(s: FitSnapshot): string[] {
  const ellipsized = !!s.title && s.title.scrollWidth > s.title.clientWidth;
  const onFirstLine = s.blocks.filter((b) => yOverlap(b.box, s.loc));
  const used = onFirstLine.reduce(
    (edge, b) => Math.max(edge, b.box.right + b.marginRight),
    s.loc.left,
  );
  const blank = s.loc.right - used;
  if (blank <= 1) return [];
  return [
    `.loc ${span(s.loc)} is ${blank.toFixed(1)}px wider than its visible blocks and separators (ending at ${used.toFixed(1)})${ellipsized ? " while the title is ellipsized" : ""}`,
  ];
}

function chromeProblems(s: FitSnapshot): string[] {
  const out: string[] = [];
  for (const [i, a] of s.items.entries()) {
    for (const b of s.items.slice(i + 1)) {
      if (xOverlap(a.box, b.box) && yOverlap(a.box, b.box))
        out.push(`${a.name} and ${b.name} overlap`);
    }
  }
  for (const { label, box } of s.buttons) {
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    const onScreen =
      box.left >= -EPS && box.right <= s.vw + EPS && box.top >= -EPS && box.bottom <= s.vh + EPS;
    if (w <= 0 || h <= 0) out.push(`${label} has no box`);
    else if (!onScreen) out.push(`${label} ${span(box)} is outside the ${s.vw}x${s.vh} viewport`);
  }
  if (s.head.right > s.vw + EPS)
    out.push(`#mainhead right ${s.head.right.toFixed(1)} is past ${s.vw}`);
  return out;
}

/**
 * The Focus header's narrow-width invariants (kb:adr/focus-model-never-truncates-name-blocks-give-way,
 * kb:adr/focus-mainhead-wraps-to-second-row-when-narrow), read from the live layout. Returns one
 * line per violated invariant, so `expect.poll(...).toEqual([])` retries until layout settles and
 * prints what is wrong. Invariants, not breakpoints: the model whole and inside `.meta`; every
 * `.rf`/`.rb` box inside its block and inside `.loc`; no first-line `.rf`/`.rb` box overlapping a
 * visible `.sep` glyph or the model; the repo block on `.loc`'s first line at no less than its
 * floor (the session has a repo; kb:adr/focus-mainhead-wraps-to-second-row-when-narrow); `.loc`
 * no wider than its visible blocks and separators (1 px tolerance); no two header items
 * overlapping; End/Resume/Remove inside the viewport.
 */
export async function mainheadFitProblems(page: Page): Promise<string[]> {
  const snapshot = await readFitSnapshot(page);
  if (!snapshot) return ["a mainhead part is missing"];
  return [
    ...modelProblems(snapshot),
    ...lineProblems(snapshot),
    ...repoProblems(snapshot),
    ...blankProblems(snapshot),
    ...chromeProblems(snapshot),
  ];
}

/**
 * Whether the Focus header's title is ellipsized right now. A width test that relies on
 * `mainheadFitProblems`' blank-`.loc` check reads this too, so it can prove the title really was
 * clipped there and the check was not vacuously true.
 */
export async function mainheadTitleEllipsized(page: Page): Promise<boolean> {
  const snapshot = await readFitSnapshot(page);
  return !!snapshot?.title && snapshot.title.scrollWidth > snapshot.title.clientWidth;
}
