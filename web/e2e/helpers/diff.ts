// Helpers for plan diff-viewer: scratch git checkouts with known changes, the diff viewer's
// locators and the read-only oracles the journeys cross-check the display against.
//
// Claude Code is faked and, here, barely involved: the diff has no Claude Code source at all
// (the daemon reads git, the dashboard polls the daemon), so a session is launched through the
// real `POST /api/sessions` and bound with the measured `SessionStart` builder from
// helpers/payloads.ts, and every change under review is real `git` or a real file write in a
// scratch checkout. Comments and ticks have no Claude Code source either; the endpoints that
// store them are driven through the UI, and `PUT …/diff/comments/{id}` is used only to build a
// starting state, never as the evidence for a journey (the shape is the plan's protocol
// contract, not a captured wire format).
//
// Locators follow the plan's Testable UI Elements table where it pins a role and name. Where it
// does not (a file section, a line row, a line number) they are flexible: text first, the
// geometry of the hovered row second.
import { execFile } from "node:child_process";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { APIRequestContext, ScratchDaemon } from "./fixtures";
import { git, type ScratchRepo, scratchRepo } from "./card-location";
import { envelopedSessionStart } from "./payloads";
import { envelopeOpts, launchSession, type SessionObject } from "./session";

const execFileAsync = promisify(execFile);

/** U+2212, the minus the plan's button and summary text use. */
export const MINUS = "−";

// ── Expected text ───────────────────────────────────────────────────────────────────────

export interface Counts {
  files: number;
  additions: number;
  deletions: number;
}

function plural(n: number): string {
  return n === 1 ? "file" : "files";
}

/** `8 files +51 −9` (single spaces, U+2212). */
export function countsText(c: Counts): string {
  return `${c.files} ${plural(c.files)} +${c.additions} ${MINUS}${c.deletions}`;
}

/**
 * The diff button's exact accessible name per the plan's "The diff button's text": an optional
 * `branch`, the counts, `💬 n` while comments are open, then the action — joined by ` · `.
 */
export function buttonText(o: {
  counts?: Counts;
  branch?: boolean;
  comments?: number;
  open?: boolean;
}): string {
  const parts: string[] = [];
  if (o.branch) parts.push("branch");
  if (o.counts) parts.push(countsText(o.counts));
  if (o.comments && o.comments > 0) parts.push(`💬 ${o.comments}`);
  parts.push(o.open ? "Close diff ×" : "View diff ›");
  return parts.join(" · ");
}

/** The toolbar summary: `<n> files · +<a> −<d> · against <base>`. */
export function summaryText(c: Counts, base: string): string {
  return `${c.files} ${plural(c.files)} · +${c.additions} ${MINUS}${c.deletions} · against ${base}`;
}

export function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Scratch checkouts ───────────────────────────────────────────────────────────────────

