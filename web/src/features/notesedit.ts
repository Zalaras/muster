import { putNote } from "../api/sessions";
import type { App } from "../app";
import type { Session } from "../protocol/session";
import { type NotePanelRefs, setEditing, setNoteBody } from "../render/notespanel";
import { safeLocalStorage } from "../storage";
import { createDraftStore, type DraftStore } from "./notesdrafts";
import {
  createNoteSaver,
  type NoteSaver,
  outcomeOf,
  type SaveOutcome,
  type SendOptions,
} from "./notessave";
import { adoptIncoming } from "./notesview";

const KEEPALIVE_LIMIT_BYTES = 60_000;

function isBlank(text: string): boolean {
  return text.trim() === "";
}

async function sendNote(id: number, text: string, options: SendOptions): Promise<SaveOutcome> {
  const small = new TextEncoder().encode(text).length <= KEEPALIVE_LIMIT_BYTES;
  return outcomeOf(await putNote(id, text, { keepalive: options.keepalive && small }));
}

export interface NoteSaving {
  drafts: DraftStore;
  saver: NoteSaver;
}

export function createNoteSaving(app: App): NoteSaving {
  const drafts = createDraftStore(safeLocalStorage());
  const saver = createNoteSaver({
    drafts,
    send: sendNote,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onChange: () => app.render(),
  });
  window.addEventListener("pagehide", () => saver.flushAll({ keepalive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saver.flushAll({ keepalive: true });
  });
  return { drafts, saver };
}

export interface NoteEditorDeps extends NoteSaving {
  refs: NotePanelRefs;
  sessionOf(id: number): Session | undefined;
  relayout(): void;
}

export interface NoteEditor {
  shownId(): number | null;
  editing(): boolean;
  show(id: number): void;
  release(): void;
  refresh(session: Session): void;
  startEdit(): void;
  endEdit(): void;
  typed(text: string): void;
  pointerDown(target: EventTarget | null): void;
}

export function createNoteEditor(deps: NoteEditorDeps): NoteEditor {
  const { refs, drafts, saver } = deps;
  let shownId: number | null = null;
  let editing = false;
  let displayed = "";
  let lastIncoming: string | null = null;
  let renderedText: string | null = null;

  function flushShown(id: number): void {
    if (deps.sessionOf(id) === undefined) saver.forget(id);
    else saver.flush(id);
  }

  function applyBody(): void {
    if (editing) return;
    const text = isBlank(displayed) ? "" : displayed;
    if (renderedText === text) return;
    setNoteBody(refs, text);
    renderedText = text;
  }

  function show(id: number): void {
    const session = deps.sessionOf(id);
    shownId = id;
    displayed = drafts.get(id) ?? session?.note ?? "";
    lastIncoming = session?.note ?? null;
    renderedText = null;
    editing = false;
    setEditing(refs, false, "");
  }

  function release(): void {
    if (shownId !== null) flushShown(shownId);
    editing = false;
    setEditing(refs, false, "");
    shownId = null;
    renderedText = null;
  }

  function refresh(session: Session): void {
    if (session.note !== lastIncoming) {
      displayed = adoptIncoming(displayed, session.note ?? "", editing);
      lastIncoming = session.note;
    }
    applyBody();
  }

  function startEdit(): void {
    if (shownId === null || editing) return;
    editing = true;
    setEditing(refs, true, displayed);
    refs.editor.focus({ preventScroll: true });
    refs.editor.setSelectionRange(displayed.length, displayed.length);
    deps.relayout();
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
    deps.relayout();
  }

  function typed(text: string): void {
    if (shownId === null) return;
    displayed = text;
    saver.edit(shownId, text);
  }

  function pointerDown(target: EventTarget | null): void {
    if (editing && target !== refs.editor) endEdit();
  }

  return {
    shownId: () => shownId,
    editing: () => editing,
    show,
    release,
    refresh,
    startEdit,
    endEdit,
    typed,
    pointerDown,
  };
}
