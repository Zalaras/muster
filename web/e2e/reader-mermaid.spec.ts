import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type ScratchDaemon, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawPostToolUse } from "./helpers/payloads";
import {
  diagramClose,
  diagramDialog,
  diagramFigure,
  diagramFigures,
  enlargeButton,
  fileEntry,
  holdReaderFileResponseFor,
  keptMermaidSource,
  OriginRequestTracker,
  popOutLink,
  ReaderRequestTracker,
  readerRegion,
  renderedBody,
  writeMermaidFixture,
} from "./helpers/reader";
import { envelopeOpts, launchSession, scratchDirectory } from "./helpers/session";
import { mainheadSurfaceButton } from "./helpers/shell";
import { openSettingsDialog, themeRadio } from "./helpers/theme";

// Plan mermaid-support — REQ-1 through REQ-15, INV-1 through INV-5, acceptance E2-E15
// (E1 is `make e2e` itself): the journeys. Each test here needs the daemon and the UI
// together — a theme change (a pref round-trip whose broadcast re-renders the diagram), a
// Write hook re-rendering the open file, the pop-out (a second page opened through its
// link), or a file response held in flight. What a document's diagrams render as — the SVG
// and its styling, a malformed fence, sanitization, the lazy chunk, the modal with its zoom
// and pan, two tiles, a wide diagram in Focus and in a compact tile, every diagram kind —
// is a render test in web/render/reader.spec.ts against the `reader-diagrams*` fixtures
// (kb:adr/process-test-levels-journey-property-logic; plans/_audit/relevel/reader.md).
//
// Fixture plan (plan.md header): every test takes the test-scoped `daemon` fixture,
// matching reader.spec.ts's rationale (E6 flips the daemon-global theme pref;
// `launchSession` relies on auto-focus of "the only session" in Focus).
//
// The daemon and tmux are real throughout; only Claude Code is faked, via
// envelopedSessionStart/rawPostToolUse — no real `claude` process ever runs here
// (CLAUDE.md hard rule). mermaid itself is real: it ships in the built dashboard bundle,
// and every diagram fixture (`writeMermaidFixture`, whose bytes are
// web/render/helpers/reader.ts's `MERMAID_DOCUMENTS`) is genuine mermaid source run
// through the actual bundled engine in the browser — never simulated SVG.

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
    data: envelopedSessionStart(`claude-${title}`, await envelopeOpts(session, daemon)),
  });
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, title);
  await fileEntry(region, fileBasename).click();
  return { session, region };
}

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
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
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
      data: envelopedSessionStart("claude-mmd-req10", await envelopeOpts(session, daemon)),
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
