// Locator helpers for `#issue-dialog` (plan issue-capture). Structure and Testable UI
// Elements transcribed from the plan's DOM snippet and its Testable UI Elements table —
// role + accessible name where the table pins one, a plain CSS/testid locator where it
// doesn't (the preview `<pre>` has no implicit role; the per-session `<option>`s are
// left to us). Kept as a shared module since assertions live across several tests in
// issue-capture.spec.ts.
import type { Locator } from "@playwright/test";

// The masthead button, the dialog and its opener are pure DOM and live in the render tier's
// helper (web/render/helpers/issue.ts, where the button's per-view property re-levelled on
// 2026-10-20 reads them); the journeys here reach them through this re-export. Everything
// below needs the capture POST the dialog fires on open, which only the daemon answers.
export { issueButton, issueDialog, openIssueDialog } from "../../render/helpers/issue";

/** Session `<select>` — native `<select>` + `<label for>` gives it the accessible name
 * "Session". */
export function issueSessionSelect(dialog: Locator): Locator {
  return dialog.getByRole("combobox", { name: "Session" });
}

/** The dashboard-scope option's exact text (REQ-2) — em dashes (U+2014), single spaces,
 * as pinned by the Testable UI Elements table. */
export const DASHBOARD_SCOPE_OPTION_TEXT = "— none (dashboard only) —";

/** All `<option>`s inside the Session select, in DOM order. */
export function issueSessionOptions(dialog: Locator): Locator {
  return issueSessionSelect(dialog).locator("option");
}

/** Title `<input>` — native `<input type="text">` + `<label for>` → accessible name
 * "Title". */
export function issueTitleInput(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Title" });
}

/** Note `<textarea>` — accessible name "What happened". */
export function issueNoteTextarea(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "What happened" });
}

/** Preview `<pre>` — no implicit role, located via its `data-testid` per the Testable UI
 * Elements table. */
export function issuePreview(dialog: Locator): Locator {
  return dialog.locator('[data-testid="issue-preview"]');
}

/** Preview pane heading — `<h3>Payload preview</h3>`. */
export function issuePreviewHeading(dialog: Locator): Locator {
  return dialog.getByRole("heading", { name: "Payload preview" });
}

/** `#issue-captured-at` — the "captured HH:MM:SSZ" meta line (REQ-20), no pinned role. */
export function issueCapturedAt(dialog: Locator): Locator {
  return dialog.locator("#issue-captured-at");
}

/** Submit button — "File issue". */
export function issueSubmitButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "File issue" });
}

/** Cancel button, scoped to `#issue-dialog` (the plan's table notes `#remove-dialog`/
 * `#end-dialog` also have a "Cancel" — `dialog` here is already the `#issue-dialog`
 * locator, so this is inherently scoped). */
export function issueCancelButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Cancel" });
}

/** Close button — hidden until a successful post (REQ-9). */
export function issueCloseButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Close" });
}

/** The one-line failure summary — `role="alert"`, scoped to the dialog. */
export function issueErrorSummary(dialog: Locator): Locator {
  return dialog.getByRole("alert");
}

/** The selectable `<pre>` detail line — `<code> — <message>` verbatim, no role. */
export function issueErrorDetail(dialog: Locator): Locator {
  return dialog.locator("#issue-error-detail");
}

/** The success line — `<p role="status">Filed <a>…</a></p>`. */
export function issueSuccessStatus(dialog: Locator): Locator {
  return dialog.getByRole("status");
}

/** The success line's link — text `<owner>/<repo>#<number>`, `href` is the issue's
 * `html_url`. */
export function issueSuccessLink(dialog: Locator): Locator {
  return dialog.getByRole("link");
}
