import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type ScratchDaemon, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawPostToolUse } from "./helpers/payloads";
import {
  canvasTransform,
  diagramCanvas,
  diagramClose,
  diagramDialog,
  diagramDialogRaw,
  diagramErrorLine,
  diagramFigure,
  diagramFigures,
  diagramStage,
  diagramZoomIn,
  diagramZoomOut,
  diagramZoomReset,
  enlargeButton,
  fileEntry,
  holdReaderFileResponseFor,
  keptMermaidSource,
  OriginRequestTracker,
  outlineEntry,
  popOutLink,
  ReaderRequestTracker,
  readerRegion,
  readerRegionInTile,
  renderedBody,
  writeMermaidFixture,
} from "./helpers/reader";
import { launchSession, scratchDirectory } from "./helpers/session";
import { mainheadSurfaceButton, tileSurfaceButton } from "./helpers/shell";
import { liveTileById } from "./helpers/terminal";
import { openSettingsDialog, themeRadio } from "./helpers/theme";

// Plan mermaid-support — REQ-1 through REQ-15, INV-1 through INV-5, acceptance E2-E15
// (E1 is `make e2e` itself). Fixture plan (plan.md header): every test takes the
// test-scoped `daemon` fixture, matching reader.spec.ts's rationale (E6 flips the
// daemon-global theme pref; `launchSession` relies on auto-focus of "the only session"
// in Focus).
//
// The daemon and tmux are real throughout; only Claude Code is faked, via
// envelopedSessionStart/rawPostToolUse — no real `claude` process ever runs here
// (CLAUDE.md hard rule). mermaid itself is real: it ships in the built dashboard bundle,
// and every diagram fixture below is genuine mermaid source run through the actual
// bundled engine in the browser — never simulated SVG. The modules this plan adds
// (render/diagrams.ts, render/diagramdialog.ts, render/mermaid.ts, reader/mermaid.ts,
// reader/zoom.ts) are in the tree and every test below runs green against them. At
// authoring time they did not exist, so all but the REQ-12 pin gated on collection only
// (`npx playwright test --list`); that history is in plans/mermaid-support/test-specs.md,
// not a property of this file today.

/** Launches a session, opens the docs surface, and opens `fileBasename` — the common
 * setup every single-session test below shares. */
async function openDiagramFile(
  page: Page,
  daemon: ScratchDaemon,
  dir: string,
  title: string,
  fileBasename: string,
) {
  await page.goto(daemon.dashboardUrl);
  const session = await launchSession(page, daemon, { directory: dir, title });
  await page.request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(`claude-${title}`, { musterSession: session.id }),
  });
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, title);
  await fileEntry(region, fileBasename).click();
  return { session, region };
}

test("a valid flowchart fence renders as an SVG diagram with styled nodes, and the source pre is gone (E2, REQ-1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e2", "flow.md");

    const figure = diagramFigure(region);
    await expect(figure.locator("svg")).toBeVisible({ timeout: 15_000 });
    await expect(keptMermaidSource(region)).toHaveCount(0);

    // A styled node's fill must not be the SVG default (none/black) — mermaid's theme
    // CSS is what supplies it (Implementation Notes: "measure that the rendered diagram
    // is styled").
    const nodeFill = await figure
      .locator("svg .node rect, svg .node polygon, svg .node circle, svg .node path")
      .first()
      .evaluate((el) => getComputedStyle(el as Element).fill);
    expect(nodeFill).not.toBe("");
    expect(["none", "rgb(0, 0, 0)"]).not.toContain(nodeFill);
  } finally {
    await cleanup();
  }
});

test("a malformed fence among valid ones keeps its source with a failure line while the others render (E3, REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e3", "broken.md");

    await expect(diagramFigures(region)).toHaveCount(1, { timeout: 15_000 });
    await expect(keptMermaidSource(region)).toHaveCount(1);
    const error = diagramErrorLine(region);
    await expect(error).toBeVisible();
    await expect(error).toHaveText(/^diagram not rendered: /);

    // DOM sketch: the failure line is the kept `<pre>`'s next sibling.
    const isNextSibling = await keptMermaidSource(region).evaluate((code) => {
      const pre = code.closest("pre");
      return pre?.nextElementSibling?.classList.contains("diagram-error") ?? false;
    });
    expect(isNextSibling).toBe(true);
  } finally {
    await cleanup();
  }
});

