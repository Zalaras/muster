// The reader controller — one `ReaderInstance` per session whose
// selected surface is `docs` in the current view (Focus's one focused id, or every live
// tile), plus the standalone pop-out's single fixed instance (`doc.ts`). Every render
// pass reads the current `Session` (title/alive/plan) straight from the shared frame —
// `app.store`'s own `sessionUpsert` handling already keeps that current; this module
// additionally subscribes to `docChanged`, `snapshot` (post-reconnect) and window
// `focus`, and owns the two HTTP fetches and the browser-side memory. `render/reader.ts`
// is DOM-only and never fetches or opens a socket. Mirrors `features/surfaces.ts`'s
// mount/dispose diff shape — the render phase below is the only place a `ReaderInstance`
// is ever constructed or disposed.
import { fetchReaderFile, fetchReaderListing, type ReaderListing } from "../api/reader";
import type { App, ConnectionStatus, RenderFrame } from "../app";
import { requireElement } from "../dom";
import type { DocChanged } from "../protocol/messages";
import type { Session } from "../protocol/session";
import { changedText } from "../reader/freshness";
import { renderMarkdown, type OutlineEntry } from "../reader/markdown";
import {
  forget,
  isDirty,
  loadMemory,
  saveMemory,
  withOpened,
  type ReaderMemory,
} from "../reader/memory";
import { mermaidThemeFor } from "../reader/mermaid";
import { classifyDocChanged, deriveNotice, UNKNOWN_SESSION_TEXT } from "../reader/notice";
import { basename, loadingText } from "../reader/paths";
import { buildTree, filterTree, flattenTree, type FlatTreeEntry } from "../reader/tree";
import { visibleIds } from "../sessions/live";
import { renderDiagrams, rerenderDiagrams } from "../render/diagrams";
import {
  attachScrollSpy,
  buildReader,
  renderReader,
  scrollHeadingIntoView,
  setReaderBody,
  type PlanSlotVM,
  type ReaderRefs,
  type ReaderVM,
} from "../render/reader";
import { getSurfaceState, type SurfaceSwitchState } from "../terminal/surfaceswitch";

export interface ReaderDeps {
  getTilesLive(): readonly number[];
  getSurfaces(): { state(): SurfaceSwitchState };
}

/** `doc.ts`'s pop-out target — `path` is the initial file to open, from `location.search`;
 * `null` when the URL carried none (the body shows the placeholder). */
export interface StandaloneTarget {
  sessionId: number;
  path: string | null;
}

/** `doc.ts`'s own query parse (moved out of the entry point itself, beside the type it
 * builds). `null` when `?session=` is missing or isn't a bare non-negative integer —
 * `doc.ts` then has no id to build a reader around at all, the nearest honest thing left
 * to show. */
export function parseStandaloneQuery(search: string): StandaloneTarget | null {
  const params = new URLSearchParams(search);
  const rawSession = params.get("session");
  const sessionId = rawSession !== null && /^\d+$/.test(rawSession) ? Number(rawSession) : null;
  if (sessionId === null) return null;
  return { sessionId, path: params.get("path") };
}

export interface ReaderHandle {
  /** For `features/focus.ts`/`features/tiles.ts` to mount, mirroring `SurfacesHandle.get`. */
  rootFor(id: number): HTMLElement | null;
}

const FILE_GONE_PREFIX = "file no longer exists — ";
const PLACEHOLDER_TEXT = "nothing open — pick a file";

/** A fresh value drawn on every diagram pass — unique per reader instance *and* per pass —
 * never reused across calls: two instances rendering the same fence (the same file open in
 * two tiles), or two passes of one instance (a fresh open racing a still in-flight one, or
 * a later theme re-render), must mint distinct SVG ids, since a diagram's own `<style>`
 * selects by `#id` and CSS id selectors aren't scoped to one subtree (`render/diagrams.ts`'s
 * `DiagramPassOptions.instance`). Minting one value per instance's whole lifetime instead
 * used to let two concurrent passes (open file A, switch to B before A's render returns)
 * mint the same id. */
let nextDiagramInstanceId = 0;

/** Reads the dashboard's current theme straight off the root — the one place both the
 * initial diagram pass and the theme-change re-render read it from, so they can never
 * disagree about which mermaid theme is current. */
function currentMermaidTheme(): "dark" | "default" {
  return mermaidThemeFor(document.documentElement.dataset["theme"] ?? null);
}

