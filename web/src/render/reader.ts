// The reader component's DOM half (plan markdown-viewing UI Specifications > Reader DOM)
// — one component, cloned from `#reader-template` into three hosts (Focus's main slot, a
// tile's body slot, and `doc.html`'s standalone page). Pure DOM: fetches, the socket and
// all state live in `features/reader.ts`; this module only ever receives a view-model and
// writes it into already-built nodes (docs/conventions.md). The tree and outline sections
// are rebuilt (`replaceChildren`) only when their *structural* signature (row set, names,
// depths, expansion, counts) differs from the last pass; `current`/`dirty` are
// attribute-level state (review markdown-viewing cycle-3 Major 1) and are applied to the
// existing buttons in place, never trigger a rebuild — so the once-a-second render tick,
// scrolling the body (which moves the outline's `current`) or opening a file (which moves
// both) never steals focus from a tree/outline button or the filter box
// (docs/conventions.md's "focusable controls inside the render tick are reused, never
// rebuilt"; kb:lesson/select-rebuilt-every-tick-passed-selectoption). When a rebuild *is*
// structurally required (an expand/collapse, a filter, or the file listing changing under
// a focused button), focus is restored to the equivalent node by its stable key (`path` /
// `headingId`) after the rebuild.
import { requireElement } from "../dom";
import type { Frontmatter } from "../reader/frontmatter";
import { UNKNOWN_SESSION_TEXT } from "../reader/notice";
import { loadingText } from "../reader/paths";
import type { FlatTreeEntry } from "../reader/tree";
import { wireDiagramDialog } from "./diagramdialog";
import { buildFrontmatterNode } from "./frontmatter";

/** `doc.ts`'s placeholder when its `?session=` doesn't parse (review cycle 1 Critical 1) —
 * not part of the `#reader-template` component below, since nothing here needs a session
 * id to construct: there is no reader at all to build. */
export function renderUnknownSessionNotice(host: HTMLElement): void {
  const notice = document.createElement("p");
  notice.setAttribute("role", "status");
  notice.textContent = UNKNOWN_SESSION_TEXT;
  host.replaceChildren(notice);
}

export interface OutlineEntryVM {
  id: string;
  level: number;
  text: string;
  current: boolean;
}

export type PlanSlotVM =
  | { kind: "absent" } // dead session (REQ-3)
  | { kind: "none" } // session.plan is null or !exists (REQ-9)
  | { kind: "file"; basename: string; dirty: boolean; current: boolean };

export interface ReaderBarVM {
  badgeVisible: boolean;
  fname: string;
  path: string;
  /** `false` removes `.path` entirely — compact hosts (a tile) drop it from the bar. */
  pathVisible: boolean;
  /** `null` removes the `.chg` element entirely (REQ-24) — never rendered as "unknown". */
  freshness: string | null;
  /** `null` hides the pop-out link (nothing open, or the standalone page itself). */
  popOutHref: string | null;
}

export interface ReaderVM {
  /** `null` renders "untitled", same convention as the terminal surfaces' aria-label. */
  title: string | null;
  navCollapsed: boolean;
  filesFolded: boolean;
  outlineFolded: boolean;
  bar: ReaderBarVM;
  /** `null` hides the status line entirely. */
  notice: string | null;
  planSlot: PlanSlotVM;
  /** `null` before the listing arrives — the count element is absent, never `0 .md`. */
  filesHeader: { dir: string; count: string | null };
  tree: readonly FlatTreeEntry[];
  /** REQ-10: the listing fetch hasn't resolved yet — the tree shows one `loading…` row
   * instead of `tree`'s (necessarily empty) entries. */
  treeLoading: boolean;
  outline: readonly OutlineEntryVM[];
  /** REQ-14: a user-initiated open is in flight — `article.md` dims and carries
   * `aria-busy`. */
  bodyLoading: boolean;
}

export type ReaderBody =
  | { kind: "placeholder"; text: string }
  | { kind: "fragment"; fragment: DocumentFragment; frontmatter: Frontmatter | null };