/** Writes `rel` under the checkout, creating its directory. */
export async function writeIn(
  repo: { path: string },
  rel: string,
  content: string | Uint8Array,
): Promise<void> {
  const abs = join(repo.path, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

export async function removeIn(repo: { path: string }, rel: string): Promise<void> {
  await rm(join(repo.path, rel), { force: true });
}

function numbered(prefix: string, n: number, width = 2): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix} ${String(i + 1).padStart(width, "0")}`);
}

function text(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

/** `src/app.txt`: 30 lines `app line NN`, with `edits` (1-based line -> replacement) applied. */
export function appText(edits: Record<number, string> = {}): string {
  return text(numbered("app line", 30).map((line, i) => edits[i + 1] ?? line));
}

export const APP_PATH = "src/app.txt";
export const OLD_NAME = "src/old-name.txt";
export const NEW_NAME = "src/new-name.txt";
export const GONE_PATH = "docs/gone.txt";
export const FRESH_PATH = "src/fresh.txt";
export const BLOB_PATH = "blob.bin";
export const COMMITTED_PATH = "src/committed.txt";

const OLD_NAME_LINES = ["old one", "old two", "old three", "old four", "old five"];
const GONE_LINES = ["gone one", "gone two", "gone three", "gone four"];
const FRESH_LINES = ["fresh alpha", "fresh beta", "fresh gamma"];
const COMMITTED_LINES = ["committed one", "committed two"];

async function commitAll(repo: ScratchRepo, message: string): Promise<void> {
  await git(repo.path, "add", "-A");
  await git(repo.path, "commit", "-m", message);
}

/** A checkout on `main` with a base commit and a clean working tree. */
export async function cleanRepo(): Promise<ScratchRepo> {
  const repo = await scratchRepo();
  await writeIn(repo, "README.md", "# fixture\n\nA scratch checkout for the diff viewer.\n");
  await writeIn(repo, APP_PATH, appText());
  await writeIn(repo, OLD_NAME, text(OLD_NAME_LINES));
  await writeIn(repo, GONE_PATH, text(GONE_LINES));
  await commitAll(repo, "base");
  return repo;
}

/** `cleanRepo` plus a branch `feature` carrying one commit since `main`. */
export async function branchOnlyRepo(): Promise<ScratchRepo> {
  const repo = await cleanRepo();
  await git(repo.path, "checkout", "-b", "feature");
  await writeIn(repo, COMMITTED_PATH, text(COMMITTED_LINES));
  await commitAll(repo, "feature work");
  return repo;
}

/** What `standardRepo` leaves in the working tree and the branch, by scope. */
export const STANDARD: { uncommitted: Counts; branch: Counts } = {
  // app.txt +1 −1, fresh.txt +3, gone.txt −4, the rename 0/0, blob.bin 0/0.
  uncommitted: { files: 5, additions: 4, deletions: 5 },
  // …plus committed.txt (+2) which only the branch scope shows.
  branch: { files: 6, additions: 6, deletions: 5 },
};

/**
 * One of each kind of change on branch `feature` (a commit since `main` and, uncommitted: a
 * modified file, an untracked added file, a deleted file, a staged `git mv` rename and an
 * untracked binary file).
 */
export async function standardRepo(): Promise<ScratchRepo> {
  const repo = await branchOnlyRepo();
  await writeIn(repo, APP_PATH, appText({ 3: "app line 03 EDITED" }));
  await writeIn(repo, FRESH_PATH, text(FRESH_LINES));
  await removeIn(repo, GONE_PATH);
  await git(repo.path, "mv", OLD_NAME, NEW_NAME);
  await writeIn(repo, BLOB_PATH, Uint8Array.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x10]));
  return repo;
}

export const REVIEW_PATH = "review.txt";
export const REVIEW_LINES = [
  "alpha one",
  "bravo two",
  "charlie three",
  "delta four",
  "echo five",
  "foxtrot six",
  "golf seven",
  "hotel eight",
];
export const REVIEW_COUNTS: Counts = { files: 1, additions: 8, deletions: 0 };

/**
 * A checkout whose only change is the untracked `review.txt` of eight distinct all-added lines:
 * its new line numbers are unique on screen, so a line number and a line's text each identify one
 * row. The base for every comment journey.
 */
export async function commentRepo(): Promise<ScratchRepo> {
  const repo = await cleanRepo();
  await writeIn(repo, REVIEW_PATH, text(REVIEW_LINES));
  return repo;
}

export const TICK_EDITS: Record<number, string> = {
  3: "app line 03 EDITED",
  15: "app line 15 EDITED",
  27: "app line 27 EDITED",
};
export const TICK_COUNTS: Counts = { files: 1, additions: 3, deletions: 3 };

/** `src/app.txt` edited in three places far enough apart to be three separate changes. */
export async function tickRepo(): Promise<ScratchRepo> {
  const repo = await cleanRepo();
  await writeIn(repo, APP_PATH, appText(TICK_EDITS));
  return repo;
}

export const BIG_PATH = "src/big.txt";

function bigText(altered: boolean): string {
  const lines = numbered("big line", 400, 3);
  if (!altered) return text(lines);
  const blocks = [20, 120, 220, 320];
  return text(
    lines.map((line, i) => {
      const n = i + 1;
      return blocks.some((start) => n >= start && n < start + 40) ? `${line} altered` : line;
    }),
  );
}

export const BIG_COUNTS: Counts = { files: 1, additions: 160, deletions: 160 };

/** A 400-line file with four 40-line changes, so Review overflows the viewer and scrolls. */
export async function bigRepo(): Promise<ScratchRepo> {
  const repo = await scratchRepo();
  await writeIn(repo, BIG_PATH, bigText(false));
  await commitAll(repo, "base");
  await writeIn(repo, BIG_PATH, bigText(true));
  return repo;
}

/**
 * A second checkout of `repo`'s repository outside its directory — what Claude's
 * `EnterWorktree` makes, minus the nesting that would put it in the launch checkout's own
 * untracked files. Returns the symlink-resolved path (the spelling Claude reports).
 */
export async function siblingWorktree(
  repo: ScratchRepo,
  name: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const target = `${repo.path}-wt-${name}`;
  await git(repo.path, "worktree", "add", "-b", `wt-${name}`, target);
  return {
    path: await realpath(target),
    cleanup: async () => {
      await rm(target, { recursive: true, force: true });
    },
  };
}

export async function shortSha(repo: ScratchRepo, rev: string): Promise<string> {
  return await git(repo.path, "rev-parse", "--short", rev);
}

/** `HEAD (<sha>)` — what `Uncommitted` states it compares against. */
export async function headBase(repo: ScratchRepo): Promise<string> {
  return `HEAD (${await shortSha(repo, "HEAD")})`;
}

/** `main @ <sha of the merge base>` — what `Branch` compares against on a feature branch. */
export async function mainBase(repo: ScratchRepo): Promise<string> {
  const mergeBase = await git(repo.path, "merge-base", "main", "HEAD");
  return `main @ ${await shortSha(repo, mergeBase)}`;
}

// ── Sessions ────────────────────────────────────────────────────────────────────────────

/**
 * Launches a session whose launch directory is `repo` and binds it with the enveloped
 * `SessionStart` a real `claude` posts first (cwd = the launch directory). The page must
 * already be on the dashboard: the launch endpoint needs its cookie. The Claude id is
 * `claude-<title>`.
 */
export async function launchBoundDiff(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  repo: { path: string },
  title: string,
): Promise<SessionObject> {
  const session = await launchSession(page, daemon, { directory: repo.path, title });
  const res = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(`claude-${title}`, {
      ...(await envelopeOpts(session, daemon)),
      cwd: repo.path,
    }),
  });
  expect(res.status()).toBe(200);
  return session;
}

/** `POST /api/sessions/{id}/end`, through the page's cookie. */
export async function endSession(page: Page, daemon: ScratchDaemon, id: number): Promise<void> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions/${id}/end`);
  expect(res.status()).toBe(200);
}

