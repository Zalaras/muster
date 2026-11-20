import {
  type DiffBody,
  type DiffReview,
  type DiffScope,
  type DiffSummary,
  fetchDiff,
  fetchDiffReview,
} from "../api/diff";
import { buildBody, type DiffView } from "../render/diffbody";
import { setText } from "../dom";
import { buildChrome, type SideTab, setPressed } from "../render/diffchrome";
import { buildFilesRow, buildMapMark } from "../render/diffside";
import { el } from "../render/diffrows";
import { diffErrorText, pickScope, summaryLine, whatChanged } from "./diffbutton";
import { createComments } from "./diffcomments";
import { buildModels } from "./diffmodel";
import {
  flip,
  flushPending,
  onReviewKey,
  reopenChange,
  resetTicks,
  showChange,
  syncReview,
  tickFile,
  toggleChangeTick,
  toggleFileFold,
} from "./diffreviewui";
import { type CommentWrites, newViewerState, type ViewerCtx } from "./diffviewerstate";

export interface ViewerDeps {
  id: number;
  initialView: DiffView;
  rememberView(view: DiffView): void;
  reviewChanged(): void;
  close(): void;
}

export interface Viewer {
  root: HTMLElement;
  isOpen(): boolean;
  open(summary: DiffSummary): void;
  hide(): void;
  counts(summary: DiffSummary): void;
  onMounted(): void;
  focus(): void;
  escape(): boolean;
}

function indexIn(target: Element, selector: string, attr: string): number {
  const node = target.closest<HTMLElement>(selector);
  return node ? Number(node.dataset[attr]) : -1;
}

