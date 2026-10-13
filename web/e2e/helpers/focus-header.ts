// Helpers for plan title-crop-stop-resume-button: the Focus header's give-way order
// (REQ-2), its right-aligned cluster (REQ-4) and the one Stop/Resume button (REQ-5, REQ-6),
// measured from the live layout.
//
// Everything here reads boxes, never a pixel breakpoint: the invariants are what the plan
// pins (INV-1 .. INV-8, kb:lesson/layout-invariant-needs-its-width-range), and a sweep
// asserts them at every 16 px step. The independent oracle for a line's width is its own
// max-content width, measured in the line's font by a throwaway clone, so a stale or
// capped display times out in the caller's poll instead of passing a pattern match
// (kb:lesson/tiles-never-refit-behind-pattern-match).
import { expect, type Locator, type Page } from "./fixtures";

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Line {
  /** `.rf` or `.rb`. */
  kind: string;
  /** Which block: the repo readout or the `↳` where-Claude-is block. */
  block: "repo" | "claude-at";
  box: Box;
  /** The line's own text at its max-content width, in its own font. */
  natural: number;
}

export interface HeaderSnapshot {
  vw: number;
  vh: number;
  head: Box;
  /** The header's content box right edge (border box minus right padding). */
  contentRight: number;
  name: Box | null;
  /** The title button's clip state: ellipsized when scrollWidth > clientWidth. */
  title: { scrollWidth: number; clientWidth: number } | null;
  chip: Box | null;
  group: Box | null;
  loc: Box | null;
  repo: Box | null;
  /** The widest repo line's max-content width. */
  repoNatural: number;
  /** `--floor` (8ch) in `.loc`'s own font, in pixels. */
  floor: number;
  /** `.claude-at` without its `hidden` attribute: Claude is in another checkout. */
  moved: boolean;
  /** The `↳` block is laid out on `.loc`'s first line, i.e. actually drawn. */
  claudeAtShown: boolean;
  lines: Line[];
  model: (Box & { scrollWidth: number; clientWidth: number }) | null;
  ended: Box | null;
  surf: Box | null;
  stopResume: Box | null;
  /** Labels of every header button reading Stop or Resume — INV-7 wants exactly one. */
  stopResumeLabels: string[];
  remove: Box | null;
}

const EPS = 0.5;
const span = (b: Box) => `${b.left.toFixed(1)}-${b.right.toFixed(1)}`;
const xOverlap = (a: Box, b: Box) => a.left < b.right - EPS && b.left < a.right - EPS;
const yOverlap = (a: Box, b: Box) => a.top < b.bottom - EPS && b.top < a.bottom - EPS;
const width = (b: Box) => b.right - b.left;

type BoxMap = Record<string, Box | null>;

/** The laid-out box of each named selector, null when it has none (hidden, absent, `visibility: hidden`). */
async function readBoxes(page: Page, selectors: Record<string, string>): Promise<BoxMap> {
  return await page.evaluate((sels) => {
    const out: Record<string, Box | null> = {};
    for (const [name, sel] of Object.entries(sels)) {
      const el = document.querySelector<HTMLElement>(sel);
      const shown =
        !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const b = el?.getBoundingClientRect();
      out[name] =
        shown && b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null;
    }
    return out;
  }, selectors);
}

interface Misc {
  vw: number;
  vh: number;
  contentRight: number;
  floor: number;
  moved: boolean;
  title: { scrollWidth: number; clientWidth: number } | null;
  model: { scrollWidth: number; clientWidth: number } | null;
  stopResumeLabels: string[];
  stopResume: Box | null;
  remove: Box | null;
}