export interface ReaderCallbacks {
  /** A tree file button — `path` is relative to the session directory, exactly as the
   * listing carries it; `features/reader.ts` joins it against `directory` to fetch. */
  onSelectPath(path: string): void;
  /** The plan slot's own button — distinct from `onSelectPath` because the plan's path
   * is already absolute and usually lives outside the session directory entirely. */
  onSelectPlan(): void;
  onToggleFolder(path: string): void;
  onFilterInput(value: string): void;
  onToggleNav(): void;
  onToggleFiles(): void;
  onToggleOutline(): void;
  onOutlineSelect(id: string): void;
}

export interface ReaderRefs {
  root: HTMLElement;
  badge: HTMLElement;
  fname: HTMLElement;
  path: HTMLElement;
  chg: HTMLElement;
  chgText: HTMLElement;
  popOut: HTMLAnchorElement;
  /** The single nav-toggle button (markdown-render-fixes REQ-1..REQ-3) — last child of
   * `.docbar`, never `hidden`; its glyph and `aria-expanded` track the nav's own state. */
  navToggle: HTMLButtonElement;
  notice: HTMLElement;
  body: HTMLElement;
  nav: HTMLElement;
  planHeader: HTMLElement;
  planSlot: HTMLElement;
  filesToggle: HTMLButtonElement;
  filesDir: HTMLElement;
  filter: HTMLInputElement;
  tree: HTMLElement;
  outlineToggle: HTMLButtonElement;
  outline: HTMLElement;
  /** Plan mermaid-support (REQ-8) — one dialog per reader root (INV-3), wired once by
   * `wireDiagramDialog` in `buildReader` below; never touched by `renderReader`'s own
   * per-tick pass, since its visibility is driven entirely by open/close events. */
  diagramDialog: HTMLDialogElement;
  diagramStage: HTMLElement;
  diagramCanvas: HTMLElement;
  diagramZoomIn: HTMLButtonElement;
  diagramZoomOut: HTMLButtonElement;
  diagramZoomReset: HTMLButtonElement;
  diagramClose: HTMLButtonElement;
  callbacks: ReaderCallbacks;
}

/** Clones `#reader-template` and wires the listeners that never change for the life of
 * this instance — everything a rebuildable tree/outline button needs is wired fresh each
 * time it's (re)built, below. */
export function buildReader(template: HTMLTemplateElement, callbacks: ReaderCallbacks): ReaderRefs {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".reader");
  if (!root) throw new Error("reader-template is missing its .reader root");

  const refs: ReaderRefs = {
    root,
    badge: requireElement(".docbar > .badge", root),
    fname: requireElement(".docbar > .fname", root),
    path: requireElement(".docbar > .path", root),
    chg: requireElement(".docbar > .chg", root),
    chgText: requireElement(".chgtext", root),
    popOut: requireElement<HTMLAnchorElement>(".docbar > .ib", root),
    navToggle: requireElement<HTMLButtonElement>('[data-role="arr-nav"]', root),
    notice: requireElement(".reader-notice", root),
    body: requireElement("article.md", root),
    nav: requireElement("nav.rnav", root),
    planHeader: requireElement('[data-role="plan-header"]', root),
    planSlot: requireElement('[data-role="plan-slot"]', root),
    filesToggle: requireElement<HTMLButtonElement>('[data-role="files-toggle"]', root),
    filesDir: requireElement('[data-role="files-toggle"] .dir', root),
    filter: requireElement<HTMLInputElement>(".filter", root),
    tree: requireElement('[data-role="tree"]', root),
    outlineToggle: requireElement<HTMLButtonElement>('[data-role="outline-toggle"]', root),
    outline: requireElement('[data-role="outline"]', root),
    diagramDialog: requireElement<HTMLDialogElement>("dialog.diagram-modal", root),
    diagramStage: requireElement(".diagram-stage", root),
    diagramCanvas: requireElement(".diagram-canvas", root),
    diagramZoomIn: requireElement<HTMLButtonElement>(".diagram-zoom-in", root),
    diagramZoomOut: requireElement<HTMLButtonElement>(".diagram-zoom-out", root),
    diagramZoomReset: requireElement<HTMLButtonElement>(".diagram-zoom-reset", root),
    diagramClose: requireElement<HTMLButtonElement>(".diagram-close", root),
    callbacks,
  };

  refs.navToggle.addEventListener("click", callbacks.onToggleNav);
  refs.filesToggle.addEventListener("click", callbacks.onToggleFiles);
  refs.outlineToggle.addEventListener("click", callbacks.onToggleOutline);
  refs.filter.addEventListener("input", () => callbacks.onFilterInput(refs.filter.value));
  wireDiagramDialog(refs);

  return refs;
}

