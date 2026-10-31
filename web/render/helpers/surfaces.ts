// The live-terminal container and its focus oracle, the segmented `claude | shell | docs`
// control in both its hosts, the shell surface's container and the shell segment's
// busy/done indicator. The containers are located by aria-label (`Terminal: <title>`,
// `Shell: <title>`), never by xterm's own DOM — xterm.js owns the inner DOM. Pure DOM —
// no daemon, no fixture knowledge — so both tiers use it: the render specs here directly,
// the E2E journeys through `web/e2e/helpers/{terminal,shell,shellinput}.ts`, which
// re-export it.
import type { Locator, Page } from "./harness";
import { liveTileById } from "./tiles";

/**
 * The live-terminal container for a given session title, per the Testable UI Elements
 * row `container carries aria-label "Terminal: <title>"`.
 */
export function terminalRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Terminal: ${title}"]`);
}

/**
 * The terminal focus oracle (Testable UI Elements: "the focus oracle is
 * `document.activeElement` is a descendant of this container — assert via
 * `page.evaluate`, not by locating xterm's textarea"). `closest()` also matches when the
 * container element itself is the active element (never true in practice for xterm's
 * hidden textarea, but keeps the check honest either way).
 */
export async function activeElementInsideTerminal(page: Page, title: string): Promise<boolean> {
  return await page.evaluate((t) => {
    const active = document.activeElement;
    if (!active) return false;
    return active.closest(`[aria-label="Terminal: ${t}"]`) !== null;
  }, title);
}

/**
 * Same oracle, unscoped to a title — the focus assertions only
 * need "not inside ANY terminal", since the point under test (a card control click, a
 * drag) must never move focus into a terminal at all, regardless of which session's.
 */
export async function activeElementInsideAnyTerminal(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return false;
    return active.closest('[aria-label^="Terminal: "]') !== null;
  });
}

// --- the segmented surface control (the `docs` kind
// included), one component rendered in two places: the Focus
// mainhead (`.mainhead .surfseg`) and every tile's footer (`.tfoot .acts .surfseg`, scoped
// through `article.tile[data-session-id]` since six tiles carry identically-named buttons,
// exactly as they already do for End — Testable UI Elements). ---

export type SurfaceKind = "claude" | "shell" | "docs";

/** The Focus mainhead's segmented group (Testable UI Elements: `role="group"
 * aria-label="Surface"`, `.mainhead .surfseg`). */
export function mainheadSurfaceGroup(page: Page): Locator {
  return page.locator(".mainhead .surfseg");
}

/** One of the mainhead's segment buttons, by exact accessible name. */
export function mainheadSurfaceButton(page: Page, kind: SurfaceKind): Locator {
  return mainheadSurfaceGroup(page).getByRole("button", { name: kind, exact: true });
}

/** A tile's segmented group, scoped by `data-session-id` (`liveTileById`) rather than
 * title text — the same disambiguation `tileRenameButton` and `tileDragHandleById` already
 * need, since every tile's footer carries identically-named `claude`/`shell` buttons. */
export function tileSurfaceGroup(page: Page, sessionId: number): Locator {
  return liveTileById(page, sessionId).locator(".tfoot .acts .surfseg");
}

/** One of a tile's segment buttons, by exact accessible name. */
export function tileSurfaceButton(page: Page, sessionId: number, kind: SurfaceKind): Locator {
  return tileSurfaceGroup(page, sessionId).getByRole("button", { name: kind, exact: true });
}

/**
 * The shell surface's container, per the Testable UI Elements row: same
 * `.terminal-surface` component as the Claude pane, `aria-label="Shell: <title>"`
 * (distinct prefix from `terminalRegion`'s `"Terminal: "`).
 */
export function shellSurfaceRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Shell: ${title}"]`);
}

/**
 * The shell segment's busy/done indicator — Testable UI Elements: `span.shellact` inside
 * the `shell` button, carrying `data-act="busy"` or `data-act="done"`, `aria-hidden` (the
 * button's own accessible name stays exactly "shell" in every indicator state).
 * Presence and `data-act` are the contract, as `span.pip`'s presence was; absence
 * (`toHaveCount(0)`) is the "no data yet"/idle state, deliberately indistinguishable
 * from "no shell has ever existed for this session".
 */
export function shellActivityIndicator(segmentButton: Locator): Locator {
  return segmentButton.locator("span.shellact");
}