/** Everything that is not a plain box: viewport, content edge, 8ch floor, clip state, button labels. */
async function readMisc(page: Page): Promise<Misc | null> {
  return await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>("#mainhead");
    const loc = document.querySelector<HTMLElement>("#mainhead .meta .loc");
    if (!head || !loc) return null;
    const rect = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    // `ch` only resolves in `.loc`'s own font: a throwaway absolutely positioned probe.
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;width:8ch;height:0";
    loc.appendChild(probe);
    const floor = probe.getBoundingClientRect().width;
    probe.remove();

    const text = (b: Element) => b.textContent?.trim() ?? "";
    const buttons = [...head.querySelectorAll<HTMLButtonElement>("button")].filter(
      (b) => !b.closest(".surfseg") && b.getClientRects().length > 0,
    );
    const stopResume = buttons.filter((b) => /^(Stop|Resume)$/.test(text(b)));
    const remove = buttons.find((b) => text(b) === "Remove");
    const title = document.querySelector<HTMLElement>("#mainhead .name .rename");
    const model = document.querySelector<HTMLElement>("#mainhead .meta .model");
    const claudeAt = document.querySelector<HTMLElement>("#mainhead .meta .loc .claude-at");
    return {
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      contentRight:
        head.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(head).paddingRight),
      floor,
      moved: !!claudeAt && !claudeAt.hasAttribute("hidden"),
      title: title ? { scrollWidth: title.scrollWidth, clientWidth: title.clientWidth } : null,
      model: model ? { scrollWidth: model.scrollWidth, clientWidth: model.clientWidth } : null,
      stopResumeLabels: stopResume.map(text),
      stopResume: stopResume[0] ? rect(stopResume[0]) : null,
      remove: remove ? rect(remove) : null,
    };
  });
}

/** The `.rf` / `.rb` lines inside one block, each with its box and its own max-content width. */
async function readBlockLines(page: Page, block: "repo" | "claude-at"): Promise<Line[]> {
  return await page.locator(`#mainhead .meta .loc .${block} :is(.rf, .rb)`).evaluateAll(
    (els, which) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          // The line's text at its max-content width: a hidden clone inside the line's own
          // parent (so it inherits the font), measured and removed.
          const clone = el.cloneNode(true) as HTMLElement;
          clone.style.cssText =
            "position:absolute;visibility:hidden;max-width:none;min-width:0;width:max-content;overflow:visible;text-overflow:clip";
          el.parentElement?.appendChild(clone);
          const natural = clone.getBoundingClientRect().width;
          clone.remove();
          const b = el.getBoundingClientRect();
          return {
            kind: el.classList.contains("rf") ? ".rf" : ".rb",
            block: which,
            box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
            natural,
          };
        }),
    block,
  );
}

/**
 * The folder and branch lines of the repo readout, and of the `↳` block when it is drawn: a
 * `↳` block that gave way wraps to a clipped second line of `.loc`, and counts as not drawn.
 */
async function readLines(page: Page, loc: Box | null): Promise<Line[]> {
  const repo = await readBlockLines(page, "repo");
  const claudeAt = await readBlockLines(page, "claude-at");
  const drawn = claudeAt.filter((l) => !loc || l.box.top < loc.bottom - EPS);
  return [...repo, ...drawn];
}

/** Reads the header's boxes as plain data; null when a part the header always has is missing. */
export async function readHeaderSnapshot(page: Page): Promise<HeaderSnapshot | null> {
  const misc = await readMisc(page);
  if (!misc) return null;
  const boxes = await readBoxes(page, {
    head: "#mainhead",
    name: "#mainhead .name",
    chip: "#mainhead .chip-danger",
    group: "#mainhead .ingroup",
    loc: "#mainhead .meta .loc",
    repo: "#mainhead .meta .loc .repo",
    model: "#mainhead .meta .model",
    ended: "#mainhead .meta .ended-at",
    surf: "#mainhead .surfseg",
  });
  const lines = await readLines(page, boxes.loc ?? null);
  const head = boxes.head;
  if (!head) return null;
  return {
    vw: misc.vw,
    vh: misc.vh,
    head,
    contentRight: misc.contentRight,
    name: boxes.name ?? null,
    title: misc.title,
    chip: boxes.chip ?? null,
    group: boxes.group ?? null,
    loc: boxes.loc ?? null,
    repo: boxes.repo ?? null,
    repoNatural: Math.max(0, ...lines.filter((l) => l.block === "repo").map((l) => l.natural)),
    floor: misc.floor,
    moved: misc.moved,
    claudeAtShown: lines.some((l) => l.block === "claude-at"),
    lines,
    model: boxes.model && misc.model ? { ...boxes.model, ...misc.model } : null,
    ended: boxes.ended ?? null,
    surf: boxes.surf ?? null,
    stopResume: misc.stopResume,
    stopResumeLabels: misc.stopResumeLabels,
    remove: misc.remove,
  };
}

