import type { DiffScope } from "../api/diff";
import type { DiffView } from "./diffbody";
import { button, el } from "./diffrows";

export type SideTab = "files" | "comments";

export interface ChromeRefs {
  root: HTMLElement;
  scopes: Record<DiffScope, HTMLButtonElement>;
  views: Record<DiffView, HTMLButtonElement>;
  summary: HTMLElement;
  reviewTools: HTMLElement;
  progress: HTMLElement;
  reset: HTMLButtonElement;
  tickFail: HTMLElement;
  refresh: HTMLButtonElement;
  close: HTMLButtonElement;
  bar: HTMLElement;
  barText: HTMLElement;
  barRefresh: HTMLButtonElement;
  scroll: HTMLElement;
  content: HTMLElement;
  map: HTMLElement;
  tabs: Record<SideTab, HTMLButtonElement>;
  filesPanel: HTMLElement;
  commentsPanel: HTMLElement;
  openList: HTMLElement;
  resolvedSection: HTMLDetailsElement;
  resolvedTitle: HTMLElement;
  resolvedList: HTMLElement;
}

function toggle(text: string, className: string): HTMLButtonElement {
  const node = button(text, className);
  node.setAttribute("aria-pressed", "false");
  return node;
}

function segment(label: string): HTMLElement {
  const group = el("div", "dv-seg");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  return group;
}

function buildToolbar(): Pick<
  ChromeRefs,
  | "scopes"
  | "views"
  | "summary"
  | "reviewTools"
  | "progress"
  | "reset"
  | "tickFail"
  | "refresh"
  | "close"
> & { toolbar: HTMLElement } {
  const toolbar = el("div", "dv-toolbar");
  const scopeGroup = segment("Scope");
  const scopes = {
    uncommitted: toggle("Uncommitted", "dv-seg-btn"),
    branch: toggle("Branch", "dv-seg-btn"),
  };
  scopeGroup.append(scopes.uncommitted, scopes.branch);
  const viewGroup = segment("View");
  const views = {
    unified: toggle("Unified", "dv-seg-btn"),
    split: toggle("Split", "dv-seg-btn"),
    review: toggle("Review", "dv-seg-btn"),
  };
  viewGroup.append(views.unified, views.split, views.review);
  const summary = el("span", "dv-summary");
  const reviewTools = el("span", "dv-review-tools");
  const progress = el("span", "dv-progress");
  const reset = button("Reset");
  const tickFail = el("span", "dv-fail");
  tickFail.setAttribute("role", "status");
  tickFail.hidden = true;
  reviewTools.append(progress, reset, tickFail);
  const refresh = button("Refresh");
  const close = button("×", "dv-btn dv-close");
  close.setAttribute("aria-label", "Close diff viewer");
  toolbar.append(
    scopeGroup,
    viewGroup,
    summary,
    reviewTools,
    el("span", "dv-spacer"),
    refresh,
    close,
  );
  return {
    toolbar,
    scopes,
    views,
    summary,
    reviewTools,
    progress,
    reset,
    tickFail,
    refresh,
    close,
  };
}

function buildBar(): Pick<ChromeRefs, "bar" | "barText" | "barRefresh"> {
  const bar = el("div", "dv-bar");
  bar.setAttribute("role", "status");
  bar.hidden = true;
  const barText = el("span", "dv-bar-text");
  const barRefresh = button("Refresh", "dv-btn primary");
  bar.append(barText, barRefresh);
  return { bar, barText, barRefresh };
}

function buildSide(): Pick<
  ChromeRefs,
  | "tabs"
  | "filesPanel"
  | "commentsPanel"
  | "openList"
  | "resolvedSection"
  | "resolvedTitle"
  | "resolvedList"
> & { side: HTMLElement } {
  const side = el("aside", "dv-side");
  side.setAttribute("aria-label", "Diff side panel");
  const tabs = { files: toggle("Files", "dv-tab"), comments: toggle("Comments (0)", "dv-tab") };
  const tabRow = el("div", "dv-tabs");
  tabRow.append(tabs.files, tabs.comments);
  const filesPanel = el("div", "dv-panel dv-files-list");
  const commentsPanel = el("div", "dv-panel dv-comments-list");
  const openList = el("div", "dv-open-list");
  const resolvedSection = el("details", "dv-resolved-section");
  const resolvedTitle = el("summary", "dv-resolved-title");
  const resolvedList = el("div", "dv-resolved-list");
  resolvedSection.append(resolvedTitle, resolvedList);
  commentsPanel.append(openList, resolvedSection);
  side.append(tabRow, filesPanel, commentsPanel);
  return {
    side,
    tabs,
    filesPanel,
    commentsPanel,
    openList,
    resolvedSection,
    resolvedTitle,
    resolvedList,
  };
}

export function buildChrome(): ChromeRefs {
  const root = el("section", "dv");
  root.setAttribute("aria-label", "Diff");
  const tools = buildToolbar();
  const bar = buildBar();
  const side = buildSide();
  const main = el("div", "dv-main");
  const scroll = el("div", "dv-scroll");
  scroll.tabIndex = -1;
  const content = el("div", "dv-content");
  scroll.append(content);
  const map = el("div", "dv-map");
  map.hidden = true;
  main.append(scroll, map, side.side);
  root.append(tools.toolbar, bar.bar, main);
  return { root, ...tools, ...bar, ...side, scroll, content, map };
}

export function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  const value = String(pressed);
  if (button.getAttribute("aria-pressed") !== value) button.setAttribute("aria-pressed", value);
}
