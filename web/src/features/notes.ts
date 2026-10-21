import { putNote } from "../api/sessions";
import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import type { Session } from "../protocol/session";
import { placeAnchored } from "../render/anchored";
import { rerenderNoteDiagrams } from "../render/notes";
import {
  buildNotePanel,
  type Gesture,
  type GestureKind,
  renderNotePanel,
  setEditing,
  setNoteBody,
  type PanelForm,
} from "../render/notespanel";
import { displayTitle } from "../sessions/card";
import { safeLocalStorage, safeSessionStorage } from "../storage";
import { createDraftStore } from "./notesdrafts";
import {
  clampRect,
  defaultRect,
  dragRect,
  type Rect,
  resizeRect,
  type Size,
} from "./notesgeometry";
import { loadPanelMemory, type PanelMemory, savePanelMemory } from "./notespanelstate";
import { createNoteSaver, outcomeOf, type SaveOutcome, type SendOptions } from "./notessave";
import { adoptIncoming, unsavedStatus } from "./notesview";

type Form = "closed" | PanelForm;

const KEEPALIVE_LIMIT_BYTES = 60_000;

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function visible(el: HTMLElement): boolean {
  return !el.hidden && el.getClientRects().length > 0;
}

async function sendNote(id: number, text: string, options: SendOptions): Promise<SaveOutcome> {
  const small = new TextEncoder().encode(text).length <= KEEPALIVE_LIMIT_BYTES;
  return outcomeOf(await putNote(id, text, { keepalive: options.keepalive && small }));
}

