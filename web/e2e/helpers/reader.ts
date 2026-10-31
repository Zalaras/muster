// Reader helpers for the markdown-viewing E2E suite (plans markdown-viewing,
// markdown-render-fixes, frontmatter, mermaid-support, reader-expanded-persists).
//
// The DOM side — every locator (region, docbar, nav, tree, outline, frontmatter, diagrams),
// the layout oracle `navLabelLayout`, the origin tracker and the documents themselves — is
// pure display and lives in the render tier's helper (`web/render/helpers/reader.ts`); the
// journeys here reach it through this re-export so a locator is written once for both
// tiers. What stays here is what a render test never does: writing the documents and a
// fake transcript to disk, holding a real daemon response in flight, and reading the
// daemon's own answers (`getReaderListing`, `getReaderFile`, `ReaderRequestTracker`).
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import {
  LARGE_TREE,
  LARGE_TREE_DOCUMENTS,
  MARKDOWN_TREE_DOCUMENTS,
  MERMAID_DOCUMENTS,
  type ReaderDocument,
} from "../../render/helpers/reader";

export {
  barFileName,
  barPath,
  barPlanBadge,
  bodyLoadingPlaceholder,
  bodyPlaceholder,
  canvasTransform,
  changedDot,
  diagramCanvas,
  diagramClose,
  diagramDialog,
  diagramDialogRaw,
  diagramErrorLine,
  diagramFigure,
  diagramFigures,
  diagramStage,
  diagramZoomIn,
  diagramZoomOut,
  diagramZoomReset,
  docBar,
  enlargeButton,
  fileCount,
  fileEntry,
  filesHeaderToggle,
  filterBox,
  FM_RAW_INNER,
  folderEntry,
  freshnessCue,
  frontmatterFallback,
  frontmatterKeyCell,
  frontmatterKeyCells,
  frontmatterTable,
  frontmatterValueCell,
  INTERLEAVED_DOCUMENT,
  keptMermaidSource,
  LARGE_TREE,
  LARGE_TREE_DOCUMENTS,
  LONG_NAMES,
  MARKDOWN_TREE_DOCUMENTS,
  MERMAID_DOCUMENTS,
  type NavLabelLayout,
  navLabelLayout,
  navOutlineSection,
  navToggle,
  navTreeSection,
  noPlanText,
  OriginRequestTracker,
  outlineEntries,
  outlineEntry,
  outlineHeaderToggle,
  planHeaderRow,
  planSlotEntry,
  popOutLink,
  popOutURL,
  READER_DOCUMENTS,
  READER_PLAN_BODY,
  type ReaderDocument,
  readerNav,
  readerRegion,
  readerRegionInTile,
  readerStatusLine,
  renderedBody,
  treeLoadingRow,
} from "../../render/helpers/reader";

// ── Fake transcript (kb:fact/plan-file-path-in-transcript) ─────────────────────────────

