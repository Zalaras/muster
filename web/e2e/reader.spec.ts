import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, type Locator, type Page, settleFor, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawPostToolUse,
  rawPreToolUse,
  rawSessionEnd,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import {
  barFileName,
  barPath,
  barPlanBadge,
  buildConfinementFixtures,
  buildLargeMarkdownFixtureTree,
  buildMarkdownFixtureTree,
  changedDot,
  docBar,
  fileCount,
  fileEntry,
  filesHeaderToggle,
  filterBox,
  folderEntry,
  freshnessCue,
  getReaderFile,
  navArrowCollapsedNode,
  navArrowHide,
  navArrowOpenNode,
  navArrowShow,
  navOutlineSection,
  navTreeSection,
  noPlanText,
  outlineEntry,
  outlineHeaderToggle,
  planSlotEntry,
  popOutLink,
  readerNav,
  readerRegion,
  readerRegionInTile,
  readerStatusLine,
  renderedBody,
  ReaderRequestTracker,
  writeFakeTranscript,
} from "./helpers/reader";
import { launchSession, scratchDirectory } from "./helpers/session";
import {
  mainheadSurfaceButton,
  shellPip,
  shellSurfaceRegion,
  shellTmuxTarget,
  tileSurfaceButton,
} from "./helpers/shell";
import { liveTileById, TerminalSocketTracker, terminalRegion } from "./helpers/terminal";

// Plan markdown-viewing — REQ-1 through REQ-28, INV-1 through INV-8, acceptance E1-E29.
// Fixture plan (plan.md header): every test takes the test-scoped `daemon` fixture — a
// fresh scratch daemon per test — because auto-focus needs "the only session" in Focus,
// and `docChanged`, the plan slot and (E28) one daemon restart are all asserted per
// session, exactly the daemon-global-state cases docs/conventions.md's fixture rule
// mandates the `daemon` fixture for.
//
// The daemon and tmux are real throughout (same as terminal.spec.ts); only Claude Code
// itself is faked, via envelopedSessionStart/rawPostToolUse — no real `claude` process
// ever runs here (CLAUDE.md hard rule). The reader feature does not exist yet: every test
// below is new-behaviour (no REQ/INV here pins pre-existing behaviour), so this file's
// authoring-mode gate is collection only (`npx playwright test --list`), never a live run.

test("Focus mainhead gains a docs segment; selecting it shows the reader and hides the Claude terminal, and selecting claude restores it (E1, REQ-1, REQ-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e1" });
    await expect(terminalRegion(page, "reader-e1")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const docsBtn = mainheadSurfaceButton(page, "docs");
    await expect(docsBtn).toBeVisible();

    await docsBtn.click();
    await expect(readerRegion(page, "reader-e1")).toBeVisible({ timeout: 15_000 });
    await expect(terminalRegion(page, "reader-e1")).toHaveCount(0);
    await expect(docsBtn).toHaveAttribute("aria-pressed", "true");

    await mainheadSurfaceButton(page, "claude").click();
    await expect(terminalRegion(page, "reader-e1")).toBeVisible({ timeout: 15_000 });
    await expect(readerRegion(page, "reader-e1")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("in Tiles, selecting docs in one tile shows the reader there only and leaves the other tile's terminal socket and geometry untouched (E2, INV-6)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    // Before anything can open a terminal socket (helpers/terminal.ts: the `websocket`
    // event only fires for connections made after the listener is attached) — both
    // sessions' initial Focus-view render opens a socket during launchSession below.
    const tracker = new TerminalSocketTracker(page);
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "reader-e2-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "reader-e2-b",
    });

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await expect(liveTileById(page, sessionA.id)).toBeVisible();
    await expect(liveTileById(page, sessionB.id)).toBeVisible();

    await expect.poll(() => tracker.liveCount).toBe(2);

    const widthBefore = await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{window_width}");
    const heightBefore = await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{window_height}");

    await tileSurfaceButton(page, sessionA.id, "docs").click();
    await expect(readerRegionInTile(page, sessionA.id)).toBeVisible({ timeout: 15_000 });

    // A's terminal socket closed; B's is untouched — never 0, never re-opened.
    await expect.poll(() => tracker.liveCount).toBe(1);
    await expect(liveTileById(page, sessionB.id).locator(".geo")).toContainText(/\d+\s*×\s*\d+/);
    expect(await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{window_width}")).toBe(widthBefore);
    expect(await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{window_height}")).toBe(heightBefore);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a session whose transcript names an existing plan file opens it automatically with the plan badge and full path (E3, REQ-7, REQ-9, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e3" });

    const planPath = join(daemon.dataDir, "plans", "reader-e3-slug.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# The Plan\n\nDo the thing.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-e3.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });

    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e3", {
        musterSession: session.id,
        transcriptPath,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e3");
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(barPlanBadge(region)).toBeVisible({ timeout: 15_000 });
    await expect(barFileName(region)).toHaveText("reader-e3-slug.md");
    await expect(barPath(region)).toHaveText(planPath);
    await expect(planSlotEntry(region)).toHaveAttribute("aria-current", "true");
  } finally {
    await cleanup();
  }
});

