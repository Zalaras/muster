// Reader helpers for the markdown-viewing E2E suite (plan markdown-viewing).
//
// Locators below are transcribed from the plan's Testable UI Elements table and Reader
// DOM sketch (docs/design/mockups/markdown-viewing/): a folder/file tree entry's caret,
// count and changed-dot are all `aria-hidden`, so a button's accessible name is exactly
// its own name — `getByRole` needs no extra disambiguation beyond that. `readerRegion`
// mirrors `helpers/terminal.ts`'s `terminalRegion` (page-wide, by title); use
// `readerRegionInTile` instead whenever two live tiles might coincidentally share a
// title (mirrors `liveTileById`'s rationale for every other tile-scoped locator here).
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { liveTileById } from "./terminal";

// ── Locators ────────────────────────────────────────────────────────────────────────────

/** The reader region for a session, by its display title (`aria-label="Reader: <title>"`,
 * Testable UI Elements; "untitled" when the title is null). Page-wide — use only when at
 * most one host renders this session's reader (Focus, or a pop-out alone); for Tiles use
 * `readerRegionInTile`. */
export function readerRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Reader: ${title}"]`);
}

/** The reader region scoped to one tile by session id, mirroring `liveTileById`'s
 * disambiguation rationale (two tiles can share a title). */
export function readerRegionInTile(page: Page, id: number): Locator {
  return liveTileById(page, id).locator(".reader");
}

export function docBar(region: Locator): Locator {
  return region.locator(".docbar");
}

/** Present only while the plan is open (REQ-4). */
export function barPlanBadge(region: Locator): Locator {
  return docBar(region).locator(".badge");
}

export function barFileName(region: Locator): Locator {
  return docBar(region).locator(".fname");
}

/** Absent in `.reader.compact` (REQ-15). */
export function barPath(region: Locator): Locator {
  return docBar(region).locator(".path");
}

/** Absent until a write hook is seen this daemon lifetime (REQ-24) — assert
 * `.toHaveCount(0)` for "no cue yet", never a visibility check. */
export function freshnessCue(region: Locator): Locator {
  return docBar(region).locator(".chg");
}

export function popOutLink(region: Locator): Locator {
  return docBar(region).getByRole("link", { name: "pop out ↗" });
}

/** The single nav-toggle button (plan markdown-render-fixes REQ-1..REQ-3): last child of
 * `.docbar`, present and unhidden in every state, `aria-label="File explorer"` throughout
 * — its glyph (`›`/`‹`) and `aria-expanded` track the nav's own open/collapsed state, so
 * this one locator covers both; there is no longer a second, hidden counterpart to
 * disambiguate against. Replaces `navArrowHide`/`navArrowShow`/`navArrowOpenNode`/
 * `navArrowCollapsedNode` from the markdown-viewing suite, which assumed the two-button
 * pair this plan deletes. */
export function navToggle(region: Locator): Locator {
  return docBar(region).getByRole("button", { name: "File explorer" });
}

/** The reader's own `role="status"` line — the only one inside `.reader` (States). */
export function readerStatusLine(region: Locator): Locator {
  return region.locator(".reader-notice");
}

export function readerNav(region: Locator): Locator {
  return region.getByRole("navigation", { name: "Documents" });
}

/** The nav's plan header row (`[data-role="plan-header"]`) — `renderPlanSlot` sets its
 * `hidden` attribute (the codebase's existing `.hidden =` idiom, never removal) when the
 * plan slot is absent (REQ-6, a dead session), so `.toBeHidden()` is the "no empty padded
 * strip" oracle, not `.toHaveCount(0)`. */
export function planHeaderRow(region: Locator): Locator {
  return readerNav(region).locator('[data-role="plan-header"]');
}

export function planSlotEntry(region: Locator): Locator {
  return readerNav(region).locator(".f.plan");
}

export function noPlanText(region: Locator): Locator {
  return readerNav(region).locator(".f.none");
}

export function filesHeaderToggle(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Files", exact: true });
}

/** Absent before the listing arrives and in compact mode (REQ-15, States). */
export function fileCount(region: Locator): Locator {
  return filesHeaderToggle(region).locator(".n");
}

export function filterBox(region: Locator): Locator {
  return region.getByRole("searchbox", { name: "Filter files" });
}

/** The tree's own scroll container (`.rnav .tree`, review cycle 2 Critical 1) — the
 * element whose `overflow-y` is `auto` and whose `scrollHeight`/`clientHeight` and
 * `scrollTop` are the reachability oracle for a fixture that exceeds the nav's height. */
export function navTreeSection(region: Locator): Locator {
  return readerNav(region).locator(".tree");
}

