import { renderEmptyNote, renderNoteInto } from "./notes";

export type PanelForm = "anchored" | "popped" | "window";

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type GestureKind = "move" | Edge;

export interface Gesture {
  update(dx: number, dy: number): void;
  end(): void;
}

export interface NotePanelHandlers {
  onEdit(): void;
  onInput(text: string): void;
  onEscape(): void;
  onPointerDown(target: EventTarget | null): void;
}

export interface NotePanelControls {
  onPopOut(): void;
  onPopIn(): void;
  onOpenWindow(): void;
  onClose(): void;
  beginGesture(kind: GestureKind): Gesture;
}

export interface NotePanelRefs {
  root: HTMLElement;
  head: HTMLElement;
  who: HTMLElement;
  status: HTMLElement;
  popOut: HTMLButtonElement;
  popIn: HTMLButtonElement;
  openWindow: HTMLButtonElement;
  close: HTMLButtonElement;
  body: HTMLElement;
  view: HTMLElement;
  editor: HTMLTextAreaElement;
}

export type StatusKind = "warn" | "info";

export interface NotePanelView {
  title: string;
  status: string;
  statusKind: StatusKind;
  form: PanelForm;
}

const EDGES: readonly Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function control(label: string, glyph: string, act: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ctl";
  button.dataset["act"] = act;
  button.setAttribute("aria-label", label);
  button.title = title;
  button.textContent = glyph;
  return button;
}

function buildHeader(): {
  head: HTMLElement;
  who: HTMLElement;
  status: HTMLElement;
  popOut: HTMLButtonElement;
  popIn: HTMLButtonElement;
  openWindow: HTMLButtonElement;
  close: HTMLButtonElement;
} {
  const head = document.createElement("div");
  head.className = "ph";
  const label = document.createElement("span");
  label.className = "lab";
  label.textContent = "Note";
  const who = document.createElement("span");
  who.className = "who";
  const status = document.createElement("span");
  status.className = "st";
  status.setAttribute("role", "status");
  const popOut = control("Pop out note", "⧉", "popout", "Pop out");
  const popIn = control("Pop in note", "⧠", "popin", "Pop in");
  const openWindow = control("Open note in window", "↗", "openwindow", "Open in window");
  const close = control("Close note", "×", "close", "Close");
  head.append(label, who, status, popOut, popIn, openWindow, close);
  return { head, who, status, popOut, popIn, openWindow, close };
}

function buildView(): HTMLElement {
  const view = document.createElement("div");
  view.className = "bd md nb";
  view.tabIndex = 0;
  view.setAttribute("role", "group");
  view.setAttribute("aria-label", "Rendered note");
  return view;
}

function buildEditor(): HTMLTextAreaElement {
  const editor = document.createElement("textarea");
  editor.setAttribute("aria-label", "Note text");
  editor.spellcheck = false;
  return editor;
}

function wireGesture(
  surface: HTMLElement,
  kind: GestureKind,
  controls: Pick<NotePanelControls, "beginGesture">,
  ignore: (target: EventTarget | null) => boolean,
): void {
  let abandon: (() => void) | null = null;
  surface.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || ignore(event.target)) return;
    event.preventDefault();
    abandon?.();
    const gesture = controls.beginGesture(kind);
    const startX = event.clientX;
    const startY = event.clientY;
    surface.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent): void =>
      gesture.update(next.clientX - startX, next.clientY - startY);
    const finish = (): void => {
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", finish);
      surface.removeEventListener("pointercancel", finish);
      abandon = null;
      gesture.end();
    };
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
    abandon = finish;
  });
}

function isInsideButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

function wireControls(refs: NotePanelRefs, controls: NotePanelControls): void {
  refs.popOut.addEventListener("click", controls.onPopOut);
  refs.popIn.addEventListener("click", controls.onPopIn);
  refs.openWindow.addEventListener("click", controls.onOpenWindow);
  refs.close.addEventListener("click", controls.onClose);
  wireGesture(refs.head, "move", controls, isInsideButton);
  for (const edge of EDGES) {
    const handle = document.createElement("div");
    handle.className = `rz ${edge}`;
    refs.root.append(handle);
    wireGesture(handle, edge, controls, () => false);
  }
}

function wireBody(refs: NotePanelRefs, handlers: NotePanelHandlers): void {
  refs.view.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a[href]")) return;
    handlers.onEdit();
  });
  refs.view.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target !== refs.view) return;
    event.preventDefault();
    handlers.onEdit();
  });
  refs.editor.addEventListener("input", () => handlers.onInput(refs.editor.value));
}

function wireRoot(refs: NotePanelRefs, handlers: NotePanelHandlers): void {
  refs.root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    handlers.onEscape();
  });
  refs.root.addEventListener("pointerdown", (event) => handlers.onPointerDown(event.target));
}

export function buildNotePanel(
  handlers: NotePanelHandlers,
  controls?: NotePanelControls,
): NotePanelRefs {
  const root = document.createElement("div");
  root.className = "npanel anchored";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Note");
  root.tabIndex = -1;
  const header = buildHeader();
  const body = document.createElement("div");
  body.className = "nbody";
  const view = buildView();
  body.append(view);
  root.append(header.head, body);
  const refs: NotePanelRefs = { root, ...header, body, view, editor: buildEditor() };
  if (controls) wireControls(refs, controls);
  wireBody(refs, handlers);
  wireRoot(refs, handlers);
  return refs;
}

export function renderNotePanel(refs: NotePanelRefs, view: NotePanelView): void {
  const who = view.title === "" ? "" : `· ${view.title}`;
  if (refs.who.textContent !== who) refs.who.textContent = who;
  if (refs.status.textContent !== view.status) {
    refs.status.textContent = view.status;
    refs.status.title = view.status;
  }
  if (refs.status.dataset["kind"] !== view.statusKind)
    refs.status.dataset["kind"] = view.statusKind;
  const className = `npanel ${view.form}`;
  if (refs.root.className !== className) refs.root.className = className;
  refs.popOut.hidden = view.form !== "anchored";
  refs.popIn.hidden = view.form !== "popped";
  refs.openWindow.hidden = view.form === "window";
  refs.close.hidden = view.form === "window";
}

export function setNoteBody(refs: NotePanelRefs, text: string): void {
  if (text === "") renderEmptyNote(refs.view);
  else renderNoteInto(refs.view, text);
}

export function showRemovedNotice(refs: NotePanelRefs, text: string): void {
  const notice = document.createElement("div");
  notice.className = "removed";
  notice.setAttribute("role", "status");
  notice.textContent = text;
  refs.editor.remove();
  refs.body.replaceChildren(notice);
}

export function setEditing(refs: NotePanelRefs, editing: boolean, text: string): void {
  refs.view.hidden = editing;
  if (!editing) {
    refs.editor.remove();
    return;
  }
  refs.editor.value = text;
  refs.body.append(refs.editor);
}
