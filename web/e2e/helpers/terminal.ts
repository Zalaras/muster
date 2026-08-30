// Terminal-pane helpers for the m2-terminal E2E suite (plan m2-terminal).
//
// M2's Testable UI Elements table pins the live-terminal container by aria-label
// (`Terminal: <title>`) but leaves xterm's own DOM untouched — "xterm.js owns the inner
// DOM — locate the container, not xterm internals". `@xterm/xterm` 6.0.0 ships no
// canvas/WebGL addon in this project's dependencies (only `@xterm/addon-fit`), so its
// default renderer is DOM-based: rendered rows are real text nodes, readable via
// Playwright's normal text matchers without reaching into xterm internals.
import { expect } from "@playwright/test";
import type { Locator, Page, WebSocket } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";

/**
 * The live-terminal container for a given session title, per the Testable UI Elements
 * row `container carries aria-label "Terminal: <title>"`.
 */
export function terminalRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Terminal: ${title}"]`);
}

/**
 * The one state-overlay element inside a live surface (down/superseded/ended), per the
 * Testable UI Elements row `/disconnected|another window|session ended/`.
 */
export function terminalOverlay(region: Locator): Locator {
  return region.getByText(/disconnected|another window|session ended/i);
}

/**
 * Live tile locator (Tiles view) — the plan calls live tiles "article-shaped" in its
 * Testable UI Elements notes: the tile template's root is a bare `<article class="tile">`,
 * the one plain element that carries an implicit ARIA role (`article`) without any
 * attribute. A bare `getByRole("article")` is NOT enough to identify a live tile,
 * though: the snapshot strip's cards (`web/e2e/helpers/terminal.ts`'s `stripCard`, same
 * template M1's rail card uses) are `<article class="card" data-testid="session-card">`
 * — also role="article" — so a role-only locator matches both a session's live tile AND
 * its strip card whenever it appears in either place, corrupting every "is this session
 * live or stripped" count in views.spec.ts. Scope on the `.tile` class (only the live-grid
 * template uses it) to disambiguate from a strip/rail card of the same session.
 */
export function liveTile(page: Page, title: string): Locator {
  return page.locator("article.tile").filter({ hasText: title });
}

/**
 * Strip-card locator (Tiles view). The plan's UI spec says a strip card is literally "the
 * M1 card content on its side" — i.e. the same rail-card component M1 already ships
 * (`data-testid="session-card"`), and web-impl's `renderStrip` does reuse that exact
 * template. But the Focus-view rail (`aria-label="Sessions"`) is only ever `hidden`, not
 * removed, when Tiles is active (`main.ts`'s `viewFocusEl.hidden = view !== "focus"`), so
 * a session's rail card and its strip card coexist in the DOM at once — both
 * `data-testid="session-card"` with the same title text. A bare `getByTestId` match is
 * therefore ambiguous (strict-mode violation) the moment a session is both known (rail)
 * and stripped (Tiles): scope to the `#tiles-strip` container so this locator only ever
 * finds the strip's own copy.
 */
export function stripCard(page: Page, titleOrUntitled: string): Locator {
  return page.locator("#tiles-strip").getByTestId("session-card").filter({ hasText: titleOrUntitled });
}

/**
 * Tracks open `/ws/terminal/` sockets for INV-2 (E11): counts opens via
 * `page.on('websocket')` and removes on close/error, so `.liveCount` always reflects the
 * number of currently-open terminal sockets. Must be constructed (i.e. its listener
 * attached) before the action that opens the socket(s) under test — Playwright's
 * `websocket` event only fires for connections made after the listener is registered.
 */
export class TerminalSocketTracker {
  private openSockets = new Set<WebSocket>();
  private opened = 0;

  constructor(page: Page) {
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/ws/terminal/")) return;
      this.opened += 1;
      this.openSockets.add(ws);
      ws.on("close", () => this.openSockets.delete(ws));
      ws.on("socketerror", () => this.openSockets.delete(ws));
    });
  }

  get liveCount(): number {
    return this.openSockets.size;
  }

  /** Cumulative opens since construction — unlike `liveCount` (a net gauge that an
   * open-then-close also brings back to zero), this asserts "never opened" literally
   * (m2 review cycle-2 Minor 5: REQ-13's "no attach attempt" needs the gross count). */
  get totalOpened(): number {
    return this.opened;
  }
}

/**
 * Cross-checks a live tile's footer geometry (the `.geo` span inside its `.tfoot`,
 * REQ-15's "tile footers show their real geometry") against the tmux oracle
 * (`#{window_width}`/`#{window_height}`) for that session's tmux target.
 *
 * Review m2-terminal Critical 6/6: E8's original REQ-15 check only matched the *pattern*
 * `/\d+×\d+/`, which a stale or fabricated geometry satisfies just as well as a real one
 * — exactly how Critical 1 (Tiles never refits) shipped green. This helper is the actual
 * INV-3 "geometry moves" oracle, applied inside Tiles: it polls because the `resize`
 * frame a tile's refit produces reaches tmux asynchronously relative to the render pass
 * that wrote the footer text, so a single synchronous read of both sides can race.
 */
