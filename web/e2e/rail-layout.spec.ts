import { expect, test } from "./helpers/fixtures";
import { cardContextRow, cardContextTrack } from "./helpers/gauges";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  rawStop,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import {
  bodyRailDensity,
  cardActivityClaude,
  cardActivityYou,
  cardName,
  cardRepoLine,
  cardStateRow,
  cardTitleRow,
  newSessionButton,
  railDensityButton,
  railDensityGroup,
} from "./helpers/railcards";
import { railSortSelect } from "./helpers/railorder";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  type SessionObject,
  sessionCard,
} from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// Plan rail-card-improvements — REQ-1 through REQ-6, REQ-15 (card layout, rail-head
// density and the single masthead New session button). Plan acceptance: E2, E7, E11,
// E12. Fixture plan header: this file asserts prefs (daemon-global) and the masthead
// button in both views, so every test takes the per-test `daemon` fixture
// (helpers/fixtures.ts) — `railDensity` is daemon-global and one test opens a second
// window.

test("the masthead's New session button opens the dialog from Focus and Tiles, Opt+Cmd+N still opens it, and no other launcher exists (E2, INV-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  // REQ-6/INV-3: exactly one New session button in the whole DOM, and the old Tiles
  // toolbar button is gone entirely.
  await expect(page.locator("#new-session-button")).toHaveCount(1);
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);

  const btn = newSessionButton(page);
  await expect(btn).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "New session" });

  await btn.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Tiles", exact: true }).click();
  await expect(newSessionButton(page)).toBeVisible();
  await newSessionButton(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(dialog).toBeVisible();
});

test("an empty rail still shows the sort select and the density control with an empty count (edge case 22)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect(railSortSelect(page)).toBeVisible();
  await expect(railDensityGroup(page)).toBeVisible();
  await expect(page.locator("#rail-count")).toHaveText("");
  await expect(page.locator("#main-empty")).toContainText("No sessions yet");
});

test("clicking Compact echoes to body[data-rail-density], persists across a reload, mirrors to a second window, applies to the Tiles strip, and is unaffected while the daemon is down (E7)", async ({
  page,
  browser,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => bodyRailDensity(page)).toBe("comfortable");
  await expect(railDensityButton(page, "comfortable")).toHaveAttribute("aria-pressed", "true");

  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    await expect(railDensityButton(page, "compact")).toHaveAttribute("aria-pressed", "true");
    await expect(railDensityButton(page, "comfortable")).toHaveAttribute("aria-pressed", "false");

    // Window B never clicked anything — it must follow purely from the `prefs`
    // broadcast (INV-4 pattern, theme.spec.ts precedent).
    await expect.poll(() => bodyRailDensity(pageB)).toBe("compact");

    await page.reload();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // REQ-1: the Tiles strip renders the same template and follows the same density
    // rules.
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-rail-density", "compact");
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(page.getByRole("button", { name: "Focus", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // REQ-15/no-optimistic-state: a failed PUT changes nothing on screen.
    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    await expect(railDensityButton(page, "compact")).toHaveAttribute("aria-pressed", "true");
    await expect(railDensityButton(page, "expanded")).toHaveAttribute("aria-pressed", "false");
  } finally {
    await contextB.close();
  }
});

test("a long title wraps to multiple lines in comfortable density and clamps to one line in compact, with title attributes on .name and .r2 throughout (E11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const longTitle =
      "a very long session title that should need more than one line to display in full at the rail's fixed column width";
    await launchSession(page, daemon, { directory: dir, title: longTitle });

    const card = sessionCard(page, longTitle);
    const name = cardName(card);
    await expect(name).toHaveAttribute("title", longTitle);

    const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(compactHeight).toBeLessThanOrEqual(lineHeight * 1.5);
    await expect(name).toHaveAttribute("title", longTitle);

    // REQ-2: `.r2` (the repo/branch line) always carries `title` equal to its own text,
    // in every density.
    const repoLine = cardRepoLine(card);
    const repoText = await repoLine.innerText();
    await expect(repoLine).toHaveAttribute("title", repoText);
  } finally {
    await cleanup();
  }
});

test("in compact density a long title is truly ellipsized within the card, not overflowing it (review cycle 1 Major 1, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const longTitle =
      "a compact-density title long enough that it must be ellipsized rather than clipped mid-word or left overflowing the card";
    await launchSession(page, daemon, { directory: dir, title: longTitle });

    const card = sessionCard(page, longTitle);
    const name = cardName(card);

    // Comfortable is the reference render (REQ-4): nothing truncates, so the same title
    // wraps to more than one line.
    const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // Review cycle 1 Major 1: `.name` is a bare `<span>` inside the block `.r1`, so
    // without a block-level `display` it computes `inline`, on which a declared
    // `overflow`/`text-overflow` never applies — the pre-fix render let the title overflow
    // the card instead of ellipsizing. `display: inline` also reports zero for
    // scrollWidth/clientWidth, so the overflow check below only holds once `display` is
    // block-level.
    const metrics = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        display: cs.display,
        textOverflow: cs.textOverflow,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(metrics.display).not.toBe("inline");
    expect(metrics.textOverflow).toBe("ellipsis");
    // The title text still logically overflows its own box — exactly what `text-overflow`
    // clips to an ellipsis — even though nothing is visible past the edge.
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    const nameBox = await name.evaluate((el) => el.getBoundingClientRect());
    const cardBox = await card.evaluate((el) => el.getBoundingClientRect());
    // Pre-fix, the inline box let its content overflow both `.r1` and the card silently
    // (measured ~281px past the card's right edge in review); the fix keeps the title's
    // own box inside the card's.
    expect(nameBox.right).toBeLessThanOrEqual(cardBox.right + 1);

    const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(compactHeight).toBeLessThanOrEqual(lineHeight * 1.5);
    await expect(name).toHaveAttribute("title", longTitle);
  } finally {
    await cleanup();
  }
});

