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
 * Plan terminal-focus's focus oracle (Testable UI Elements: "the focus oracle is
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
 * Same oracle, unscoped to a title — plan terminal-focus's INV-3/INV-4 assertions only
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
 * terminal.spec.ts E12 flaky for weeks (docs/design/test-strategy.md). For an ended pane,
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
 * Live tile locator scoped by `data-session-id` rather than title text. Validate-mode
 * repair (plan ui-text-and-focus): once a tile's rename editor is open, its title text
 * lives in the `input.name-edit`'s `value` attribute, which `filter({ hasText })` never
 * sees (`textContent` doesn't include form-control values) — so `liveTile(page, title)`
 * stops matching the very tile whose editor was just opened by title. Use this id-scoped
 * variant whenever a tile must still be found while its own rename field may be open.
 */
export function liveTileById(page: Page, id: number): Locator {
  return page.locator(`article.tile[data-session-id="${id}"]`);
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
 * Drag-handle locator scoped by `data-session-id` (`liveTileById`) rather than title
 * text. Validate-mode repair (plan ui-text-and-focus): a Playwright `Locator` is a lazy
 * definition re-resolved on every `expect`/action call, not a snapshot taken at
 * construction — so a single `tileDragHandle(page, title)` captured before a rename
 * stops matching once that tile's rename editor swaps its title text for
 * `input.name-edit` (mid-edit), and never matches again once the title actually changes
 * (post-commit). Use this id-scoped variant for any drag-handle assertion that spans a
 * rename.
 */
export function tileDragHandleById(page: Page, id: number): Locator {
  return liveTileById(page, id).locator(".thead");
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

// ── file-drop-fix: drop simulation ─────────────────────────────────────────────────────
//
// Plan file-drop-fix, Affected Files > E2E: `dropFiles`/`dropText` build a `DataTransfer`
// in-page (`page.evaluateHandle`, `new File([...])`) and `dispatchEvent("drop", {
// dataTransfer })`; `dropNotice` returns the one `role="status"` element per surface. A
// dropped file's *content* never needs to cross the CDP wire when only its *size* is
// under test (REQ-7's 50 MiB+1 fixture) — passing `size` instead of `bytes` builds a
// zero-filled `Uint8Array` of that length directly in the page.

/** One file to include in a synthesized drop. Provide `bytes` whenever the daemon must
 * find a byte-identical match on disk (E1-E4, E8); provide `size` alone when only the
 * File's size matters (E7) so tens of megabytes of literal content never round-trip
 * through this Node process as a JSON array. */
export interface DropFileSpec {
  name: string;
  bytes?: Buffer;
  size?: number;
}

async function buildFileDataTransfer(page: Page, files: readonly DropFileSpec[]) {
  const serializable = files.map((f) => ({
    name: f.name,
    bytes: f.bytes ? Array.from(f.bytes) : null,
    size: f.size ?? f.bytes?.length ?? 0,
  }));
  return await page.evaluateHandle((fs) => {
    const dt = new DataTransfer();
    for (const f of fs) {
      const content = f.bytes ? new Uint8Array(f.bytes) : new Uint8Array(f.size);
      dt.items.add(new File([content], f.name));
    }
    return dt;
  }, serializable);
}

async function buildTextDataTransfer(page: Page, text: string) {
  return await page.evaluateHandle((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    return dt;
  }, text);
}

/**
 * Dispatches one "drop" carrying every listed file, in order, onto `region` — the UI's own
 * sequential locate→paste loop (REQ-2) then processes them one at a time. Playwright's
 * `dispatchEvent` bypasses the native drag gesture entirely, so no preceding `dragover` is
 * needed to reach a target's own `drop` listener (plan Implementation Notes); use
 * `dragoverThenDropFiles` when the *document-level guard's* `dragover` listener is itself
 * what's under test (E5).
 */
export async function dropFiles(region: Locator, files: readonly DropFileSpec[]): Promise<void> {
  const dataTransfer = await buildFileDataTransfer(region.page(), files);
  await region.dispatchEvent("drop", { dataTransfer });
}

/** REQ-10: a text/plain-only drop (no Files) onto `region`. */
export async function dropText(region: Locator, text: string): Promise<void> {
  const dataTransfer = await buildTextDataTransfer(region.page(), text);
  await region.dispatchEvent("drop", { dataTransfer });
}

/**
 * E5: dispatches `dragover` then `drop` with the SAME `DataTransfer` handle — the
 * documented Playwright drag-and-drop testing pattern (reusing one handle across both
 * events, mirroring its own `dragstart`+`drop` example) — so a foreign drag over a
 * non-terminal part of the dashboard exercises the document-level drop guard's real
 * `dragover` listener, not just its `drop` handler.
 */
export async function dragoverThenDropFiles(target: Locator, files: readonly DropFileSpec[]): Promise<void> {
  const dataTransfer = await buildFileDataTransfer(target.page(), files);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

/**
 * The one-per-surface drop notice (Testable UI Elements: "Only one notice element exists
 * per surface" — `role="status"` inside `.terminal-surface`, REQ-6).
 */
export function dropNotice(region: Locator): Locator {
  return region.getByRole("status");
}
