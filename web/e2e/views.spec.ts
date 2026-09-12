import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { railOrderIds } from "./helpers/railorder";
import { launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";

// Plan m2-terminal — REQ-9 (view switcher/keyboard), REQ-10 (prefs), plus the INV-4
// prefs-echo invariant and the M2 protocol delta (GET /api/state's prefs snapshot).
//
// Plan code-breakup's E2E split (plan.md UI Specifications → E2E split) moved this
// file's Tiles density/promotion/socket-count/drag-reorder tests to tiles.spec.ts (plans
// m2-terminal and move-tiles); what remains below is the Focus/Tiles switcher itself,
// its keyboard shortcuts, and the prefs object's wire contract — none of which depend on
// Tiles' grid density or session count.
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
    // Launch B first, A second — but only A gets a permission prompt, so it must sort
    // to the top (M1's needs-input-first rule) regardless of launch order.
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "prio-b" });
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "prio-a" });

    const claudeA = "claude-prio-a";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeA, { musterSession: sessionA.id }),
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

test("GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  // `usageModel` was added by plan usage-model-bar (kb:anchor/prefs.put / kb:anchor/ws.prefs delta, merged
  // into docs/protocol.md on approval; default "Fable" before any PUT) — included
  // here so this M2 assertion tracks the merged protocol contract rather than going
  // stale the moment usage-model-bar ships, same rationale as density's own addition.
  // `railSort` was added by plan order-sidebar (kb:anchor/prefs.put delta, merged into
  // docs/protocol.md on approval; default "manual" before any PUT) — same rationale.
  // `theme` was added by plan new-ui-design-colors (kb:anchor/prefs.put delta, merged into
  // docs/protocol.md on approval; default "follow" before any PUT) — same rationale.
  // `updateCheck` was added by plan auto-update (kb:anchor/prefs.put / kb:anchor/ws.prefs delta, merged into
  // docs/protocol.md on approval; default true before any PUT) — same rationale.
  const before = (await stateRes.json()) as {
    prefs: {
      view: string;
      density: string;
      usageModel: string;
      railSort: string;
      theme: string;
      updateCheck: boolean;
    };
  };
  expect(before.prefs).toEqual({
    view: "focus",
    density: "2x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
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
    };
  };
  expect(after.prefs).toEqual({
    view: "focus",
    density: "3x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
  });
});