// ── Daemon-side oracles (the plan's protocol contract) ──────────────────────────────────

export interface ScopeCounts extends Counts {
  fingerprint: string;
}

export interface DiffSummary {
  repo: boolean;
  uncommitted: ScopeCounts;
  branch: ScopeCounts;
  openComments: number;
}

export interface DiffFileBody {
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  binary: boolean;
  additions: number;
  deletions: number;
}

export interface DiffBody {
  scope: string;
  base: string;
  fingerprint: string;
  files: DiffFileBody[];
}

export interface ReviewComment {
  id: string;
  path: string;
  start: { side: "old" | "new"; line: number };
  end: { side: "old" | "new"; line: number };
  quote: string[];
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface DiffReview {
  comments: ReviewComment[];
  ticks: string[];
}

async function getJson<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url);
  if (res.status() !== 200)
    throw new Error(`GET ${url} failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function getDiffSummary(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<DiffSummary> {
  return await getJson<DiffSummary>(page, `${daemon.baseURL}/api/sessions/${id}/diff/summary`);
}

export async function getDiffBody(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
  scope: "uncommitted" | "branch",
): Promise<DiffBody> {
  return await getJson<DiffBody>(page, `${daemon.baseURL}/api/sessions/${id}/diff?scope=${scope}`);
}

export async function getReview(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<DiffReview> {
  return await getJson<DiffReview>(page, `${daemon.baseURL}/api/sessions/${id}/diff/review`);
}

export interface SeedComment {
  id: string;
  path: string;
  line: number;
  endLine?: number;
  quote: string[];
  body: string;
  resolved?: boolean;
}

/** Builds a starting state: one comment on new-side lines, through the real write endpoint. */
export async function seedComment(
  page: Page,
  daemon: ScratchDaemon,
  sessionId: number,
  c: SeedComment,
): Promise<void> {
  const res = await page.request.put(
    `${daemon.baseURL}/api/sessions/${sessionId}/diff/comments/${c.id}`,
    {
      data: {
        path: c.path,
        start: { side: "new", line: c.line },
        end: { side: "new", line: c.endLine ?? c.line },
        quote: c.quote,
        body: c.body,
        resolved: c.resolved ?? false,
      },
    },
  );
  if (res.status() !== 204)
    throw new Error(`comment PUT failed: ${res.status()} ${await res.text()}`);
}

async function sqlite(daemon: ScratchDaemon, sql: string): Promise<Array<Record<string, unknown>>> {
  const { stdout } = await execFileAsync("sqlite3", ["-json", "-readonly", daemon.dbPath, sql]);
  const trimmed = stdout.trim();
  return trimmed ? (JSON.parse(trimmed) as Array<Record<string, unknown>>) : [];
}

/** How many session rows carry a stored review (`session.diff_review`, migration 0021). */
export async function storedReviewCount(daemon: ScratchDaemon): Promise<number> {
  const rows = await sqlite(
    daemon,
    "SELECT COUNT(*) AS n FROM session WHERE diff_review IS NOT NULL;",
  );
  return Number(rows[0]?.n ?? 0);
}

/** How many session rows have this id. */
export async function sessionRowCount(daemon: ScratchDaemon, id: number): Promise<number> {
  const rows = await sqlite(daemon, `SELECT COUNT(*) AS n FROM session WHERE id = ${Number(id)};`);
  return Number(rows[0]?.n ?? 0);
}

// ── What the dashboard asks the daemon ──────────────────────────────────────────────────

/**
 * Counts the dashboard's `GET /api/sessions/{id}/diff/summary` requests and answers per
 * session. Construct it before the page navigates: `page.on("request")` sees only what follows.
 */
export class SummaryPolls {
  private readonly requests = new Map<number, number>();
  private readonly answers = new Map<number, number>();

  constructor(page: Page) {
    page.on("request", (req) => {
      const id = SummaryPolls.sessionOf(req.url());
      if (id !== null) this.requests.set(id, (this.requests.get(id) ?? 0) + 1);
    });
    page.on("response", (res) => {
      const id = SummaryPolls.sessionOf(res.url());
      if (id !== null && res.status() === 200)
        this.answers.set(id, (this.answers.get(id) ?? 0) + 1);
    });
  }

  private static sessionOf(url: string): number | null {
    const m = /^\/api\/sessions\/(\d+)\/diff\/summary$/.exec(new URL(url).pathname);
    return m?.[1] ? Number(m[1]) : null;
  }

  requested(id: number): number {
    return this.requests.get(id) ?? 0;
  }

  answered(id: number): number {
    return this.answers.get(id) ?? 0;
  }

  totalRequested(): number {
    let n = 0;
    for (const v of this.requests.values()) n += v;
    return n;
  }
}

// ── Locators ────────────────────────────────────────────────────────────────────────────

/** The button in any state: the table's name pattern. */
export function anyDiffButton(page: Page): Locator {
  return page.getByRole("button", {
    name: /^(branch · )?(\d+ files? \+\d+ −\d+ · )?(💬 \d+ · )?(View diff ›|Close diff ×)$/,
  });
}

/** The button with its exact text (see `buttonText`). */
export function diffButton(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

export function openDiffButton(page: Page): Locator {
  return page.getByRole("button", { name: /View diff ›$/ });
}

export function closeDiffButton(page: Page): Locator {
  return page.getByRole("button", { name: /Close diff ×$/ });
}

export function viewer(page: Page): Locator {
  return page.getByRole("region", { name: "Diff", exact: true });
}

export function closeViewerButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Close diff viewer" });
}

export function scopeButton(page: Page, scope: "Uncommitted" | "Branch"): Locator {
  return viewer(page).getByRole("button", { name: scope, exact: true });
}

export function viewButton(page: Page, view: "Unified" | "Split" | "Review"): Locator {
  return viewer(page).getByRole("button", { name: view, exact: true });
}

export function toolbarSummary(page: Page): Locator {
  return viewer(page).getByText(/^\d+ files? · \+\d+ −\d+ · against .+$/);
}

/** The toolbar's Refresh; with the changed bar showing there are two, the toolbar's first. */
export function toolbarRefresh(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Refresh", exact: true }).first();
}

export function changedBar(page: Page): Locator {
  return viewer(page)
    .getByRole("status")
    .filter({ hasText: "This diff has changed since you opened it" });
}

export function barRefresh(page: Page): Locator {
  return changedBar(page).getByRole("button", { name: "Refresh", exact: true });
}

/** The exact bar text for `what` (`1 new file, 1 file changed`); the button's label joins with no gap. */
export function barText(what: string): RegExp {
  return new RegExp(`^This diff has changed since you opened it — ${escapeRe(what)}\\s*Refresh$`);
}

/** A file's fold control: the one button naming the path that carries `aria-expanded`. */
export function fileFold(page: Page, pathOrRename: string | RegExp): Locator {
  return viewer(page).locator("button[aria-expanded]").filter({ hasText: pathOrRename });
}

export function allFileFolds(page: Page): Locator {
  return viewer(page)
    .locator("button[aria-expanded]")
    .filter({ hasNotText: /^✓ Resolved/ });
}

/** The header of a file section: the fold control's parent, where its counts sit. */
export function fileHeader(page: Page, pathOrRename: string | RegExp): Locator {
  return fileFold(page, pathOrRename).locator("xpath=..");
}

export function filesTab(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Files", exact: true });
}

export function commentsTab(page: Page, n?: number): Locator {
  return viewer(page).getByRole("button", {
    name: n === undefined ? /^Comments \(\d+\)$/ : `Comments (${n})`,
    exact: n !== undefined,
  });
}

export function progress(page: Page): Locator {
  return viewer(page).getByText(/^\d+ \/ \d+ changes reviewed$/);
}

export function resetButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Reset", exact: true });
}

export function changeTicks(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Mark change reviewed" });
}

export function foldedChanges(page: Page): Locator {
  return viewer(page).getByRole("button", { name: /^✓ reviewed · \+\d+ −\d+$/ });
}

/** A file's tick box on its header (the first match: the body precedes the side panel). */
export function headerFileTick(page: Page, path: string): Locator {
  return viewer(page)
    .getByRole("checkbox", { name: `Mark ${path} reviewed` })
    .first();
}

export function filesRowFileTick(page: Page, path: string): Locator {
  return viewer(page)
    .getByRole("checkbox", { name: `Mark ${path} reviewed` })
    .last();
}

export function afterLabels(page: Page): Locator {
  return viewer(page).getByText("after", { exact: true });
}

export function beforeLabels(page: Page): Locator {
  return viewer(page).getByText("before", { exact: true });
}

/** A displayed line of code (all-added fixture lines are unique on screen). */
export function lineRow(page: Page, lineText: string): Locator {
  return viewer(page).getByText(lineText, { exact: true });
}

/** A line number cell; unique on screen in `commentRepo`'s all-added file in Unified. */
export function lineNumber(page: Page, n: number): Locator {
  return viewer(page).getByText(String(n), { exact: true });
}

export function commentBoxHeading(page: Page, lines: string): Locator {
  return viewer(page).getByText(`Commenting on ${lines}`, { exact: true });
}

export function commentField(page: Page): Locator {
  return viewer(page).getByRole("textbox", { name: "Comment" });
}

export function saveButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Save", exact: true });
}

export function cancelButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Cancel", exact: true });
}

export const SAVE_FAILURE = "Not saved, musterd unreachable";

/** A saved comment's heading (`Line 4`, `Lines 2–4`). */
export function cardHeading(page: Page, lines: string): Locator {
  return viewer(page).getByText(lines, { exact: true });
}

export function editButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Edit", exact: true });
}

export function resolveButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Resolve", exact: true });
}

export function reopenButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Reopen", exact: true });
}

export function deleteButton(page: Page): Locator {
  return viewer(page).getByRole("button", { name: "Delete", exact: true });
}

export function resolvedRow(page: Page): Locator {
  return viewer(page).getByRole("button", { name: /^✓ Resolved · Lines? \d+(–\d+)? · / });
}

/** A Comments-list entry for `path` (`review.txt:4`, then the quote and the comment). */
export function listEntry(page: Page, path: string): Locator {
  return viewer(page).getByRole("button", { name: new RegExp(`^${escapeRe(path)}:\\d+(–\\d+)?`) });
}

/**
 * The `+` of the row showing `rowText`, found by hovering the row and taking the visible
 * `Comment on line n` button whose box lies on that row — several share a name across files.
 */
export async function hoverRowPlus(page: Page, rowText: string): Promise<Locator> {
  const row = lineRow(page, rowText);
  await row.hover();
  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error(`row "${rowText}" has no box`);
  const pluses = viewer(page).getByRole("button", { name: /^Comment on line \d+$/ });
  const n = await pluses.count();
  for (let i = 0; i < n; i++) {
    const box = await pluses.nth(i).boundingBox();
    if (!box) continue;
    const mid = box.y + box.height / 2;
    if (mid >= rowBox.y && mid <= rowBox.y + rowBox.height) return pluses.nth(i);
  }
  throw new Error(`no "Comment on line n" button on the hovered row "${rowText}"`);
}

/** Hover a row, click its `+`, type and save: one comment through the keyboard and pointer a developer has. */
export async function commentOnRow(page: Page, rowText: string, body: string): Promise<void> {
  const plus = await hoverRowPlus(page, rowText);
  await plus.click();
  await commentField(page).click();
  await page.keyboard.type(body);
  await saveButton(page).click();
}

/** Press on a row's `+` and drag to another row's text with the real pointer. */
export async function dragFromPlus(page: Page, fromText: string, toText: string): Promise<void> {
  const plus = await hoverRowPlus(page, fromText);
  const plusBox = await plus.boundingBox();
  const targetBox = await lineRow(page, toText).boundingBox();
  if (!plusBox || !targetBox) throw new Error("drag endpoints have no box");
  await page.mouse.move(plusBox.x + plusBox.width / 2, plusBox.y + plusBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}

// ── Journeys ────────────────────────────────────────────────────────────────────────────

/** Clicks the button and waits for the viewer to have read its diff. */
export async function openDiff(page: Page): Promise<void> {
  await openDiffButton(page).click();
  await expect(viewer(page)).toBeVisible();
  await expect(toolbarSummary(page)).toBeVisible();
}

/** The viewer's visible text with whitespace collapsed — the lines on screen, bar included. */
export async function viewerText(page: Page): Promise<string> {
  return (await viewer(page).innerText()).replace(/\s+/g, " ").trim();
}

/** `viewerText` with the changed bar's own text removed: the shown lines and nothing else. */
export async function shownLines(page: Page): Promise<string> {
  const bar = changedBar(page);
  const full = await viewerText(page);
  if ((await bar.count()) === 0) return full;
  const barOwn = (await bar.innerText()).replace(/\s+/g, " ").trim();
  return full.replace(barOwn, "").replace(/\s+/g, " ").trim();
}

/** Runs `run` in a second browser window of the same daemon (its own context: its own storage). */
export async function inSecondWindow(
  browser: Browser,
  daemon: ScratchDaemon,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(daemon.dashboardUrl);
    await run(page);
  } finally {
    await context.close();
  }
}

/**
 * Proves a saved change is kept: `check` must hold after a reload, after a daemon restart and a
 * reload, and in a second window — each opening the viewer afresh (a viewer is per tab).
 */
export async function expectKeptEverywhere(
  page: Page,
  browser: Browser,
  daemon: ScratchDaemon,
  check: (page: Page) => Promise<void>,
): Promise<void> {
  await page.reload();
  await openDiff(page);
  await check(page);

  await daemon.restart();
  await page.reload();
  await openDiff(page);
  await check(page);

  await inSecondWindow(browser, daemon, async (other) => {
    await openDiff(other);
    await check(other);
  });
}

// ── Terminal fit (REQ-22) ───────────────────────────────────────────────────────────────

/**
 * What is wrong with the live terminal's fit right now: a page scrollbar, a last row cut off
 * by its container, or the container running under the diff button. Empty when fine.
 */
export async function terminalFitProblems(page: Page, ariaLabel: string): Promise<string[]> {
  return await page.evaluate((label) => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollHeight > window.innerHeight + 1) {
      problems.push(`page scrolls: ${root.scrollHeight} > ${window.innerHeight}`);
    }
    const region = document.querySelector(`[aria-label="${label}"]`);
    if (!region) return [`no region ${label}`];
    const regionBox = region.getBoundingClientRect();
    const screen = region.querySelector(".xterm-screen");
    if (screen && screen.getBoundingClientRect().bottom > regionBox.bottom + 1) {
      problems.push("the last terminal row is clipped by its container");
    }
    const button = [...document.querySelectorAll("button")].find((b) =>
      /(View diff ›|Close diff ×)$/.test(b.textContent?.trim() ?? ""),
    );
    if (button && regionBox.bottom > button.getBoundingClientRect().top + 1) {
      problems.push("the terminal runs under the diff button");
    }
    return problems;
  }, ariaLabel);
}