export function createViewer(deps: ViewerDeps): Viewer {
  const chrome = buildChrome();
  const s = newViewerState(deps.initialView);
  const ctx: ViewerCtx = { id: deps.id, chrome, s, reviewChanged: deps.reviewChanged };
  const comments = createComments(ctx);
  let requestId = 0;
  let fetchingFor: string | null = null;
  let loadError = "";

  function renderToolbar(): void {
    setPressed(chrome.scopes.uncommitted, s.scope === "uncommitted");
    setPressed(chrome.scopes.branch, s.scope === "branch");
    for (const view of ["unified", "split", "review"] as const)
      setPressed(chrome.views[view], s.view === view);
    setText(chrome.summary, s.diff ? summaryLine(s.diff) : "");
    for (const tab of ["files", "comments"] as const) setPressed(chrome.tabs[tab], s.tab === tab);
    chrome.filesPanel.hidden = s.tab !== "files";
    chrome.commentsPanel.hidden = s.tab !== "comments";
  }

  function showBar(text: string | null): void {
    chrome.bar.hidden = text === null;
    setText(chrome.barText, text ?? "");
  }

  function rebuildBody(): void {
    comments.closeDraft();
    s.selection = null;
    if (!s.diff) return;
    const body = buildBody(s.models, s.view);
    s.body = body;
    s.filesRows = s.models.map((m) =>
      buildFilesRow(m, s.view === "review" && m.changes.length > 0),
    );
    chrome.filesPanel.replaceChildren(...s.filesRows.map((r) => r.root));
    s.map = [];
    if (s.view === "review") {
      for (const [fi, file] of body.files.entries()) {
        for (const ci of file.changes.keys())
          s.map.push({ fi, ci, el: buildMapMark(s.map.length + 1) });
      }
    }
    chrome.map.replaceChildren(...s.map.map((m) => m.el));
    chrome.content.replaceChildren(body.root);
    chrome.scroll.scrollTop = s.scrollTop;
    comments.sync();
  }

  function renderContent(): void {
    renderToolbar();
    if (s.load === "error") {
      chrome.content.replaceChildren(el("div", "dv-error", `Couldn't read the diff: ${loadError}`));
      s.body = null;
      return;
    }
    if (s.load === "loading" && !s.diff) {
      chrome.content.replaceChildren(el("div", "dv-loading", "Loading…"));
      s.body = null;
      return;
    }
    rebuildBody();
  }

  function applyReview(value: DiffReview, writes: CommentWrites, tickWrites: number): void {
    const quiet =
      writes.active === 0 &&
      s.commentWrites.active === 0 &&
      s.commentWrites.started === writes.started;
    if (quiet) s.comments = value.comments;
    if (s.tickWrites !== tickWrites) return;
    s.ticks = new Set(value.ticks);
    for (const key of s.pendingAdd) s.ticks.add(key);
    for (const key of s.pendingRemove) s.ticks.delete(key);
  }

  async function load(scope: DiffScope): Promise<void> {
    const mine = ++requestId;
    s.scope = scope;
    s.load = "loading";
    if (!s.diff || s.diff.scope !== scope) {
      s.diff = null;
      s.models = [];
      renderContent();
    }
    const tickWrites = s.tickWrites;
    await flushPending(ctx);
    const writes = { ...s.commentWrites };
    const [diff, review] = await Promise.all([fetchDiff(deps.id, scope), fetchDiffReview(deps.id)]);
    if (mine !== requestId) return;
    if (!diff.ok) {
      s.load = "error";
      loadError = diffErrorText(diff.error);
      renderContent();
      return;
    }
    if (review.ok) applyReview(review.value, writes, tickWrites);
    s.load = "ready";
    s.diff = diff.value;
    s.latest = null;
    s.models = buildModels(diff.value.files);
    showBar(null);
    renderContent();
    deps.reviewChanged();
  }

  function refresh(): void {
    s.scrollTop = chrome.scroll.scrollTop;
    void load(s.scope);
  }

  function setScope(scope: DiffScope): void {
    if (scope === s.scope && s.load === "ready") return;
    s.scrollTop = 0;
    void load(scope);
  }

  function setView(view: DiffView): void {
    if (view === s.view) return;
    s.scrollTop = chrome.scroll.scrollTop;
    s.view = view;
    deps.rememberView(view);
    renderToolbar();
    if (s.load === "ready") rebuildBody();
    syncReview(ctx);
  }

  function setTab(tab: SideTab): void {
    s.tab = tab;
    renderToolbar();
    comments.syncLists();
  }

  function counts(summary: DiffSummary): void {
    if (!s.open || !s.diff || s.load !== "ready") return;
    const fingerprint = summary[s.scope].fingerprint;
    if (fingerprint === s.diff.fingerprint) {
      s.latest = null;
      showBar(null);
      return;
    }
    if (s.latest?.fingerprint === fingerprint || fetchingFor === fingerprint) return;
    fetchingFor = fingerprint;
    const scope = s.scope;
    const shown = s.diff;
    void fetchDiff(deps.id, scope).then((result) => {
      fetchingFor = null;
      if (!result.ok || !s.open || s.scope !== scope || s.diff !== shown) return;
      applyLatest(shown, result.value);
    });
  }

  function applyLatest(shown: DiffBody, latest: DiffBody): void {
    if (latest.fingerprint === shown.fingerprint) {
      s.latest = null;
      showBar(null);
      return;
    }
    s.latest = latest;
    showBar(`This diff has changed since you opened it — ${whatChanged(shown, latest)}`);
  }

  function open(summary: DiffSummary): void {
    if (s.open) return;
    s.open = true;
    s.tab = "files";
    void load(pickScope(summary));
  }

  function hide(): void {
    comments.closeDraft();
    s.selection = null;
    s.open = false;
    requestId++;
  }

  function onClick(event: MouseEvent): void {
    comments.onClick(event);
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (clickControl(target)) return;
    flipFromBlock(target);
  }

  function changeKeyAt(target: Element): string | null {
    const fi = indexIn(target, ".dv-file", "fi");
    const ci = indexIn(target, ".dv-change-wrap", "change");
    const ref = s.body?.files[fi]?.changes.find((c) => c.change.index === ci);
    return ref ? ref.change.key : null;
  }

  function clickControl(target: Element): boolean {
    const fold = target.closest(".dv-fold");
    if (fold) {
      toggleFileFold(ctx, indexIn(fold, ".dv-file", "fi"));
      return true;
    }
    const tick = target.closest(".dv-changetick");
    const key = tick ? changeKeyAt(tick) : null;
    if (key) {
      toggleChangeTick(ctx, key);
      return true;
    }
    const folded = target.closest(".dv-folded");
    const foldedKey = folded ? changeKeyAt(folded) : null;
    if (foldedKey) {
      reopenChange(ctx, foldedKey);
      return true;
    }
    return clickSide(target);
  }

  function clickSide(target: Element): boolean {
    const jump = target.closest(".dv-fjump");
    if (jump) {
      jumpToFile(s.filesRows.findIndex((r) => r.root.contains(jump)));
      return true;
    }
    const mark = target.closest(".dv-mark");
    if (mark) {
      const at = s.map.find((m) => m.el === mark);
      if (at) showChange(ctx, at.fi, at.ci);
      return true;
    }
    return false;
  }

  function jumpToFile(fi: number): void {
    const file = s.body?.files[fi];
    if (!file) return;
    s.fileFold.set(file.model.file.path, false);
    syncReview(ctx);
    file.section.scrollIntoView({ block: "start" });
  }

  function flipFromBlock(target: Element): void {
    const block = target.closest(".dv-change");
    if (!block || target.closest("button, input, textarea, .dv-num, .dv-plus, .dv-comment-ui"))
      return;
    if (window.getSelection()?.toString()) return;
    const key = changeKeyAt(block);
    if (key) flip(ctx, key);
  }

  function onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("dv-filetick")) return;
    const rowIndex = s.filesRows.findIndex((r) => r.root.contains(target));
    const fi = rowIndex >= 0 ? rowIndex : indexIn(target, ".dv-file", "fi");
    tickFile(ctx, fi, target.checked);
  }

  chrome.root.addEventListener("click", onClick);
  chrome.root.addEventListener("change", onChange);
  chrome.root.addEventListener("pointerdown", (e) => comments.onPointerDown(e));
  chrome.root.addEventListener("keydown", (e) => {
    if (onReviewKey(ctx, e)) e.preventDefault();
  });
  chrome.scroll.addEventListener("scroll", () => {
    s.scrollTop = chrome.scroll.scrollTop;
  });
  chrome.scopes.uncommitted.addEventListener("click", () => setScope("uncommitted"));
  chrome.scopes.branch.addEventListener("click", () => setScope("branch"));
  for (const view of ["unified", "split", "review"] as const) {
    chrome.views[view].addEventListener("click", () => setView(view));
  }
  chrome.tabs.files.addEventListener("click", () => setTab("files"));
  chrome.tabs.comments.addEventListener("click", () => setTab("comments"));
  chrome.reset.addEventListener("click", () => resetTicks(ctx));
  chrome.refresh.addEventListener("click", refresh);
  chrome.barRefresh.addEventListener("click", refresh);
  chrome.close.addEventListener("click", () => deps.close());
  renderToolbar();

  return {
    root: chrome.root,
    isOpen: () => s.open,
    open,
    hide,
    counts,
    onMounted() {
      chrome.scroll.scrollTop = s.scrollTop;
    },
    focus() {
      chrome.scroll.focus({ preventScroll: true });
    },
    escape: () => comments.dismiss(),
  };
}
