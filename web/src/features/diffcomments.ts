import {
  type CommentWrite,
  deleteDiffComment,
  putDiffComment,
  type ReviewComment,
} from "../api/diff";
import { setText } from "../dom";
import {
  buildCommentBox,
  buildCommentCard,
  buildResolvedRow,
  type CommentUi,
  showFail,
} from "../render/diffcomment";
import { buildCommentEntry } from "../render/diffside";
import type { Entry } from "../render/diffshape";
import { entrySide } from "./diffmodel";
import {
  commentHeading,
  lineLabel,
  lineSpan,
  openCount,
  type Placement,
  placeComment,
  placementAnchor,
  recordedLines,
} from "./diffplace";
import { showChange, syncReview } from "./diffreviewui";
import type { Draft, ViewerCtx } from "./diffviewerstate";

const MAX_QUOTE = 500;

function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return `c-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

function writeBody(comment: ReviewComment, patch: Partial<CommentWrite>): CommentWrite {
  return {
    path: comment.path,
    start: comment.start,
    end: comment.end,
    quote: comment.quote,
    body: comment.body,
    resolved: comment.resolved,
    ...patch,
  };
}

export interface Comments {
  sync(): void;
  syncLists(): void;
  dismiss(): boolean;
  closeDraft(): void;
  onPointerDown(event: PointerEvent): void;
  onClick(event: MouseEvent): void;
  jump(id: string): void;
  clearSelection(): void;
}

export function createComments(ctx: ViewerCtx): Comments {
  const { s, chrome } = ctx;
  const uis = new Map<string, CommentUi>();
  let drag: { fi: number; anchor: number; moved: boolean } | null = null;
  let justDragged = false;

  function fileIndex(path: string): number {
    return s.models.findIndex((m) => m.file.path === path);
  }

  function entryAt(fi: number, idx: number): Entry {
    return s.models[fi]?.entries[idx] as Entry;
  }

  function syncSelection(): void {
    for (const node of chrome.content.querySelectorAll(".sel")) node.classList.remove("sel");
    const sel = s.selection;
    if (!sel || !s.body) return;
    const marks = s.body.files[sel.fi]?.marks;
    const lo = Math.min(sel.anchor, sel.head);
    const hi = Math.max(sel.anchor, sel.head);
    for (let i = lo; i <= hi; i++)
      for (const node of marks?.get(i) ?? []) node.classList.add("sel");
  }

  function clearSelection(): void {
    s.selection = null;
    syncSelection();
  }

  function closeDraft(): void {
    s.draft?.box.root.remove();
    s.draft = null;
  }

  function placementOf(comment: ReviewComment): { fi: number; placement: Placement } {
    const fi = fileIndex(comment.path);
    return { fi, placement: placeComment(s.models[fi], comment) };
  }

  function failOn(id: string): void {
    const ui = uis.get(id);
    if (ui) showFail(ui, true);
  }

  async function tracked<T>(job: () => Promise<T>): Promise<T> {
    s.commentWrites.active++;
    s.commentWrites.started++;
    try {
      return await job();
    } finally {
      s.commentWrites.active--;
    }
  }

  function upsert(comment: ReviewComment): void {
    const at = s.comments.findIndex((c) => c.id === comment.id);
    if (at < 0) s.comments.push(comment);
    else s.comments[at] = comment;
  }

  async function write(comment: ReviewComment, patch: Partial<CommentWrite>): Promise<void> {
    const result = await tracked(() =>
      putDiffComment(ctx.id, comment.id, writeBody(comment, patch)),
    );
    if (!result.ok) {
      failOn(comment.id);
      return;
    }
    upsert({ ...(s.comments.find((c) => c.id === comment.id) ?? comment), ...patch });
    closeDraftIfEditing(comment.id);
    sync();
    ctx.reviewChanged();
  }

  function closeDraftIfEditing(id: string): void {
    if (s.draft?.editing !== id) return;
    closeDraft();
    clearSelection();
  }

  async function remove(comment: ReviewComment): Promise<void> {
    const result = await tracked(() => deleteDiffComment(ctx.id, comment.id));
    if (!result.ok) {
      failOn(comment.id);
      return;
    }
    s.comments = s.comments.filter((c) => c.id !== comment.id);
    s.expandedResolved.delete(comment.id);
    sync();
    ctx.reviewChanged();
  }

  async function saveDraft(draft: Draft, text: string): Promise<void> {
    if (text.trim() === "") return;
    const editing = draft.editing ? s.comments.find((c) => c.id === draft.editing) : undefined;
    if (editing) {
      await write(editing, { body: text });
      return;
    }
    const entries = s.models[draft.fi]?.entries ?? [];
    const lo = entries[draft.lo] as Entry;
    const hi = entries[draft.hi] as Entry;
    const comment: ReviewComment = {
      id: newId(),
      path: s.models[draft.fi]?.file.path ?? "",
      start: { side: entrySide(lo), line: lo.line },
      end: { side: entrySide(hi), line: hi.line },
      quote: entries
        .slice(draft.lo, draft.hi + 1)
        .map((e) => e.text)
        .slice(0, MAX_QUOTE),
      body: text,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const { id, createdAt, ...body } = comment;
    void createdAt;
    const result = await tracked(() => putDiffComment(ctx.id, id, body));
    if (!result.ok) {
      showFail(draft.box, true);
      return;
    }
    upsert(comment);
    closeDraft();
    clearSelection();
    sync();
    ctx.reviewChanged();
  }

  function openDraft(fi: number, lo: number, hi: number, editing: ReviewComment | null): void {
    closeDraft();
    const file = s.body?.files[fi];
    if (!file) return;
    const lines = editing
      ? lineSpan(editing.start.line, editing.end.line)
      : lineSpan(entryAt(fi, lo).line, entryAt(fi, hi).line);
    const draft: Draft = { fi, lo, hi, editing: editing?.id ?? null, box: null as never };
    draft.box = buildCommentBox(commentHeading(lines), editing?.body ?? "", {
      onSave: (text) => void saveDraft(draft, text),
      onCancel: () => {
        closeDraft();
        clearSelection();
      },
    });
    s.draft = draft;
    sync();
    draft.box.textarea.focus();
    draft.box.root.scrollIntoView({ block: "nearest" });
  }

  function chain(
    tails: Map<HTMLElement, HTMLElement>,
    anchor: HTMLElement,
    node: HTMLElement,
  ): void {
    (tails.get(anchor) ?? anchor).after(node);
    tails.set(anchor, node);
  }

  function uiFor(comment: ReviewComment, placement: Placement): CommentUi | null {
    const lines = placement.kind === "outdated" ? recordedLines(comment) : placement.lines;
    if (s.draft?.editing === comment.id) return s.draft.box;
    if (comment.resolved) {
      return buildResolvedRow(lineLabel(lines), comment.body, s.expandedResolved.has(comment.id), {
        onToggle: () => toggleResolved(comment.id),
        onReopen: () => void write(comment, { resolved: false }),
        onDelete: () => void remove(comment),
      });
    }
    return buildCommentCard(lineLabel(lines), comment.body, {
      onEdit: () => editComment(comment),
      onResolve: () => void write(comment, { resolved: true }),
    });
  }

  function toggleResolved(id: string): void {
    if (s.expandedResolved.has(id)) s.expandedResolved.delete(id);
    else s.expandedResolved.add(id);
    sync();
  }

  function editComment(comment: ReviewComment): void {
    const { fi, placement } = placementOf(comment);
    const anchor = placementAnchor(placement);
    if (anchor === null) return;
    s.selection = null;
    openDraft(fi, anchor, anchor, comment);
  }

  function markComment(fi: number, placement: Placement): void {
    const marks = s.body?.files[fi]?.marks;
    if (!marks || placement.kind === "outdated") return;
    const first = placement.kind === "placed" ? placement.first : placement.at;
    const last = placementAnchor(placement) as number;
    for (let i = first; i <= last; i++)
      for (const node of marks.get(i) ?? []) node.classList.add("has-comment");
  }

  function placeOne(comment: ReviewComment, tails: Map<HTMLElement, HTMLElement>): boolean {
    const { fi, placement } = placementOf(comment);
    const idx = placementAnchor(placement);
    const anchor = idx === null ? undefined : s.body?.files[fi]?.anchors.get(idx);
    const ui = anchor ? uiFor(comment, placement) : null;
    if (!anchor || !ui) return false;
    ui.root.dataset["cid"] = comment.id;
    uis.set(comment.id, ui);
    chain(tails, anchor, ui.root);
    if (!comment.resolved) markComment(fi, placement);
    return !comment.resolved;
  }

  function placeDraft(tails: Map<HTMLElement, HTMLElement>): void {
    const draft = s.draft;
    if (!draft || draft.editing) return;
    const anchor = s.body?.files[draft.fi]?.anchors.get(draft.hi);
    if (anchor) chain(tails, anchor, draft.box.root);
  }

  function placeCards(): Map<string, number> {
    const tails = new Map<HTMLElement, HTMLElement>();
    const opens = new Map<string, number>();
    for (const comment of s.comments) {
      if (placeOne(comment, tails)) opens.set(comment.path, (opens.get(comment.path) ?? 0) + 1);
    }
    placeDraft(tails);
    return opens;
  }

  function syncPanels(opens: Map<string, number>): void {
    s.filesRows.forEach((row, i) => {
      const count = opens.get(s.models[i]?.file.path ?? "") ?? 0;
      row.comments.hidden = count === 0;
      setText(row.comments, count === 0 ? "" : `💬 ${count}`);
    });
    syncCommentLists();
  }

  function entryOf(comment: ReviewComment): HTMLButtonElement {
    const { placement } = placementOf(comment);
    const lines = placement.kind === "outdated" ? recordedLines(comment) : placement.lines;
    const first = comment.quote[0] ?? "";
    const rest = comment.quote.length - 1;
    const node = buildCommentEntry({
      path: comment.path,
      lines,
      quote: first,
      more: rest > 0 ? ` … +${rest} lines` : "",
      body: comment.body,
      mark:
        placement.kind === "outdated"
          ? "outdated"
          : placement.kind === "partial"
            ? "partly outdated"
            : null,
    });
    node.addEventListener("click", () => jump(comment.id));
    return node;
  }

  function syncCommentLists(): void {
    const open = s.comments.filter((c) => !c.resolved);
    const resolved = s.comments.filter((c) => c.resolved);
    setText(chrome.tabs.comments, `Comments (${openCount(s.comments)})`);
    const shown = s.tab === "comments";
    chrome.openList.replaceChildren(...(shown ? open.map(entryOf) : []));
    chrome.resolvedList.replaceChildren(...(shown ? resolved.map(entryOf) : []));
    setText(chrome.resolvedTitle, `Resolved (${resolved.length})`);
  }

  function sync(): void {
    const draft = s.draft;
    const box = draft?.box.textarea;
    const focused = box !== undefined && document.activeElement === box;
    const start = box?.selectionStart ?? 0;
    const end = box?.selectionEnd ?? 0;
    for (const node of chrome.content.querySelectorAll(".dv-comment-ui")) node.remove();
    for (const node of chrome.content.querySelectorAll(".has-comment"))
      node.classList.remove("has-comment");
    uis.clear();
    syncPanels(placeCards());
    syncSelection();
    syncReview(ctx);
    if (focused && box) {
      box.focus();
      box.setSelectionRange(start, end);
    }
  }

  function jump(id: string): void {
    const comment = s.comments.find((c) => c.id === id);
    if (!comment) return;
    const { fi, placement } = placementOf(comment);
    const idx = placementAnchor(placement);
    const file = s.body?.files[fi];
    if (idx === null || !file) return;
    const entry = file.model.entries[idx] as Entry;
    s.fileFold.set(comment.path, false);
    if (comment.resolved) s.expandedResolved.add(id);
    const change =
      entry.change >= 0 ? file.changes.findIndex((c) => c.change.index === entry.change) : -1;
    if (change >= 0) {
      if (entry.kind === "del") s.flips.add(file.changes[change]?.change.key as string);
      showChange(ctx, fi, change);
    }
    sync();
    const target = chrome.content.querySelector(`[data-cid="${id}"]`);
    (target ?? file.anchors.get(idx))?.scrollIntoView({ block: "center" });
  }

  function indexOf(target: Element): { fi: number; idx: number } | null {
    const cell = target.closest<HTMLElement>("[data-idx]");
    const section = target.closest<HTMLElement>(".dv-file");
    if (!cell || !section) return null;
    return { fi: Number(section.dataset["fi"]), idx: Number(cell.dataset["idx"]) };
  }

  function extend(head: number): void {
    if (!s.selection) return;
    s.selection = { ...s.selection, head };
    syncSelection();
  }

  function onMove(event: PointerEvent): void {
    if (!drag) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const at = hit ? indexOf(hit) : null;
    if (!at || at.fi !== drag.fi) return;
    if (at.idx !== drag.anchor) drag.moved = true;
    extend(at.idx);
  }

  function onUp(): void {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    const done = drag;
    drag = null;
    if (!done?.moved || !s.selection) return;
    justDragged = true;
    setTimeout(() => {
      justDragged = false;
    }, 0);
    openDraft(
      done.fi,
      Math.min(s.selection.anchor, s.selection.head),
      Math.max(s.selection.anchor, s.selection.head),
      null,
    );
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || event.button !== 0) return;
    const plus = target.closest(".dv-plus");
    const at = plus ? indexOf(plus) : null;
    if (!at) return;
    drag = { fi: at.fi, anchor: at.idx, moved: false };
    s.selection = { fi: at.fi, anchor: at.idx, head: at.idx };
    syncSelection();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function onNumber(at: { fi: number; idx: number }, shift: boolean): void {
    if (shift && s.selection && s.selection.fi === at.fi) {
      extend(at.idx);
      const sel = s.selection;
      if (sel)
        openDraft(sel.fi, Math.min(sel.anchor, sel.head), Math.max(sel.anchor, sel.head), null);
      return;
    }
    s.selection = { fi: at.fi, anchor: at.idx, head: at.idx };
    syncSelection();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const plus = target.closest(".dv-plus");
    if (plus) {
      const at = indexOf(plus);
      if (at && !justDragged) {
        s.selection = { fi: at.fi, anchor: at.idx, head: at.idx };
        openDraft(at.fi, at.idx, at.idx, null);
      }
      return;
    }
    const number = target.closest(".dv-num");
    const at = number ? indexOf(number) : null;
    if (at) onNumber(at, event.shiftKey);
  }

  function dismiss(): boolean {
    if (s.draft) {
      closeDraft();
      return true;
    }
    if (s.selection) {
      clearSelection();
      return true;
    }
    return false;
  }

  return {
    sync,
    syncLists: syncCommentLists,
    dismiss,
    closeDraft,
    onPointerDown,
    onClick,
    jump,
    clearSelection,
  };
}