/** The header is on two rows when its action cluster sits below the title's row. */
export function onTwoRows(s: HeaderSnapshot): boolean {
  const cluster = [s.surf, s.stopResume, s.remove].filter((b): b is Box => b !== null);
  if (!s.name || cluster.length === 0) return false;
  return Math.min(...cluster.map((b) => b.top)) >= s.name.bottom - EPS;
}

const titleEllipsized = (s: HeaderSnapshot) =>
  !!s.title && s.title.scrollWidth > s.title.clientWidth;

/** A folder or branch line narrower than its own text (a 1 px tolerance for sub-pixel layout). */
function ellipsizedLines(s: HeaderSnapshot): Line[] {
  return s.lines.filter((line) => width(line.box) < line.natural - 1);
}

function namedItems(s: HeaderSnapshot): { name: string; box: Box }[] {
  const candidates: [string, Box | null][] = [
    ["name", s.name],
    ["bypass chip", s.chip],
    ["group control", s.group],
    ["repo readout", s.repo],
    ["↳ block", s.claudeAtShown ? findClaudeAt(s) : null],
    ["model", s.model],
    ["ended clause", s.ended],
    ["surface switch", s.surf],
    ["Stop/Resume", s.stopResume],
    ["Remove", s.remove],
  ];
  return candidates.flatMap(([name, box]) => (box ? [{ name, box }] : []));
}

/** INV-1: no two header items overlap and each is inside the viewport. */
function overlapProblems(s: HeaderSnapshot): string[] {
  const out: string[] = [];
  const items = namedItems(s);
  for (const [i, a] of items.entries()) {
    for (const b of items.slice(i + 1)) {
      if (xOverlap(a.box, b.box) && yOverlap(a.box, b.box)) {
        out.push(`INV-1: ${a.name} ${span(a.box)} overlaps ${b.name} ${span(b.box)}`);
      }
    }
    if (a.box.left < -EPS || a.box.right > s.vw + EPS || a.box.bottom > s.vh + EPS) {
      out.push(`INV-1: ${a.name} ${span(a.box)} is outside the ${s.vw}x${s.vh} viewport`);
    }
  }
  const missing: [string, Box | null][] = [
    ["Stop/Resume button", s.stopResume],
    ["Remove button", s.remove],
    ["surface switch", s.surf],
  ];
  for (const [name, box] of missing) {
    if (!box) out.push(`INV-1: no ${name} is laid out in the header`);
  }
  return out;
}

/** REQ-2 (b), REQ-4: the surface switch and the buttons are one cluster, on one row, never split across two. */
function clusterProblems(s: HeaderSnapshot): string[] {
  const parts: [string, Box | null][] = [
    ["surface switch", s.surf],
    ["Stop/Resume", s.stopResume],
    ["Remove", s.remove],
  ];
  const centres = parts.flatMap(([name, box]) =>
    box ? [{ name, y: (box.top + box.bottom) / 2, h: box.bottom - box.top }] : [],
  );
  const first = centres[0];
  if (!first) return [];
  return centres
    .filter((c) => Math.abs(c.y - first.y) > Math.min(c.h, first.h) / 2)
    .map(
      (c) =>
        `REQ-2: the ${c.name} is on another row than the ${first.name}; the cluster must move as one`,
    );
}

/** INV-2: the model is whole. */
function modelProblems(s: HeaderSnapshot): string[] {
  if (!s.model) return ["INV-2: the model is not laid out"];
  const out: string[] = [];
  if (s.model.scrollWidth > s.model.clientWidth)
    out.push(`INV-2: model clipped, scrollWidth ${s.model.scrollWidth} > ${s.model.clientWidth}`);
  out.push(...stackedModelProblems(s, s.model));
  return out;
}

/**
 * REQ-2 / REQ-3 in the stacked band: a model that is not beside the readout (not on its row)
 * sits under it, below the readout's bottom edge and within its column, whole and inside the
 * viewport. Never above it, never off to the side on another row, never clipped by the window.
 */