test("a session whose transcript names no plan shows no plan yet and lists the directory's files (E4, REQ-9)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e4" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e4");
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(noPlanText(region)).toHaveText("no plan yet");
    await expect(fileEntry(region, "TODO.md")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("after a /clear pair naming a planless transcript, the slot returns to no plan yet (E5, edge case 3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e5" });

    const oldPlan = join(daemon.dataDir, "plans", "reader-e5-old.md");
    await mkdir(dirname(oldPlan), { recursive: true });
    await writeFile(oldPlan, "# old plan\n");
    const oldTranscript = join(daemon.dataDir, "transcripts", "reader-e5-old.jsonl");
    await writeFakeTranscript(oldTranscript, { planFilePath: oldPlan });
    const oldClaudeId = "claude-reader-e5-old";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(oldClaudeId, {
        musterSession: session.id,
        transcriptPath: oldTranscript,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e5");
    await expect(barPlanBadge(region)).toBeVisible({ timeout: 15_000 });

    const newTranscript = join(daemon.dataDir, "transcripts", "reader-e5-new.jsonl");
    await writeFakeTranscript(newTranscript, {});
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawSessionEnd(oldClaudeId, "clear"),
    });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e5-new", {
        musterSession: session.id,
        source: "clear",
        transcriptPath: newTranscript,
      }),
    });

    await expect(noPlanText(region)).toHaveText("no plan yet", { timeout: 15_000 });
    await expect(barPlanBadge(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("the tree lists exactly the fixture's markdown files, folders collapsed with counts, and expanding reveals children (E6, REQ-10)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e6" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e6");
    await expect(region).toBeVisible({ timeout: 15_000 });

    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });
    await expect(folderEntry(region, "docs")).toBeVisible();
    await expect(fileEntry(region, "notes.txt")).toHaveCount(0);
    await expect(fileEntry(region, "secret.md")).toHaveCount(0);

    await folderEntry(region, "docs").click();
    await expect(folderEntry(region, "adr")).toBeVisible();
    await folderEntry(region, "adr").click();
    await expect(fileEntry(region, "x.md")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("typing in the filter narrows the tree to matching files with ancestors expanded, and clearing restores the collapsed tree (E7, REQ-11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e7" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e7");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });
    await expect(fileEntry(region, "x.md")).toHaveCount(0);

    await filterBox(region).fill("x.md");
    await expect(fileEntry(region, "x.md")).toBeVisible({ timeout: 15_000 });
    await expect(fileEntry(region, "TODO.md")).toHaveCount(0);

    await filterBox(region).fill("");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });
    await expect(fileEntry(region, "x.md")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("the open file carries aria-current, moving to whichever file is opened (E8, REQ-12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e8" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e8");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });

    await fileEntry(region, "TODO.md").click();
    await expect(fileEntry(region, "TODO.md")).toHaveAttribute("aria-current", "true");

    await folderEntry(region, "docs").click();
    await folderEntry(region, "adr").click();
    await fileEntry(region, "x.md").click();
    await expect(fileEntry(region, "x.md")).toHaveAttribute("aria-current", "true");
    await expect(fileEntry(region, "TODO.md")).not.toHaveAttribute("aria-current", "true");
  } finally {
    await cleanup();
  }
});

test("a routed Write hook for an unopened file lights its changed dot, cleared by opening it (E9, REQ-13)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e9" });
    const claudeId = "claude-reader-e9";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e9");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });

    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: join(dir, "TODO.md") }),
    });

    await expect(changedDot(fileEntry(region, "TODO.md"))).toHaveCount(1, { timeout: 15_000 });
    await fileEntry(region, "TODO.md").click();
    await expect(changedDot(fileEntry(region, "TODO.md"))).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("rewriting the open file on disk and posting a Write hook for it re-renders the new content with a changed cue (E10, REQ-18)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e10" });
    const claudeId = "claude-reader-e10";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e10");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    await writeFile(fx.todoPath, "# TODO\n\nUpdated content marker.\n");
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: fx.todoPath }),
    });

    await expect(renderedBody(region)).toContainText("Updated content marker", { timeout: 15_000 });
    await expect(freshnessCue(region)).toHaveText(/^changed (now|.+ ago)$/, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("before any write hook for the open file, no freshness cue element exists (E11, REQ-24)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e11" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e11");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });
    await expect(freshnessCue(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("rewriting the plan on disk and switching away and back to docs shows the new content (E12, REQ-19)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e12" });
    const planPath = join(daemon.dataDir, "plans", "reader-e12.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Plan\n\nOriginal.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-e12.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e12", {
        musterSession: session.id,
        transcriptPath,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e12");
    await expect(renderedBody(region)).toContainText("Original", { timeout: 15_000 });

    await writeFile(planPath, "# Plan\n\nRevised content marker.\n");
    await mainheadSurfaceButton(page, "claude").click();
    await mainheadSurfaceButton(page, "docs").click();

    await expect(renderedBody(region)).toContainText("Revised content marker", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("rewriting the plan on disk and dispatching a window focus event shows the new content (E13, REQ-19)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e13" });
    const planPath = join(daemon.dataDir, "plans", "reader-e13.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Plan\n\nOriginal.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-e13.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e13", {
        musterSession: session.id,
        transcriptPath,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e13");
    await expect(renderedBody(region)).toContainText("Original", { timeout: 15_000 });

    await writeFile(planPath, "# Plan\n\nFocus-triggered marker.\n");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(renderedBody(region)).toContainText("Focus-triggered marker", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("with a reader open and nothing happening, no further requests reach /reader or /reader/file (E14, INV-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e14" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e14");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    // Constructed only after the mount's own listing/file fetches have already happened —
    // it must count nothing further over the settle window.
    const tracker = new ReaderRequestTracker(page);
    await settleFor(page, 3_000);
    expect(tracker.total).toBe(0);
  } finally {
    await cleanup();
  }
});

test("a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block (E15, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFile(
      join(dir, "gfm.md"),
      [
        "# GFM",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "- [ ] todo one",
        "- [x] todo two",
        "",
        "```js",
        "console.log('hi');",
        "```",
        "",
      ].join("\n"),
    );
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e15" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e15");
    await fileEntry(region, "gfm.md").click();
    const body = renderedBody(region);
    await expect(body.locator("table")).toBeVisible({ timeout: 15_000 });
    await expect(body.locator('input[type="checkbox"]')).toHaveCount(2);
    await expect(body.locator('input[type="checkbox"]').first()).toBeDisabled();
    await expect(body.locator("pre code")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16, REQ-22)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFile(
      join(dir, "unsafe.md"),
      [
        "# Unsafe",
        "",
        "<script>window.__readerXss = true;</script>",
        "",
        '<img src="x" onerror="window.__readerXss = true" />',
        "",
        "[click me](javascript:window.__readerXss=true)",
        "",
      ].join("\n"),
    );
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e16" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e16");
    await fileEntry(region, "unsafe.md").click();
    const body = renderedBody(region);
    await expect(body).toContainText("Unsafe", { timeout: 15_000 });
    await expect(body.locator("script")).toHaveCount(0);
    await expect(body.locator("[onerror]")).toHaveCount(0);
    await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __readerXss?: boolean }).__readerXss),
    ).toBeUndefined();
  } finally {
    await cleanup();
  }
});