function setPresence(el: HTMLElement, anchor: HTMLElement, present: boolean): void {
  const connected = el.parentNode !== null;
  if (present && !connected) anchor.parentElement?.insertBefore(el, anchor);
  else if (!present && connected) el.remove();
}

/** `vm.popOutHref` is `null` both when nothing is open and, permanently, on the
 * standalone pop-out page itself (REQ-27) — `features/reader.ts`/`doc.ts` never compute
 * a non-null href in standalone mode, so this needs no separate "am I doc.html" flag. */
function renderBar(refs: ReaderRefs, vm: ReaderBarVM): void {
  setPresence(refs.badge, refs.fname, vm.badgeVisible);
  refs.fname.textContent = vm.fname;
  refs.path.textContent = vm.path;

  // `.chg` first, still anchored on the permanent `.ib` (popOut) — `.ib` is only ever
  // hidden (`.hidden =`), never removed from the DOM, so it's a safe anchor even when
  // `.chg` itself is absent (REQ-24's default state, no write seen yet).
  setPresence(refs.chg, refs.popOut, vm.freshness !== null);
  if (vm.freshness !== null) refs.chgText.textContent = vm.freshness;

  // `.path` anchors on `.chg` when a cue is present, and on `.ib` otherwise. `setPresence`
  // only moves an element when it transitions from absent to present — it never repairs
  // an already-connected element's position — so anchoring both insertions on the same
  // fixed point (`.ib`) left `.path` stranded after an already-connected `.chg` on a
  // Tiles→Focus round trip (review cycle 2 Major 1: `.path` is re-inserted while `.chg`
  // never moved). Picking the anchor from `.chg`'s presence this pass keeps
  // badge/fname/path/chg/popOut order deterministic regardless of what was already
  // connected going in.
  setPresence(refs.path, vm.freshness !== null ? refs.chg : refs.popOut, vm.pathVisible);

  refs.popOut.hidden = vm.popOutHref === null;
  if (vm.popOutHref !== null) refs.popOut.href = vm.popOutHref;
}

function applyPlanAttrs(btn: HTMLButtonElement, vm: Extract<PlanSlotVM, { kind: "file" }>): void {
  if (vm.current) btn.setAttribute("aria-current", "true");
  else btn.removeAttribute("aria-current");
  const existingDot = btn.querySelector<HTMLElement>(".dot");
  if (vm.dirty && !existingDot) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    btn.append(dot);
  } else if (!vm.dirty && existingDot) {
    existingDot.remove();
  }
}

/** `current`/`dirty` are attribute-level state — the same defect class review
 * markdown-viewing cycle-3 Major 1 measured on the tree/outline buttons applies here
 * identically (this is the plan slot's own single interactive button): the struct
 * signature is only `kind` + `basename` (which file, if any is open), so opening the plan
 * or a `docChanged` toggling its dirty dot updates the existing button in place rather
 * than destroying and rebuilding it. */
