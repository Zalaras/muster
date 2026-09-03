// Plan ui-text-and-focus — REQ-1 through REQ-3, INV-3 (the "shown in the Focus pane"
// rail marker, #16). Plan acceptance: E1-E3.
//
// Every test gets its own private scratch daemon (mirrors rail-order.spec.ts's
// rationale): marker assertions read the exact set/position of `aria-current` in
// `#sessions`/`#tiles-strip`, so a session launched by a concurrently-running test in a
// shared daemon would corrupt "exactly one current card" counts. `fullyParallel: true`
// is safe only because each test's daemon, port, and tmux socket are entirely its own.
//
// `reconcileCards`/`renderSessions` do not yet accept a `currentId` parameter as of this
// authoring pass (main.ts never threads `focusedId` through) — every test here is
// EXPECTED TO FAIL until web-impl lands REQ-1. Collection-only gate for this file.
import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { railCard } from "./helpers/railorder";
import { currentRailCard, currentStripCard, launchSession, scratchDirectory } from "./helpers/session";
import { resolvedCssVar } from "./helpers/theme";

async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon();
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

test("the top rail card is current by default, and clicking another card moves the marker (E1)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dirA.path, title: "marker-e1-a" });
      await launchSession(page, daemon, { directory: dirB.path, title: "marker-e1-b" });

      const cardA = railCard(page, "marker-e1-a");
      const cardB = railCard(page, "marker-e1-b");

      // Default focus: the first-launched session's card is current, and it is the
      // ONLY current card (INV-3).
      await expect(cardA).toHaveAttribute("aria-current", "true");
      await expect(cardB).not.toHaveAttribute("aria-current", "true");
      await expect(currentRailCard(page)).toHaveCount(1);

      await cardB.click();

      await expect(cardB).toHaveAttribute("aria-current", "true");
      await expect(cardA).not.toHaveAttribute("aria-current", "true");
      await expect(currentRailCard(page)).toHaveCount(1);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("clicking into the live terminal leaves the marker on the clicked-into session (E2)", async ({ page }) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dirA.path, title: "marker-e2-a" });
      await launchSession(page, daemon, { directory: dirB.path, title: "marker-e2-b" });

      const cardB = railCard(page, "marker-e2-b");
      await cardB.click();
      await expect(cardB).toHaveAttribute("aria-current", "true");

      const terminalRegion = page.locator('[aria-label="Terminal: marker-e2-b"]');
      await expect(terminalRegion).toBeVisible();
      await terminalRegion.click();

      // The marker is a rail-only cue, orthogonal to keyboard focus (design decision,
      // Overview) — clicking into the terminal must not move it back or clear it.
      await expect(cardB).toHaveAttribute("aria-current", "true");
      await expect(currentRailCard(page)).toHaveCount(1);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("Tiles never shows a current strip card; switching back to Focus restores exactly one (E3)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dirA.path, title: "marker-e3-a" });
      await launchSession(page, daemon, { directory: dirB.path, title: "marker-e3-b" });

      await expect(currentRailCard(page)).toHaveCount(1);

      await page.getByRole("button", { name: "Tiles" }).click();
      await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

      // Both sessions fit the default 2x2 grid as live tiles, so #tiles-strip is empty —
      // but the assertion is on the STRIP's own current-marker locator regardless (REQ-1:
      // "the Tiles strip passes null, so a strip card is never current"), matching
      // INV-3's "never one" clause independent of how many sessions are stripped.
      await expect(currentStripCard(page)).toHaveCount(0);

      await page.getByRole("button", { name: "Focus" }).click();
      await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");
      await expect(currentRailCard(page)).toHaveCount(1);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("Cmd+2 moves the marker to the rail's second card (REQ-3)", async ({ page }) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dirA.path, title: "marker-cmdn-a" });
      await launchSession(page, daemon, { directory: dirB.path, title: "marker-cmdn-b" });

      const cardA = railCard(page, "marker-cmdn-a");
      const cardB = railCard(page, "marker-cmdn-b");
      await expect(cardA).toHaveAttribute("aria-current", "true");

      await page.keyboard.press("Meta+2");

      await expect(cardB).toHaveAttribute("aria-current", "true");
      await expect(cardA).not.toHaveAttribute("aria-current", "true");
      await expect(currentRailCard(page)).toHaveCount(1);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("removing the focused session falls the marker through to the remaining session (REQ-3)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "marker-remove-a" });
      await launchSession(page, daemon, { directory: dirB.path, title: "marker-remove-b" });

      const cardA = railCard(page, "marker-remove-a");
      const cardB = railCard(page, "marker-remove-b");
      await expect(cardA).toHaveAttribute("aria-current", "true");

      // End A first — a live session's mainhead Remove opens a dialog explaining it
      // ends the session first (actions.spec.ts precedent); ending directly via the real
      // endpoint reaches the same dead-Remove path without asserting that copy again.
      const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionA.id}/end`);
      expect(endRes.status()).toBe(200);

      // exact: true — a plain substring match on "Remove" is ambiguous the moment a
      // session's own display title contains "remove" (this test's own
      // "marker-remove-a"/"marker-remove-b" fixture titles), because it also matches
      // the mainhead's rename trigger (whose accessible name is the display title).
      // Validate-mode repair: the mainhead's own Remove button is the only exact match.
      const mainhead = page.locator("#mainhead");
      const removeBtn = mainhead.getByRole("button", { name: "Remove", exact: true });
      await expect(removeBtn).toBeEnabled({ timeout: 15_000 });
      await removeBtn.click();
      const dialog = page.getByRole("dialog", { name: "Remove session?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(cardA).toHaveCount(0, { timeout: 15_000 });

      // Only B remains — the fallthrough must land the marker there (REQ-3).
      await expect(cardB).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
      await expect(currentRailCard(page)).toHaveCount(1);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("a manual drag reorder follows the current session's id, never a stale DOM slot (REQ-3, INV-3)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
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
        .poll(async () => await page.locator("#sessions [data-testid='session-card']").first().textContent())
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
});

test(".card.current renders on --bg-hover with an --edge ring and its acts-row visible without hovering (REQ-2)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dir, title: "marker-style" });

      const card = railCard(page, "marker-style");
      await expect(card).toHaveAttribute("aria-current", "true");

      // Move the mouse well away from the card so `:hover` cannot also explain the
      // ground/ring/reveal — the marker's own styling must hold on its own merits.
      await page.mouse.move(0, 0);

      const bgHover = await resolvedCssVar(page, "--bg-hover", "background-color");
      const edge = await resolvedCssVar(page, "--edge", "color");
      await expect(card).toHaveCSS("background-color", bgHover);
      const outline = await card.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.outlineColor, style: cs.outlineStyle, width: cs.outlineWidth };
      });
      expect(outline.style).toBe("solid");
      expect(outline.width).toBe("1px");
      // Resolve the ring's rgb() the same way `resolvedCssVar` does, so the string
      // comparison holds regardless of the browser's own hex<->rgb normalization.
      expect(outline.color).toBe(edge);

      const actsRow = card.locator(".acts-row");
      const opacity = await actsRow.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(opacity)).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