export async function expectTileGeometryMatchesTmux(
  page: Page,
  daemon: ScratchDaemon,
  title: string,
  tmuxTarget: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const text = await liveTile(page, title).locator(".geo").textContent();
        if (!text) return "no-geo-text";
        const match = /(\d+)\s*×\s*(\d+)/.exec(text);
        if (!match) return `unparseable:${text}`;
        const [, footerCols, footerRows] = match;
        const width = await daemon.tmuxDisplay(tmuxTarget, "#{window_width}");
        const height = await daemon.tmuxDisplay(tmuxTarget, "#{window_height}");
        return footerCols === width && footerRows === height
          ? "match"
          : `mismatch: footer ${footerCols}x${footerRows} vs tmux ${width}x${height}`;
      },
      { timeout: 15_000 },
    )
    .toBe("match");
}

/**
 * Waits until every listed tile's footer geometry agrees with a fresh tmux read, for ALL
 * of them at once in the same poll iteration.
 *
 * This differs from calling `expectTileGeometryMatchesTmux` once per tile in a sequential
 * loop: a freshly-populated 2x2 grid settles as one shared reflow (all tiles resize
 * together as the grid's own layout finishes, not independently), so a per-tile loop can
 * observe tile 0 "matched" on its own poll cycle, move on to tile 1, and never re-check
 * tile 0 again — even though a later shared reflow (triggered while waiting on tile 1/2/3)
 * still changes tile 0's true final size after that early match. move-tiles E2E validate
 * attempt 2 hit exactly this: a per-tile sequential wait still produced an off-by-one
 * "before" vs "after" height on a pure reorder, purely from this race, on every one of 8
 * repeated runs. Requiring all tiles to match in the *same* poll callback closes it: the
 * poll only returns true once every tile agrees simultaneously, so an in-flight shared
 * reflow that would invalidate an earlier match keeps the whole poll failing until it's
 * truly done everywhere.
 */
export async function expectAllTileGeometrySettled(
  page: Page,
  daemon: ScratchDaemon,
  entries: ReadonlyArray<{ title: string; tmuxTarget: string }>,
): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const { title, tmuxTarget } of entries) {
          const text = await liveTile(page, title).locator(".geo").textContent();
          if (!text) return `no-geo-text:${title}`;
          const match = /(\d+)\s*×\s*(\d+)/.exec(text);
          if (!match) return `unparseable:${title}:${text}`;
          const [, footerCols, footerRows] = match;
          const width = await daemon.tmuxDisplay(tmuxTarget, "#{window_width}");
          const height = await daemon.tmuxDisplay(tmuxTarget, "#{window_height}");
          if (footerCols !== width || footerRows !== height) {
            return `mismatch:${title}:footer ${footerCols}x${footerRows} vs tmux ${width}x${height}`;
          }
        }
        return "match";
      },
      { timeout: 15_000 },
    )
    .toBe("match");
}

/**
 * Plan move-tiles' drag handle locator: the Testable UI Elements table pins
 * `article.tile .thead[draggable="true"]` as "the only draggable element in a tile"
 * (REQ-4) — this is the sole source locator for every drag-based reorder in the suite.
 * Scoped through `liveTile` so a dragged/target title still disambiguates from the same
 * session's strip/rail card the way every other tile locator in this file does.
 */
export function tileDragHandle(page: Page, title: string): Locator {
  return liveTile(page, title).locator(".thead");
}

/**
 * The state dot inside a tile (move-tiles REQ-9: gains a `title` attribute with the
 * lowercase state word — `.sdot[title]` per the Testable UI Elements table).
 */
export function tileStateDot(page: Page, title: string): Locator {
  return liveTile(page, title).locator(".sdot");
}

/**
 * The grid-order oracle move-tiles' Testable UI Elements table names directly:
 * `#tiles-grid article.tile .nm` in DOM order. Every reorder assertion in that plan reads
 * titles through this one helper so a locator fix (if the real markup diverges) only ever
 * needs to happen here.
 */
export async function tilesGridOrder(page: Page): Promise<string[]> {
  return await page.locator("#tiles-grid article.tile .nm").allInnerTexts();
}

/**
 * Drags a live tile's header onto another live tile — move-tiles REQ-5: "Dropping a tile
 * drag on another tile (anywhere on that tile, header or body) applies `moveTile`", so the
 * source must be the `.thead` handle (REQ-4) but the drop target is the whole tile.
 * `locator.dragTo` drives real HTML5 DnD in Chromium (plan Implementation Notes) as long
 * as the source element itself is `draggable="true"`, which is exactly what `.thead` is.
 */
export async function dragTileOnto(page: Page, draggedTitle: string, targetTitle: string): Promise<void> {
  await tileDragHandle(page, draggedTitle).dragTo(liveTile(page, targetTitle));
}

/**
 * Parses the Focus sizenote line's leading `<cols>×<rows>` (REQ-15, a-instrument mockup:
 * `<cols>×<rows> · one live client · geometry owned by this pane`) out of its text
 * content, for E4's cross-check against the tmux geometry oracle.
 */
export function parseSizenote(text: string): { cols: string; rows: string } {
  const match = /(\d+)\s*×\s*(\d+)/.exec(text);
  if (!match) throw new Error(`sizenote text did not contain a <cols>×<rows> pattern: ${text}`);
  const [, cols, rows] = match;
  if (!cols || !rows) throw new Error(`sizenote regex matched without capture groups: ${text}`);
  return { cols, rows };
}
