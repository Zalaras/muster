import { requireElement } from "../dom";
import { renderEmptyNote, renderNoteInto } from "./notes";

export type PanelForm = "anchored" | "popped";

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type GestureKind = "move" | Edge;

export interface Gesture {
  update(dx: number, dy: number): void;
  end(): void;
}

export interface NotePanelHandlers {
  onPopOut(): void;
  onPopIn(): void;
  onClose(): void;
  onEdit(): void;
  onInput(text: string): void;
  onEscape(): void;
  onPointerDown(target: EventTarget | null): void;
  beginGesture(kind: GestureKind): Gesture;
}

export interface NotePanelRefs {
  root: HTMLElement;
  who: HTMLElement;
  status: HTMLElement;
  popOut: HTMLButtonElement;
  popIn: HTMLButtonElement;
  close: HTMLButtonElement;
  view: HTMLElement;
  editor: HTMLTextAreaElement;
}

export interface NotePanelView {
  title: string;
  status: string;
  form: PanelForm;
}

const EDGES: readonly Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function control(label: string, glyph: string, act: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ctl";
  button.dataset["act"] = act;
  button.setAttribute("aria-label", label);
  button.title = label.replace(/ note$/, "");
  button.textContent = glyph;
  return button;
}

function buildHeader(): {
  head: HTMLElement;
  who: HTMLElement;
  status: HTMLElement;
  popOut: HTMLButtonElement;
  popIn: HTMLButtonElement;
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
  const popOut = control("Pop out note", "⧉", "popout");
  const popIn = control("Pop in note", "⧠", "popin");
  const close = control("Close note", "×", "close");
  head.append(label, who, status, popOut, popIn, close);
  return { head, who, status, popOut, popIn, close };
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
  handlers: NotePanelHandlers,
  ignore: (target: EventTarget | null) => boolean,
): void {
  surface.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || ignore(event.target)) return;
    event.preventDefault();
    const gesture = handlers.beginGesture(kind);
    const startX = event.clientX;
    const startY = event.clientY;
    surface.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent): void =>
      gesture.update(next.clientX - startX, next.clientY - startY);
    const finish = (): void => {
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", finish);
      surface.removeEventListener("pointercancel", finish);
      gesture.end();
    };
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
  });
}

function isInsideButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

function wireControls(refs: NotePanelRefs, handlers: NotePanelHandlers): void {
  refs.popOut.addEventListener("click", handlers.onPopOut);
  refs.popIn.addEventListener("click", handlers.onPopIn);
  refs.close.addEventListener("click", handlers.onClose);
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

export function buildNotePanel(handlers: NotePanelHandlers): NotePanelRefs {
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
  for (const edge of EDGES) {
    const handle = document.createElement("div");
    handle.className = `rz ${edge}`;
    root.append(handle);
    wireGesture(handle, edge, handlers, () => false);
  }
  const refs: NotePanelRefs = { root, ...header, view, editor: buildEditor() };
  wireGesture(header.head, "move", handlers, isInsideButton);
  wireControls(refs, handlers);
  wireBody(refs, handlers);
  wireRoot(refs, handlers);
  return refs;
}

export function renderNotePanel(refs: NotePanelRefs, view: NotePanelView): void {
  const who = `· ${view.title}`;
  if (refs.who.textContent !== who) refs.who.textContent = who;
  if (refs.status.textContent !== view.status) {
    refs.status.textContent = view.status;
    refs.status.title = view.status;
  }
  const className = view.form === "popped" ? "npanel popped" : "npanel anchored";
  if (refs.root.className !== className) refs.root.className = className;
  refs.popOut.hidden = view.form !== "anchored";
  refs.popIn.hidden = view.form !== "popped";
  refs.close.hidden = view.form !== "popped";
}

export function setNoteBody(refs: NotePanelRefs, text: string): void {
  if (text === "") renderEmptyNote(refs.view);
  else renderNoteInto(refs.view, text);
}

export function setEditing(refs: NotePanelRefs, editing: boolean, text: string): void {
  const host = requireElement<HTMLElement>(".nbody", refs.root);
  refs.view.hidden = editing;
  if (!editing) {
    refs.editor.remove();
    return;
  }
  refs.editor.value = text;
  host.append(refs.editor);
}
