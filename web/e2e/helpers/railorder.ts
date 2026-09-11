// Rail-order helpers for the order-sidebar E2E suite (plan order-sidebar).
//
// The rail/strip card is the same `data-testid="session-card"` template M1 shipped
// (`web/e2e/helpers/session.ts`'s `sessionCard`), and it coexists in the DOM with its
// strip copy whenever Tiles is active (`helpers/terminal.ts`'s `stripCard`/`liveTile`
// comments explain why an unscoped match is ambiguous) — so every locator here is scoped
// to the rail's own container (`#sessions`), mirroring that established pattern rather
// than inventing a new one.
import type { Locator, Page } from "@playwright/test";

/** Rail card locator, scoped to `#sessions` (the Focus rail) so a session that is both
 * known (rail) and shown elsewhere (strip) never produces a strict-mode ambiguity. */
export function railCard(page: Page, titleOrUntitled: string): Locator {
  return page.locator("#sessions").getByTestId("session-card").filter({ hasText: titleOrUntitled });
}

/**
 * DOM order of the rail's cards, by `data-session-id` — exactly the oracle the plan's
 * Testable UI Elements table names ("order asserted via `data-session-id` sequence").
 * Returned as numbers so callers can diff directly against a `GET /api/state` derived
 * expectation.
 */
export async function railOrderIds(page: Page): Promise<number[]> {
  const raw = await page
    .locator("#sessions [data-testid='session-card']")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-session-id")));
  return raw.map((v) => {
    if (v === null) throw new Error("rail card missing data-session-id");
    return Number(v);
  });
}

/** Same, scoped to the Tiles strip (REQ-13: same order, minus live tiles). */
export async function stripOrderIds(page: Page): Promise<number[]> {
  const raw = await page
    .locator("#tiles-strip [data-testid='session-card']")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-session-id")));
  return raw.map((v) => {
    if (v === null) throw new Error("strip card missing data-session-id");
    return Number(v);
  });
}

/**
 * The pin/unpin control inside a card's `.r1` (Testable UI Elements: role `button`, name
 * `Pin` unpinned / `Unpin` pinned, `aria-pressed` mirroring `pinned`). The accessible
 * name flips with state, so match either — callers assert the specific name/state
 * separately.
 */
export function pinButton(card: Locator): Locator {
  return card.getByRole("button", { name: /^(Pin|Unpin)$/ });
}

/** The rail-head sort toggle (Testable UI Elements: `combobox` named "Sort", options
 * Manual/Attention — a real `<select>` carries the `combobox` role implicitly). */
export function railSortSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Sort" });
}

/**
 * Sets a session's pinned flag directly via the real `PUT /api/sessions/{id}/pin`
 * (kb:anchor/sessions.pin) — used to build a starting configuration (e.g. "two cards already
 * pinned") without re-deriving it through a chain of UI clicks in every test that needs
 * one. Throws on anything but the documented 204.
 */
export async function pinViaApi(page: Page, daemonBaseURL: string, id: number, pinned: boolean): Promise<void> {
  const res = await page.request.put(`${daemonBaseURL}/api/sessions/${id}/pin`, { data: { pinned } });
  if (res.status() !== 204) {
    throw new Error(`pin API call failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Exact class-token membership check via `classList.contains`, rather than a regex
 * against the `class` attribute string — `"pinned-last"` contains `"pinned"` as a
 * literal prefix, so a naive `\bpinned\b` regex matches both (a `-` is a non-word
 * character, so the word-boundary lands right after "pinned" in "pinned-last" too).
 * Distinguishing "has `pinned`" from "has `pinned-last`" needs the real token check.
 */
export async function hasClass(locator: Locator, className: string): Promise<boolean> {
  return await locator.evaluate((el, cls) => el.classList.contains(cls), className);
}

/**
 * REQ-6's manual-mode order, replicated from the plan's pure definition (pinned first —
 * by `railPos` ascending — then unpinned by `railPos` ascending, `id` as the final
 * tiebreak) over a `GET /api/state` snapshot. This is an *independent* oracle from the
 * rendered DOM (the daemon's own persisted truth), per the e2e-specs rule that a
 * displayed order with an independent oracle must be cross-checked against it rather
 * than merely pattern-matched. Never mutates its input.
 */
export function expectedManualOrder(
  sessions: ReadonlyArray<{ id: number; pinned: boolean; railPos: number }>,
): number[] {
  return [...sessions]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.railPos !== b.railPos) return a.railPos - b.railPos;
      return a.id - b.id;
    })
    .map((s) => s.id);
}