test("script, onerror and javascript: content in a diagram's labels and click directive never reach the DOM, even under a loose init directive (E4, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e4", "unsafe.md");

    const body = renderedBody(region);
    await expect(body).toContainText("Unsafe", { timeout: 15_000 });
    await expect(body.locator("script")).toHaveCount(0);
    await expect(body.locator("[onerror]")).toHaveCount(0);
    await expect(body.locator('[href^="javascript:"]')).toHaveCount(0);
    await expect(body.locator('[src^="javascript:"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __readerXss?: boolean }).__readerXss),
    ).toBeUndefined();
  } finally {
    await cleanup();
  }
});

test("mermaid's chunk loads lazily only for a document with a fence, and every request stays on the daemon's origin (E5, REQ-3, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "mmd-e5" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mmd-e5", { musterSession: session.id }),
    });
    const tracker = new OriginRequestTracker(page, daemon.baseURL);

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "mmd-e5");
    await fileEntry(region, "plain.md").click();
    await expect(renderedBody(region)).toContainText("Plain", { timeout: 15_000 });
    tracker.assertAllSameOrigin();
    expect(tracker.scriptRequestsContaining("mermaid")).toHaveLength(0);

    await fileEntry(region, "flow.md").click();
    await expect(diagramFigure(region).locator("svg")).toBeVisible({ timeout: 15_000 });
    tracker.assertAllSameOrigin();
    expect(tracker.scriptRequestsContaining("mermaid").length).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("changing the theme re-renders a diagram in the mapped mermaid theme without re-fetching the file, and the diagram survives having been enlarged (E6, REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e6", "flow.md");

    const figure = diagramFigure(region);
    const svg = figure.locator("svg");
    await expect(svg).toBeVisible({ timeout: 15_000 });
    await expect(figure).toHaveAttribute("data-mermaid-theme", "dark");

    // Drive the order that breaks it (review cycle 1 Critical 1): enlarge, close, then
    // flip the theme. Either the close handler clearing the dialog's cloned SVG, or the
    // re-render minting a fresh id per pass, independently stops the later re-render from
    // resolving against a stale clone; this test guards the defect class, not either fix
    // in isolation.
    const enlargeDiagramDialog = diagramDialog(region);
    await enlargeButton(figure).click();
    await expect(enlargeDiagramDialog).toBeVisible({ timeout: 15_000 });
    await diagramClose(enlargeDiagramDialog).click();
    await expect(enlargeDiagramDialog).toBeHidden({ timeout: 15_000 });

    const tracker = new ReaderRequestTracker(page);
    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Light").check();

    await expect(figure).toHaveAttribute("data-mermaid-theme", "default", { timeout: 15_000 });
    expect(tracker.fileRequests).toBe(0);

    // The diagram itself must survive the flip, not just the attribute (review cycle 1
    // Critical 1/2): flow.md's source is `flowchart TD / A --> B`, so a live re-render
    // keeps its viewBox and both nodes; the destroyed case leaves a 300x150
    // replaced-element default with no viewBox and no nodes.
    await expect(svg).toHaveAttribute("viewBox", /\S/);
    await expect(svg.locator(".node")).toHaveCount(2);
    await expect(svg).toContainText("A");
    await expect(svg).toContainText("B");
  } finally {
    await cleanup();
  }
});

