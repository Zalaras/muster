// One session's viewer state, shared by the viewer's parts. Each field has one writer, named
// beside it; the DOM refs are rebuilt with each read and held here so a tick never rebuilds.
import type { DiffBody, DiffScope, ReviewComment } from "../api/diff";
import type { BodyRefs, DiffView } from "../render/diffbody";
import type { ChromeRefs, SideTab } from "../render/diffchrome";
import type { CommentBox } from "../render/diffcomment";
import type { FilesRowRefs } from "../render/diffside";
import type { FileModel } from "../render/diffshape";

export interface Selection {
  fi: number;
  anchor: number;
  head: number;
}

export interface Draft {
  fi: number;
  lo: number;
  hi: number;
  editing: string | null;
  box: CommentBox;
}

export interface MapMark {
  fi: number;
  ci: number;
  el: HTMLButtonElement;
}

export interface CommentWrites {
  active: number;
  started: number;
}

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface ViewerState {
  open: boolean; // diffviewer.ts
  scope: DiffScope; // diffviewer.ts
  view: DiffView; // diffviewer.ts
  tab: SideTab; // diffviewer.ts
  load: LoadState; // diffviewer.ts
  diff: DiffBody | null; // diffviewer.ts
  models: FileModel[]; // diffviewer.ts
  body: BodyRefs | null; // diffviewer.ts
  filesRows: FilesRowRefs[]; // diffviewer.ts
  map: MapMark[]; // diffviewer.ts
  comments: ReviewComment[]; // diffcomments.ts, and diffviewer.ts on a read no comment write overlapped
  commentWrites: CommentWrites; // diffcomments.ts
  ticks: Set<string>; // diffreviewui.ts, and diffviewer.ts on a read no tick write overlapped
  tickWrites: number; // diffreviewui.ts, counts every tick or untick
  pendingAdd: Set<string>; // diffreviewui.ts
  pendingRemove: Set<string>; // diffreviewui.ts
  flushing: Promise<void>; // diffreviewui.ts, the tail of the ordered tick posts
  flips: Set<string>; // diffreviewui.ts
  reopened: Set<string>; // diffreviewui.ts, until that change is next ticked or unticked
  fileFold: Map<string, boolean>; // diffreviewui.ts
  expandedResolved: Set<string>; // diffcomments.ts
  selection: Selection | null; // diffcomments.ts
  draft: Draft | null; // diffcomments.ts
  current: string | null; // diffreviewui.ts
  latest: DiffBody | null; // diffviewer.ts
  scrollTop: number; // diffviewer.ts
}

export function newViewerState(view: DiffView): ViewerState {
  return {
    open: false,
    scope: "uncommitted",
    view,
    tab: "files",
    load: "idle",
    diff: null,
    models: [],
    body: null,
    filesRows: [],
    map: [],
    comments: [],
    commentWrites: { active: 0, started: 0 },
    ticks: new Set(),
    tickWrites: 0,
    pendingAdd: new Set(),
    pendingRemove: new Set(),
    flushing: Promise.resolve(),
    flips: new Set(),
    reopened: new Set(),
    fileFold: new Map(),
    expandedResolved: new Set(),
    selection: null,
    draft: null,
    current: null,
    latest: null,
    scrollTop: 0,
  };
}

export interface ViewerCtx {
  id: number;
  chrome: ChromeRefs;
  s: ViewerState;
  reviewChanged(): void;
}
