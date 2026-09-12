// The Issue dialog (plan issue-capture; kb:anchor/issue.captures / kb:anchor/issue.create). DOM + wiring
// only — every daemon call goes through ../api.ts. `initIssue` below owns the masthead
// trigger button (`#issue-button`, disabled on daemon-down like every other masthead
// control) and calls `open()` with the rail's own session order and `focusedId`; this module
// never reads the session store itself, so the frozen-option-list rule (REQ-2) holds by
// construction — there is nothing here to re-read after the dialog opens.
//
// W3: this module must never reference an allowlist field name. The preview is composed
// from exactly two things it treats as opaque strings — the daemon's own
// `snapshotMarkdown` (api.ts's `IssueCapture`) and the user's own note text — never a
// key out of `snapshot`. That is what makes the daemon the only place allowlisted data
// becomes text (plan Implementation Notes).
import { captureIssueSnapshot, fileIssue, type ApiErrorBody, type IssueCapture } from "../api";
import type { App } from "../app";
import { requireElement } from "../dom";
import { orderRail } from "../sessions/sort";
import type { Session } from "../protocol";

export interface IssueDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  sessionSelect: HTMLSelectElement;
  titleInput: HTMLInputElement;
  noteTextarea: HTMLTextAreaElement;
  bodyEl: HTMLElement;
  previewEl: HTMLElement;
  captureTimeEl: HTMLElement;
  successEl: HTMLElement;
  successLinkEl: HTMLAnchorElement;
  errorEl: HTMLElement;
  errorDetailEl: HTMLElement;
  cancelBtn: HTMLButtonElement;
  submitBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
}

export interface IssueDialogController {
  /** REQ-2: builds the Session select from `sessions` (already in rail order — the
   * caller's job, not this module's) plus the dashboard-scope option, preselects
   * `focusedId` when it's in the list else the dashboard option, and immediately takes a
   * capture for that selection. A no-op if the dialog is already open. */
  open: (sessions: readonly Session[], focusedId: number | null) => void;
  /** REQ-13: "Daemon down ... an open #issue-dialog closes." Mirrors
   * render/confirm.ts's `closeAll`. */
  closeAll: () => void;
}

/** REQ-2's exact dashboard-scope option text — em dashes (U+2014), single spaces. */
const DASHBOARD_SCOPE_TEXT = "— none (dashboard only) —";
const DASHBOARD_SCOPE_VALUE = "";

/** W4: pure, so Vitest can exercise it directly. Normalises CRLF to LF, trims the whole
 * string, and emits either `""` (whitespace-only note) or
 * `"## What happened\n\n" + trimmed + "\n\n"` — pinned identically on the daemon side
 * (plan Implementation Notes: "One composer for the note section, two callers"), which
 * is what makes INV-2's byte-identity assertion meaningful rather than coincidental. */
export function composeNoteSection(note: string): string {
  const trimmed = note.replace(/\r\n/g, "\n").trim();
  if (trimmed === "") return "";
  return `## What happened\n\n${trimmed}\n\n`;
}

/** The live preview text (User Flow 3/4): the composed note section followed by the
 * daemon's own `snapshotMarkdown` verbatim — `body = noteSection + snapshotMarkdown`,
 * exactly the daemon's own composition rule (kb:anchor/issue.create), so INV-2 holds
 * without this module ever inspecting `snapshotMarkdown`'s contents. */
function composePreview(note: string, snapshotMarkdown: string): string {
  return composeNoteSection(note) + snapshotMarkdown;
}

/** REQ-20: "captured HH:MM:SSZ" from the capture's RFC3339 UTC timestamp — an absolute
 * reading, not a ticking age (this dialog has no per-second render pass). */
function formatCaptureTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `captured ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** Testable UI Elements: `<code> — <message>` verbatim (em dash, same convention as
 * render/confirm.ts's session label). */
function formatErrorDetail(err: ApiErrorBody): string {
  return `${err.code} — ${err.message}`;
}

export function renderIssueButton(el: HTMLButtonElement, connected: boolean): void {
  el.disabled = !connected;
}

export function initIssueDialog(elements: IssueDialogElements): IssueDialogController {
  // The one held capture (or its absence) this open/selection is showing. `requestId`
  // guards a session-select change (or a fresh open) racing a still-in-flight capture
  // fetch — mirrors features/launch.ts's `browseRequestId`.
  let capture: IssueCapture | null = null;
  let captureFailed = false;
  let captureRequestId = 0;
  let submitting = false;

  function clearError(): void {
    elements.errorEl.textContent = "";
    elements.errorEl.hidden = true;
    elements.errorDetailEl.textContent = "";
    elements.errorDetailEl.hidden = true;
  }

  function showError(summary: string, err: ApiErrorBody): void {
    elements.errorEl.textContent = summary;
    elements.errorEl.hidden = false;
    elements.errorDetailEl.textContent = formatErrorDetail(err);
    elements.errorDetailEl.hidden = false;
  }

  /** States: "no data yet" (fetching…), "capture failed" (snapshot unavailable, error
   * region owns the detail), "data" (the live composed preview). */
  function renderPreview(): void {
    if (capture) {
      elements.previewEl.textContent = composePreview(
        elements.noteTextarea.value,
        capture.snapshotMarkdown,
      );
      elements.captureTimeEl.textContent = formatCaptureTime(capture.takenAt);
      return;
    }
    if (captureFailed) {
      elements.previewEl.textContent = "snapshot unavailable";
      elements.captureTimeEl.textContent = "";
      return;
    }
    elements.previewEl.textContent = "fetching snapshot…";
    elements.captureTimeEl.textContent = "";
  }

  /** REQ-6: empty title (after trim), no landed capture, or an in-flight capture/POST all
   * disable Submit. */
  function updateSubmitEnabled(): void {
    elements.submitBtn.disabled =
      submitting || capture === null || elements.titleInput.value.trim() === "";
  }

  async function takeCapture(sessionId: number | null): Promise<void> {
    const requestId = ++captureRequestId;
    capture = null;
    captureFailed = false;
    clearError();
    renderPreview();
    updateSubmitEnabled();

    const result = await captureIssueSnapshot(sessionId);
    // A newer navigation (session-select change, or the dialog being reopened) landed
    // first — drop this stale response (features/launch.ts's `navigate` guard, same shape).
    if (requestId !== captureRequestId) return;

    if (result.ok) {
      capture = result.value;
    } else {
      captureFailed = true;
      showError("Could not take a snapshot.", result.error);
    }
    renderPreview();
    updateSubmitEnabled();
  }

  function buildSessionOptions(sessions: readonly Session[], focusedId: number | null): void {
    const dashboardOption = document.createElement("option");
    dashboardOption.value = DASHBOARD_SCOPE_VALUE;
    dashboardOption.textContent = DASHBOARD_SCOPE_TEXT;

    const sessionOptions = sessions.map((session) => {
      const option = document.createElement("option");
      option.value = String(session.id);
      option.textContent = session.title ?? "untitled";
      return option;
    });

    elements.sessionSelect.replaceChildren(dashboardOption, ...sessionOptions);
    const preselect =
      focusedId !== null && sessions.some((s) => s.id === focusedId)
        ? String(focusedId)
        : DASHBOARD_SCOPE_VALUE;
    elements.sessionSelect.value = preselect;
  }

  function selectedSessionId(): number | null {
    const raw = elements.sessionSelect.value;
    return raw === DASHBOARD_SCOPE_VALUE ? null : Number(raw);
  }

  async function submit(): Promise<void> {
    if (submitting) return;
    const activeCapture = capture;
    const title = elements.titleInput.value.trim();
    if (!activeCapture || title === "") return;

    submitting = true;
    updateSubmitEnabled();
    clearError();

    const result = await fileIssue({
      captureId: activeCapture.captureId,
      title,
      note: elements.noteTextarea.value,
    });
    submitting = false;

    if (!result.ok) {
      // Edge Case 2: a `capture_expired` failure means the held snapshot is now known
      // gone — Submit stays disabled (via `capture === null`) until the session
      // selection changes (or the dialog is reopened) takes a fresh one. Any other
      // failure (e.g. `issue_post_failed`) leaves the still-good capture in place so a
      // bare retry works without re-capturing (REQ-10).
      if (result.error.code === "capture_expired") capture = null;
      showError("Could not file the issue.", result.error);
      renderPreview();
      updateSubmitEnabled();
      return;
    }

    elements.bodyEl.hidden = true;
    elements.successEl.hidden = false;
    elements.successLinkEl.textContent = `${result.value.repo}#${result.value.number}`;
    elements.successLinkEl.href = result.value.url;
    elements.submitBtn.hidden = true;
    elements.cancelBtn.hidden = true;
    elements.closeBtn.hidden = false;
  }

  function open(sessions: readonly Session[], focusedId: number | null): void {
    if (elements.dialog.open) return;

    submitting = false;
    elements.titleInput.value = "";
    elements.noteTextarea.value = "";
    elements.bodyEl.hidden = false;
    elements.successEl.hidden = true;
    elements.successLinkEl.textContent = "";
    elements.successLinkEl.href = "";
    elements.cancelBtn.hidden = false;
    elements.submitBtn.hidden = false;
    elements.closeBtn.hidden = true;
    clearError();

    buildSessionOptions(sessions, focusedId);
    capture = null;
    captureFailed = false;
    renderPreview();
    updateSubmitEnabled();

    elements.dialog.showModal();
    void takeCapture(selectedSessionId());
  }

  elements.sessionSelect.addEventListener("change", () => {
    void takeCapture(selectedSessionId());
  });
  elements.titleInput.addEventListener("input", updateSubmitEnabled);
  elements.noteTextarea.addEventListener("input", renderPreview);
  elements.cancelBtn.addEventListener("click", () => elements.dialog.close());
  elements.closeBtn.addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });

  return {
    open,
    closeAll() {
      if (elements.dialog.open) elements.dialog.close();
    },
  };
}