test("the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17, REQ-14)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const filler = Array.from(
      { length: 80 },
      (_, i) => `Paragraph line ${i} of filler text to force a scrollable body.`,
    ).join("\n\n");
    await writeFile(
      join(dir, "long.md"),
      `# Top\n\n${filler}\n\n## Middle\n\n${filler}\n\n## Bottom\n\n${filler}\n`,
    );
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e17" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e17");
    await fileEntry(region, "long.md").click();
    await expect(outlineEntry(region, "Bottom")).toBeVisible({ timeout: 15_000 });

    await outlineEntry(region, "Bottom").click();
    await expect(outlineEntry(region, "Bottom")).toHaveAttribute("aria-current", "true", {
      timeout: 15_000,
    });

    await renderedBody(region).evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(outlineEntry(region, "Top")).toHaveAttribute("aria-current", "true", {
      timeout: 15_000,
    });
  } finally {
    await cleanup();
  }
});

test("a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading (edge case 26, REQ-14)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFile(join(dir, "dup.md"), "# Top\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.\n");
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-dup" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-dup");
    await fileEntry(region, "dup.md").click();

    await expect(outlineEntry(region, "Notes")).toHaveCount(2, { timeout: 15_000 });
    await expect(renderedBody(region).locator("#notes")).toBeVisible();
    await expect(renderedBody(region).locator("#notes-2")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("the Files and Outline header toggles fold independently, and the nav arrow hides and restores the whole nav (E18, REQ-14, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e18" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e18");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });

    await filesHeaderToggle(region).click();
    await expect(filesHeaderToggle(region)).toHaveAttribute("aria-expanded", "false");
    await expect(fileEntry(region, "TODO.md")).toHaveCount(0);
    await expect(outlineHeaderToggle(region)).toHaveAttribute("aria-expanded", "true");

    await navArrowHide(region).click();
    await expect(readerNav(region)).toHaveCount(0);
    await expect(navArrowShow(region)).toBeVisible();

    await navArrowShow(region).click();
    await expect(readerNav(region)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("the last opened file is remembered across a reload (E19, REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e19" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e19");
    await expect(fileEntry(region, "TODO.md")).toBeVisible({ timeout: 15_000 });
    await folderEntry(region, "docs").click();
    await folderEntry(region, "adr").click();
    await fileEntry(region, "x.md").click();
    await expect(barFileName(region)).toHaveText("x.md");

    await mainheadSurfaceButton(page, "claude").click();
    await page.reload();
    await mainheadSurfaceButton(page, "docs").click();

    await expect(barFileName(readerRegion(page, "reader-e19"))).toHaveText("x.md", {
      timeout: 15_000,
    });
  } finally {
    await cleanup();
  }
});

test("reader/file returns 404 for .. traversal, an outside symlink and the plan's -agent- sibling (E20, REQ-20)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const { path: outsideDir, cleanup: cleanupOutside } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e20" });
    const planPath = join(daemon.dataDir, "plans", "reader-e20.md");
    const fx = await buildConfinementFixtures(dir, outsideDir, planPath);

    const traversal = await getReaderFile(
      page,
      daemon.baseURL,
      session.id,
      join(dir, "..", "outside.md"),
    );
    expect(traversal.status).toBe(404);

    const symlinkEscape = await getReaderFile(
      page,
      daemon.baseURL,
      session.id,
      fx.symlinkInsidePath,
    );
    expect(symlinkEscape.status).toBe(404);

    const agentSibling = await getReaderFile(page, daemon.baseURL, session.id, fx.agentSiblingPath);
    expect(agentSibling.status).toBe(404);
  } finally {
    await cleanup();
    await cleanupOutside();
  }
});

test("the pop out link opens a second page with the reader for the same file, and a docChanged re-renders it there too (E21, REQ-8, REQ-27)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e21" });
    const claudeId = "claude-reader-e21";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e21");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain(`/doc.html?session=${session.id}`);
    const popRegion = readerRegion(popup, "reader-e21");
    await expect(popRegion).toBeVisible({ timeout: 15_000 });
    await expect(renderedBody(popRegion)).toContainText("TODO");
    await expect(popOutLink(popRegion)).toHaveCount(0);

    await writeFile(fx.todoPath, "# TODO\n\nPopout marker.\n");
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: fx.todoPath }),
    });
    await expect(renderedBody(popRegion)).toContainText("Popout marker", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("on an ended session the plan block is absent and opening a tree file still renders it (E22, REQ-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e22" });
    await expect(terminalRegion(page, "reader-e22")).toBeVisible({ timeout: 15_000 });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e22");
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(planSlotEntry(region)).toHaveCount(0);
    await expect(noPlanText(region)).toHaveCount(0);

    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("on an ended session whose directory was removed, the status line shows the directory_missing message (E23, edge case 12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  let cleaned = false;
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e23" });
    await expect(terminalRegion(page, "reader-e23")).toBeVisible({ timeout: 15_000 });
    await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    await cleanup();
    cleaned = true;

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e23");
    await expect(readerStatusLine(region)).toContainText(/no longer exists/i, { timeout: 15_000 });
  } finally {
    if (!cleaned) await cleanup();
  }
});

test("stopping the daemon disables the docs segment and shows the unreachable status while keeping the render, and restarting restores it (E24, edge case 13)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e24" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e24");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveText(/musterd unreachable/i);
    await expect(mainheadSurfaceButton(page, "docs")).toBeDisabled();
    await expect(readerStatusLine(region)).toContainText(/unreachable/i, { timeout: 15_000 });
    await expect(renderedBody(region)).toContainText("TODO");

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(mainheadSurfaceButton(page, "docs")).toBeEnabled();
  } finally {
    await cleanup();
  }
});