test("a card's End button keeps focus and node identity when a density button is clicked (E12, REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "density-focus-e12" });

    const card = sessionCard(page, "density-focus-e12");
    await expect(card).toBeVisible();
    const endBtn = card.getByRole("button", { name: "End" });
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    await endBtn.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-end-btn";
    });

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");

    await expect(endBtn).toBeFocused();
    const stillTagged = await endBtn.evaluate(
      (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-end-btn",
    );
    expect(stillTagged).toBe(true);
  } finally {
    await cleanup();
  }
});

// Plan rail-card-improvements-2 — REQ-1 through REQ-4 (#49/#50's second pass: the
// density ramp swap, the restored compact gauge track and the title-leads row order).
// Plan acceptance: E1 through E6. Same fixture plan header as above: `prefs.railDensity`
// is daemon-global, so every test below also takes the per-test `daemon` fixture.

test("a long activity line clamps to three lines in comfortable density and runs past three lines in expanded (E1, REQ-1)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "density-clamp-e1",
    });
    const claudeId = "claude-density-clamp-e1";
    // Kept under 200 characters deliberately — `internal/claudecode` truncates the reply
    // text at 200 chars the same way it truncates `lastPrompt` (pre-existing, unrelated
    // to this plan), and this test needs an exact-text match to compute line counts.
    const longReply =
      "the retry logic now backs off exponentially and logs each attempt with its delay, " +
      "the flaky assertion in the queue drain test was rewritten to poll instead of sleep, " +
      "and the suite passed twice";

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { lastAssistantMessage: longReply }),
    });

    const card = sessionCard(page, "density-clamp-e1");
    const line = cardActivityClaude(card);
    await expect(line).toHaveText(`claude: ${longReply}`);
    // REQ-2/edge case 1: the clamp makes the tail of the line unreachable without a
    // hover title carrying the full text — plan Edge Cases maps REQ-2's own e2e coverage
    // to this criterion.
    await expect(line).toHaveAttribute("title", `claude: ${longReply}`);

    const lineHeight = await line.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    // Comfortable is the density on load (default `railDensity`).
    const comfortableHeight = await line.evaluate((el) => el.getBoundingClientRect().height);
    // REQ-1: clamped to three lines — never noticeably more than three line-heights.
    expect(comfortableHeight).toBeLessThanOrEqual(lineHeight * 3.5);
    expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");
    await expect(line).toHaveAttribute("title", `claude: ${longReply}`);
    const expandedHeight = await line.evaluate((el) => el.getBoundingClientRect().height);
    // REQ-1: expanded is uncapped — this reply needs well more than three lines.
    expect(expandedHeight).toBeGreaterThan(lineHeight * 3.5);
  } finally {
    await cleanup();
  }
});

test("card height is never greater in comfortable than in expanded, for a short and a long activity line (E2, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  const dirShort = await scratchDirectory();
  const dirLong = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const shortMsg = "done";
    const longMsg =
      "a very long assistant reply that needs to run past three lines even in the widest " +
      "rail column this suite ever measures, repeated with enough words to guarantee it " +
      "overflows regardless of viewport width or font metrics on the run machine";

    const sessionShort = await launchSession(page, daemon, {
      directory: dirShort.path,
      title: "density-ramp-short",
    });
    const sessionLong = await launchSession(page, daemon, {
      directory: dirLong.path,
      title: "density-ramp-long",
    });

    async function closeTurn(
      claudeId: string,
      session: SessionObject,
      message: string,
    ): Promise<void> {
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
      });
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
      await request.post(daemon.ingestURL("hook"), {
        data: rawStop(claudeId, { lastAssistantMessage: message }),
      });
    }

    await closeTurn("claude-density-ramp-short", sessionShort, shortMsg);
    await closeTurn("claude-density-ramp-long", sessionLong, longMsg);

    const cardShort = sessionCard(page, "density-ramp-short");
    const cardLong = sessionCard(page, "density-ramp-long");
    await expect(cardActivityClaude(cardShort)).toHaveText(`claude: ${shortMsg}`);
    await expect(cardActivityClaude(cardLong)).toContainText("claude:");

    async function heights(): Promise<{ short: number; long: number }> {
      return {
        short: await cardShort.evaluate((el) => el.getBoundingClientRect().height),
        long: await cardLong.evaluate((el) => el.getBoundingClientRect().height),
      };
    }

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    const compact = await heights();

    await railDensityButton(page, "comfortable").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("comfortable");
    const comfortable = await heights();

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");
    const expanded = await heights();

    // INV-1: for each card, height compact ≤ comfortable ≤ expanded. The short case is
    // where a naive clamp swap still passes; the long case is the reported inversion
    // (Overview: comfortable measured 248.5px against expanded's 169.8px pre-fix).
    expect(compact.short).toBeLessThanOrEqual(comfortable.short);
    expect(comfortable.short).toBeLessThanOrEqual(expanded.short);
    expect(compact.long).toBeLessThanOrEqual(comfortable.long);
    expect(comfortable.long).toBeLessThanOrEqual(expanded.long);
  } finally {
    await dirShort.cleanup();
    await dirLong.cleanup();
  }
});