/** The single `loading…` row shown inside the tree while the listing is in flight
 * (REQ-10) — a `div`, not a button (Testable UI Elements: "not focusable"), styled like
 * `.f.none`. */
export function treeLoadingRow(region: Locator): Locator {
  return navTreeSection(region).getByText("loading…");
}

/** The outline's own scroll container (`.rnav .outline`), mirroring `navTreeSection`. */
export function navOutlineSection(region: Locator): Locator {
  return readerNav(region).locator(".outline");
}

/** A folder button in the tree, by its own name — accessible name is exactly `<name>/`
 * since the caret and count are `aria-hidden` (Testable UI Elements). */
export function folderEntry(region: Locator, name: string): Locator {
  return navTreeSection(region).getByRole("button", { name: `${name}/`, exact: true });
}

/** A file button in the tree, by its basename — accessible name is exactly the basename
 * since the changed dot is `aria-hidden`. */
export function fileEntry(region: Locator, fileBasename: string): Locator {
  return navTreeSection(region).getByRole("button", { name: fileBasename, exact: true });
}

/** The changed-dot span inside a tree/plan-slot entry — its presence in the DOM (not a
 * CSS state) is the whole indicator (REQ-13). */
export function changedDot(entry: Locator): Locator {
  return entry.locator(".dot");
}

export function outlineHeaderToggle(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Outline" });
}

/** `exact: true` matters here specifically (unlike `fileEntry`/`folderEntry`, which
 * already had it): Playwright's default name match is substring, and
 * `buildLargeMarkdownFixtureTree`'s 30 headings are `Section 1`..`Section 30`, so
 * `"Section 1"` would otherwise also match `Section 10`..`Section 19` (review cycle 3
 * keyboard/pop-out coverage). */
export function outlineEntry(region: Locator, headingText: string): Locator {
  return navOutlineSection(region).getByRole("button", { name: headingText, exact: true });
}

export function renderedBody(region: Locator): Locator {
  return region.locator("article.md");
}

export function bodyPlaceholder(region: Locator): Locator {
  return renderedBody(region).getByText("nothing open — pick a file");
}

/** `article.md > p.placeholder` while nothing has rendered yet (mount, or a user-initiated
 * open with `bodyRendered` still false) — plan markdown-render-fixes REQ-9. Neither
 * `article.md` nor `p` carries an implicit role (Testable UI Elements), so this is a text
 * locator like `bodyPlaceholder` above, never a role query. */
export function bodyLoadingPlaceholder(region: Locator): Locator {
  return renderedBody(region).getByText("loading…");
}

/** `/doc.html?session=<id>&path=<abs>` (REQ-8) — for asserting a pop-out tab's URL, or
 * navigating to it directly rather than through the `pop out ↗` link. */
export function popOutURL(id: number, path: string): string {
  return `/doc.html?session=${id}&path=${encodeURIComponent(path)}`;
}

// ── Fake transcript (kb:fact/plan-file-path-in-transcript) ─────────────────────────────

export interface FakeTranscriptOpts {
  /** Absolute plan file path named via an attachment line's `planFilePath`. Omit for a
   * transcript that names no plan at all (edge cases 1/3/5's planless shape). */
  planFilePath?: string;
  /** `attachment.planExists` on that line. Default true. */
  planExists?: boolean;
  /** The attachment type carrying `planFilePath` — any of the three the fact record
   * names; `plan_mode_exit` alone (no `plan_mode` line) is itself a measured shape.
   * Default `"plan_mode"`. */
  attachmentType?: "plan_mode" | "plan_mode_exit" | "plan_mode_reentry";
  /** A slug-only fallback line (the fact's "slug is only a fallback" shape). Ignored
   * when `planFilePath` is set — `planFilePath` is the authoritative form. */
  slug?: string;
}

/**
 * Writes a fake Claude Code transcript at `path` — a JSONL file whose only lines this
 * reader locator cares about are a `slug` field or a `plan_mode*` attachment line
 * (kb:fact/plan-file-path-in-transcript); every other line is inert bookkeeping, included
 * only for realism. `LocatePlanFile`'s own "no plan" answer is a transcript that doesn't
 * exist at all, or one with neither a `planFilePath`-carrying line nor a `slug` line —
 * both reachable by calling this with `{}`.
 */
