import { button, el } from "./diffrows";

export const NOT_SAVED = "Not saved, musterd unreachable";

export interface CommentUi {
  root: HTMLElement;
  fail: HTMLElement;
}

function failNote(): HTMLElement {
  const note = el("span", "dv-fail");
  note.setAttribute("role", "status");
  note.hidden = true;
  return note;
}

export function showFail(ui: { fail: HTMLElement }, failed: boolean): void {
  ui.fail.hidden = !failed;
  ui.fail.textContent = failed ? NOT_SAVED : "";
}

export interface BoxHandlers {
  onSave(text: string): void;
  onCancel(): void;
}

export interface CommentBox extends CommentUi {
  textarea: HTMLTextAreaElement;
}

export function buildCommentBox(heading: string, text: string, handlers: BoxHandlers): CommentBox {
  const root = el("div", "dv-comment-ui dv-box");
  const textarea = el("textarea", "dv-textarea");
  textarea.setAttribute("aria-label", "Comment");
  textarea.rows = 3;
  textarea.value = text;
  const save = button("Save", "dv-btn primary");
  const cancel = button("Cancel");
  const fail = failNote();
  const actions = el("div", "dv-box-actions");
  actions.append(save, cancel, fail);
  root.append(el("div", "dv-box-heading", heading), textarea, actions);
  save.addEventListener("click", () => handlers.onSave(textarea.value));
  cancel.addEventListener("click", () => handlers.onCancel());
  return { root, fail, textarea };
}

export interface CardHandlers {
  onEdit(): void;
  onResolve(): void;
}

export function buildCommentCard(lines: string, body: string, handlers: CardHandlers): CommentUi {
  const root = el("div", "dv-comment-ui dv-card");
  const head = el("div", "dv-card-head");
  const edit = button("Edit");
  const resolve = button("Resolve");
  const fail = failNote();
  head.append(el("span", "dv-card-lines", lines), edit, resolve, fail);
  root.append(head, el("div", "dv-card-body", body));
  edit.addEventListener("click", () => handlers.onEdit());
  resolve.addEventListener("click", () => handlers.onResolve());
  return { root, fail };
}

export interface ResolvedHandlers {
  onToggle(): void;
  onReopen(): void;
  onDelete(): void;
}

const SNIPPET = 48;

export function buildResolvedRow(
  lines: string,
  body: string,
  expanded: boolean,
  handlers: ResolvedHandlers,
): CommentUi {
  const root = el("div", "dv-comment-ui dv-resolved");
  const snippet = body.length > SNIPPET ? `${body.slice(0, SNIPPET)}…` : body;
  const row = button(`✓ Resolved · ${lines} · ${snippet}`, "dv-resolved-row");
  row.setAttribute("aria-expanded", String(expanded));
  const reopen = button("Reopen");
  const fail = failNote();
  const top = el("div", "dv-resolved-top");
  top.append(row, reopen, fail);
  root.append(top);
  if (expanded) {
    const detail = el("div", "dv-resolved-detail");
    const del = button("Delete");
    detail.append(el("div", "dv-card-body", body), del);
    root.append(detail);
    del.addEventListener("click", () => handlers.onDelete());
  }
  row.addEventListener("click", () => handlers.onToggle());
  reopen.addEventListener("click", () => handlers.onReopen());
  return { root, fail };
}
