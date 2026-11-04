import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import { buildNotePanel, renderNotePanel, showRemovedNotice } from "../render/notespanel";
import { rerenderNoteDiagrams } from "../render/notes";
import { displayTitle } from "../sessions/card";
import { createNoteEditor, createNoteSaving } from "./notesedit";
import { REMOVED_NOTICE_TEXT, windowStatus, type WindowStatus } from "./notesview";

const BASE_TITLE = "Note";

export function mountNotePage(app: App, sessionId: number | null): void {
  const host = requireElement<HTMLElement>("#note-host");
  const saving = createNoteSaving(app);
  let removed = false;
  let snapshotSeen = false;
  let title = "";

  const refs = buildNotePanel({
    onEdit: () => editor.startEdit(),
    onInput: (text) => editor.typed(text),
    onEscape: () => editor.endEdit(),
    onPointerDown: (target) => editor.pointerDown(target),
  });
  const editor = createNoteEditor({
    refs,
    ...saving,
    sessionOf: (id) => app.store.get(id),
    relayout: () => {},
  });
  host.append(refs.root);

  function markRemoved(): void {
    if (removed) return;
    removed = true;
    if (sessionId !== null) saving.saver.forget(sessionId);
    editor.release();
    showRemovedNotice(refs, REMOVED_NOTICE_TEXT);
  }

  function statusFor(frame: RenderFrame): WindowStatus {
    return windowStatus(frame.connection, sessionId !== null && saving.saver.failed(sessionId));
  }

  function paint(frame: RenderFrame): void {
    const status = statusFor(frame);
    renderNotePanel(refs, {
      title,
      status: removed ? "" : status.text,
      statusKind: status.kind,
      form: "window",
    });
    const documentTitle = title === "" ? BASE_TITLE : `${BASE_TITLE} · ${title}`;
    if (document.title !== documentTitle) document.title = documentTitle;
  }

  function renderPhase(frame: RenderFrame): void {
    const session = sessionId === null ? undefined : app.store.get(sessionId);
    if (session !== undefined && !removed) {
      title = displayTitle(session);
      if (editor.shownId() === null) editor.show(session.id);
      editor.refresh(session);
    } else if (sessionId === null || snapshotSeen) {
      markRemoved();
    }
    paint(frame);
  }

  app.on("snapshot", () => {
    snapshotSeen = true;
    if (sessionId !== null && !removed && app.store.get(sessionId) !== undefined)
      saving.saver.resend(sessionId);
  });
  app.on("sessionRemoved", (id) => {
    if (id === sessionId) markRemoved();
  });
  app.on("themeChanged", () => {
    if (!removed) rerenderNoteDiagrams(refs.view);
  });
  app.onRender(renderPhase);
}