export async function writeFakeTranscript(
  path: string,
  opts: FakeTranscriptOpts = {},
): Promise<void> {
  const lines: Record<string, unknown>[] = [{ type: "system", subtype: "init" }];
  if (opts.planFilePath !== undefined) {
    lines.push({
      type: "attachment",
      attachment: {
        type: opts.attachmentType ?? "plan_mode",
        planFilePath: opts.planFilePath,
        planExists: opts.planExists ?? true,
      },
    });
  } else if (opts.slug !== undefined) {
    lines.push({ type: "user", slug: opts.slug });
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf-8");
}

// ── Fixture directories ──────────────────────────────────────────────────────────────────

export interface MarkdownFixtureTree {
  /** `<dir>/TODO.md` */
  todoPath: string;
  /** `<dir>/docs/adr/x.md` — two folder levels deep. */
  nestedPath: string;
  /** `<dir>/notes.txt` — not markdown; must never be listed. */
  nonMarkdownPath: string;
  /** `<dir>/.hidden/secret.md` — inside a dot-directory; skipped by the non-git walk. */
  dotDirFilePath: string;
}

/** Builds the tree `docs/features/reader/spec.md`'s E6/D8 fixtures describe: a top-level
 * `.md`, a two-deep nested `.md`, a non-`.md` sibling and a `.md` inside a dot-directory. */
export async function buildMarkdownFixtureTree(dir: string): Promise<MarkdownFixtureTree> {
  const todoPath = join(dir, "TODO.md");
  await writeFile(todoPath, "# TODO\n\n- [ ] one\n");

  const nestedPath = join(dir, "docs", "adr", "x.md");
  await mkdir(dirname(nestedPath), { recursive: true });
  await writeFile(nestedPath, "# ADR X\n\nBody.\n");

  const nonMarkdownPath = join(dir, "notes.txt");
  await writeFile(nonMarkdownPath, "not markdown\n");

  const dotDirFilePath = join(dir, ".hidden", "secret.md");
  await mkdir(dirname(dotDirFilePath), { recursive: true });
  await writeFile(dotDirFilePath, "# hidden\n");

  return { todoPath, nestedPath, nonMarkdownPath, dotDirFilePath };
}

export interface LargeMarkdownFixtureTree {
  /** The last of 20 top-level `.md` files in tree-sort order (`compareEntries`: same
   * kind, alphabetical) — reachable only by scrolling `.rnav .tree` once its content
   * exceeds the nav's bounded height (review cycle 2 Critical 1). */
  lastFileName: string;
  /** A single file carrying 30 `##` headings, to open and drive the outline past its
   * own bound. */
  outlineFileName: string;
  outlineFilePath: string;
  /** The outline's last heading — reachable only by scrolling `.rnav .outline`. */
  lastHeading: string;
}

/**
 * Builds a tree genuinely bigger than the nav's own height in the full Focus pane —
 * `buildMarkdownFixtureTree`'s four files never overflow it (review cycle 2 Major 2),
 * which is how the nav-placement test measured the outer box but never the nav's own
 * scrollability. Sizes mirror web-impl's cycle-2 verification
 * (`plans/markdown-viewing/web-implementation.md` Fix Attempt 3): 20 top-level files and
 * a 30-heading open file. `0-outline.md` sorts alphabetically before every `file-NN.md`
 * (`"0" < "f"`), so `file-20.md` is reliably the tree's last row regardless of which file
 * is open.
 */
export async function buildLargeMarkdownFixtureTree(
  dir: string,
): Promise<LargeMarkdownFixtureTree> {
  let lastFileName = "";
  for (let i = 1; i <= 20; i += 1) {
    const name = `file-${String(i).padStart(2, "0")}.md`;
    await writeFile(join(dir, name), `# File ${i}\n\nBody text for file ${i}.\n`);
    lastFileName = name;
  }

  const outlineFileName = "0-outline.md";
  const outlineFilePath = join(dir, outlineFileName);
  const headings = Array.from({ length: 30 }, (_, i) => `Section ${i + 1}`);
  const body = headings.map((h) => `## ${h}\n\nParagraph text for ${h}.\n`).join("\n\n");
  await writeFile(outlineFilePath, `# Outline\n\n${body}\n`);

  return { lastFileName, outlineFileName, outlineFilePath, lastHeading: "Section 30" };
}

export interface ConfinementFixtures {
  /** A `.md` file OUTSIDE the session directory. */
  outsideFilePath: string;
  /** A symlink INSIDE the session directory pointing at `outsideFilePath` (D11/E20). */
  symlinkInsidePath: string;
  /** `<planSlug>-agent-helper.md` next to the plan (D11/edge case 17/21). */
  agentSiblingPath: string;
  /** `<planSlug>.workshop.md` next to the plan (D11/edge case 21). */
  workshopSiblingPath: string;
}

/** Builds the confinement-boundary fixtures INV-2/D11/E20 need, next to `planPath` and
 * pointing out of `dir` into `outsideDir` (a directory the caller owns and cleans up
 * independently, so a symlink escape genuinely leaves the confined tree). */
export async function buildConfinementFixtures(
  dir: string,
  outsideDir: string,
  planPath: string,
): Promise<ConfinementFixtures> {
  await mkdir(outsideDir, { recursive: true });
  const outsideFilePath = join(outsideDir, "outside.md");
  await writeFile(outsideFilePath, "# outside\n");

  const symlinkInsidePath = join(dir, "escape.md");
  await symlink(outsideFilePath, symlinkInsidePath);

  const planDir = dirname(planPath);
  const planSlug = basename(planPath, ".md");
  await mkdir(planDir, { recursive: true });
  const agentSiblingPath = join(planDir, `${planSlug}-agent-helper.md`);
  await writeFile(agentSiblingPath, "# agent\n");
  const workshopSiblingPath = join(planDir, `${planSlug}.workshop.md`);
  await writeFile(workshopSiblingPath, "# workshop\n");

  return { outsideFilePath, symlinkInsidePath, agentSiblingPath, workshopSiblingPath };
}

// ── Held responses (plan markdown-render-fixes Implementation Notes: copy
// actions.spec.ts:703-756's real-response-held-behind-a-promise-gate shape for the
// otherwise sub-second loading-cue window) ─────────────────────────────────────────────

export interface HeldRoute {
  /** Lets the held response through; call after asserting the interim loading state. */
  release: () => void;
}

/** Holds the real `GET /api/sessions/{id}/reader/file` response behind a promise gate —
 * delays the genuine round trip, fabricates nothing. Scoped to one session id so two
 * tiles' file fetches (E15/INV-CUES-PER-INSTANCE) can be held independently. Must be
 * called before the action that triggers the fetch (`page.route` only affects requests
 * made after it is registered). */
export async function holdReaderFileResponse(page: Page, id: number): Promise<HeldRoute> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(new RegExp(`/api/sessions/${id}/reader/file\\?`), async (route) => {
    await gate;
    await route.continue();
  });
  return { release };
}