function renderPlanSlot(refs: ReaderRefs, vm: PlanSlotVM): void {
  // REQ-6: a dead session drops the plan header row whole (`.hd` plus its label), not
  // just the label — no empty padded strip at the top of the nav. The nav toggle now
  // lives in the docbar, unaffected by plan liveness (REQ-1).
  refs.planHeader.hidden = vm.kind === "absent";
  refs.planSlot.hidden = vm.kind === "absent";

  const structSig = vm.kind === "file" ? `file:${vm.basename}` : vm.kind;
  if (refs.planSlot.dataset["structSig"] === structSig) {
    if (vm.kind === "file") {
      const btn = refs.planSlot.querySelector<HTMLButtonElement>(".f.plan");
      if (btn) applyPlanAttrs(btn, vm);
    }
    return;
  }
  refs.planSlot.dataset["structSig"] = structSig;

  if (vm.kind === "absent") {
    refs.planSlot.replaceChildren();
    return;
  }
  if (vm.kind === "none") {
    const none = document.createElement("div");
    none.className = "f none";
    none.textContent = "no plan yet";
    refs.planSlot.replaceChildren(none);
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "f plan";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "plan";
  btn.append(badge, document.createTextNode(vm.basename));
  applyPlanAttrs(btn, vm);
  btn.addEventListener("click", () => refs.callbacks.onSelectPlan());
  refs.planSlot.replaceChildren(btn);
}

function buildTreeButton(refs: ReaderRefs, entry: FlatTreeEntry): HTMLButtonElement {
  const depthClass = `d${Math.min(entry.depth, 5)}`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `f ${depthClass}`;
  // Stable key across rebuilds, used only to restore focus onto the equivalent node
  // after a structurally-required rebuild (see file header) — not user-visible.
  btn.dataset["path"] = entry.path;
  if (entry.kind === "dir") {
    btn.setAttribute("aria-expanded", String(entry.expanded ?? false));
    const car = document.createElement("span");
    car.className = "car";
    car.setAttribute("aria-hidden", "true");
    car.textContent = entry.expanded ? "▾" : "▸";
    const cnt = document.createElement("span");
    cnt.className = "cnt";
    cnt.setAttribute("aria-hidden", "true");
    cnt.textContent = String(entry.count ?? 0);
    btn.append(car, document.createTextNode(`${entry.name}/`), cnt);
    btn.addEventListener("click", () => refs.callbacks.onToggleFolder(entry.path));
  } else {
    if (entry.current) btn.setAttribute("aria-current", "true");
    btn.append(document.createTextNode(entry.name));
    if (entry.dirty) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      btn.append(dot);
    }
    btn.addEventListener("click", () => refs.callbacks.onSelectPath(entry.path));
  }
  return btn;
}

/** Every field `buildTreeButton` reads except `current`/`dirty` (review markdown-viewing
 * cycle-3 Major 1: those two are attribute-level state, applied in place by
 * `applyTreeAttrs`, and must never force a rebuild). */
function treeStructOf(entry: FlatTreeEntry): unknown {
  return entry.kind === "dir"
    ? {
        kind: "dir",
        path: entry.path,
        name: entry.name,
        depth: entry.depth,
        expanded: entry.expanded ?? false,
        count: entry.count ?? 0,
      }
    : { kind: "file", path: entry.path, name: entry.name, depth: entry.depth };
}

/** Finds the currently-focused element's stable key, iff it's a direct child of
 * `container` — used to restore focus onto the equivalent node across a rebuild that
 * genuinely changes the row set. */
function focusedKeyWithin(container: HTMLElement, dataKey: string): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.parentElement !== container) return null;
  return active.dataset[dataKey] ?? null;
}

function restoreFocusByKey(container: HTMLElement, dataKey: string, key: string | null): void {
  if (key === null) return;
  for (const child of container.children) {
    if (child instanceof HTMLElement && child.dataset[dataKey] === key) {
      child.focus();
      return;
    }
  }
}

/** Applies `current`/`dirty` to the already-built buttons in place — entries and DOM
 * children are in the same order (both derive from the same flattened array), so this
 * never needs to search. */
function applyTreeAttrs(container: HTMLElement, entries: readonly FlatTreeEntry[]): void {
  const buttons = container.children;
  entries.forEach((entry, i) => {
    const btn = buttons[i];
    if (!(btn instanceof HTMLButtonElement) || entry.kind !== "file") return;
    if (entry.current) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
    const existingDot = btn.querySelector<HTMLElement>(".dot");
    if (entry.dirty && !existingDot) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      btn.append(dot);
    } else if (!entry.dirty && existingDot) {
      existingDot.remove();
    }
  });
}

