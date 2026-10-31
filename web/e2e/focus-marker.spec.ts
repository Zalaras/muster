// The "shown in the Focus pane" rail marker (#16).
//
// The journeys: the marker across a view switch, a Remove and a persisted drag reorder. The
// marker for a given snapshot — the top card current by default and a click or ⌥⌘2 moving it, a
// click into the terminal leaving it, `.card.current`'s ground and ring —
// moved to the render tier on 2026-10-20: web/render/focus.spec.ts against the
// `unbound-sessions` fixture (plans/_audit/relevel/focus.md).
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts; mirrors
// rail-order.spec.ts's rationale): marker assertions read the exact set/position of
// `aria-current` in `#sessions`/`#tiles-strip` — "exactly one current card", the
// positional Opt+Cmd+2 — so a session launched by a concurrently-running test in a
// shared daemon would corrupt those counts. `fullyParallel: true` is safe only because
// each test's daemon, port, and tmux socket are entirely its own.
import { expect, test } from "./helpers/fixtures";
import { removeFromCardMenu } from "./helpers/rail-menu";
import { railCard } from "./helpers/railorder";
import {
  currentRailCard,
  currentStripCard,
  launchSession,
  scratchDirectory,
} from "./helpers/session";

test("Tiles never shows a current strip card; switching back to Focus restores exactly one (E3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "marker-e3-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "marker-e3-b" });

    await expect(currentRailCard(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Both sessions fit the default 2x2 grid as live tiles, so #tiles-strip is empty —
    // but the assertion is on the STRIP's own current-marker locator regardless
    // ("the Tiles strip passes null, so a strip card is never current"), matching
    // the "never one" clause independent of how many sessions are stripped.
    await expect(currentStripCard(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(currentRailCard(page)).toHaveCount(1);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("removing the focused session falls the marker through to the remaining session (REQ-3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "marker-remove-a",
    });
    await launchSession(page, daemon, { directory: dirB.path, title: "marker-remove-b" });

    const cardA = railCard(page, "marker-remove-a");
    const cardB = railCard(page, "marker-remove-b");
    await expect(cardA).toHaveAttribute("aria-current", "true");

    // End A first — a live session's Remove… opens a dialog explaining it ends the
    // session first (actions.spec.ts precedent); ending directly via the real endpoint
    // reaches the same dead-Remove path without asserting that copy again.
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionA.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(cardA).toHaveClass(/ended/, { timeout: 15_000 });

    // The Focus header holds no Remove button: the
    // focused session is removed from its card's menu.
    await removeFromCardMenu(page, cardA);
    await expect(cardA).toHaveCount(0, { timeout: 15_000 });

    // Only B remains — the fallthrough must land the marker there.
    await expect(cardB).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
    await expect(currentRailCard(page)).toHaveCount(1);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a manual drag reorder follows the current session's id, never a stale DOM slot (REQ-3, INV-3)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirs[0]?.path ?? "", title: "marker-drag-a" });
    await launchSession(page, daemon, { directory: dirs[1]?.path ?? "", title: "marker-drag-b" });
    await launchSession(page, daemon, { directory: dirs[2]?.path ?? "", title: "marker-drag-c" });

    const cardA = railCard(page, "marker-drag-a");
    const cardB = railCard(page, "marker-drag-b");
    const cardC = railCard(page, "marker-drag-c");

    // Focus C explicitly, then drag it to the FRONT of the rail — the slot A used to
    // occupy. If `reconcileCards` ever applied `aria-current` by DOM position rather
    // than by session id, A's card (now sitting where C used to be) would wrongly
    // inherit the marker after the reorder.
    await cardC.click();
    await expect(cardC).toHaveAttribute("aria-current", "true");

    await cardC.dragTo(cardA);
    await expect
      .poll(
        async () =>
          await page.locator("#sessions [data-testid='session-card']").first().textContent(),
      )
      .toContain("marker-drag-c");

    await expect(cardC).toHaveAttribute("aria-current", "true");
    await expect(cardA).not.toHaveAttribute("aria-current", "true");
    await expect(cardB).not.toHaveAttribute("aria-current", "true");
    await expect(currentRailCard(page)).toHaveCount(1);
    const cId = await cardC.getAttribute("data-session-id");
    await expect(currentRailCard(page)).toHaveAttribute("data-session-id", cId ?? "");
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