class ReaderInstance {
  private readonly sessionId: number;
  private readonly standalonePath: string | null;
  private readonly isStandalone: boolean;
  /** A per-render input (the host passes it each pass, like `session`/`now`/`connected`),
   * not a constructor-fixed field — whether the reader renders compact is a property of
   * the host ("in a tile the reader renders compact"), and a view switch (Cmd+\) keeps the
   * same instance alive across Focus/Tiles via `reconcileInstances`'s desired-set diff, so
   * a value fixed at mount time went stale the moment the host changed under it. */
  private compact = false;
  private readonly refs: ReaderRefs;
  private readonly requestRender: () => void;
  private memory: ReaderMemory;
  private listing: ReaderListing | null = null;
  /** Whether the listing fetch itself is still outstanding — distinct from
   * `listing === null`, which also stays true forever after a *failed* listing fetch
   * (`listing` is never assigned on that path). Cleared on every exit from `loadListing`
   * so the tree's `loading…` row (driven by this, not by `listing`) disappears once the
   * request settles either way. */
  private listingLoading = true;
  /** Absolute path -> the latest `writtenAt`/`docChanged.at` known for it. Seeded from the
   * listing fetch, then kept current by `docChanged` alone — the listing itself is never
   * re-fetched after mount (kb:adr/reader-change-signal-is-the-write-hook). */
  private writtenAt = new Map<string, string>();
  private openPath: string | null = null;
  private outline: OutlineEntry[] = [];
  private filterQuery = "";
  private manualExpanded = new Set<string>();
  private navCollapsed: boolean;
  private filesFolded = false;
  private outlineFolded = false;
  private currentHeadingId: string | null = null;
  private noticeText: string | null = null;
  /** The absolute path of a user-initiated open in flight; `null` otherwise. Drives both
   * the status-line text and the grey-out (`render`'s `bodyLoading`), so the two can never
   * disagree about whether something is loading. */
  private loadingPath: string | null = null;
  /** Set `true` the first time a document's fragment enters the body; never reset — once
   * something has rendered, a later failed open keeps it rather than falling back to the
   * placeholder (kb:adr/reader-loading-cue-never-clears-a-rendered-body). */
  private bodyRendered = false;
  private disposeScrollSpy: (() => void) | null = null;
  private fetchSeq = 0;
  private disposed = false;
  /** `diagramPass` is always the most recently started diagram pass — the theme observer
   * chains behind it; a fresh document open simply replaces it, since a superseded pass's
   * own `isCurrent` guard already keeps it from touching the new body regardless of
   * ordering. Each pass (an open's `renderDiagrams` call, or a theme flip's
   * `rerenderDiagrams` call) draws its own fresh id from `nextDiagramInstanceId` at the
   * call site below — never a value fixed for this instance's lifetime. */
  private diagramPass: Promise<void> = Promise.resolve();