test("a routed Write hook for the open diagram file re-renders it with the changed node label (E7, REQ-1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "mmd-e7" });
    const claudeId = "claude-mmd-e7";
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "mmd-e7");
    await fileEntry(region, "flow.md").click();
    const figure = diagramFigure(region);
    await expect(figure.locator("svg")).toBeVisible({ timeout: 15_000 });

    const flowPath = join(dir, "flow.md");
    await writeFile(flowPath, "# Flow\n\n```mermaid\nflowchart TD\n  A --> RelabeledNode\n```\n");
    await page.request.post(daemon.ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { toolName: "Write", filePath: flowPath }),
    });

    await expect(figure.locator("svg")).toContainText("RelabeledNode", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("Enlarge diagram opens a fitted, focused modal; Escape, the backdrop and Close each close it and restore focus to the button (E8, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e8", "flow.md");
    const figure = diagramFigure(region);
    await expect(figure.locator("svg")).toBeVisible({ timeout: 15_000 });
    const button = enlargeButton(figure);
    const dialog = diagramDialog(region);

    // Escape.
    await button.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(diagramCanvas(dialog).locator("svg")).toBeVisible();
    const stage = diagramStage(dialog);
    await expect(stage).toHaveAttribute("data-zoom", "1.00");
    await expect(stage).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(button).toBeFocused();

    // Backdrop click — the dialog is sized `calc(100vw - 32px)`/`calc(100vh - 32px)`, so
    // the viewport's corner sits outside its content box on every runner size.
    await button.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.mouse.click(3, 3);
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(button).toBeFocused();

    // Close button.
    await button.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await diagramClose(dialog).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(button).toBeFocused();
  } finally {
    await cleanup();
  }
});

test("with two tiles open on the same diagram file, enlarging one tile's diagram opens only that tile's dialog (E9, INV-3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await writeMermaidFixture(dirA.path);
    await writeMermaidFixture(dirB.path);
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "mmd-e9-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "mmd-e9-b" });

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await expect(liveTileById(page, sessionA.id)).toBeVisible();
    await expect(liveTileById(page, sessionB.id)).toBeVisible();

    await tileSurfaceButton(page, sessionA.id, "docs").click();
    await tileSurfaceButton(page, sessionB.id, "docs").click();
    const regionA = readerRegionInTile(page, sessionA.id);
    const regionB = readerRegionInTile(page, sessionB.id);
    await fileEntry(regionA, "flow.md").click();
    await fileEntry(regionB, "flow.md").click();
    const figureA = diagramFigure(regionA);
    const figureB = diagramFigure(regionB);
    await expect(figureA.locator("svg")).toBeVisible({ timeout: 15_000 });
    await expect(figureB.locator("svg")).toBeVisible({ timeout: 15_000 });

    // Each reader root holds exactly one dialog, and only A's opens.
    await expect(diagramDialogRaw(regionA)).toHaveCount(1);
    await expect(diagramDialogRaw(regionB)).toHaveCount(1);
    const buttonA = enlargeButton(figureA);
    await buttonA.click();
    await expect(diagramDialog(regionA)).toBeVisible({ timeout: 15_000 });
    await expect(diagramDialog(regionB)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(diagramDialog(regionA)).toBeHidden({ timeout: 15_000 });
    await expect(buttonA).toBeFocused();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("on the pop-out, Enlarge diagram opens and closes the modal with focus restored, and every request stays on the daemon's origin (E10, REQ-8)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e10", "flow.md");
    await expect(diagramFigure(region).locator("svg")).toBeVisible({ timeout: 15_000 });

    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    const tracker = new OriginRequestTracker(popup, daemon.baseURL);
    const popRegion = readerRegion(popup, "mmd-e10");
    const popFigure = diagramFigure(popRegion);
    await expect(popFigure.locator("svg")).toBeVisible({ timeout: 15_000 });

    const button = enlargeButton(popFigure);
    const dialog = diagramDialog(popRegion);
    await button.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await popup.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(button).toBeFocused();
    tracker.assertAllSameOrigin();
  } finally {
    await cleanup();
  }
});