export function initNotes(app: App): void {
  const glyph = requireElement<HTMLButtonElement>("#mainhead .ng");
  const mainEl = requireElement<HTMLElement>(".main");
  const mainheadEl = requireElement<HTMLElement>("#mainhead");
  const effortStripEl = requireElement<HTMLElement>("#effort-strip");
  const sizenoteEl = requireElement<HTMLElement>("#sizenote");
  const sessionStore = safeSessionStorage();
  const drafts = createDraftStore(safeLocalStorage());
  const saver = createNoteSaver({
    drafts,
    send: sendNote,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onChange: () => app.render(),
  });

  let form: Form = "closed";
  let editing = false;
  let shownId: number | null = null;
  let displayed = "";
  let lastIncoming: string | null = null;
  let renderedText: string | null = null;
  let memory: PanelMemory = loadPanelMemory(sessionStore);
  let restorePending = memory.popped;

  function sessionOf(id: number | null): Session | undefined {
    return id === null ? undefined : app.store.get(id);
  }

  function persist(next: PanelMemory): void {
    memory = next;
    savePanelMemory(sessionStore, memory);
  }

  function slotBounds(): Rect | null {
    if (mainEl.getClientRects().length === 0) return null;
    const main = mainEl.getBoundingClientRect();
    let top = main.top;
    let bottom = main.bottom;
    for (const el of [mainheadEl, effortStripEl]) {
      if (visible(el)) top = Math.max(top, el.getBoundingClientRect().bottom);
    }
    if (visible(sizenoteEl)) bottom = Math.min(bottom, sizenoteEl.getBoundingClientRect().top);
    return { x: main.left, y: top, width: main.width, height: Math.max(0, bottom - top) };
  }

  function slotSize(bounds: Rect): Size {
    return { width: bounds.width, height: bounds.height };
  }

  function effectiveRect(bounds: Rect): Rect {
    const size = slotSize(bounds);
    return clampRect(memory.rect ?? defaultRect(size), size);
  }

  const handlers = {
    onPopOut: () => popOut(),
    onPopIn: () => popIn(),
    onClose: () => closeByUser(),
    onEdit: () => startEdit(),
    onInput: (text: string) => typed(text),
    onEscape: () => leaveOrClose(),
    onPointerDown: (target: EventTarget | null) => {
      if (editing && target !== refs.editor) endEdit();
    },
    beginGesture: (kind: GestureKind): Gesture => beginGesture(kind),
  };
  const refs = buildNotePanel(handlers);

  function layoutPopped(): void {
    const bounds = slotBounds();
    refs.root.hidden = bounds === null;
    if (bounds === null) return;
    const rect = effectiveRect(bounds);
    const style = refs.root.style;
    style.left = `${bounds.x + rect.x}px`;
    style.top = `${bounds.y + rect.y}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
  }

  function layoutAnchored(): void {
    refs.root.hidden = false;
    refs.root.style.width = "";
    refs.root.style.height = "";
    placeAnchored(refs.root, glyph);
  }

  function applyBody(): void {
    if (editing) return;
    const text = isBlank(displayed) ? "" : displayed;
    if (renderedText === text) return;
    setNoteBody(refs, text);
    renderedText = text;
  }

  function applyView(): void {
    const session = sessionOf(shownId);
    if (form === "closed" || session === undefined || shownId === null) return;
    renderNotePanel(refs, {
      title: displayTitle(session),
      status: unsavedStatus(saver.failed(shownId)),
      form,
    });
    applyBody();
    if (form === "popped") layoutPopped();
    else layoutAnchored();
  }

  function syncGlyph(): void {
    const expanded = String(form === "anchored");
    if (glyph.getAttribute("aria-expanded") !== expanded)
      glyph.setAttribute("aria-expanded", expanded);
    const session = sessionOf(app.state.focusedId);
    if (session === undefined) return;
    const className = session.note === null ? "ng" : "ng has";
    if (glyph.className !== className) glyph.className = className;
  }

  function bind(id: number): void {
    const session = sessionOf(id);
    shownId = id;
    displayed = drafts.get(id) ?? session?.note ?? "";
    lastIncoming = session?.note ?? null;
    renderedText = null;
  }

  function onOutsidePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (refs.root.contains(target) || glyph.contains(target)) return;
    close(false);
  }

  function open(next: PanelForm, id: number, focus: boolean): void {
    restorePending = false;
    bind(id);
    form = next;
    editing = false;
    setEditing(refs, false, "");
    if (!refs.root.isConnected) document.body.append(refs.root);
    if (next === "anchored") document.addEventListener("pointerdown", onOutsidePointerDown, true);
    applyView();
    syncGlyph();
    if (focus) refs.view.focus({ preventScroll: true });
  }

  function close(returnFocus: boolean): void {
    if (form === "closed") return;
    if (shownId !== null) flushShown(shownId);
    const hadFocus = refs.root.contains(document.activeElement);
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    editing = false;
    setEditing(refs, false, "");
    refs.root.remove();
    form = "closed";
    shownId = null;
    renderedText = null;
    syncGlyph();
    if (returnFocus || hadFocus) glyph.focus({ preventScroll: true });
  }

  function closeByUser(): void {
    if (memory.popped) persist({ ...memory, popped: false });
    close(true);
  }

  function flushShown(id: number): void {
    if (sessionOf(id) === undefined) saver.forget(id);
    else saver.flush(id);
  }

  function popOut(): void {
    if (form !== "anchored") return;
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    form = "popped";
    persist({ ...memory, popped: true });
    applyView();
    syncGlyph();
    refs.popIn.focus({ preventScroll: true });
  }

  function popIn(): void {
    if (form !== "popped") return;
    form = "anchored";
    persist({ ...memory, popped: false });
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    applyView();
    syncGlyph();
    refs.popOut.focus({ preventScroll: true });
  }

  function startEdit(): void {
    if (form === "closed" || editing) return;
    editing = true;
    setEditing(refs, true, displayed);
    refs.editor.focus({ preventScroll: true });
    refs.editor.setSelectionRange(displayed.length, displayed.length);
    if (form === "anchored") layoutAnchored();
  }

  function endEdit(): void {
    if (!editing) return;
    const hadFocus = document.activeElement === refs.editor;
    displayed = refs.editor.value;
    editing = false;
    setEditing(refs, false, "");
    applyBody();
    if (shownId !== null) flushShown(shownId);
    if (hadFocus) refs.view.focus({ preventScroll: true });
    if (form === "anchored") layoutAnchored();
  }

  function typed(text: string): void {
    if (shownId === null) return;
    displayed = text;
    saver.edit(shownId, text);
  }

  function leaveOrClose(): void {
    if (editing) endEdit();
    else closeByUser();
  }

  function beginGesture(kind: GestureKind): Gesture {
    const bounds = slotBounds();
    if (bounds === null) return { update: () => {}, end: () => {} };
    const size = slotSize(bounds);
    const base = effectiveRect(bounds);
    let latest = base;
    return {
      update(dx, dy) {
        latest =
          kind === "move" ? dragRect(base, dx, dy, size) : resizeRect(base, kind, dx, dy, size);
        memory = { ...memory, rect: latest };
        layoutPopped();
      },
      end() {
        persist({ popped: true, rect: latest });
      },
    };
  }

  glyph.addEventListener("click", () => {
    const id = app.state.focusedId;
    if (sessionOf(id) === undefined || id === null) return;
    if (form === "popped") {
      if (editing) refs.editor.focus({ preventScroll: true });
      else refs.view.focus({ preventScroll: true });
    } else if (form === "anchored") closeByUser();
    else open("anchored", id, true);
  });

  app.on("focusChanged", (id) => {
    if (form === "closed") return;
    if (shownId !== null && id !== shownId) {
      flushShown(shownId);
      editing = false;
      setEditing(refs, false, "");
    }
    if (form === "anchored") {
      if (id !== shownId) close(false);
      return;
    }
    if (id !== null && id !== shownId) bind(id);
  });

  app.on("sessionRemoved", (id) => saver.forget(id));

  app.on("snapshot", () => {
    for (const id of drafts.pending().keys()) {
      if (sessionOf(id) === undefined) drafts.drop(id);
      else saver.resend(id);
    }
  });

  app.on("themeChanged", () => {
    if (form !== "closed") rerenderNoteDiagrams(refs.view);
  });

  window.addEventListener("pagehide", () => saver.flushAll({ keepalive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saver.flushAll({ keepalive: true });
  });

  function syncIncoming(session: Session): void {
    if (session.note === lastIncoming) return;
    displayed = adoptIncoming(displayed, session.note ?? "", editing);
    lastIncoming = session.note;
  }

  function restoreIfPending(session: Session | undefined): void {
    if (!restorePending || form !== "closed" || session === undefined) return;
    if (app.state.view !== "focus") return;
    restorePending = false;
    if (memory.popped) open("popped", session.id, false);
  }

  function renderPhase(frame: RenderFrame): void {
    const session = frame.sessions.find((s) => s.id === app.state.focusedId);
    restoreIfPending(session);
    if (form !== "closed") {
      if (session === undefined) close(false);
      else if (app.state.view !== "focus" && form === "anchored") close(false);
      else if (session.id !== shownId) bind(session.id);
    }
    if (form !== "closed" && session !== undefined) {
      syncIncoming(session);
      applyView();
    }
    syncGlyph();
  }

  app.onRender(renderPhase);

  const slotWatch = new ResizeObserver(() => {
    if (form === "popped") layoutPopped();
  });
  for (const el of [mainEl, mainheadEl, effortStripEl, sizenoteEl]) slotWatch.observe(el);
}