test("a compact card renders a visible context gauge track when context is known (E3)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "density-e3-known",
    });
    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-density-e3-known", {
        ...(await envelopeOpts(session, daemon)),
        contextUsedPct: 42,
      }),
    });

    const card = sessionCard(page, "density-e3-known");
    await expect(cardContextRow(card)).not.toHaveClass(/unk/);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // REQ-3: the rule hiding `.r3 .ctx` in compact is removed — the track keeps a
    // non-zero rendered width there, same as in every other density.
    const track = cardContextTrack(card);
    await expect(track).toBeVisible();
    const box = await track.evaluate((el) => el.getBoundingClientRect());
    expect(box.width).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("a compact card with unknown context renders the word and no gauge track (E6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    // No status-line post at all — context stays unknown (kb:fact/unknown-before-first-response).
    await launchSession(page, daemon, { directory: dir, title: "density-e6-unknown" });
    const card = sessionCard(page, "density-e6-unknown");

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // render/context.ts's unknown branch sets `.r3.unk` with plain text and builds no
    // `.ctx` element at all — REQ-3 removing compact's hiding rule can never produce an
    // empty track here (edge case 3).
    await expect(card.locator(".r3.unk")).toContainText("unknown");
    await expect(cardContextTrack(card)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a card with no activity text renders no activity line in compact or expanded, and compact drops a populated one too (E4)", async ({
  page,
  request,
  daemon,
}) => {
  const dirPopulated = await scratchDirectory();
  const dirEmpty = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dirPopulated.path,
      title: "density-e4-populated",
    });
    const claudeId = "claude-density-e4";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { lastAssistantMessage: "done" }),
    });

    const populatedCard = sessionCard(page, "density-e4-populated");
    await expect(cardActivityClaude(populatedCard)).toHaveText("claude: done");

    await launchSession(page, daemon, { directory: dirEmpty.path, title: "density-e4-empty" });
    const emptyCard = sessionCard(page, "density-e4-empty");

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    // Compact drops the line entirely (REQ-1's unchanged clause), even though it carries
    // text.
    await expect(cardActivityClaude(populatedCard)).toBeHidden();
    await expect(cardActivityClaude(emptyCard)).toBeHidden();
    await expect(cardActivityYou(emptyCard)).toBeHidden();

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");
    // A line with no text stays absent regardless of density's own `display` override
    // (kb:lesson/display-rule-overrides-hidden-attribute's companion-rule requirement).
    await expect(cardActivityClaude(emptyCard)).toBeHidden();
    await expect(cardActivityYou(emptyCard)).toBeHidden();
  } finally {
    await dirPopulated.cleanup();
    await dirEmpty.cleanup();
  }
});

test("the title renders above the state row on a rail card and on a Tiles strip card (E5, INV-4)", async ({
  page,
  daemon,
}) => {
  // The rail always shows every session regardless of density, but the Tiles strip only
  // holds sessions demoted out of the live grid (tiles.spec.ts's own "switching density"
  // pattern) — a single launched session stays a live tile (which does not share
  // `#session-card-template` with the rail/strip card) and never reaches the strip.
  // Five sessions at the default 2×2 grid leaves exactly one stripped.
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `row-order-e5-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    const railCard = sessionCard(page, titles[0] ?? "");
    await expect(railCard).toBeVisible();
    const railTitleTop = await cardTitleRow(railCard).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const railStateTop = await cardStateRow(railCard).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(railTitleTop).toBeLessThan(railStateTop);

    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    // Wait for the grid to actually render live tiles before reading which title landed
    // in the strip (tiles.spec.ts's own "switching density" pattern) — without this, the
    // loop below can run before the view switch has painted anything, finding every
    // title's live-tile count at zero and picking the wrong one.
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) {
        strippedTitle = t;
        break;
      }
    }
    if (!strippedTitle) {
      throw new Error("expected exactly one of the five sessions demoted to the strip");
    }
    const strip = stripCard(page, strippedTitle);
    await expect(strip).toBeVisible();
    // INV-4: the rail card and the Tiles strip card share one template — a fix applied
    // to only one host is a fix applied to neither.
    const stripTitleTop = await cardTitleRow(strip).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const stripStateTop = await cardStateRow(strip).evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    expect(stripTitleTop).toBeLessThan(stripStateTop);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