test("deleting the open file and posting a Write hook for it shows file no longer exists while keeping the last render (E25, REQ-28)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e25" });
    const claudeId = "claude-reader-e25";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e25");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    await rm(fx.todoPath);
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: fx.todoPath }),
    });

    await expect(readerStatusLine(region)).toContainText(`file no longer exists — ${fx.todoPath}`, {
      timeout: 15_000,
    });
    await expect(renderedBody(region)).toContainText("TODO");
  } finally {
    await cleanup();
  }
});

test("opening a file over 10 MiB shows the too_large message and leaves the body unchanged (E26, REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await writeFile(join(dir, "big.md"), Buffer.alloc(10 * 1024 * 1024 + 1, "a"));
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-e26" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e26");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    await fileEntry(region, "big.md").click();
    await expect(readerStatusLine(region)).toContainText(/too large|10 MB/i, { timeout: 15_000 });
    await expect(renderedBody(region)).toContainText("TODO");
  } finally {
    await cleanup();
  }
});

test("the pop-out's own status line is hidden while healthy, shows file-gone on a routed delete, and then genuinely unreachable once the daemon dies (E30, REQ-8, REQ-27, REQ-28)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e30" });
    const claudeId = "claude-reader-e30";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e30");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    const popRegion = readerRegion(popup, "reader-e30");
    await expect(popRegion).toBeVisible({ timeout: 15_000 });
    await expect(renderedBody(popRegion)).toContainText("TODO");

    // Healthy: the pop-out's own socket has said hello, so the notice must stay hidden
    // and empty rather than asserting a connection fact it was never told (review cycle
    // 5 Critical 1 — before the fix this was permanently "musterd unreachable").
    const popStatus = readerStatusLine(popRegion);
    await expect(popStatus).toBeHidden({ timeout: 15_000 });
    await expect(popStatus).toHaveText("");

    await rm(fx.todoPath);
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: fx.todoPath }),
    });
    await expect(popStatus).toContainText(`file no longer exists — ${fx.todoPath}`, {
      timeout: 15_000,
    });
    await expect(renderedBody(popRegion)).toContainText("TODO");

    // Genuinely down now, not the same false message the file-gone case already ruled
    // out one line above — this is the state the pop-out could never previously report.
    await daemon.kill();
    await expect(popStatus).toHaveText("musterd unreachable — showing last render", {
      timeout: 15_000,
    });
    await expect(renderedBody(popRegion)).toContainText("TODO");
  } finally {
    await cleanup();
  }
});