/** REQ-10: a single `loading…` row, shaped like `.f.none` (`renderPlanSlot`'s "no plan
 * yet" placeholder) but its own class rather than a literal `.f.none` — the plan slot's
 * "no plan yet" can render before the listing fetch resolves (it reads `session.plan`,
 * not `this.listing`), so a `.rnav .f.none` locator would otherwise match both at once.
 * Not a button (Testable UI Elements: not focusable). */
function buildTreeLoadingRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "f loading-row";
  row.textContent = loadingText(null);
  return row;
}

function renderTree(refs: ReaderRefs, entries: readonly FlatTreeEntry[], loading: boolean): void {
  const structSig = loading ? "loading" : JSON.stringify(entries.map(treeStructOf));
  if (refs.tree.dataset["structSig"] === structSig) {
    if (!loading) applyTreeAttrs(refs.tree, entries);
    return;
  }
  refs.tree.dataset["structSig"] = structSig;
  if (loading) {
    refs.tree.replaceChildren(buildTreeLoadingRow());
    return;
  }
  const focusedPath = focusedKeyWithin(refs.tree, "path");
  refs.tree.replaceChildren(...entries.map((entry) => buildTreeButton(refs, entry)));
  restoreFocusByKey(refs.tree, "path", focusedPath);
}

function buildOutlineButton(refs: ReaderRefs, entry: OutlineEntryVM): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `ol h${entry.level}`;
  btn.dataset["headingId"] = entry.id;
  if (entry.current) btn.setAttribute("aria-current", "true");
  btn.textContent = entry.text;
  btn.addEventListener("click", () => refs.callbacks.onOutlineSelect(entry.id));
  return btn;
}

/** Every field `buildOutlineButton` reads except `current` (attribute-level; applied in
 * place by `applyOutlineAttrs` — same pattern as `treeStructOf`). */
function outlineStructOf(entry: OutlineEntryVM): unknown {
  return { id: entry.id, level: entry.level, text: entry.text };
}

