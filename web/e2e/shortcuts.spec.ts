import { type APIRequestContext, expect, type ScratchDaemon, test } from "./helpers/fixtures";
import { launchDialog, openLaunchDialog } from "./helpers/picker";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { pinButton, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";
import { launchSession, scratchDirectory, type SessionObject, stateBadge } from "./helpers/session";
import { activeElementInsideTerminal, liveTile, stripCard, terminalRegion, tileStateDot } from "./helpers/terminal";

// Plan shortcut-fixes — REQ-1 through REQ-9 (Must Have), the rebind of the whole session-
// shortcut family onto ⌥⌘ chords Safari and Chrome both leave alone (spikes/S5-key-probe.md
// is the measurement authority for INV-1 — reviewer-verified, NOT re-verified here: per
// Implementation Notes > Measurement, "no agent may 'verify' INV-1 with a Playwright run").
// Plan acceptance: E1-E10, plus extra coverage for ⌥⌘0's edge cases and INV-3/INV-5 named
// under Affected Files > E2E.
//
// Every test presses the NEW chord only. Per the plan's Automated Checks dry-run note,
// "no test has a legitimate reason to press a chord Muster no longer binds" — so this file
// never presses "Meta+n" or a bare "Meta+<digit>" (W13/W14's negative greps are aimed
// exactly at that). Chords are pressed via Playwright's code-based key names
// (`KeyN`/`Digit0`-`Digit9`), matching the plan's "matching moves to event.code" rule —
// the same style `views.spec.ts` already uses for `Meta+Backslash`.
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts; mirrors
// rail-order.spec.ts/views.spec.ts's rationale): rail-order, live-tile-membership and
// `#main-empty`/`#tiles-empty` assertions read full DOM state that a concurrently-running
// test's sessions would corrupt.

/** Drives a session to `needs_input` via the real ingest endpoints (SessionStart ->
 * UserPromptSubmit -> a permission Notification), exactly per protocol §7.3 — copied
 * from rail-order.spec.ts's local helper of the same name/shape (each spec file keeps
 * its own copy of this helper rather than sharing one, matching that file's pattern). */
async function makeNeedsInput(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
): Promise<void> {
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, { musterSession: session.id }),
  });
  await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
  await request.post(daemon.ingestURL("hook"), { data: rawNotification(claudeId, "p1", "permission_prompt") });
}

test("pressing Opt+Cmd+N in Focus opens the launch dialog (E1)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(launchDialog(page)).toBeVisible();
});

test("pressing Opt+Cmd+N in Tiles opens the launch dialog (E2, INV-5)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(launchDialog(page)).toBeVisible();
});

test("pressing Opt+Cmd+N with the dialog already open leaves it open and keeps the Title field (E3, edge case 2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("still-here");

  await page.keyboard.press("Alt+Meta+KeyN");

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("still-here");
});