test("in Tiles at 3x2 the reader nav starts collapsed and the bar has no path; at 2x2 it starts open (E27, REQ-15)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await buildMarkdownFixtureTree(dirA.path);
    await buildMarkdownFixtureTree(dirB.path);
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "reader-e27-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "reader-e27-b",
    });

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();

    // 3x2: a session opened at this density starts compact — nav collapsed, no path.
    await page.getByRole("button", { name: "3×2" }).click();
    await expect(page.getByRole("button", { name: "3×2" })).toHaveAttribute("aria-pressed", "true");
    await tileSurfaceButton(page, sessionA.id, "docs").click();
    const regionA = readerRegionInTile(page, sessionA.id);
    await expect(regionA).toBeVisible({ timeout: 15_000 });
    await expect(readerNav(regionA)).toHaveCount(0);
    await expect(barPath(regionA)).toHaveCount(0);

    // 2x2: a session opened at this density starts with the nav open.
    await page.getByRole("button", { name: "2×2" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await tileSurfaceButton(page, sessionB.id, "docs").click();
    const regionB = readerRegionInTile(page, sessionB.id);
    await expect(regionB).toBeVisible({ timeout: 15_000 });
    await expect(readerNav(regionB)).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("the reader nav sits beside the body as a right-hand column bounded by its host, in Focus and in a tile (review cycle 1 Critical 1, REQ-4/REQ-9/REQ-10/REQ-14)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildLargeMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "reader-nav-geom",
    });

    // Focus: `.reader` mounts into `#main-terminal-slot` (features/focus.ts) — that slot
    // is the host bounding it here. Measured pre-fix at y=487, stacked below a 980px body;
    // the grid fix puts it beside the body instead.
    await mainheadSurfaceButton(page, "docs").click();
    const focusRegion = readerRegion(page, "reader-nav-geom");
    await expect(focusRegion).toBeVisible({ timeout: 15_000 });
    await expect(readerNav(focusRegion)).toBeVisible({ timeout: 15_000 });

    // Open the 30-heading file so `.rnav .outline` has content of its own to overflow —
    // the tree overflows regardless of what's open, but the outline only ever reflects
    // the currently open file.
    await fileEntry(focusRegion, fx.outlineFileName).click();
    await expect(renderedBody(focusRegion)).toContainText(fx.lastHeading, { timeout: 15_000 });

    const focusHostBox = await page.locator("#main-terminal-slot").boundingBox();
    const focusBodyBox = await renderedBody(focusRegion).boundingBox();
    const focusNavBox = await readerNav(focusRegion).boundingBox();
    expect(focusHostBox).not.toBeNull();
    expect(focusBodyBox).not.toBeNull();
    expect(focusNavBox).not.toBeNull();
    // Right-hand column: the nav starts at or past the body's own right edge, never below it.
    expect(focusNavBox!.x).toBeGreaterThanOrEqual(focusBodyBox!.x + focusBodyBox!.width);
    // Bounded by its host, not overflowing past the slot it is mounted into.
    expect(focusNavBox!.y + focusNavBox!.height).toBeLessThanOrEqual(
      focusHostBox!.y + focusHostBox!.height + 1,
    );

    // review cycle 2 Critical 1: bounding the nav (above) exposed `.rnav .tree`/`.rnav
    // .outline` clipping their own content — each is independently `overflow-y: auto`
    // rather than the whole nav scrolling as one column, so reachability has to be
    // measured by scrolling the OWNING element to its own `scrollHeight`, never the nav's.
    // First, confirm this fixture genuinely overflows each section (so the reachability
    // check below isn't vacuously true against content that already fit).
    const treeSection = navTreeSection(focusRegion);
    const outlineSection = navOutlineSection(focusRegion);
    await expect(fileEntry(focusRegion, fx.lastFileName)).toBeAttached({ timeout: 15_000 });
    await expect(outlineEntry(focusRegion, fx.lastHeading)).toBeAttached({ timeout: 15_000 });

    expect(await treeSection.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    expect(await outlineSection.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    const treeOverflow = await treeSection.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(treeOverflow.scrollHeight).toBeGreaterThan(treeOverflow.clientHeight);
    const outlineOverflow = await outlineSection.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(outlineOverflow.scrollHeight).toBeGreaterThan(outlineOverflow.clientHeight);

    // Now scroll each section to its own scrollHeight and confirm the last row of each is
    // actually reachable — this is what the fix made possible; before it, nothing scrolled
    // (neither the section nor `.rnav` itself) and both rows sat permanently past the fold.
    await treeSection.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const treeBox = await treeSection.boundingBox();
    const lastFileBox = await fileEntry(focusRegion, fx.lastFileName).boundingBox();
    expect(treeBox).not.toBeNull();
    expect(lastFileBox).not.toBeNull();
    expect(lastFileBox!.y + lastFileBox!.height).toBeLessThanOrEqual(
      treeBox!.y + treeBox!.height + 1,
    );

    await outlineSection.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const outlineBox = await outlineSection.boundingBox();
    const lastHeadingBox = await outlineEntry(focusRegion, fx.lastHeading).boundingBox();
    expect(outlineBox).not.toBeNull();
    expect(lastHeadingBox).not.toBeNull();
    expect(lastHeadingBox!.y + lastHeadingBox!.height).toBeLessThanOrEqual(
      outlineBox!.y + outlineBox!.height + 1,
    );

    // Same session, same live reader instance (review cycle 1 Major 1) — now hosted by a
    // tile. The nav mounted uncollapsed in Focus, so it stays open here regardless of
    // density (REQ-15's collapse default is mount-time only).
    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    const tile = liveTileById(page, session.id);
    const tileRegion = readerRegionInTile(page, session.id);
    await expect(tileRegion).toBeVisible({ timeout: 15_000 });
    await expect(readerNav(tileRegion)).toBeVisible({ timeout: 15_000 });

    const tileHostBox = await tile.boundingBox();
    const tileBodyBox = await renderedBody(tileRegion).boundingBox();
    const tileNavBox = await readerNav(tileRegion).boundingBox();
    expect(tileHostBox).not.toBeNull();
    expect(tileBodyBox).not.toBeNull();
    expect(tileNavBox).not.toBeNull();
    expect(tileNavBox!.x).toBeGreaterThanOrEqual(tileBodyBox!.x + tileBodyBox!.width);
    // The worse half of Critical 1: the nav ended 25.5px past the tile's own bottom edge,
    // painting over the chrome below.
    expect(tileNavBox!.y + tileNavBox!.height).toBeLessThanOrEqual(
      tileHostBox!.y + tileHostBox!.height + 1,
    );
  } finally {
    await cleanup();
  }
});

test("compact follows the current host across a Focus/Tiles switch, not the mount moment (review cycle 1 Major 1, REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "reader-live-compact",
    });
    const claudeId = "claude-reader-live-compact";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    // Mount in Focus — not compact. Open a file first: `.path` renders empty (zero-size,
    // so Playwright reports it not-visible regardless of `pathVisible`) until something is
    // open, and `.n` needs the listing to have arrived.
    await mainheadSurfaceButton(page, "docs").click();
    const focusRegion = readerRegion(page, "reader-live-compact");
    await expect(focusRegion).toBeVisible({ timeout: 15_000 });
    await fileEntry(focusRegion, "TODO.md").click();
    await expect(renderedBody(focusRegion)).toContainText("TODO", { timeout: 15_000 });
    await expect(focusRegion).not.toHaveClass(/compact/);
    await expect(barPath(focusRegion)).toBeVisible();
    await expect(fileCount(focusRegion)).toBeVisible();

    // A routed Write hook for the open file (review cycle 2 Major 1) — without this,
    // `.chg` never exists and the `.path`/`.chg` ordering combination the bug depends on
    // never occurs (both cycle-1 fix and cycle-2's re-fix only bite once a freshness cue
    // is already attached going into a Tiles→Focus round trip).
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: fx.todoPath }),
    });
    await expect(freshnessCue(focusRegion)).toBeVisible({ timeout: 15_000 });
    // REQ-4 order before any round trip: basename, path, cue, pop out.
    await expect(docBar(focusRegion).locator(".path ~ .chg")).toHaveCount(1);

    // Switch to Tiles — the SAME session's reader must now read compact. Before review
    // cycle 1 Major 1's fix, `compact` was fixed at construction, so this stayed stuck at
    // its Focus-mount value (class "reader", `.path` present, `.n` present) here too.
    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    const tileRegion = readerRegionInTile(page, session.id);
    await expect(tileRegion).toBeVisible({ timeout: 15_000 });
    await expect(tileRegion).toHaveClass(/compact/);
    await expect(barPath(tileRegion)).toHaveCount(0);
    await expect(fileCount(tileRegion)).toHaveCount(0);
    // `.chg` does not depend on compact (only `.path` does, REQ-15) — the cue stays.
    await expect(freshnessCue(tileRegion)).toBeVisible();

    // And back to Focus — reverts, proving it tracks the host every render tick rather
    // than the tile's own mount moment. This is the combination review cycle 2 Major 1
    // measured broken: `.path` re-inserted while `.chg` was already connected from the
    // write above landed `.path` AFTER `.chg` (`fname / chg / path / pop out`, instead of
    // REQ-4's `fname / path / chg / pop out`).
    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-focus")).toBeVisible();
    const focusRegionAgain = readerRegion(page, "reader-live-compact");
    await expect(focusRegionAgain).toBeVisible({ timeout: 15_000 });
    await expect(focusRegionAgain).not.toHaveClass(/compact/);
    await expect(barPath(focusRegionAgain)).toBeVisible();
    await expect(fileCount(focusRegionAgain)).toBeVisible();
    await expect(freshnessCue(focusRegionAgain)).toBeVisible();
    // The return-leg order check (review cycle 2 Major 1): `.path` must still precede
    // `.chg`, not just both be present.
    await expect(docBar(focusRegionAgain).locator(".path ~ .chg")).toHaveCount(1);
  } finally {
    await cleanup();
  }
});