  constructor(
    sessionId: number,
    template: HTMLTemplateElement,
    opts: {
      navCollapsedDefault: boolean;
      standalonePath: string | null;
      isStandalone: boolean;
      requestRender: () => void;
    },
  ) {
    this.sessionId = sessionId;
    this.standalonePath = opts.standalonePath;
    this.isStandalone = opts.isStandalone;
    this.navCollapsed = opts.navCollapsedDefault;
    this.requestRender = opts.requestRender;
    this.memory = loadMemory(window.localStorage, sessionId);
    this.refs = buildReader(template, {
      onSelectPath: (path) => this.selectRelative(path),
      onSelectPlan: () => this.selectPlan(),
      onToggleFolder: (path) => this.toggleFolder(path),
      onFilterInput: (value) => this.setFilter(value),
      onToggleNav: () => this.toggleNav(),
      onToggleFiles: () => this.toggleFiles(),
      onToggleOutline: () => this.toggleOutline(),
      onOutlineSelect: (id) => this.selectOutline(id),
    });
    // `render()` (called immediately after construction in both the mount and
    // reconcile paths — see `initReader`) sets the `compact` class from its own
    // parameter; nothing here needs to guess a value that will be overwritten before
    // the next paint.
    setReaderBody(this.refs, { kind: "placeholder", text: loadingText(null) });
    this.disposeScrollSpy = attachScrollSpy(
      this.refs.body,
      () => Array.from(this.refs.body.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")),
      (id) => {
        if (id === this.currentHeadingId) return;
        this.currentHeadingId = id;
        this.requestRender();
      },
    );
    this.loadListing();
  }

  get root(): HTMLElement {
    return this.refs.root;
  }

  dispose(): void {
    this.disposed = true;
    this.disposeScrollSpy?.();
    this.refs.root.remove();
  }

  private saveMemory(): void {
    saveMemory(window.localStorage, this.sessionId, this.memory);
  }

  private async loadListing(): Promise<void> {
    const seq = ++this.fetchSeq;
    const result = await fetchReaderListing(this.sessionId);
    if (this.disposed || seq !== this.fetchSeq) return;
    this.listingLoading = false;
    if (!result.ok) {
      if (result.error.code === "unknown_session") {
        this.noticeText = UNKNOWN_SESSION_TEXT;
      } else {
        this.noticeText = result.error.message;
      }
      // The listing itself failed, so nothing will ever open — settle the body rather
      // than leaving it at the constructor's `loading…` forever.
      if (!this.bodyRendered)
        setReaderBody(this.refs, { kind: "placeholder", text: PLACEHOLDER_TEXT });
      this.requestRender();
      return;
    }
    this.listing = result.value;
    if (result.value.plan?.writtenAt)
      this.writtenAt.set(result.value.plan.path, result.value.plan.writtenAt);
    for (const file of result.value.files) {
      if (file.writtenAt)
        this.writtenAt.set(`${result.value.directory}/${file.path}`, file.writtenAt);
    }
    this.decideInitialOpen(result.value);
    this.requestRender();
  }

  /** Memory wins when set; otherwise the plan opens iff it resolves; otherwise nothing
   * opens. The pop-out's own `?path=` query overrides both (`?session=<id>&path=<abs>`).
   * When nothing opens, the body must settle on `PLACEHOLDER_TEXT` rather than staying at
   * the constructor's `loading…`. */
  private decideInitialOpen(listing: ReaderListing): void {
    if (this.isStandalone) {
      if (this.standalonePath) void this.openFile(this.standalonePath, { showLoading: true });
      else setReaderBody(this.refs, { kind: "placeholder", text: PLACEHOLDER_TEXT });
      return;
    }
    if (this.memory.openPath) {
      void this.openFile(this.memory.openPath, { showLoading: true });
      return;
    }
    if (listing.plan?.exists) {
      void this.openFile(listing.plan.path, { showLoading: true });
      return;
    }
    setReaderBody(this.refs, { kind: "placeholder", text: PLACEHOLDER_TEXT });
  }

  /** `showLoading` distinguishes a user-initiated open (the bar and `aria-current` move
   * synchronously, before the await, and the reading area greys out;
   * kb:adr/reader-loading-cue-never-clears-a-rendered-body) from a silent re-fetch of the
   * already-open file (`docChanged`, window focus, post-reconnect `snapshot` — no cue,
   * ever). Every resolution path clears `loadingPath` behind the existing
   * `disposed`/`fetchSeq`/`openPath` guard: a fetch superseded by a newer open never
   * reaches that line, so it can't clear a newer load's cue. */
  private async openFile(absPath: string, opts: { showLoading: boolean }): Promise<void> {
    const seq = ++this.fetchSeq;
    this.openPath = absPath;
    if (opts.showLoading) {
      this.loadingPath = absPath;
      this.noticeText = null;
      this.outline = [];
      this.currentHeadingId = null;
      // Nothing has rendered yet, so the status line's own cue is suppressed
      // (deriveNotice) — the body must carry the loading cue itself instead of leaving the
      // constructor/failed-open placeholder text on screen while a fetch the bar already
      // names is in flight.
      if (!this.bodyRendered)
        setReaderBody(this.refs, { kind: "placeholder", text: loadingText(null) });
      this.requestRender();
    }
    const result = await fetchReaderFile(this.sessionId, absPath);
    if (this.disposed || seq !== this.fetchSeq || this.openPath !== absPath) return;
    this.loadingPath = null;
    if (!result.ok) {
      this.noticeText =
        result.error.code === "not_found" ? `${FILE_GONE_PREFIX}${absPath}` : result.error.message;
      // Keep the last render on a failed open once something has rendered; otherwise
      // settle on the placeholder rather than leaving the body stuck at `loading…`.
      if (!this.bodyRendered)
        setReaderBody(this.refs, { kind: "placeholder", text: PLACEHOLDER_TEXT });
      this.requestRender();
      return;
    }
    this.noticeText = null;
    const { fragment, outline, frontmatter } = renderMarkdown(result.value);
    this.outline = outline;
    this.currentHeadingId = outline[0]?.id ?? null;
    this.bodyRendered = true;
    setReaderBody(this.refs, { kind: "fragment", fragment, frontmatter });
    // Runs after the fragment is in the DOM and `renderMarkdown` has already assigned
    // heading ids — a no-op for a document with no mermaid fence. Never awaited here: the
    // fenced source stays visible while it's in flight, and a superseded open is caught by
    // its own `isCurrent` guard rather than by blocking this method on it.
    this.diagramPass = renderDiagrams(this.refs.body, {
      instance: nextDiagramInstanceId++,
      isCurrent: () => !this.disposed && seq === this.fetchSeq,
      theme: currentMermaidTheme(),
    });
    const writtenAt = this.writtenAt.get(absPath) ?? null;
    this.memory = withOpened(this.memory, absPath, writtenAt);
    this.saveMemory();
    this.requestRender();
  }

  private selectRelative(relPath: string): void {
    if (!this.listing) return;
    void this.openFile(`${this.listing.directory}/${relPath}`, { showLoading: true });
  }

  private selectPlan(): void {
    const plan = this.listing?.plan;
    if (!plan) return;
    void this.openFile(plan.path, { showLoading: true });
  }

  private toggleFolder(path: string): void {
    if (this.manualExpanded.has(path)) this.manualExpanded.delete(path);
    else this.manualExpanded.add(path);
    this.requestRender();
  }

  private setFilter(value: string): void {
    this.filterQuery = value;
    if (value.trim() === "") this.manualExpanded.clear();
    this.requestRender();
  }

  private toggleNav(): void {
    this.navCollapsed = !this.navCollapsed;
    this.requestRender();
  }

  private toggleFiles(): void {
    this.filesFolded = !this.filesFolded;
    this.requestRender();
  }

  private toggleOutline(): void {
    this.outlineFolded = !this.outlineFolded;
    this.requestRender();
  }

  private selectOutline(id: string): void {
    this.currentHeadingId = id;
    const heading = this.refs.body.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (heading) scrollHeadingIntoView(this.refs.body, heading);
    this.requestRender();
  }

  /** A routed write for the open file re-fetches and re-renders it silently
   * (`showLoading: false`, so a refetch never blanks the current content); any other in-scope path just
   * updates the dot via the `writtenAt` overlay (no re-listing). The classification itself
   * is `classifyDocChanged`: a `docChanged` for a path that isn't open never re-fetches,
   * even mid-open-in-flight for a different path. */
  handleDocChanged(msg: DocChanged): void {
    this.writtenAt.set(msg.path, msg.at);
    if (classifyDocChanged(this.openPath, msg.path) === "refetch")
      void this.openFile(msg.path, { showLoading: false });
    else this.requestRender();
  }

  /** Re-fetches the open file on a `snapshot` (post-reconnect), silently — `initReader`'s
   * own `app.on("snapshot", ...)` below calls this for every mounted instance. Mount
   * itself already fetches via `loadListing`+`decideInitialOpen`, so this only matters for
   * a later reconnect while the same instance stays mounted. */
  refetchOpenFile(): void {
    if (this.openPath) void this.openFile(this.openPath, { showLoading: false });
  }

  /** Window `focus` only re-fetches when the open file is the plan, silently. */
  handleWindowFocus(): void {
    if (this.openPath && this.listing?.plan?.path === this.openPath)
      void this.openFile(this.openPath, { showLoading: false });
  }

  /** Re-renders every already-rendered diagram from its retained source in the newly
   * mapped theme — never re-fetching the file. Chains behind whatever diagram pass is
   * already in flight (the initial `renderDiagrams` from the current open, or a previous
   * theme flip) rather than racing it; `seq` pins this re-render to the file open that was
   * current when the theme changed, so a document switched in the meantime discards it via
   * the same `isCurrent` guard every other diagram write uses. Called by `initReader`'s own
   * `app.on("themeChanged", ...)` for every mounted instance — this used to be each
   * instance's own `MutationObserver` on `<html data-theme>`, which is what forced
   * `doc.ts` to fake a no-op `surfaces.applyTheme` for `features/theme.ts`'s other push
   * path; both surfaces now react to the same signal. */
  handleThemeChange(): void {
    const theme = currentMermaidTheme();
    const seq = this.fetchSeq;
    const instance = nextDiagramInstanceId++;
    this.diagramPass = this.diagramPass
      .catch(() => {})
      .then(() =>
        rerenderDiagrams(this.refs.body, {
          instance,
          theme,
          isCurrent: () => !this.disposed && seq === this.fetchSeq,
        }),
      );
  }

  /** A plan that appears after mount (ExitPlanMode's `sessionUpsert`) opens
   * automatically iff nothing is open yet. `decideInitialOpen` only runs once at mount
   * from `loadListing`, so it never sees a plan that shows up later on an
   * already-mounted, empty reader — this covers that transition on the next render
   * pass. Gated on `this.listing` so it never races `decideInitialOpen` itself: both are
   * set/called synchronously inside `loadListing`, so `render` can't observe a
   * non-null `listing` with `decideInitialOpen` still pending. */
  private maybeAutoOpenPlan(session: Session | null): void {
    if (this.isStandalone || this.listing === null || this.openPath !== null) return;
    const plan = session?.plan;
    if (plan?.exists) void this.openFile(plan.path, { showLoading: true });
  }

  private buildPlanSlot(session: Session | null): PlanSlotVM {
    if (!session?.alive) return { kind: "absent" };
    const plan = session.plan;
    if (!plan?.exists) return { kind: "none" };
    return {
      kind: "file",
      basename: basename(plan.path),
      dirty: isDirty(this.memory, plan.path, this.writtenAt.get(plan.path) ?? null),
      current: this.openPath === plan.path,
    };
  }

  /** The nav tree, flattened and decorated with this instance's dirty/current state —
   * split out of `render` purely to keep that function's cognitive complexity under the
   * project ceiling; it reads no state `render` doesn't already hold. */
  private buildTreeVM(): FlatTreeEntry[] {
    const listing = this.listing;
    const directory = listing?.directory ?? null;
    const isDirtyRel = (relPath: string): boolean => {
      if (!directory) return false;
      const abs = `${directory}/${relPath}`;
      return isDirty(this.memory, abs, this.writtenAt.get(abs) ?? null);
    };
    const isCurrentRel = (relPath: string): boolean =>
      directory !== null && this.openPath === `${directory}/${relPath}`;

    const baseTree = listing ? buildTree(listing.files.map((f) => f.path)) : [];
    const filtering = this.filterQuery.trim() !== "";
    const activeTree = filtering ? filterTree(baseTree, this.filterQuery) : baseTree;
    return flattenTree(activeTree, filtering ? new Set<string>() : this.manualExpanded, {
      isDirty: isDirtyRel,
      isCurrent: isCurrentRel,
    });
  }

  private buildBarVM(session: Session | null, now: Date): ReaderVM["bar"] {
    // A present `session` is authoritative, including an explicit `plan: null` (no
    // plan) — the listing's own (possibly stale) plan path is a fallback only for the
    // rare case `session` itself isn't known yet (kb:adr/reader-plan-sticky-once-named).
    const planPath = session ? (session.plan?.path ?? null) : (this.listing?.plan?.path ?? null);
    const openWrittenAt = this.openPath ? (this.writtenAt.get(this.openPath) ?? null) : null;
    return {
      badgeVisible: this.openPath !== null && this.openPath === planPath,
      fname: this.openPath ? basename(this.openPath) : "",
      path: this.openPath ?? "",
      pathVisible: !this.compact,
      freshness: openWrittenAt ? changedText(openWrittenAt, now) : null,
      popOutHref:
        this.isStandalone || !this.openPath || !session
          ? null
          : `/doc.html?session=${session.id}&path=${encodeURIComponent(this.openPath)}`,
    };
  }

  render(session: Session | null, now: Date, connection: ConnectionStatus, compact: boolean): void {
    this.compact = compact;
    this.refs.root.classList.toggle("compact", compact);
    this.maybeAutoOpenPlan(session);
    const listing = this.listing;
    // Design-system §6.7: daemon-down is loud and wins over whatever notice was showing —
    // the render underneath (last content, or the placeholder) is left exactly as-is.
    // A reader that has never connected reads "connecting…" instead —
    // `deriveNotice` is the one place that ordering is decided.
    const notice = deriveNotice(connection, this.loadingPath, this.bodyRendered, this.noticeText);

    const vm: ReaderVM = {
      title: session?.title ?? null,
      navCollapsed: this.navCollapsed,
      filesFolded: this.filesFolded,
      outlineFolded: this.outlineFolded,
      bar: this.buildBarVM(session, now),
      notice,
      planSlot: this.buildPlanSlot(session),
      filesHeader: {
        dir: listing?.directory ?? "",
        // Compact drops the count too, regardless of whether the listing arrived.
        count:
          listing && !this.compact
            ? `${listing.files.length}${listing.truncated ? "+" : ""} .md`
            : null,
      },
      tree: this.buildTreeVM(),
      treeLoading: this.listingLoading,
      outline: this.outline.map((entry) => ({
        ...entry,
        current: entry.id === this.currentHeadingId,
      })),
      bodyLoading: this.loadingPath !== null,
    };

    renderReader(this.refs, vm);
  }
}

/** The visible ids (`sessions/live.ts`'s `visibleIds` — the same rule
 * `features/surfaces.ts`'s terminal visibility uses) that also currently have `docs`
 * selected as their surface. */
function visibleDocsIds(app: App, deps: ReaderDeps): readonly number[] {
  const state = deps.getSurfaces().state();
  return visibleIds(app.state.view, app.state.focusedId, deps.getTilesLive()).filter(
    (id) => getSurfaceState(state, id).selected === "docs",
  );
}

export function initReader(
  app: App,
  deps: ReaderDeps,
  standalone?: StandaloneTarget,
): ReaderHandle {
  const template = requireElement<HTMLTemplateElement>("#reader-template");
  const instances = new Map<number, ReaderInstance>();

  function newInstance(id: number, standaloneTarget?: StandaloneTarget): ReaderInstance {
    // Mount-time only: the "starts collapsed" default, unlike `compact` itself (now a
    // per-render input), is genuinely a one-shot decision made when the instance first
    // appears.
    const mountCompact = !standaloneTarget && app.state.view === "tiles";
    const navCollapsedDefault = mountCompact && app.state.density === "3x2";
    return new ReaderInstance(id, template, {
      navCollapsedDefault,
      standalonePath: standaloneTarget?.path ?? null,
      isStandalone: standaloneTarget !== undefined,
      requestRender: () => app.render(),
    });
  }

  if (standalone) {
    const instance = newInstance(standalone.sessionId, standalone);
    instances.set(standalone.sessionId, instance);
  }

  /** Mount/dispose diff over the sessions currently showing `docs` — dashboard mode
   * only; split out of `renderFrame` purely to keep that function's complexity under
   * the project ceiling. */
  function reconcileInstances(frame: RenderFrame): void {
    const desired = new Set(visibleDocsIds(app, deps));
    // Computed once per pass here rather than once at mount — a live instance kept alive
    // across a Focus/Tiles switch (`desired` stays true for it) must reflect the *current*
    // host, not the one it was born into.
    const compact = app.state.view === "tiles";
    for (const [id, instance] of instances) {
      if (!desired.has(id)) {
        instance.dispose();
        instances.delete(id);
      }
    }
    for (const id of desired) {
      const session = frame.sessions.find((s) => s.id === id);
      if (!session) continue;
      let instance = instances.get(id);
      if (!instance) {
        instance = newInstance(id);
        instances.set(id, instance);
      }
      instance.render(session, frame.now, frame.connection, compact);
    }
  }

  function renderFrame(frame: RenderFrame): void {
    if (standalone) {
      const instance = instances.get(standalone.sessionId);
      const session = frame.sessions.find((s) => s.id === standalone.sessionId) ?? null;
      instance?.render(session, frame.now, frame.connection, false);
      return;
    }
    reconcileInstances(frame);
  }

  app.onRender(renderFrame);

  app.on("docChanged", (msg) => {
    instances.get(msg.id)?.handleDocChanged(msg);
  });

  // Re-fetch the open file after a reconnect (`snapshot` follows every `hello`).
  app.on("snapshot", () => {
    for (const instance of instances.values()) instance.refetchOpenFile();
  });

  // The one theme-change signal features/theme.ts emits, replacing each instance's own
  // `<html data-theme>` `MutationObserver`.
  app.on("themeChanged", () => {
    for (const instance of instances.values()) instance.handleThemeChange();
  });

  window.addEventListener("focus", () => {
    for (const instance of instances.values()) instance.handleWindowFocus();
  });

  if (!standalone) {
    app.on("sessionRemoved", (id) => {
      instances.get(id)?.dispose();
      instances.delete(id);
      // Reader memory is created/saved/forgotten only by this feature —
      // `features/actions.ts`'s `handleRemoved` used to clear it directly.
      forget(window.localStorage, id);
    });
  }

  return {
    rootFor: (id) => instances.get(id)?.root ?? null,
  };
}