export interface FakeTranscriptOpts {
  /** Absolute plan file path named via an attachment line's `planFilePath`. Omit for a
   * transcript that names no plan at all (the planless shape). */
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
//
// Each builder writes the documents the render helper holds (the same bytes the
// `reader-docs*` / `reader-diagrams*` render fixtures record) into a scratch directory,
// creating parents, and returns the absolute paths a journey then rewrites or deletes.

async function writeDocument(dir: string, doc: ReaderDocument): Promise<string> {
  const path = join(dir, ...doc.path.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, doc.body);
  return path;
}

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

/** Builds the tree `docs/features/reader/spec.md`'s fixtures describe: a top-level
 * `.md`, a two-deep nested `.md`, a non-`.md` sibling and a `.md` inside a dot-directory. */
export async function buildMarkdownFixtureTree(dir: string): Promise<MarkdownFixtureTree> {
  const { todo, nested, nonMarkdown, dotDir } = MARKDOWN_TREE_DOCUMENTS;
  return {
    todoPath: await writeDocument(dir, todo),
    nestedPath: await writeDocument(dir, nested),
    nonMarkdownPath: await writeDocument(dir, nonMarkdown),
    dotDirFilePath: await writeDocument(dir, dotDir),
  };
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
 * `buildMarkdownFixtureTree`'s four files never overflow it (review cycle 2 Major 2).
 * Sizes mirror web-impl's cycle-2 verification (`plans/markdown-viewing/web-implementation.md`
 * Fix Attempt 3): 20 top-level files and a 30-heading open file.
 */
export async function buildLargeMarkdownFixtureTree(
  dir: string,
): Promise<LargeMarkdownFixtureTree> {
  for (const doc of LARGE_TREE_DOCUMENTS) await writeDocument(dir, doc);
  return {
    ...LARGE_TREE,
    outlineFilePath: join(dir, LARGE_TREE.outlineFileName),
  };
}

export interface ConfinementFixtures {
  /** A `.md` file OUTSIDE the session directory. */
  outsideFilePath: string;
  /** A symlink INSIDE the session directory pointing at `outsideFilePath`. */
  symlinkInsidePath: string;
  /** `<planSlug>-agent-helper.md` next to the plan. */
  agentSiblingPath: string;
  /** `<planSlug>.workshop.md` next to the plan. */
  workshopSiblingPath: string;
}

/** Builds the confinement-boundary fixtures needed, next to `planPath` and
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

export interface MermaidFixtureTree {
  /** One valid `flowchart TD`. */
  flowPath: string;
  /** One fence missing an arrow target, one valid fence after it. */
  brokenPath: string;
  /** Script/onerror/`javascript:` labels plus a `securityLevel: "loose"` init directive
   * that must have no effect. */
  unsafePath: string;
  /** One fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote
   * and duplicate-fence variants. */
  kindsPath: string;
  /** A flowchart naming `layout: elk` in frontmatter, and one naming no layout. */
  elkPath: string;
  /** A `flowchart LR` with 40 chained nodes, wider than the reader body. */
  widePath: string;
  /** No mermaid fence at all (the engine chunk must never load for this file). */
  plainPath: string;
}

/**
 * Writes the mermaid fixture markdown files the plan's Implementation Notes name, under
 * `dir` — `MERMAID_DOCUMENTS`' bytes: genuine mermaid source for the real bundled engine,
 * never simulated daemon output.
 */
export async function writeMermaidFixture(dir: string): Promise<MermaidFixtureTree> {
  const { flow, broken, unsafe, kinds, elk, wide, plain } = MERMAID_DOCUMENTS;
  return {
    flowPath: await writeDocument(dir, flow),
    brokenPath: await writeDocument(dir, broken),
    unsafePath: await writeDocument(dir, unsafe),
    kindsPath: await writeDocument(dir, kinds),
    elkPath: await writeDocument(dir, elk),
    widePath: await writeDocument(dir, wide),
    plainPath: await writeDocument(dir, plain),
  };
}

// ── Held responses (copy actions.spec.ts's real-response-held-behind-a-promise-gate
// shape for the otherwise sub-second loading-cue window) ─────────────────────────────────────────────

export interface HeldRoute {
  /** Lets the held response through; call after asserting the interim loading state. */
  release: () => void;
}

/** Holds the real `GET /api/sessions/{id}/reader/file` response behind a promise gate —
 * delays the genuine round trip, fabricates nothing. Scoped to one session id so two
 * tiles' file fetches can be held independently. Must be
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
 * gate — same shape as `holdReaderFileResponse`, for the tree `loading…` row and
 * the body placeholder. The endpoint takes no query (Protocol Contract), so the
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

/** Like `holdReaderFileResponse`, but matches only a request whose `path` query names
 * `fileBasename` — for the mermaid case where one file's fetch must
 * stay pending while a different file's completes normally, so the test demonstrates
 * genuine lateness rather than two held requests released in an arbitrary race. */
export async function holdReaderFileResponseFor(
  page: Page,
  id: number,
  fileBasename: string,
): Promise<HeldRoute> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const escaped = fileBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.route(new RegExp(`/api/sessions/${id}/reader/file\\?.*${escaped}`), async (route) => {
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
 * Counts GET requests reaching `/api/sessions/{id}/reader` and `/reader/file` — the
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