/** REQ-2's controller entry: the masthead's Issue button + `#issue-dialog`. The frozen
 * session list (REQ-2) is the rail's own current order plus `focusedId`, computed here at
 * click time from `app.store`/`app.state` — this module owns no session-store access of
 * its own. */
export function initIssue(app: App): void {
  const issueButtonEl = requireElement<HTMLButtonElement>("#issue-button");
  const elements: IssueDialogElements = {
    dialog: requireElement<HTMLDialogElement>("#issue-dialog"),
    form: requireElement<HTMLFormElement>("#issue-form"),
    sessionSelect: requireElement<HTMLSelectElement>("#issue-session-select"),
    titleInput: requireElement<HTMLInputElement>("#issue-title-input"),
    noteTextarea: requireElement<HTMLTextAreaElement>("#issue-note-input"),
    bodyEl: requireElement<HTMLElement>("#issue-body"),
    previewEl: requireElement<HTMLElement>("#issue-preview"),
    captureTimeEl: requireElement<HTMLElement>("#issue-captured-at"),
    successEl: requireElement<HTMLElement>("#issue-success"),
    successLinkEl: requireElement<HTMLAnchorElement>("#issue-success-link"),
    errorEl: requireElement<HTMLElement>("#issue-error"),
    errorDetailEl: requireElement<HTMLElement>("#issue-error-detail"),
    cancelBtn: requireElement<HTMLButtonElement>("#issue-cancel-button"),
    submitBtn: requireElement<HTMLButtonElement>("#issue-submit-button"),
    closeBtn: requireElement<HTMLButtonElement>("#issue-close-button"),
  };
  const dialog = initIssueDialog(elements);

  issueButtonEl.addEventListener("click", () => {
    dialog.open(orderRail(app.store.values(), app.state.railSort), app.state.focusedId);
  });

  // States: "Daemon down ... an open #issue-dialog closes."
  app.on("status", () => dialog.closeAll());

  // Render phase 4 (UI Specifications > Render phase order).
  app.onRender((frame) => renderIssueButton(issueButtonEl, frame.connected));
}