function stackedModelProblems(s: HeaderSnapshot, model: Box): string[] {
  if (!s.repo || yOverlap(model, s.repo)) return [];
  const out: string[] = [];
  if (model.top < s.repo.bottom - EPS)
    out.push(
      `REQ-3: the model (top ${model.top.toFixed(1)}) is above the readout's bottom ${s.repo.bottom.toFixed(1)}`,
    );
  if (!xOverlap(model, s.repo))
    out.push(
      `REQ-3: the model ${span(model)} is on another row than the readout ${span(s.repo)} but not under it`,
    );
  if (model.left < -EPS || model.right > s.vw + EPS || model.bottom > s.vh + EPS)
    out.push(`REQ-3: the stacked model ${span(model)} is outside the ${s.vw}x${s.vh} viewport`);
  return out;
}

/** INV-3 and the first halves of REQ-2: a line is ellipsized only on two rows with the `↳` block hidden. */
function lineProblems(s: HeaderSnapshot): string[] {
  const out: string[] = [];
  const twoRows = onTwoRows(s);
  const drawn = s.moved && s.claudeAtShown;
  const ellipsized = ellipsizedLines(s);
  if (ellipsized.length > 0) {
    const names = ellipsized
      .map((l) => `${l.block} ${l.kind} ${width(l.box).toFixed(1)} of ${l.natural.toFixed(1)}px`)
      .join(", ");
    if (!twoRows) out.push(`INV-3: ${names} ellipsized while the header is on one row`);
    if (drawn) out.push(`INV-3: ${names} ellipsized with the ↳ block drawn`);
  }
  if (drawn && twoRows)
    out.push("REQ-2: the cluster is on row two while the ↳ block is still drawn");
  return out;
}

/** INV-4 and REQ-2 (d): the title shortens only after everything before it gave way. */
function titleProblems(s: HeaderSnapshot): string[] {
  if (!titleEllipsized(s)) return [];
  const out: string[] = [];
  const repoWidth = s.repo ? width(s.repo) : 0;
  if (s.repoNatural > s.floor + 1.5 && repoWidth > s.floor + 1.5) {
    out.push(
      `INV-4: the title is ellipsized while the readout is ${repoWidth.toFixed(1)}px, above its ${s.floor.toFixed(1)}px floor`,
    );
  }
  if (!onTwoRows(s))
    out.push("REQ-2: the title is ellipsized while the cluster is still on row one");
  if (s.moved && s.claudeAtShown) out.push("REQ-2: the title is ellipsized with the ↳ block drawn");
  return out;
}

/** INV-8: the repo block is on `.loc`'s first line, at no less than its floor. */
function repoProblems(s: HeaderSnapshot): string[] {
  if (!s.repo) return ["INV-8: the repo block has no box"];
  const out: string[] = [];
  if (s.loc && !yOverlap(s.repo, s.loc))
    out.push("INV-8: the repo block is below .loc's first line");
  const floor = Math.min(s.floor, s.repoNatural);
  if (width(s.repo) < floor - 1) {
    out.push(
      `INV-8: the repo block is ${width(s.repo).toFixed(1)}px, under its ${floor.toFixed(1)}px floor`,
    );
  }
  return out;
}

/**
 * The plan's width-independent invariants for one snapshot, one line per violation so an
 * `expect.poll(...).toEqual([])` retries until layout settles and prints what is wrong.
 *
 * INV-1 (no overlap, inside the viewport), INV-2 (model whole), INV-3 (a line is ellipsized
 * only on two rows, with the `↳` block hidden), INV-4 (the title is ellipsized only with
 * the readout at its floor), INV-8 (the repo block is on `.loc`'s first line, at no less
 * than its floor). The REQ-2 order's other halves ride along: the cluster drops only after
 * the `↳` block hid, and the title shortens only after the cluster dropped.
 */
export function headerProblems(s: HeaderSnapshot): string[] {
  return [
    ...overlapProblems(s),
    ...clusterProblems(s),
    ...modelProblems(s),
    ...lineProblems(s),
    ...titleProblems(s),
    ...repoProblems(s),
  ];
}

function findClaudeAt(s: HeaderSnapshot): Box | null {
  const own = s.lines.filter((l) => l.block === "claude-at");
  if (own.length === 0) return null;
  return {
    left: Math.min(...own.map((l) => l.box.left)),
    right: Math.max(...own.map((l) => l.box.right)),
    top: Math.min(...own.map((l) => l.box.top)),
    bottom: Math.max(...own.map((l) => l.box.bottom)),
  };
}

/**
 * The stacked band's claim, asserted as a fact rather than assumed from a sweep: the title is
 * ellipsized with the readout beside it at its floor, and the model sits under the readout, in
 * its column, whole and inside the viewport.
 */
