import type { Change, Entry, FileModel } from "./diffshape";
import {
  buildHunkRow,
  buildPlaceholder,
  buildSplitRow,
  buildUnifiedRow,
  button,
  el,
} from "./diffrows";

export type DiffView = "unified" | "split" | "review";

export interface ChangeRefs {
  change: Change;
  el: HTMLElement;
  block: HTMLElement;
  label: HTMLElement;
  tick: HTMLButtonElement;
  after: HTMLElement;
  before: HTMLElement;
  folded: HTMLButtonElement;
  head: HTMLElement;
}

export interface FileRefs {
  model: FileModel;
  section: HTMLElement;
  fold: HTMLButtonElement;
  body: HTMLElement;
  tick: HTMLInputElement | null;
  tickCount: HTMLElement | null;
  changes: ChangeRefs[];
  anchors: Map<number, HTMLElement>;
  marks: Map<number, HTMLElement[]>;
}

export interface BodyRefs {
  root: HTMLElement;
  files: FileRefs[];
}

function buildHead(
  model: FileModel,
  review: boolean,
): Pick<FileRefs, "fold" | "tick" | "tickCount"> & { head: HTMLElement } {
  const { file } = model;
  const head = el("div", "dv-file-head");
  const fold = button("", "dv-fold");
  fold.setAttribute("aria-expanded", "true");
  fold.append(
    el("span", `dv-status ${file.status}`, file.status),
    el("span", "dv-path", model.path),
  );
  head.append(fold, el("span", "dv-counts", model.counts));
  let tick: HTMLInputElement | null = null;
  let tickCount: HTMLElement | null = null;
  if (review && model.changes.length > 0) {
    tick = buildFileTick(model.path);
    tickCount = el("span", "dv-tickcount");
    tickCount.hidden = true;
    head.append(tick, tickCount);
  }
  return { head, fold, tick, tickCount };
}

export function buildFileTick(path: string): HTMLInputElement {
  const tick = el("input", "dv-filetick");
  tick.type = "checkbox";
  tick.setAttribute("aria-label", `Mark ${path} reviewed`);
  return tick;
}

function appendRow(refs: FileRefs, parent: HTMLElement, entry: Entry): HTMLElement {
  const row = buildUnifiedRow(entry);
  parent.append(row);
  refs.anchors.set(entry.idx, row);
  refs.marks.set(entry.idx, [row]);
  return row;
}

function buildUnified(refs: FileRefs): void {
  let hunk = -1;
  for (const entry of refs.model.entries) {
    if (entry.hunk !== hunk) {
      hunk = entry.hunk;
      const header = refs.model.file.hunks[hunk]?.header ?? "";
      refs.body.append(buildHunkRow(header));
    }
    appendRow(refs, refs.body, entry);
  }
}

function appendSplit(refs: FileRefs, oldEntry: Entry | null, newEntry: Entry | null): void {
  const { row, cells } = buildSplitRow(oldEntry, newEntry);
  refs.body.append(row);
  for (const { idx, cell } of cells) {
    refs.anchors.set(idx, row);
    refs.marks.set(idx, [cell]);
  }
  const both = oldEntry && newEntry && oldEntry.kind === "context";
  if (both)
    refs.marks.set(newEntry.idx, [row.children[0] as HTMLElement, row.children[1] as HTMLElement]);
}

function appendSplitChange(refs: FileRefs, change: Change): void {
  const { entries } = refs.model;
  const rows = Math.max(change.dels.length, change.adds.length);
  for (let r = 0; r < rows; r++) {
    const del = change.dels[r];
    const add = change.adds[r];
    appendSplit(
      refs,
      del === undefined ? null : (entries[del] as Entry),
      add === undefined ? null : (entries[add] as Entry),
    );
  }
}

function buildSplit(refs: FileRefs): void {
  const { entries, changes } = refs.model;
  let hunk = -1;
  let lastChange = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Entry;
    if (entry.hunk !== hunk) {
      hunk = entry.hunk;
      refs.body.append(buildHunkRow(refs.model.file.hunks[hunk]?.header ?? ""));
    }
    if (entry.kind === "context") {
      appendSplit(refs, entry, entry);
      continue;
    }
    if (entry.change === lastChange) continue;
    lastChange = entry.change;
    appendSplitChange(refs, changes[entry.change] as Change);
  }
}

function buildChange(refs: FileRefs, change: Change): ChangeRefs {
  const { entries } = refs.model;
  const block = el("div", "dv-change");
  block.dataset["change"] = String(change.index);
  const head = el("div", "dv-change-head");
  const label = el("span", "dv-label", "after");
  const tick = button("✓", "dv-changetick");
  tick.setAttribute("aria-label", "Mark change reviewed");
  tick.title = "Mark change reviewed";
  head.append(label, el("span", "dv-counts", change.counts), tick);
  const after = el("div", "dv-after");
  const before = el("div", "dv-before");
  for (const i of change.adds) appendRow(refs, after, entries[i] as Entry);
  for (const i of change.dels) appendRow(refs, before, entries[i] as Entry);
  if (change.adds.length === 0) after.append(buildPlaceholder("nothing here after the change"));
  if (change.dels.length === 0) before.append(buildPlaceholder("nothing here before the change"));
  const folded = button(`✓ reviewed · ${change.counts}`, "dv-folded");
  block.append(head, after);
  const wrap = el("div", "dv-change-wrap");
  wrap.dataset["change"] = String(change.index);
  wrap.append(block);
  return { change, el: wrap, block, head, label, tick, after, before, folded };
}

function buildReview(refs: FileRefs): void {
  const { entries } = refs.model;
  let hunk = -1;
  let lastChange = -1;
  for (const entry of entries) {
    if (entry.hunk !== hunk) {
      hunk = entry.hunk;
      if (hunk > 0) refs.body.append(buildHunkRow("⋯"));
    }
    if (entry.kind === "context") {
      appendRow(refs, refs.body, entry);
      continue;
    }
    if (entry.change === lastChange) continue;
    lastChange = entry.change;
    const built = buildChange(refs, refs.model.changes[entry.change] as Change);
    refs.changes.push(built);
    refs.body.append(built.el);
  }
}

function buildFile(model: FileModel, view: DiffView, index: number): FileRefs {
  const section = el("section", "dv-file");
  section.dataset["fi"] = String(index);
  const { head, fold, tick, tickCount } = buildHead(model, view === "review");
  const body = el("div", "dv-file-body");
  const refs: FileRefs = {
    model,
    section,
    fold,
    body,
    tick,
    tickCount,
    changes: [],
    anchors: new Map(),
    marks: new Map(),
  };
  section.append(head, body);
  if (model.file.binary) {
    body.append(el("div", "dv-note", "Binary file not shown"));
  } else if (view === "unified") {
    buildUnified(refs);
  } else if (view === "split") {
    buildSplit(refs);
  } else {
    buildReview(refs);
  }
  return refs;
}

export function buildBody(models: readonly FileModel[], view: DiffView): BodyRefs {
  const root = el("div", `dv-files dv-view-${view}`);
  const files = models.map((model, i) => buildFile(model, view, i));
  if (files.length === 0) root.append(el("div", "dv-empty", "No changes"));
  for (const file of files) root.append(file.section);
  return { root, files };
}
