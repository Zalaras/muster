// Locators and the grid-order oracle for the Tiles view: a live tile, its strip card, its
// drag handle and state dot. Pure DOM — no daemon, no fixture knowledge — so both tiers use
// it: the render specs here directly, the E2E journeys through `web/e2e/helpers/terminal.ts`,
// which re-exports it.
import type { Locator, Page } from "./harness";

/**
 * Live tile locator (Tiles view). The tile template's root is a bare
 * `<article class="tile">`, which carries an implicit ARIA role (`article`) without any
 * attribute. A bare `getByRole("article")` is NOT enough to identify a live tile,
 * though: the snapshot strip's cards (`stripCard` below, the same template the rail card
 * uses) are `<article class="card" data-testid="session-card">` — also role="article" — so
 * a role-only locator matches both a session's live tile AND its strip card whenever it
 * appears in either place, corrupting every "is this session live or stripped" count in
 * tiles.spec.ts. Scope on the `.tile` class (only the live-grid template uses it) to
 * disambiguate from a strip/rail card of the same session.
 */
export function liveTile(page: Page, title: string): Locator {
  return page.locator("article.tile").filter({ hasText: title });
}

/**
 * Live tile locator scoped by `data-session-id` rather than title text. Validate-mode
 * repair: once a tile's rename editor is open, its title text
 * lives in the `input.name-edit`'s `value` attribute, which `filter({ hasText })` never
 * sees (`textContent` doesn't include form-control values) — so `liveTile(page, title)`
 * stops matching the very tile whose editor was just opened by title. Use this id-scoped
 * variant whenever a tile must still be found while its own rename field may be open.
 */
export function liveTileById(page: Page, id: number): Locator {
  return page.locator(`article.tile[data-session-id="${id}"]`);
}

/**
 * Strip-card locator (Tiles view). A strip card is the rail card's template
 * (`data-testid="session-card"`) — `renderStrip` reuses it. But the Focus-view rail
 * (`aria-label="Sessions"`) is only ever `hidden`, not removed, when Tiles is active
 * (`features/views.ts`'s `viewFocusEl.hidden = app.state.view !== "focus"`), so
 * a session's rail card and its strip card coexist in the DOM at once — both
 * `data-testid="session-card"` with the same title text. A bare `getByTestId` match is
 * therefore ambiguous (strict-mode violation) the moment a session is both known (rail)
 * and stripped (Tiles): scope to the `#tiles-strip` container so this locator only ever
 * finds the strip's own copy.
 */
export function stripCard(page: Page, titleOrUntitled: string): Locator {
  return page
    .locator("#tiles-strip")
    .getByTestId("session-card")
    .filter({ hasText: titleOrUntitled });
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
 * The drag handle locator: the Testable UI Elements table pins
 * `article.tile .thead[draggable="true"]` as "the only draggable element in a tile"
 * — this is the sole source locator for every drag-based reorder in the suite.
 * Scoped through `liveTile` so a dragged/target title still disambiguates from the same
 * session's strip/rail card the way every other tile locator in this file does.
 */
export function tileDragHandle(page: Page, title: string): Locator {
  return liveTile(page, title).locator(".thead");
}

/**
 * Drag-handle locator scoped by `data-session-id` (`liveTileById`) rather than title
 * text. Validate-mode repair: a Playwright `Locator` is a lazy
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
 * Drags a live tile's header onto another live tile — "Dropping a tile
 * drag on another tile (anywhere on that tile, header or body) applies `moveTile`", so the
 * source must be the `.thead` handle but the drop target is the whole tile.
 * `locator.dragTo` drives real HTML5 DnD in Chromium as long
 * as the source element itself is `draggable="true"`, which is exactly what `.thead` is.
 */
export async function dragTileOnto(
  page: Page,
  draggedTitle: string,
  targetTitle: string,
): Promise<void> {
  await tileDragHandle(page, draggedTitle).dragTo(liveTile(page, targetTitle));
}

/**
 * The state dot inside a tile (gains a `title` attribute with the
 * lowercase state word — `.sdot[title]` per the Testable UI Elements table).
 */
export function tileStateDot(page: Page, title: string): Locator {
  return liveTile(page, title).locator(".sdot");
}
