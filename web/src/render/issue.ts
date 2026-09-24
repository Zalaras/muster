// The Issue dialog's DOM builders (kb:spec/issue) — split out of features/issue.ts
// (docs/conventions.md § Composition roots: DOM building belongs in `render/`, matching
// `render/crumbs.ts`'s shape for a small builder used by exactly one controller).
// `initIssueDialog` itself stays in
// features/issue.ts: it owns the capture/submit network calls and the mutable capture
// state, which `render/` never does.
import type { Session } from "../protocol/session";

/** The dashboard-scope option's exact text — em dashes (U+2014), single spaces; a
 * separate literal copy in `web/e2e/helpers/issue.ts`'s `DASHBOARD_SCOPE_OPTION_TEXT`
 * must match this byte-for-byte since the two aren't shared via import. */
export const DASHBOARD_SCOPE_TEXT = "— none (dashboard only) —";
export const DASHBOARD_SCOPE_VALUE = "";

export function renderIssueButton(el: HTMLButtonElement, connected: boolean): void {
  el.disabled = !connected;
}

/** Builds the Session select from `sessions` (already in rail order — the caller's
 * job, not this module's) plus the dashboard-scope option, and preselects `focusedId`
 * when it's in the list else the dashboard option. */
export function buildSessionOptions(
  sessionSelect: HTMLSelectElement,
  sessions: readonly Session[],
  focusedId: number | null,
): void {
  const dashboardOption = document.createElement("option");
  dashboardOption.value = DASHBOARD_SCOPE_VALUE;
  dashboardOption.textContent = DASHBOARD_SCOPE_TEXT;

  const sessionOptions = sessions.map((session) => {
    const option = document.createElement("option");
    option.value = String(session.id);
    option.textContent = session.title ?? "untitled";
    return option;
  });

  sessionSelect.replaceChildren(dashboardOption, ...sessionOptions);
  const preselect =
    focusedId !== null && sessions.some((s) => s.id === focusedId)
      ? String(focusedId)
      : DASHBOARD_SCOPE_VALUE;
  sessionSelect.value = preselect;
}