test("after a daemon restart and reload, switching to docs shows the plan in the slot (E28, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e28" });
    const planPath = join(daemon.dataDir, "plans", "reader-e28.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# plan\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-e28.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e28", {
        musterSession: session.id,
        transcriptPath,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    await expect(barPlanBadge(readerRegion(page, "reader-e28"))).toBeVisible({ timeout: 15_000 });

    await daemon.restart();
    await page.reload();
    await expect(page.getByRole("status")).toHaveText(/connected/i, { timeout: 15_000 });

    await mainheadSurfaceButton(page, "docs").click();
    await expect(barPlanBadge(readerRegion(page, "reader-e28"))).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("after a /clear pair, a straggler Write hook carrying the old claude id and transcript leaves the slot at no plan yet (E29, INV-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-e29" });

    const oldPlan = join(daemon.dataDir, "plans", "reader-e29-old.md");
    await mkdir(dirname(oldPlan), { recursive: true });
    await writeFile(oldPlan, "# old\n");
    const oldTranscript = join(daemon.dataDir, "transcripts", "reader-e29-old.jsonl");
    await writeFakeTranscript(oldTranscript, { planFilePath: oldPlan });
    const oldClaudeId = "claude-reader-e29-old";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(oldClaudeId, {
        musterSession: session.id,
        transcriptPath: oldTranscript,
      }),
    });

    const newTranscript = join(daemon.dataDir, "transcripts", "reader-e29-new.jsonl");
    await writeFakeTranscript(newTranscript, {});
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawSessionEnd(oldClaudeId, "clear"),
    });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-reader-e29-new", {
        musterSession: session.id,
        source: "clear",
        transcriptPath: newTranscript,
      }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-e29");
    await expect(noPlanText(region)).toHaveText("no plan yet", { timeout: 15_000 });

    // Straggler: the OLD claude id and OLD transcript path, arriving after the rebind.
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(oldClaudeId, {
        toolName: "Write",
        transcriptPath: oldTranscript,
        filePath: join(dir, "TODO.md"),
      }),
    });

    await settleFor(page, 1_000);
    await expect(noPlanText(region)).toHaveText("no plan yet");
    await expect(barPlanBadge(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("leaving plan mode fires a scan that fills the plan slot (REQ-16, edge case 4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-req16" });
    const claudeId = "claude-reader-req16";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-req16");
    await expect(noPlanText(region)).toHaveText("no plan yet", { timeout: 15_000 });

    const planPath = join(daemon.dataDir, "plans", "reader-req16.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# plan\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-req16.jsonl");
    await writeFakeTranscript(transcriptPath, {
      planFilePath: planPath,
      attachmentType: "plan_mode_exit",
    });

    // Leaving plan mode (kb:fact/plan-mode-hook-sequence): by the time PostToolUse
    // {ExitPlanMode} arrives the transcript already names the plan.
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPreToolUse(claudeId, { toolName: "ExitPlanMode", transcriptPath }),
    });
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, {
        toolName: "ExitPlanMode",
        permissionMode: "acceptEdits",
        transcriptPath,
      }),
    });

    await expect(barPlanBadge(region)).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("no terminal exists for the docs surface from every switch direction, and ending a running shell while docs is selected keeps the docs selection (INV-1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-inv1" });
    await expect(terminalRegion(page, "reader-inv1")).toBeVisible({ timeout: 15_000 });

    // shell -> docs
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "reader-inv1")).toBeVisible({ timeout: 15_000 });
    await mainheadSurfaceButton(page, "docs").click();
    await expect(readerRegion(page, "reader-inv1")).toBeVisible({ timeout: 15_000 });
    await expect(shellSurfaceRegion(page, "reader-inv1")).toHaveCount(0);
    await expect(terminalRegion(page, "reader-inv1")).toHaveCount(0);

    // docs -> shell (still running; pip stays lit)
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "reader-inv1")).toBeVisible({ timeout: 15_000 });
    await expect(readerRegion(page, "reader-inv1")).toHaveCount(0);

    // docs selected again, then the shell process itself ends underneath it.
    await mainheadSurfaceButton(page, "docs").click();
    await expect(readerRegion(page, "reader-inv1")).toBeVisible({ timeout: 15_000 });
    await daemon.killTmuxWindow(shellTmuxTarget(session.id));

    await expect(mainheadSurfaceButton(page, "docs")).toHaveAttribute("aria-pressed", "true", {
      timeout: 15_000,
    });
    await expect(shellPip(mainheadSurfaceButton(page, "shell"))).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(readerRegion(page, "reader-inv1")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("the pop-out reader bounds itself to the viewport so the body scrolls, the docbar stays fixed and scroll-spy tracks it (review cycle 3 Critical 1)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const fx = await buildLargeMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-popout-layout" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-popout-layout");
    await fileEntry(region, fx.outlineFileName).click();
    await expect(renderedBody(region)).toContainText(fx.lastHeading, { timeout: 15_000 });

    // Must go through the real link (REQ-8) — a hand-built /doc.html?... URL drops the
    // dashboard token and lands on "Muster is not running here" (review cycle 3 note).
    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    const popRegion = readerRegion(popup, "reader-popout-layout");
    await expect(popRegion).toBeVisible({ timeout: 15_000 });
    await expect(outlineEntry(popRegion, fx.lastHeading)).toBeAttached({ timeout: 15_000 });

    // `article.md` is the scroller...
    const body = renderedBody(popRegion);
    const bodyOverflow = await body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(bodyOverflow.scrollHeight).toBeGreaterThan(bodyOverflow.clientHeight);

    // ...while the document itself is not (the pre-fix bug: the page grew to its content
    // instead of the reader host filling the viewport).
    const docOverflow = await popup.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(docOverflow.scrollHeight).toBe(docOverflow.clientHeight);

    // Opening a file resets current to the outline's own first entry (features/reader.ts:
    // `this.currentHeadingId = outline[0]?.id`) — the fixture's h1 ("Outline"), not the
    // first `## Section` (h2). This is the state the review measured stuck forever
    // pre-fix ("aria-current after window.scrollTo(0, 1200): 'Outline'"), because the
    // scroll-spy listens on `.md`'s own scroll event, which the window never fires.
    await expect(outlineEntry(popRegion, "Outline")).toHaveAttribute("aria-current", "true");
    const barBefore = await docBar(popRegion).boundingBox();
    expect(barBefore).not.toBeNull();

    // Scrolling the body (never the window) must move scroll-spy and must NOT move the bar.
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(outlineEntry(popRegion, "Outline")).not.toHaveAttribute("aria-current", "true", {
      timeout: 15_000,
    });

    const barAfter = await docBar(popRegion).boundingBox();
    expect(barAfter).not.toBeNull();
    expect(barAfter!.y).toBe(barBefore!.y);
  } finally {
    await cleanup();
  }
});