export function stackedBandProblems(s: HeaderSnapshot): string[] {
  const { model, repo, name, title } = s;
  if (!model || !repo || !name) return ["a header part is missing"];
  const readout = width(repo);
  const checks: [boolean, string][] = [
    [!!title && title.scrollWidth > title.clientWidth, "the title is not ellipsized"],
    [name.bottom > repo.top, "the readout is on a row below the title, not beside it"],
    [model.top >= repo.bottom - EPS, `the model (top ${model.top}) is not under the readout`],
    [xOverlap(model, repo), "the model is not in the readout's column"],
    [model.scrollWidth <= model.clientWidth, "the model is clipped"],
    [
      model.left >= 0 && model.right <= s.vw && model.bottom <= s.vh,
      "the model is outside the viewport",
    ],
    [readout <= s.floor + 1.5, `the readout is ${readout.toFixed(1)}px, above its floor`],
  ];
  return checks.filter(([ok]) => !ok).map(([, why]) => `stacked band: ${why}`);
}

/** Reads and checks the header now; a missing part is itself a problem. */
export async function headerInvariantProblems(page: Page): Promise<string[]> {
  const snapshot = await readHeaderSnapshot(page);
  if (!snapshot) return ["a mainhead part is missing"];
  return headerProblems(snapshot);
}

/** Two animation frames: a resize's ResizeObserver callbacks and the layout they cause have run. */
export async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** What the sweep compares between the way down and the way back up. */
interface Signature {
  twoRows: boolean;
  claudeAtShown: boolean;
  linesEllipsized: boolean;
  titleEllipsized: boolean;
}

function signatureOf(s: HeaderSnapshot): Signature {
  return {
    twoRows: onTwoRows(s),
    claudeAtShown: s.claudeAtShown,
    linesEllipsized: ellipsizedLines(s).length > 0,
    titleEllipsized: titleEllipsized(s),
  };
}

/** Viewport widths from `from` down to `to` in `step` px, `to` itself last. */
export function sweepWidths(from = 2000, to = 600, step = 16): number[] {
  const widths: number[] = [];
  for (let w = from; w >= to; w -= step) widths.push(w);
  if (widths[widths.length - 1] !== to) widths.push(to);
  return widths;
}

/** REQ-7: the step where the cluster drops to row two takes no width from the title or the readout. */
function expectDropTookNothing(
  label: string,
  at: number,
  previous: HeaderSnapshot,
  now: HeaderSnapshot,
): void {
  const pairs: [string, Box | null, Box | null][] = [
    ["title", previous.name, now.name],
    ["readout", previous.repo, now.repo],
  ];
  for (const [what, before, after] of pairs) {
    if (!before || !after) continue;
    expect(
      width(after),
      `${label}: the ${what} was squeezed at the step (${at}px) where the cluster dropped`,
    ).toBeGreaterThanOrEqual(width(before) - 1.5);
  }
}

/**
 * The E3 sweep: from 2000 px down to 600 px and back up in 16 px steps, asserting INV-1,
 * INV-2, INV-3, INV-4 and INV-8 at every step, that widening retraces the narrowing
 * (REQ-2), and (REQ-7) that the step where the cluster drops takes no width from the title or
 * the readout. `extra` adds a caller's own per-width problems (the existing
 * `mainheadFitProblems`, say).
 */
export async function sweepHeader(
  page: Page,
  label: string,
  extra: (width: number) => Promise<string[]> = async () => [],
): Promise<void> {
  const down = sweepWidths();
  const seen = new Map<number, Signature>();
  let previous: HeaderSnapshot | null = null;
  for (const [i, w] of [...down, ...[...down].reverse()].entries()) {
    const goingUp = i >= down.length;
    await page.setViewportSize({ width: w, height: 800 });
    await settleLayout(page);
    let snapshot: HeaderSnapshot | null = null;
    await expect
      .poll(
        async () => {
          snapshot = await readHeaderSnapshot(page);
          return snapshot
            ? [...headerProblems(snapshot), ...(await extra(w))]
            : ["a mainhead part is missing"];
        },
        { message: `${label}: header layout at ${w}px ${goingUp ? "(widening)" : "(narrowing)"}` },
      )
      .toEqual([]);
    if (!snapshot) throw new Error("the header vanished mid-sweep");
    const now: HeaderSnapshot = snapshot;
    if (goingUp) {
      expect(
        signatureOf(now),
        `${label}: at ${w}px the give-way state differs from the way down (widening must reverse the order)`,
      ).toEqual(seen.get(w));
      continue;
    }
    seen.set(w, signatureOf(now));
    if (previous && !onTwoRows(previous) && onTwoRows(now))
      expectDropTookNothing(label, w, previous, now);
    previous = now;
  }
}

