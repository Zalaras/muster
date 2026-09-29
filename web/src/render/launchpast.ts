// The launch dialog's Resume tab: the past-session list head, its loading/empty/error
// states and its rows — split out of render/launch.ts (the New tab's own builders) since
// this is a genuinely separate list with its own row shape, matching
// docs/conventions.md's "a new module … takes its neighbours' shape" (render/launch.ts's
// renderRecentsList/renderBrowseListing pair is the sibling this follows: elements/values
// in, an `onSelect` callback out, no daemon call of its own). The controller
// (features/launchresume.ts) owns the fetch, the filter and the selection; this module
// only ever draws whatever it's handed.
import type { PastSession } from "../api/launch";
import { formatAge } from "../sessions/format";
import { captureFocusedKey, restoreFocusedKey } from "./focuskeep";

/** A row's already-derived display fields — the title fallback and the bypass
 * condition are computed once by `features/launchpastlist.ts`'s `pastRowView` (its one
 * caller, `features/launchresume.ts`, maps the visible sessions through it before
 * calling `renderPastList`); this module only ever draws the result
 * (render/CLAUDE.md: "a builder here takes the computed value, never the raw data").
 * Declared here, not there, so that pure decision (one controller caller) imports its
 * return type downward from the builder that also consumes it — same direction as
 * `render/launch.ts`'s `ModelRowState` / `features/launchmodels.ts`'s
 * `deriveModelRowState` (`rg -n 'from "\.\./render/' web/src/features` shows the same
 * shape in `rename.ts`, `connectionversion.ts`, `tiles.ts`, `surfaces.ts`). */
export interface PastRowView {
  session: PastSession;
  title: string;
  bypassChip: boolean;
}

/** The list head: "Claude sessions in <dir name> · <n>", or without the count while it
 * isn't known yet (loading/error) — design-system §6 honesty rules, never a fabricated
 * "· 0". */
export function renderPastHead(el: HTMLElement, dirName: string, count: number | null): void {
  el.textContent =
    count === null ? `Claude sessions in ${dirName}` : `Claude sessions in ${dirName} · ${count}`;
}

export function renderPastLoading(el: HTMLElement): void {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = "Loading sessions…";
  el.replaceChildren(p);
}

export function renderPastError(el: HTMLElement, message: string): void {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = message;
  el.replaceChildren(p);
}

/** One row: a `.tw` wrapper holding the title (its fallback already applied by
 * `pastRowView`) and, as its flex sibling, the bypass chip when the row's last mode was
 * bypass — never appended *inside* the title span, whose own
 * `overflow:hidden;text-overflow:ellipsis` would clip an appended chip off-screen for a
 * long title. `.past-list .tw`/`.t`/`.chip-danger` in style.css give the title the
 * shrink-and-ellipsis and the chip `flex:0 0 auto`, so it never does. Then the age, then
 * the last prompt — or "open in Muster" (and `disabled`)
 * when an alive Muster session already holds this claudeSessionId
 * (kb:adr/launch-resume-running-guard-muster-only). `.tw`'s own textContent still
 * concatenates title-then-chip with no separator (Testable UI Elements), and the button's
 * overall textContent is unaffected by the wrapper (nesting depth doesn't change text
 * order). Carries `data-claude-session-id` so `renderPastList`'s rebuild can restore
 * keyboard focus onto the equivalent row (`render/focuskeep.ts`'s
 * `captureFocusedKey`/`restoreFocusedKey`, the same primitive `render/reader.ts`'s
 * tree/outline rebuilds use). */
function buildPastRow(
  row: PastRowView,
  selected: boolean,
  now: Date,
  onSelect: (session: PastSession) => void,
): HTMLButtonElement {
  const { session } = row;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row";
  button.dataset["claudeSessionId"] = session.claudeSessionId;

  const titleWrap = document.createElement("span");
  titleWrap.className = "tw";

  const title = document.createElement("span");
  title.className = "t";
  title.textContent = row.title;
  titleWrap.append(title);

  if (row.bypassChip) {
    const chip = document.createElement("span");
    chip.className = "chip-danger";
    chip.textContent = "bypass";
    titleWrap.append(chip);
  }

  const age = document.createElement("span");
  age.className = "age";
  age.textContent = formatAge(session.lastActiveAt, now);

  const lastPrompt = document.createElement("span");
  lastPrompt.className = "lp";
  const openElsewhere = session.openSessionId !== null;
  lastPrompt.textContent = openElsewhere ? "open in Muster" : (session.lastPrompt ?? "");

  button.append(titleWrap, age, lastPrompt);
  if (openElsewhere) {
    button.disabled = true;
  } else {
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => onSelect(session));
  }
  return button;
}

/** The list body: the honest empty state ("No Claude Code sessions in this directory"
 * when the directory truly has none, "No sessions match" when the filter excludes
 * everything that does exist), one row per visible session otherwise, plus the
 * truncation line when the daemon capped the response at 200. `visible` is already
 * filtered (features/launchpastlist.ts's `filterPastSessions`) and mapped through
 * `pastRowView` (its title/chip already derived); `totalEmpty` is whether the
 * *unfiltered* fetch came back empty, which decides which empty string applies.
 *
 * Rebuilds every row on every call (`replaceChildren`) rather than reconciling, same as
 * this list's own precedent-check found no existing keyed-reorder path for a plain flat
 * button list (`rg -n "reconcileKeyedOrder" web/src/render` only matches the rail/tiles
 * grid, which track drag-and-drop order this list has none of) — so a keyboard selection
 * would otherwise blur to `<body>` on a keyboard selection. Capturing/restoring
 * focus around the rebuild, rather than reconciling, is the smaller change and matches
 * `render/reader.ts`'s tree/outline, which rebuild wholesale on the same structural-change
 * shape and use the identical two calls. */
export function renderPastList(
  el: HTMLElement,
  visible: readonly PastRowView[],
  totalEmpty: boolean,
  truncated: boolean,
  selectedId: string | null,
  now: Date,
  onSelect: (session: PastSession) => void,
): void {
  if (visible.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = totalEmpty ? "No Claude Code sessions in this directory" : "No sessions match";
    el.replaceChildren(p);
    return;
  }
  const focused = captureFocusedKey(el, "claudeSessionId");
  el.replaceChildren(
    ...visible.map((row) =>
      buildPastRow(row, row.session.claudeSessionId === selectedId, now, onSelect),
    ),
  );
  restoreFocusedKey(el, "claudeSessionId", focused);
  if (truncated) {
    const trunc = document.createElement("p");
    trunc.className = "trunc";
    trunc.textContent = "Showing the newest 200";
    el.append(trunc);
  }
}
