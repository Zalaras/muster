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
} from "../render/notespanel";
import { displayTitle } from "../sessions/card";
import { safeSessionStorage } from "../storage";
import { createNoteEditor, createNoteSaving } from "./notesedit";
import {
  clampRect,
  defaultPlacement,
  dragRect,
  type Rect,
  resizeRect,
  type Size,
} from "./notesgeometry";
import {
  isPopped,
  loadPlaces,
  type NotePlaces,
  rectOf,
  savePlaces,
  withoutAbsent,
  withoutPlace,
  withPlace,
} from "./notespanelstate";
import { unsavedStatus } from "./notesview";
import { createNoteWindows } from "./noteswindows";

type DockedForm = "anchored" | "popped";
type Form = "closed" | DockedForm;

function visible(el: HTMLElement): boolean {
  return !el.hidden && el.getClientRects().length > 0;
}

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

export interface NotesDeps {
  surfaces: { focusSelected(id: number): void };
}

export function initNotes(app: App, deps: NotesDeps): void {
  const glyph = requireElement<HTMLButtonElement>("#mainhead .ng");
  const mainEl = requireElement<HTMLElement>(".main");
  const mainheadEl = requireElement<HTMLElement>("#mainhead");
  const effortStripEl = requireElement<HTMLElement>("#effort-strip");
  const sizenoteEl = requireElement<HTMLElement>("#sizenote");
  const sessionStore = safeSessionStorage();
  const saving = createNoteSaving(app);
  const windows = createNoteWindows((url, name, features) => window.open(url, name, features));

  let form: Form = "closed";
  let places: NotePlaces = loadPlaces(sessionStore);
  let liveGesture: Gesture | null = null;

  function sessionOf(id: number | null): Session | undefined {
    return id === null ? undefined : app.store.get(id);
  }

  function setForm(next: Form): void {
    form = next;
    if (next !== "popped") liveGesture = null;
  }

  function remember(next: NotePlaces): void {
    if (next === places) return;
    places = next;
    savePlaces(sessionStore, places);
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

  function effectiveRect(id: number): Rect {
    const viewport = viewportSize();
    const slot = slotBounds() ?? { x: 0, y: 0, ...viewport };
    return clampRect(rectOf(places, id) ?? defaultPlacement(slot, viewport), viewport);
  }

  const handlers = {
    onEdit: () => editor.startEdit(),
    onInput: (text: string) => editor.typed(text),
    onEscape: () => leaveOrClose(),
    onPointerDown: (target: EventTarget | null) => editor.pointerDown(target),
  };
  const controls = {
    onPopOut: () => popOut(),
    onPopIn: () => popIn(),
    onOpenWindow: () => openInWindow(),
    onClose: () => closeByUser(),
    beginGesture: (kind: GestureKind): Gesture => beginGesture(kind),
  };
  const refs = buildNotePanel(handlers, controls);
  const editor = createNoteEditor({
    refs,
    ...saving,
    sessionOf: (id) => sessionOf(id),
    relayout: () => {
      if (form === "anchored") layoutAnchored();
    },
  });

  function layoutPopped(id: number): void {
    const rect = effectiveRect(id);
    const style = refs.root.style;
    style.left = `${rect.x}px`;
    style.top = `${rect.y}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
  }

  function layoutAnchored(): void {
    refs.root.style.width = "";
    refs.root.style.height = "";
    placeAnchored(refs.root, glyph);
  }

  function applyView(): void {
    const id = editor.shownId();
    const session = sessionOf(id);
    if (form === "closed" || session === undefined || id === null) return;
    renderNotePanel(refs, {
      title: displayTitle(session),
      status: unsavedStatus(saving.saver.failed(id)),
      statusKind: "warn",
      form,
    });
    editor.refresh(session);
    if (form === "popped") layoutPopped(id);
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

  function onOutsidePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (refs.root.contains(target) || glyph.contains(target)) return;
    close(false);
  }

  function open(next: DockedForm, id: number, focus: boolean): void {
    editor.show(id);
    setForm(next);
    if (!refs.root.isConnected) document.body.append(refs.root);
    if (next === "anchored") document.addEventListener("pointerdown", onOutsidePointerDown, true);
    applyView();
    syncGlyph();
    if (focus) refs.view.focus({ preventScroll: true });
  }

  function close(returnFocus: boolean): void {
    if (form === "closed") return;
    const closedId = editor.shownId();
    const hadFocus = refs.root.contains(document.activeElement);
    editor.release();
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    refs.root.remove();
    setForm("closed");
    syncGlyph();
    if (returnFocus && closedId !== null) deps.surfaces.focusSelected(closedId);
    const unfocused = document.activeElement === null || document.activeElement === document.body;
    if (returnFocus ? unfocused : hadFocus) glyph.focus({ preventScroll: true });
  }

  function closeByUser(): void {
    const id = editor.shownId();
    if (form === "popped" && id !== null) remember(withPlace(places, id, { popped: false }));
    close(true);
  }

  function openInWindow(): void {
    const id = editor.shownId();
    if (id === null || !windows.openOrFocus(id)) return;
    closeByUser();
  }

  function popOut(): void {
    const id = editor.shownId();
    if (form !== "anchored" || id === null) return;
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    setForm("popped");
    remember(withPlace(places, id, { popped: true }));
    applyView();
    syncGlyph();
    refs.popIn.focus({ preventScroll: true });
  }

  function popIn(): void {
    const id = editor.shownId();
    if (form !== "popped" || id === null) return;
    setForm("anchored");
    remember(withPlace(places, id, { popped: false }));
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    applyView();
    syncGlyph();
    refs.popOut.focus({ preventScroll: true });
  }

  function leaveOrClose(): void {
    if (editor.editing()) editor.endEdit();
    else closeByUser();
  }

  function beginGesture(kind: GestureKind): Gesture {
    const id = editor.shownId();
    if (form !== "popped" || id === null) return { update: () => {}, end: () => {} };
    const viewport = viewportSize();
    const base = effectiveRect(id);
    const gesture: Gesture = {
      update(dx, dy) {
        if (liveGesture !== gesture) return;
        const latest =
          kind === "move"
            ? dragRect(base, dx, dy, viewport)
            : resizeRect(base, kind, dx, dy, viewport);
        places = withPlace(places, id, { popped: true, rect: latest });
        layoutPopped(id);
      },
      end() {
        if (liveGesture !== gesture) return;
        liveGesture = null;
        savePlaces(sessionStore, places);
      },
    };
    liveGesture = gesture;
    return gesture;
  }

  glyph.addEventListener("click", () => {
    const id = app.state.focusedId;
    if (sessionOf(id) === undefined || id === null) return;
    if (form === "popped") {
      if (editor.editing()) refs.editor.focus({ preventScroll: true });
      else refs.view.focus({ preventScroll: true });
    } else if (form === "anchored") closeByUser();
    else open("anchored", id, true);
  });

  app.on("focusChanged", (id) => {
    if (form !== "closed" && id !== editor.shownId()) close(false);
  });

  app.on("sessionRemoved", (id) => {
    saving.saver.forget(id);
    remember(withoutPlace(places, id));
  });

  app.on("snapshot", () => {
    remember(withoutAbsent(places, new Set(app.store.values().map((s) => s.id))));
    for (const id of saving.drafts.pending().keys()) {
      if (sessionOf(id) === undefined) saving.drafts.drop(id);
      else saving.saver.resend(id);
    }
  });

  app.on("themeChanged", () => {
    if (form !== "closed") rerenderNoteDiagrams(refs.view);
  });

  function showsFor(session: Session | undefined): session is Session {
    return session !== undefined && app.state.view === "focus";
  }

  function stillWanted(session: Session | undefined): boolean {
    if (!showsFor(session) || session.id !== editor.shownId()) return false;
    return form === "anchored" || isPopped(places, session.id);
  }

  function renderPhase(frame: RenderFrame): void {
    const session = frame.sessions.find((s) => s.id === app.state.focusedId);
    if (form !== "closed" && !stillWanted(session)) close(false);
    if (form === "closed" && showsFor(session) && isPopped(places, session.id))
      open("popped", session.id, false);
    else if (form !== "closed") applyView();
    syncGlyph();
  }

  app.onRender(renderPhase);

  function relayoutPopped(): void {
    const id = editor.shownId();
    if (form === "popped" && id !== null) layoutPopped(id);
  }

  const slotWatch = new ResizeObserver(relayoutPopped);
  for (const el of [mainEl, mainheadEl, effortStripEl, sizenoteEl]) slotWatch.observe(el);
  window.addEventListener("resize", relayoutPopped);
}