/** Every header button reading Stop or Resume, scoped to the Focus header (the dead surface's cap has its own Resume). */
export function headerStopResume(page: Page): Locator {
  return page.locator("#mainhead").getByRole("button", { name: /^(Stop|Resume)$/ });
}

export function headerButton(page: Page, name: "Stop" | "Resume" | "Remove"): Locator {
  return page.locator("#mainhead").getByRole("button", { name, exact: true });
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A locator's bounding box, failing loudly when it has none. */
export async function boxOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("expected the element to have a bounding box");
  return box;
}

/** A `Box` as the `x/y/width/height` shape `boundingBox()` returns. */
export function rectOf(b: Box): Rect {
  return { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top };
}

/** `a` and `b` are the same box to within sub-pixel layout. */
export function sameBox(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= EPS &&
    Math.abs(a.y - b.y) <= EPS &&
    Math.abs(a.width - b.width) <= EPS &&
    Math.abs(a.height - b.height) <= EPS
  );
}

/** Marks a node so a later read can prove it is the same element, not a rebuilt twin. */
export async function tagNode(locator: Locator, tag: string): Promise<void> {
  await locator.evaluate((el, value) => {
    (el as HTMLElement).dataset.e2eNode = value;
  }, tag);
}

/** The focused element's tag and the node tag `tagNode` left on it. */
export async function focusedNode(
  page: Page,
): Promise<{ tag: string | null; node: string | null }> {
  return await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return { tag: active?.tagName ?? null, node: active?.dataset.e2eNode ?? null };
  });
}

// ---------------------------------------------------------------------------------------
// INV-6 across the swap: what a Stop or a Resume must leave exactly where it was (REQ-6)
// ---------------------------------------------------------------------------------------

/** The boxes a Stop or a Resume must not move: the cluster's own and the header's. */
interface ClusterBoxes {
  head: Box;
  surf: Box | null;
  stopResume: Box;
  remove: Box;
}

function clusterOf(s: HeaderSnapshot): ClusterBoxes | null {
  if (!s.stopResume || !s.remove) return null;
  return { head: s.head, surf: s.surf, stopResume: s.stopResume, remove: s.remove };
}

const sameBoxes = (a: Box, b: Box) =>
  Math.abs(a.left - b.left) <= EPS &&
  Math.abs(a.right - b.right) <= EPS &&
  Math.abs(a.top - b.top) <= EPS &&
  Math.abs(a.bottom - b.bottom) <= EPS;

const boxText = (b: Box) =>
  `x ${b.left.toFixed(1)}-${b.right.toFixed(1)} y ${b.top.toFixed(1)}-${b.bottom.toFixed(1)}`;

/**
 * INV-6: Remove, the Stop/Resume button, the surface switch and the header itself are the same
 * boxes in `after` as in `before` (the same session at the same width, alive then dead or the
 * other way round). An empty list is "nothing moved".
 */
export function clusterShiftProblems(before: HeaderSnapshot, after: HeaderSnapshot): string[] {
  const a = clusterOf(before);
  const b = clusterOf(after);
  if (!a || !b) return ["INV-6: the Stop/Resume button or Remove is not laid out in the header"];
  const parts: [string, Box | null, Box | null][] = [
    ["Remove", a.remove, b.remove],
    ["Stop/Resume", a.stopResume, b.stopResume],
    ["surface switch", a.surf, b.surf],
    ["header", a.head, b.head],
  ];
  return parts.flatMap(([name, was, now]) =>
    was && now && !sameBoxes(was, now)
      ? [`INV-6: ${name} moved from ${boxText(was)} to ${boxText(now)}`]
      : [],
  );
}

/**
 * The header's snapshot at viewport width `w` once its layout has stopped moving: two reads,
 * a render frame apart, that agree on the cluster. (`fitMainheadMeta` and `stackMeta` run from
 * a ResizeObserver, a frame or two after the resize.)
 */