// review cycle 3 Major 2: no prior reader spec used focus + keys anywhere (E8/E17/E18 all
// use `.click()`), so none could see review cycle 3's Major 1 (every tree/outline/plan-slot
// button destroyed and rebuilt on any `current`/`dirty` change, dropping keyboard focus to
// `<body>`). This test drives the plan slot, a tree file and an outline entry with real
// focus + `Enter`, across a render tick, a routed `docChanged` write and an unrelated
// `sessionUpsert` — the two events the fix's own log names as re-rendering attributes only,
// never structure — and asserts `document.activeElement` is still the exact same DOM node
// (an element handle captured before the event, not merely "a matching locator"), the
// shape kb:lesson/select-rebuilt-every-tick-passed-selectoption mandates.
test("keyboard-activating the plan slot, a tree file and an outline entry keeps focus on that exact node across a render tick, a routed docChanged write and an unrelated sessionUpsert (review cycle 3 Major 1/2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    const planPath = join(daemon.dataDir, "plans", "reader-kbd-slug.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# The Plan\n\nDo the thing.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "reader-kbd.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });

    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "reader-kbd" });
    const claudeId = "claude-reader-kbd";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id, transcriptPath }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-kbd");
    await expect(barPlanBadge(region)).toBeVisible({ timeout: 15_000 });

    // Expand the nested folders up front so `x.md`'s button exists for the docChanged
    // step below — folder children render only while expanded (REQ-10), and expanding a
    // folder is itself the structural rebuild the next test in this file covers on its
    // own; this setup click happens before any focus-survival assertion begins.
    await folderEntry(region, "docs").click();
    await folderEntry(region, "adr").click();
    await expect(fileEntry(region, "x.md")).toBeVisible({ timeout: 15_000 });

    // Plan slot: focus, activate by keyboard, survive a tick.
    const planEntry = planSlotEntry(region);
    await planEntry.focus();
    await expect(planEntry).toBeFocused();
    const planHandle = await planEntry.elementHandle();
    if (!planHandle) throw new Error("plan slot button not found");
    await page.keyboard.press("Enter");
    await settleFor(page, 1100);
    await expect(planEntry).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, planHandle)).toBe(true);

    // Tree file: focus, activate by keyboard (opens it), survive a tick — this is the
    // exact case review cycle 3 measured red (Enter on a tree file left activeElement
    // at BODY).
    const treeEntry = fileEntry(region, "TODO.md");
    await treeEntry.focus();
    await expect(treeEntry).toBeFocused();
    const treeHandle = await treeEntry.elementHandle();
    if (!treeHandle) throw new Error("tree file button not found");
    await page.keyboard.press("Enter");
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });
    await settleFor(page, 1100);
    await expect(treeEntry).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, treeHandle)).toBe(true);

    // A routed docChanged write for a DIFFERENT (unopened) file lights that file's dot —
    // an attribute-level patch on a sibling button, not a structural rebuild of this one.
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, {
        toolName: "Write",
        filePath: join(dir, "docs", "adr", "x.md"),
      }),
    });
    await expect(changedDot(fileEntry(region, "x.md"))).toHaveCount(1, { timeout: 15_000 });
    await expect(treeEntry).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, treeHandle)).toBe(true);

    // An unrelated sessionUpsert (a turn-activity hook that touches no document) — the
    // other named re-render trigger with no structural consequence for the reader nav.
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId),
    });
    await settleFor(page, 1100);
    await expect(treeEntry).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, treeHandle)).toBe(true);

    // Outline entry (TODO.md's own single heading): focus, activate by keyboard, survive
    // a tick — the second control kind review cycle 3 measured red.
    const outlineBtn = outlineEntry(region, "TODO");
    await outlineBtn.focus();
    await expect(outlineBtn).toBeFocused();
    const outlineHandle = await outlineBtn.elementHandle();
    if (!outlineHandle) throw new Error("outline button not found");
    await page.keyboard.press("Enter");
    await expect(outlineBtn).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
    await settleFor(page, 1100);
    await expect(outlineBtn).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, outlineHandle)).toBe(true);
  } finally {
    await cleanup();
  }
});

