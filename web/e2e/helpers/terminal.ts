// Terminal-pane helpers.
//
// The live-terminal container is located by aria-label (`Terminal: <title>`), never by
// xterm's own DOM — xterm.js owns the inner DOM. `@xterm/xterm` 6.0.0 ships no
// canvas/WebGL addon in this project's dependencies (only `@xterm/addon-fit`), so its
// default renderer is DOM-based: rendered rows are real text nodes, readable via
// Playwright's normal text matchers without reaching into xterm internals.
import { expect } from "@playwright/test";
import type { Locator, Page, WebSocket } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";

// The pure DOM side — the terminal container and its focus oracle, the tile, strip-card and
// drag-handle locators and the grid-order oracle — lives in the render tier's helpers; the
// journeys here reach it through these re-exports so a locator is written once for both
// tiers.
export {
  activeElementInsideAnyTerminal,
  activeElementInsideTerminal,
  terminalRegion,
} from "../../render/helpers/surfaces";
export {
  dragTileOnto,
  liveTile,
  liveTileById,
  stripCard,
  tileDragHandle,
  tileDragHandleById,
  tilesGridOrder,
  tileStateDot,
} from "../../render/helpers/tiles";
import { liveTile } from "../../render/helpers/tiles";

/**
 * The state-overlay element inside a live surface, for the two states that are durable:
 * "disconnected" (the daemon is down — nothing can re-render the surface) and "another
 * window" (4000 superseded — the session stays alive, so the surface is never disposed).
 *
 * Deliberately NOT the third state, `4001` "session ended". That overlay is a ~25 ms
 * transient: the same PTY-EOF branch that closes the socket with 4001 nudges the liveness
 * poll, and the resulting `alive:false` render pass disposes the TerminalSurface (overlay
 * included) and shows the dead surface. Measured 2026-09-11: overlay 5–9 ms after
 * kill-window, dead surface ~30 ms after, and 1 in 15 kills never rendered the overlay
 * because the state upsert beat the socket's `close` event. Asserting it made
 * terminal.spec.ts E12 flaky for weeks (docs/history/design/test-strategy.md). For an ended pane,
 * assert the durable end state instead: `#dead-surface` (Focus) or
 * `liveTile(...).locator(".dead-surface")`/`.endcap` (Tiles), plus
 * `terminalRegion(...).toHaveCount(0)` and, for the socket itself, `TerminalSocketTracker`
 * — see terminal.spec.ts E12/REQ-13 and actions.spec.ts's End tests for the shape.
 * e2e-lint rule 4 rejects the overlay oracle.
 */
export function terminalOverlay(region: Locator): Locator {
  return region.getByText(/disconnected|another window/i);
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

// ── file-drop-fix: drop simulation ─────────────────────────────────────────────────────
//
// The in-page `DataTransfer` builders (`dropFiles`/`dropText`/`dragoverThenDropFiles`) and
// the one-per-surface `dropNotice` are pure DOM and live in the render tier's helper
// (web/render/helpers/drop.ts, where the drop guard's display properties re-levelled on
// 2026-10-20 read them); the journeys here reach them through this re-export.
export {
  dragoverThenDropFiles,
  type DropFileSpec,
  dropFiles,
  dropNotice,
  dropText,
} from "../../render/helpers/drop";