export async function settledSnapshot(page: Page, w: number): Promise<HeaderSnapshot> {
  await page.setViewportSize({ width: w, height: 800 });
  let previous: ClusterBoxes | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    await settleLayout(page);
    const s = await readHeaderSnapshot(page);
    if (!s) throw new Error(`the header is missing at ${w}px`);
    const now = clusterOf(s);
    if (previous && now && clusterShiftProblems({ ...s, ...previous }, s).length === 0) return s;
    previous = now;
  }
  throw new Error(`the header's layout never settled at ${w}px`);
}

/** The ended age and what it sits beside, read in one go. */
interface EndedClause {
  slotHidden: boolean;
  slotText: string;
  text: string;
  shown: boolean;
  box: Box | null;
  model: Box | null;
  loc: Box | null;
  head: Box;
  vw: number;
  vh: number;
}

async function readEndedClause(page: Page): Promise<EndedClause | null> {
  return await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>("#mainhead");
    const slot = document.querySelector<HTMLElement>("#mainhead .meta .ended-at");
    const ended = document.querySelector<HTMLElement>("#mainhead .meta .ended-at .ended");
    if (!head || !slot || !ended) return null;
    const rect = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const model = document.querySelector<HTMLElement>("#mainhead .meta .model");
    const loc = document.querySelector<HTMLElement>("#mainhead .meta .loc");
    const shown =
      ended.getClientRects().length > 0 && getComputedStyle(slot).visibility !== "hidden";
    return {
      slotHidden: slot.hasAttribute("hidden"),
      slotText: slot.textContent ?? "",
      text: ended.textContent ?? "",
      shown,
      box: shown ? rect(ended) : null,
      model: model ? rect(model) : null,
      loc: loc ? rect(loc) : null,
      head: rect(head),
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
    };
  });
}

/**
 * A dead session's ended age (`ended now`, `ended 3m ago`) is shown under the model, in the
 * model's column, with no `·` before it, clear of the readout and inside both the header and the
 * viewport. Fix wave of review cycle 1: it used to sit beside the model and take a row of its own
 * below 460 px, which is what moved the cluster on a Stop.
 */
export async function endedAgeProblems(page: Page): Promise<string[]> {
  const c = await readEndedClause(page);
  if (!c) return ["the ended clause is missing from the header"];
  if (!c.shown || !c.box || !c.model) return ["ended age: not shown on a dead session"];
  const out: string[] = [];
  if (!/^ended (now|\d+[mhd] ago)$/.test(c.text)) out.push(`ended age: the text reads "${c.text}"`);
  if (c.slotText.includes("·")) out.push(`ended age: a "·" separator stands in the clause`);
  if (c.box.top < c.model.bottom - EPS)
    out.push(`ended age: not under the model (age ${boxText(c.box)}, model ${boxText(c.model)})`);
  if (!xOverlap(c.box, c.model))
    out.push(`ended age: not in the model's column (age ${span(c.box)}, model ${span(c.model)})`);
  if (c.loc && xOverlap(c.box, c.loc) && yOverlap(c.box, c.loc))
    out.push(`ended age: overlaps the readout (age ${boxText(c.box)}, readout ${boxText(c.loc)})`);
  if (c.box.left < -EPS || c.box.right > c.vw + EPS || c.box.bottom > c.vh + EPS)
    out.push(`ended age: outside the ${c.vw}x${c.vh} viewport (${boxText(c.box)})`);
  if (c.box.right > c.head.right + EPS || c.box.bottom > c.head.bottom + EPS)
    out.push(`ended age: outside the header (age ${boxText(c.box)}, header ${boxText(c.head)})`);
  return out;
}

/** A live session shows no ended age: the clause stays `hidden` and draws nothing. */
export async function endedAgeAbsentProblems(page: Page): Promise<string[]> {
  const c = await readEndedClause(page);
  if (!c) return ["the ended clause is missing from the header"];
  const out: string[] = [];
  if (!c.slotHidden) out.push("alive: the ended clause is not hidden");
  if (c.shown) out.push("alive: the ended age is drawn");
  if (c.text !== "") out.push(`alive: the ended age carries text "${c.text}"`);
  return out;
}