// review cycle 3 sweep: the fix restores focus by stable key across a genuinely
// structural rebuild (expand/collapse/filter), not just across the attribute-only
// re-renders the test above covers. Expanding a folder changes the flattened entry
// list (kind/path/name/depth/expanded/count all feed the structural signature), which
// destroys and replaces every tree button, including the one just clicked — proven here
// by an element-handle identity check, not merely "a button matching the same name is
// focused afterwards".
test("expanding a tree folder rebuilds the section structurally and restores focus onto the new equivalent button, not the destroyed old node (review cycle 3 Major 1 sweep)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-focus-rebuild" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-focus-rebuild");
    const folder = folderEntry(region, "docs");
    await expect(folder).toBeVisible({ timeout: 15_000 });
    await expect(folder).toHaveAttribute("aria-expanded", "false");

    await folder.focus();
    await expect(folder).toBeFocused();
    const oldHandle = await folder.elementHandle();
    if (!oldHandle) throw new Error("folder button not found");

    await page.keyboard.press("Enter");
    await expect(folderEntry(region, "adr")).toBeVisible({ timeout: 15_000 });

    // The old node is gone (a genuine structural rebuild happened)...
    expect(await page.evaluate((n) => !document.contains(n), oldHandle)).toBe(true);
    // ...and focus is NOT still "pointing at" that removed node...
    expect(await page.evaluate((n) => document.activeElement === n, oldHandle)).toBe(false);
    // ...but a new button with the same accessible name and the toggled state IS focused —
    // the restore-by-stable-key the fix implements, not mere accidental survival.
    const newFolder = folderEntry(region, "docs");
    await expect(newFolder).toBeFocused();
    await expect(newFolder).toHaveAttribute("aria-expanded", "true");
  } finally {
    await cleanup();
  }
});

// review cycle 4 Major 2: the nav arrow pair (`Hide files` / `Show files`) is the reader's
// fourth interactive control kind, and the only one whose own activation makes the
// activated element disappear — `hidden`, not rebuilt (review cycle 4 Major 1, Fix Attempt
// 5's `prepareNavArrowFocusRestore`) — so the cycle-3 sweep above (plan slot, tree file,
// outline entry: all *reused* nodes) could not have seen it, and E18 drives both arrows
// with `.click()`, which never reveals where focus lands. This drives both arrows with real
// focus + `Enter`, both directions, on the Focus host and again on the pop-out, asserting
// against an element handle for the *counterpart* arrow captured before the toggle that
// unhides it — the counterpart is a permanent DOM node that already exists, just `hidden`,
// so `navArrowCollapsedNode`/`navArrowOpenNode` (plain attribute locators, unlike
// `navArrowHide`/`navArrowShow`'s `getByRole`, which excludes hidden elements) can take its
// handle up front, the same identity-check shape the cycle-3 sweep uses throughout.
async function assertArrowFocusSurvivesToggle(page: Page, region: Locator): Promise<void> {
  // "Hide files" -> Enter collapses the nav; "Show files" (still hidden right now) must
  // hold focus afterwards.
  const collapsedHandle = await navArrowCollapsedNode(region).elementHandle();
  if (!collapsedHandle) throw new Error("collapsed arrow node not found");
  await navArrowHide(region).focus();
  await expect(navArrowHide(region)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(readerNav(region)).toHaveCount(0);
  await settleFor(page, 1100);
  await expect(navArrowShow(region)).toBeFocused();
  expect(await page.evaluate((n) => document.activeElement === n, collapsedHandle)).toBe(true);

  // Reverse: "Show files" -> Enter reopens the nav; "Hide files" (still hidden right now)
  // must hold focus afterwards.
  const openHandle = await navArrowOpenNode(region).elementHandle();
  if (!openHandle) throw new Error("open arrow node not found");
  await navArrowShow(region).focus();
  await expect(navArrowShow(region)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(readerNav(region)).toBeVisible();
  await settleFor(page, 1100);
  await expect(navArrowHide(region)).toBeFocused();
  expect(await page.evaluate((n) => document.activeElement === n, openHandle)).toBe(true);
}

test("keyboard-activating the nav arrow keeps focus on its counterpart, both directions, on the Focus host and on the pop-out (review cycle 4 Major 2)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await buildMarkdownFixtureTree(dir);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "reader-arrow-focus" });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "reader-arrow-focus");
    await expect(navArrowHide(region)).toBeVisible({ timeout: 15_000 });
    await assertArrowFocusSurvivesToggle(page, region);

    // A file must be open for `pop out ↗` to exist (REQ-4/REQ-8); the arrow toggles above
    // leave the nav open (they end each direction back on `Hide files`), so the tree is
    // reachable here.
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO", { timeout: 15_000 });

    // Pop out (REQ-8) and repeat both directions there — the same shared component and
    // the same `prepareNavArrowFocusRestore`, a second composition root (REQ-27).
    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    const popRegion = readerRegion(popup, "reader-arrow-focus");
    await expect(navArrowHide(popRegion)).toBeVisible({ timeout: 15_000 });
    await assertArrowFocusSurvivesToggle(popup, popRegion);
  } finally {
    await cleanup();
  }
});

// review cycle 4 Major 2's "also assert the negative": toggling the nav from something
// OTHER than the arrow itself must not focus-steal to an arrow. There is no such path at
// runtime — `navCollapsed` (features/reader.ts) is set once at mount (the compact-3x2
// default) and thereafter flipped only by `toggleNav()`, which only the two arrows'
// `onToggleNav` click handler calls; no other control, shortcut or hook-driven re-render
// ever changes it. The closest real analogue — an unrelated re-render firing
// `prepareNavArrowFocusRestore` while focus sits on a non-arrow control — is already pinned
// by the cycle-3 focus-survival test above (a routed `docChanged` write and an unrelated
// `sessionUpsert` both re-render the reader while `treeEntry` is focused, and it asserts
// focus stays exactly there, i.e. it was never stolen onto either arrow). No new test is
// added here for the "toggled from elsewhere" case: inventing a non-arrow nav-toggle path
// that does not exist in the product would not be an honest test.