test("pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card, in manual and attention modes (E4)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirA.path, title: "e4-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "e4-b" });
    await expect(railSortSelect(page)).toHaveValue("manual");

    // Manual mode: rail order is launch order [a, b] — Opt+Cmd+1 must land on a.
    await railCard(page, "e4-b").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e4-b");

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(page.locator("#mainhead .name")).toHaveText("e4-a");

    // Attention mode with b the neediest — the rail's first card is now b, not a
    // (decision cmd-n-ordering Option A: the shortcut follows orderRail's CURRENT
    // order, unchanged by this plan — only the chord moves).
    await makeNeedsInput(request, daemon, b, "claude-e4-b");
    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect.poll(() => railOrderIds(page)).toEqual([b.id, a.id]);

    await railCard(page, "e4-a").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e4-a");

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(page.locator("#mainhead .name")).toHaveText("e4-b");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session into the grid (E5)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `e5-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
    }
    if (!strippedTitle) throw new Error("expected exactly one stripped title");

    // Pin the stripped session so it becomes the rail's displayed first card (orderRail:
    // pinned block first) while it stays stripped from the grid — the case Opt+Cmd+1
    // must actually promote, not merely re-select an already-live tile.
    await pinButton(stripCard(page, strippedTitle)).click();
    await expect(stripCard(page, strippedTitle).getByRole("button", { name: "Unpin" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.keyboard.press("Alt+Meta+Digit1");

    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("pressing Opt+Cmd+0 focuses the longest-blocked needs-input session, ignoring a pinned session ahead of it in manual mode (E6, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 3 }, () => scratchDirectory()));
  try {
    const [dirA, dirB, dirC] = dirs;
    if (!dirA || !dirB || !dirC) throw new Error("expected 3 scratch directories");
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirA.path, title: "e6-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "e6-b" });
    const c = await launchSession(page, daemon, { directory: dirC.path, title: "e6-c" });
    await expect(railSortSelect(page)).toHaveValue("manual");

    // Pin a — a DIFFERENT session than the one that needs input — so the rail's actual
    // first displayed card (what Opt+Cmd+1 would pick) is deliberately not c.
    await pinButton(railCard(page, "e6-a")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, expect.any(Number), c.id]);

    await makeNeedsInput(request, daemon, c, "claude-e6-c");
    await expect(stateBadge(railCard(page, "e6-c"))).toHaveText(/needs input/i);

    await railCard(page, "e6-b").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e6-b");

    await page.keyboard.press("Alt+Meta+Digit0");
    await expect(page.locator("#mainhead .name")).toHaveText("e6-c");

    // Contrast, same setup: Opt+Cmd+1 (the rail's actual first card) reaches the
    // pinned a, not c — the exact case Opt+Cmd+0 exists to bypass (INV-4).
    await railCard(page, "e6-b").click();
    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(page.locator("#mainhead .name")).toHaveText("e6-a");
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("pressing Opt+Cmd+0 in Tiles promotes the neediest session into the grid (INV-5)", async ({ page, request, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `e6b-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedIdx = -1;
    for (const [i, t] of titles.entries()) {
      if ((await liveTile(page, t).count()) === 0) strippedIdx = i;
    }
    if (strippedIdx === -1) throw new Error("expected exactly one stripped title");
    const strippedTitle = titles[strippedIdx];
    const strippedSession = sessions[strippedIdx];
    if (!strippedTitle || !strippedSession) throw new Error("unreachable");

    await makeNeedsInput(request, daemon, strippedSession, "claude-e6b");
    await expect(stateBadge(stripCard(page, strippedTitle))).toHaveText(/needs input/i);

    await page.keyboard.press("Alt+Meta+Digit0");

    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live (edge case 6)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `edge6-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }
    await expect(page.locator("#tiles-strip [data-testid='session-card']")).toHaveCount(0);

    const target = sessions[3];
    const targetTitle = titles[3];
    if (!target || !targetTitle) throw new Error("unreachable");
    await makeNeedsInput(request, daemon, target, "claude-edge6");
    // Validate-mode repair: a live tile never renders the state word as visible text
    // (that's rail/strip-card-only, via sessions/card.ts's BADGE_TEXT) — a live tile
    // carries state only via the `.sdot` dot's `title` attribute (render/tiles.ts:67),
    // exactly as views.spec.ts's "a tile's state dot title tracks the state word" test
    // already asserts. `stateBadge(liveTile(...))` could never match here.
    await expect(tileStateDot(page, targetTitle)).toHaveAttribute("title", /needs input/i);

    await page.keyboard.press("Alt+Meta+Digit0");

    // Every tile that was live stays live — nothing was demoted to make room for a
    // session that already had a slot (edge case 6; `promote` already returns the live
    // array unchanged when the target `live.includes(id)` — this only proves the new
    // dispatch path doesn't regress it).
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }
    await expect(page.locator("#tiles-strip [data-testid='session-card']")).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("pressing Opt+Cmd+0 with sessions present but none alive stays on the explicitly focused session, never falling through to the most-recently-ended one (edge case 4)", async ({
  page,
  daemon,
}) => {
  const [dirOld, dirNew] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const older = await launchSession(page, daemon, { directory: dirOld.path, title: "edge4-old" });
    const newer = await launchSession(page, daemon, { directory: dirNew.path, title: "edge4-new" });

    for (const s of [older, newer]) {
      const res = await page.request.post(`${daemon.baseURL}/api/sessions/${s.id}/end`);
      expect(res.status()).toBe(200);
    }
    await expect(railCard(page, "edge4-new")).toHaveClass(/ended/, { timeout: 15_000 });
    await expect(railCard(page, "edge4-old")).toHaveClass(/ended/, { timeout: 15_000 });

    // Explicitly focus the OLDER (not-most-recently-ended) session, so a wrong
    // fallback to "most recently ended" — exactly what `sortSessions` would hand back
    // for an all-dead store — is distinguishable from a true no-op.
    await railCard(page, "edge4-old").click();
    await expect(page.locator("#mainhead .name")).toHaveText("edge4-old");

    await page.keyboard.press("Alt+Meta+Digit0");

    await expect(page.locator("#mainhead .name")).toHaveText("edge4-old");
  } finally {
    await Promise.all([dirOld.cleanup(), dirNew.cleanup()]);
  }
});

test("pressing Opt+Cmd+0 with no sessions is a silent no-op (E7, edge case 3)", async ({ page, daemon }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(daemon.dashboardUrl);
  await expect(page.locator("#main-empty")).toBeVisible();

  await page.keyboard.press("Alt+Meta+Digit0");

  await expect(page.locator("#main-empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("pressing Opt+Cmd+N with focus inside a session's terminal opens the dialog without leaking the keystroke to the terminal (E8, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);

    // Registered before the launch so the terminal socket's own 'websocket' event —
    // fired the moment Focus's live pane mounts — isn't missed (mirrors
    // helpers/terminal.ts's TerminalSocketTracker doc comment on listener ordering).
    const sentFrames: string[] = [];
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/ws/terminal/")) return;
      ws.on("framesent", (frame) => sentFrames.push(String(frame.payload)));
    });

    await launchSession(page, daemon, { directory: dir, title: "e8-term" });
    const region = terminalRegion(page, "e8-term");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await region.click();
    expect(await activeElementInsideTerminal(page, "e8-term")).toBe(true);

    // Only frames sent as a direct result of the shortcut itself count — clear
    // whatever the connection handshake/focus click already produced.
    sentFrames.length = 0;

    await page.keyboard.press("Alt+Meta+KeyN");

    await expect(launchDialog(page)).toBeVisible();
    expect(sentFrames).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("pressing Opt+Cmd+1 with focus inside the launch dialog's Title field does not insert a digit into it (INV-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);
  const title = dialog.getByLabel("Title");
  await title.fill("no-leak");
  await title.focus();

  await page.keyboard.press("Alt+Meta+Digit1");

  await expect(title).toHaveValue("no-leak");
});

test("the Focus and Tiles empty placeholders name the new Opt+Cmd+N chord (E9)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.locator("#main-empty")).toHaveText("No sessions yet — ⌥⌘N to launch");

  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.locator("#tiles-empty")).toHaveText("No sessions yet — New session or ⌥⌘N to launch");
});

test("the launch dialog heading names ⌥⌘N via its kbd chip, excluded from the accessible name (E10)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  // Testable UI Elements: the `.kbd` chip is `aria-hidden`, so the heading's accessible
  // name stays "New session" rather than "New session ⌥⌘N".
  await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();
  await expect(dialog.locator("#launch-dialog-title .kbd")).toHaveText("⌥⌘N");
});