test("a diagram wider than the body scrolls its own figure without giving article.md a horizontal scrollbar, in Focus and in a compact tile (E11, REQ-11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { session, region: focusRegion } = await openDiagramFile(
      page,
      daemon,
      dir,
      "mmd-e11",
      "wide.md",
    );
    const focusFigure = diagramFigure(focusRegion);
    await expect(focusFigure.locator("svg")).toBeVisible({ timeout: 15_000 });

    const focusOverflow = await focusFigure.evaluate(
      (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
    );
    expect(focusOverflow).toBe(true);
    const focusArticleOverflow = await renderedBody(focusRegion).evaluate(
      (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
    );
    expect(focusArticleOverflow).toBe(false);

    // Same document, compact tile (3×2).
    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await page.getByRole("button", { name: "3×2" }).click();
    await tileSurfaceButton(page, session.id, "docs").click();
    const tileRegion = readerRegionInTile(page, session.id);
    // wide.md is already open (browser memory keyed by session, kb:adr/reader-memory-split-browser-and-daemon)
    // from the Focus half above — this tile's ReaderInstance auto-opens it on mount via
    // decideInitialOpen, so re-clicking the same file here would trigger a redundant
    // re-fetch/re-render that races the very assertion below.
    const tileFigure = diagramFigure(tileRegion);
    await expect(tileFigure.locator("svg")).toBeVisible({ timeout: 15_000 });

    const tileOverflow = await tileFigure.evaluate(
      (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
    );
    expect(tileOverflow).toBe(true);
    const tileArticleOverflow = await renderedBody(tileRegion).evaluate(
      (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
    );
    expect(tileArticleOverflow).toBe(false);
  } finally {
    await cleanup();
  }
});

test("a file with a fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote and duplicate variants, renders every one (E12, REQ-1, REQ-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e12", "kinds.md");

    await expect(diagramFigures(region)).toHaveCount(13, { timeout: 15_000 });
    await expect(keptMermaidSource(region)).toHaveCount(0);
    for (let i = 0; i < 13; i += 1) {
      await expect(diagramFigure(region, i).locator("svg")).toBeVisible();
    }
  } finally {
    await cleanup();
  }
});

// REGRESSION PIN: heading ids and the outline come from the reader's pre-existing
// markdown path, and the diagram pass must leave both alone. Authored before that pass
// existed (green then, against the bare markdown path) and green now with it running over
// the same document — which is the assertion that matters — REQ-12's own text: "it runs
// after renderMarkdown has assigned ids and touches only pre > code mermaid blocks."
test("heading ids and the outline are unchanged by a document that also carries mermaid fences, valid and malformed, between its headings (REQ-12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const filler = Array.from(
      { length: 40 },
      (_, i) => `Paragraph line ${i} of filler text to force a scrollable body.`,
    ).join("\n\n");
    await writeFile(
      join(dir, "interleaved.md"),
      [
        "# Top",
        "",
        "## Alpha",
        "",
        filler,
        "",
        "```mermaid",
        "flowchart TD",
        "  A --> B",
        "```",
        "",
        "## Beta",
        "",
        filler,
        "",
        "```mermaid",
        "flowchart TD",
        "  C -->",
        "```",
        "",
        "## Gamma",
        "",
        filler,
        "",
      ].join("\n"),
    );
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "mmd-req12" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mmd-req12", { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "mmd-req12");
    await fileEntry(region, "interleaved.md").click();
    await expect(outlineEntry(region, "Gamma")).toBeVisible({ timeout: 15_000 });

    await expect(outlineEntry(region, "Top")).toBeVisible();
    await expect(outlineEntry(region, "Alpha")).toBeVisible();
    await expect(outlineEntry(region, "Beta")).toBeVisible();
    await expect(renderedBody(region).locator("#top")).toBeVisible();
    await expect(renderedBody(region).locator("#alpha")).toBeVisible();
    await expect(renderedBody(region).locator("#beta")).toBeVisible();
    await expect(renderedBody(region).locator("#gamma")).toBeVisible();

    await outlineEntry(region, "Gamma").click();
    await expect(outlineEntry(region, "Gamma")).toHaveAttribute("aria-current", "true", {
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

test("in the open modal, Zoom in/out, +/-/=/0 keys and Reset zoom move data-zoom through the documented sequence, clamped to [0.25, 8] (E13, REQ-9, INV-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e13", "flow.md");
    const figure = diagramFigure(region);
    await expect(figure.locator("svg")).toBeVisible({ timeout: 15_000 });
    await enlargeButton(figure).click();
    const dialog = diagramDialog(region);
    const stage = diagramStage(dialog);
    await expect(stage).toHaveAttribute("data-zoom", "1.00");

    await diagramZoomIn(dialog).click();
    await expect(stage).toHaveAttribute("data-zoom", "1.25");
    await diagramZoomOut(dialog).click();
    await expect(stage).toHaveAttribute("data-zoom", "1.00");
    await stage.press("-");
    await expect(stage).toHaveAttribute("data-zoom", "0.80");
    await diagramZoomReset(dialog).click();
    await expect(stage).toHaveAttribute("data-zoom", "1.00");

    for (let i = 0; i < 12; i += 1) await stage.press("+");
    await expect(stage).toHaveAttribute("data-zoom", "8.00");
    for (let i = 0; i < 12; i += 1) await stage.press("+");
    await expect(stage).toHaveAttribute("data-zoom", "8.00");

    for (let i = 0; i < 16; i += 1) await stage.press("-");
    await expect(stage).toHaveAttribute("data-zoom", "0.25");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await enlargeButton(figure).click();
    await expect(diagramStage(diagramDialog(region))).toHaveAttribute("data-zoom", "1.00", {
      timeout: 15_000,
    });
  } finally {
    await cleanup();
  }
});

