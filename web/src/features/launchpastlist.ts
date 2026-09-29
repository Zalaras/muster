// Pure decisions for the launch dialog's Resume tab list — used only by
// features/launchresume.ts, its one caller, so this lives beside it rather than in
// render/ or sessions/ (docs/conventions.md § Composition roots; same shape as
// launchcrumbs.ts/launchmodels.ts/launchrestore.ts).
import type { PastSession } from "../api/launch";
import type { PastRowView } from "../render/launchpast";
import { isBypassMode } from "../sessions/permission";

/** Case-insensitive substring match over title and last prompt. An empty
 * (or whitespace-only) query matches everything, same "no filter yet" default every
 * other filter box in the codebase uses. */
export function filterPastSessions(list: readonly PastSession[], query: string): PastSession[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter(
    (session) =>
      (session.title?.toLowerCase().includes(q) ?? false) ||
      (session.lastPrompt?.toLowerCase().includes(q) ?? false),
  );
}

/** kb:adr/launch-resume-running-guard-muster-only: the first row not already open in an
 * alive Muster session, or `null` when every row is (or the list is empty). */
export function defaultSelection(list: readonly PastSession[]): PastSession | null {
  return list.find((session) => session.openSessionId === null) ?? null;
}

/** A row's view — the two view decisions `render/launchpast.ts`'s row builder and the
 * Resume-tab footer both need, computed once here rather than each owning its own copy.
 * Mirrors `sessions/card.ts`'s `bypassChip`/`title ?? "untitled"` split — one pure
 * derivation per concept, `render/` only ever reads the result. `PastRowView` itself is
 * declared in `render/launchpast.ts`, not here, so both this function's return type and
 * that module's row builder share the one declaration (same direction as
 * `render/launch.ts`'s `ModelRowState` / `features/launchmodels.ts`'s
 * `deriveModelRowState`). */
export function pastRowView(session: PastSession): PastRowView {
  return {
    session,
    title: session.title ?? "(untitled)",
    bypassChip: isBypassMode(session.permissionMode),
  };
}