/** Holds the real `GET /api/sessions/{id}/reader` (listing) response behind a promise
 * gate — same shape as `holdReaderFileResponse`, for REQ-10's tree `loading…` row and
 * REQ-9's body placeholder. The endpoint takes no query (Protocol Contract), so the
 * pattern anchors on end-of-string. */
export async function holdReaderListingResponse(page: Page, id: number): Promise<HeldRoute> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(new RegExp(`/api/sessions/${id}/reader$`), async (route) => {
    await gate;
    await route.continue();
  });
  return { release };
}

// ── HTTP oracles ──────────────────────────────────────────────────────────────────────────

export interface ReaderListing {
  directory: string;
  plan: { path: string; exists: boolean; writtenAt: string | null } | null;
  files: { path: string; writtenAt: string | null }[];
  listing: "git" | "walk";
  truncated: boolean;
}

/** `GET /api/sessions/{id}/reader` directly (Protocol Contract) — the listing/plan-scan
 * oracle, mirroring `helpers/session.ts`'s `getState`. Throws on anything but 200. */
export async function getReaderListing(
  page: Page,
  baseURL: string,
  id: number,
): Promise<ReaderListing> {
  const res = await page.request.get(`${baseURL}/api/sessions/${id}/reader`);
  if (res.status() !== 200) {
    throw new Error(`GET .../reader failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as ReaderListing;
}

/** `GET /api/sessions/{id}/reader/file?path=<path>` directly — returns the status and
 * body without throwing, since every 4xx/413 shape is itself the thing under test. */
export async function getReaderFile(
  page: Page,
  baseURL: string,
  id: number,
  path: string,
): Promise<{ status: number; body: string }> {
  const res = await page.request.get(`${baseURL}/api/sessions/${id}/reader/file`, {
    params: { path },
  });
  return { status: res.status(), body: await res.text() };
}

/**
 * Counts GET requests reaching `/api/sessions/{id}/reader` and `/reader/file` — INV-5's
 * "zero requests over a settle window" oracle, mirroring `helpers/terminal.ts`'s
 * `TerminalSocketTracker` shape. Must be constructed after any fetch the action under
 * test is expected to make (the initial mount's listing/file GETs), so it only counts
 * requests that have no such excuse.
 */
export class ReaderRequestTracker {
  private listingCount = 0;
  private fileCount = 0;

  constructor(page: Page) {
    page.on("request", (req) => {
      if (req.method() !== "GET") return;
      const path = new URL(req.url()).pathname;
      if (/^\/api\/sessions\/\d+\/reader$/.test(path)) this.listingCount += 1;
      else if (/^\/api\/sessions\/\d+\/reader\/file$/.test(path)) this.fileCount += 1;
    });
  }

  get listingRequests(): number {
    return this.listingCount;
  }

  get fileRequests(): number {
    return this.fileCount;
  }

  get total(): number {
    return this.listingCount + this.fileCount;
  }
}