test("in the open modal, wheel-up zooms in, a pointer drag pans the canvas by the drag delta, and Reset zoom restores fit with no pan (E14, REQ-9)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e14", "flow.md");
    const figure = diagramFigure(region);
    await expect(figure.locator("svg")).toBeVisible({ timeout: 15_000 });
    await enlargeButton(figure).click();
    const dialog = diagramDialog(region);
    const stage = diagramStage(dialog);
    const canvas = diagramCanvas(dialog);
    await expect(stage).toBeVisible({ timeout: 15_000 });

    const box = await stage.boundingBox();
    if (!box) throw new Error("diagram stage has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await expect
      .poll(async () => Number(await stage.getAttribute("data-zoom")))
      .toBeGreaterThan(1.0);

    await diagramZoomReset(dialog).click();
    await expect(stage).toHaveAttribute("data-zoom", "1.00");
    let transform = await canvasTransform(canvas);
    expect(transform.x).toBe(0);
    expect(transform.y).toBe(0);

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
    await page.mouse.up();
    transform = await canvasTransform(canvas);
    expect(transform.x).toBeCloseTo(100, 0);
    expect(transform.y).toBeCloseTo(50, 0);

    await diagramZoomReset(dialog).click();
    transform = await canvasTransform(canvas);
    expect(transform.x).toBe(0);
    expect(transform.y).toBe(0);
    await expect(stage).toHaveAttribute("data-zoom", "1.00");
  } finally {
    await cleanup();
  }
});

test("a flowchart naming layout: elk in frontmatter and one naming no layout both render (E15, REQ-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    const { region } = await openDiagramFile(page, daemon, dir, "mmd-e15", "elk.md");

    await expect(diagramFigures(region)).toHaveCount(2, { timeout: 15_000 });
    await expect(diagramFigure(region, 0).locator("svg")).toBeVisible();
    await expect(diagramFigure(region, 1).locator("svg")).toBeVisible();
    await expect(keptMermaidSource(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("switching to a plain file while a diagram file's fetch is still held discards the late render (REQ-10, edge case 5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeMermaidFixture(dir);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "mmd-req10" });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-mmd-req10", { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "mmd-req10");
    // Hold only flow.md's own fetch — plain.md's must complete immediately so the "late"
    // flow.md render genuinely arrives after the user has already moved on to plain.md.
    const held = await holdReaderFileResponseFor(page, session.id, "flow.md");

    await fileEntry(region, "flow.md").click();
    await fileEntry(region, "plain.md").click();
    await expect(renderedBody(region)).toContainText("Plain", { timeout: 15_000 });
    held.release();

    await expect(renderedBody(region)).toContainText("Plain");
    await expect(diagramFigures(region)).toHaveCount(0);
    await expect(keptMermaidSource(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
