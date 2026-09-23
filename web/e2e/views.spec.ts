import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { railOrderIds } from "./helpers/railorder";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";

// The Focus/Tiles switcher itself, its keyboard shortcuts, and the prefs object's wire
// contract (the prefs echo and GET /api/state's prefs snapshot) — none of which depend on
// Tiles' grid density or session count; those tests live in tiles.spec.ts.
//
// Every test here takes the per-test `daemon` fixture (helpers/fixtures.ts): the view
// switcher's own persisted pref and the prefs broadcast are both global per daemon, so a
// test sharing a daemon with a neighbour would leak its own `PUT /api/prefs` into that
// neighbour's expected initial view. Two tests also restart or kill their daemon.

test("the masthead switcher persists the chosen view across a reload (E5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("the chosen view survives a daemon restart (E6)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await daemon.restart();

  // Reload to prove the HTTP snapshot path persisted it too, not merely a live socket
  // that never dropped.
  await page.reload();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
});

test("Cmd+\\ toggles the view and Opt+Cmd+1 focuses the top-priority session regardless of launch order (E7)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    // Launch B first, A second — but only A gets a permission prompt, so under the
    // Attention sort selected below it must sort to the top regardless of launch order.
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "prio-b" });
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "prio-a" });

    const claudeA = "claude-prio-a";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeA, await envelopeOpts(sessionA, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeA) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(claudeA, "p1", "permission_prompt"),
    });
    await expect(stateBadge(sessionCard(page, "prio-a"))).toHaveText(/needs input/i);

    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Meta+Backslash");
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Meta+Backslash");
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Explicitly focus B first, so Opt+Cmd+1 has to move focus rather than merely leave it.
    await sessionCard(page, "prio-b").click();
    await expect(terminalRegion(page, "prio-b")).toBeVisible();

    // order-sidebar's approved protocol delta + decision `cmd-n-ordering` (Option A):
    // Opt+Cmd+1 now indexes into `orderRail`'s CURRENT order, which depends on `railSort`.
    // REQ-5's default is "manual" (creation order here: B launched first, then A), so
    // in manual mode Opt+Cmd+1 would now focus B, not A. Switch to Attention (needs-input
    // sorts first) before the Opt+Cmd+1 assertion below — same repair class as
    // actions.spec.ts #3-#5 (select Attention mode before the priority assertion,
    // assertion preserved verbatim).
    await page.locator("#rail-sort").selectOption("attention");
    await expect(page.locator("#rail-sort")).toHaveValue("attention");
    // REQ-6: the readiness gate for the chord below is the rail's OWN DOM order
    // (`railOrderIds`), not the <select>'s value above. `railSort` only changes locally
    // via the `prefs` broadcast round-trip (INV-6, web/src/main.ts:395,
    // `requestRailSort`'s doc comment) — the <select>'s value flips on `selectOption`
    // immediately, regardless of whether that broadcast has landed yet, so gating on it
    // races `focusNth`'s read of the still-manual order (this plan's diagnosed E7 flake:
    // manual order here is [B, A] since B launched first, so a race lands on B). Attention
    // order (needs-input first) is [A, B] — genuinely different from manual, so this wait
    // cannot pass vacuously on launch order alone.
    await expect.poll(() => railOrderIds(page)).toEqual([sessionA.id, sessionB.id]);

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(terminalRegion(page, "prio-a")).toBeVisible();
    // The old surface must be unmounted, not merely covered — ⌥⌘1 moves focus the same
    // way a rail-card click does (one live surface at a time, INV-2).
    await expect(terminalRegion(page, "prio-b")).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("every accepted PUT /api/prefs re-broadcasts the full object to every other UI socket (INV-4)", async ({
  page,
  browser,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);
    await expect(pageB.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Window B never clicked anything — its switcher must flip purely from the `prefs`
    // WS broadcast (INV-4), not from any action of its own.
    await expect(pageB.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(pageB.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  } finally {
    await contextB.close();
  }
});

test("GET /api/state's prefs snapshot carries the full prefs object before and after a density PUT", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  const before = (await stateRes.json()) as {
    prefs: {
      view: string;
      density: string;
      usageModel: string;
      railSort: string;
      theme: string;
      updateCheck: boolean;
      railDensity: string;
      railActivity: string;
    };
  };
  expect(before.prefs).toEqual({
    view: "focus",
    density: "2x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
    railDensity: "comfortable",
    railActivity: "turn",
  });

  const putRes = await page.request.put(`${daemon.baseURL}/api/prefs`, {
    data: { density: "3x2" },
  });
  expect(putRes.status()).toBe(204);

  const afterRes = await page.request.get(`${daemon.baseURL}/api/state`);
  const after = (await afterRes.json()) as {
    prefs: {
      view: string;
      density: string;
      usageModel: string;
      railSort: string;
      theme: string;
      updateCheck: boolean;
      railDensity: string;
      railActivity: string;
    };
  };
  expect(after.prefs).toEqual({
    view: "focus",
    density: "3x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
    railDensity: "comfortable",
    railActivity: "turn",
  });
});