function applyOutlineAttrs(container: HTMLElement, entries: readonly OutlineEntryVM[]): void {
  const buttons = container.children;
  entries.forEach((entry, i) => {
    const btn = buttons[i];
    if (!(btn instanceof HTMLButtonElement)) return;
    if (entry.current) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
}

function renderOutline(refs: ReaderRefs, entries: readonly OutlineEntryVM[]): void {
  const structSig = JSON.stringify(entries.map(outlineStructOf));
  if (refs.outline.dataset["structSig"] === structSig) {
    applyOutlineAttrs(refs.outline, entries);
    return;
  }
  refs.outline.dataset["structSig"] = structSig;
  const focusedId = focusedKeyWithin(refs.outline, "headingId");
  refs.outline.replaceChildren(...entries.map((entry) => buildOutlineButton(refs, entry)));
  restoreFocusByKey(refs.outline, "headingId", focusedId);
}

/** Every render pass — cheap to call on the once-a-second tick too, since the tree and
 * outline sub-builders above are signature-memoized no-ops when nothing changed. Never
 * touches `refs.filter.value` (the user's own typing) or `refs.body` (a distinct fetch
 * result, applied via `setReaderBody`). */
export function renderReader(refs: ReaderRefs, vm: ReaderVM): void {
  refs.root.setAttribute("aria-label", `Reader: ${vm.title ?? "untitled"}`);
  renderBar(refs, vm.bar);

  refs.notice.hidden = vm.notice === null;
  refs.notice.textContent = vm.notice ?? "";

  // REQ-1..REQ-3: one button, never hidden — `nav.rnav` itself is the only thing this
  // toggle hides, so the button is never rebuilt or removed and keeps focus across a
  // toggle with no restore dance needed (review markdown-viewing cycle-4 Major 1 is moot
  // for a control that can never lose its node).
  refs.nav.hidden = vm.navCollapsed;
  refs.navToggle.setAttribute("aria-expanded", String(!vm.navCollapsed));
  refs.navToggle.textContent = vm.navCollapsed ? "‹" : "›";

  renderPlanSlot(refs, vm.planSlot);

  refs.filesToggle.setAttribute("aria-expanded", String(!vm.filesFolded));
  refs.filesDir.textContent = vm.filesHeader.dir;
  const existingCount = refs.filesToggle.querySelector<HTMLElement>(".n");
  if (vm.filesHeader.count === null) {
    existingCount?.remove();
  } else {
    const countEl = existingCount ?? document.createElement("span");
    countEl.className = "n";
    countEl.textContent = vm.filesHeader.count;
    if (!existingCount) refs.filesToggle.append(countEl);
  }
  refs.filter.hidden = vm.filesFolded;
  refs.tree.hidden = vm.filesFolded;
  renderTree(refs, vm.tree, vm.treeLoading);

  refs.outlineToggle.setAttribute("aria-expanded", String(!vm.outlineFolded));
  refs.outline.hidden = vm.outlineFolded;
  renderOutline(refs, vm.outline);

  // REQ-14: `aria-busy` is removed rather than set to `"false"` when clear, matching how
  // `aria-current` is handled elsewhere in this module — the attribute's presence is the
  // durable oracle, never a computed style mid-transition.
  refs.body.classList.toggle("loading", vm.bodyLoading);
  if (vm.bodyLoading) refs.body.setAttribute("aria-busy", "true");
  else refs.body.removeAttribute("aria-busy");
}

/** Sets the reader body — only ever called when the open file's rendered content
 * actually changes (a successful fetch), never from the tick-driven `renderReader` above,
 * since a `DocumentFragment` empties itself the moment it's inserted. REQ-5/REQ-6: the
 * frontmatter node (if any) is built and prepended here, after `reader/markdown.ts`'s own
 * outline walk — so it can never be queried as a heading or counted in the outline (review
 * seed d-m4: this is the DOM half of that split). */
export function setReaderBody(refs: ReaderRefs, body: ReaderBody): void {
  if (body.kind === "placeholder") {
    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = body.text;
    refs.body.replaceChildren(p);
    return;
  }
  const frontmatterNode = buildFrontmatterNode(body.frontmatter);
  if (frontmatterNode) body.fragment.prepend(frontmatterNode);
  refs.body.replaceChildren(body.fragment);
}

/** REQ-14 scroll-spy: the last heading whose top is at or above the container's top is
 * current. rAF-throttled, one listener per instance, disposed when the instance is —
 * `getHeadingEls` is read fresh each call since the body's headings change on every
 * re-render. Returns the disposer. */
export function attachScrollSpy(
  container: HTMLElement,
  getHeadingEls: () => readonly HTMLElement[],
  onCurrentChange: (id: string | null) => void,
): () => void {
  // `.md`'s own top padding (22px / 10px compact — style.css) sits between the
  // container's border box and its first heading even when scrolled all the way to the
  // top, so a heading is "at the container's top" within a tolerance wider than any
  // padding this component uses, not a bare 1px that only a zero-padding container
  // could ever satisfy.
  const TOP_TOLERANCE_PX = 24;
  let scheduled = false;
  function computeCurrent(): void {
    scheduled = false;
    const headings = getHeadingEls();
    const containerTop = container.getBoundingClientRect().top;
    let current: string | null = null;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top - containerTop <= TOP_TOLERANCE_PX)
        current = heading.id;
      else break;
    }
    onCurrentChange(current ?? headings[0]?.id ?? null);
  }
  function onScroll(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(computeCurrent);
  }
  container.addEventListener("scroll", onScroll);
  computeCurrent();
  return () => container.removeEventListener("scroll", onScroll);
}

/** Scrolls the body so `headingEl`'s top aligns with the container's top (REQ-14's
 * outline-click-to-scroll). */
export function scrollHeadingIntoView(container: HTMLElement, headingEl: HTMLElement): void {
  const delta = headingEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += delta;
}
