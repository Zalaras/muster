import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, settleFor, test } from "./helpers/fixtures";
import {
  rawPostToolUse,
  rawSessionEnd,
  rawUserPromptSubmit,
  envelopedSessionStart,
} from "./helpers/payloads";
import {
  barFileName,
  barPath,
  buildMarkdownFixtureTree,
  docBar,
  fileEntry,
  getReaderFile,
  navToggle,
  noPlanText,
  planSlotEntry,
  popOutLink,
  ReaderRequestTracker,
  readerRegion,
  readerRegionInTile,
  renderedBody,
  writeFakeTranscript,
} from "./helpers/reader";
import {
  awaitHooksApplied,
  claudeRowOrder,
  claudeSummary,
  envelopeHook,
  getScratchListing,
  getScratchpadDir,
  launchWithScratchpad,
  makeScratchpad,
  noPlanChip,
  planChip,
  postHook,
  scratchRow,
  scratchRows,
  tmpChip,
  unfoldClaudeSection,
  withScratchpad,
} from "./helpers/reader-scratch";
import { envelopeOpts, launchSession, scratchDirectory, sessionCard } from "./helpers/session";
import { mainheadSurfaceButton, tileSurfaceButton } from "./helpers/shell";

// The claude section's scratchpad journeys (plan claude-tmp-files, mockup B): Claude Code names
// each interactive session's scratchpad folder on every hook (kb:fact/scratchpad-dir-per-session-id),
// the daemon keeps it on the session row, lists its `.md` files in the reader listing, serves them
// through the file route and sends `docChanged` for writes there; the nav's top section shows one
// folded `claude` summary row with chips and, unfolded, the plan row and the scratch rows.
//
// Fixture plan (plan.md header): every test takes the test-scoped `daemon` fixture — a fresh
// scratch daemon per test, each launching its own session(s) on its own scratchpad folder and
// reading the reader listing fresh; none relies on another test's side effects.
//
// Claude Code is faked: hooks are the payloads helpers/payloads.ts synthesizes plus the measured
// `scratchpad_dir` key helpers/reader-scratch.ts puts on them. The daemon, tmux and the
// browser are real. What the row, chips and badge look like for a given listing (ages, teal
// badge, ellipsis in a 3x2 tile) is a render test in web/render/reader.spec.ts.

const FIXED_NEWER = new Date("2026-11-11T10:00:00Z");
const FIXED_MIDDLE = new Date("2026-11-10T10:00:00Z");
const FIXED_OLDER = new Date("2026-11-09T10:00:00Z");

test("a SessionStart naming a well-formed scratchpad folder shows 1 tmp on a folded claude row, and unfolding then clicking the row opens the file with a tmp badge (E1, REQ-1, REQ-3, REQ-4, REQ-7, REQ-8, REQ-9, REQ-10, INV-1, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-e1";
  const scratch = await makeScratchpad(claudeId);
  try {
    const findings = await scratch.write("findings.md", "# Findings\n\nScratch marker one.\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-e1",
      claudeSessionId: claudeId,
      scratch,
    });
    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(scratch.dir);

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-e1");
    const summary = claudeSummary(region);
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await expect(noPlanChip(region)).toBeVisible();
    await expect(planChip(region)).toHaveCount(0);
    await expect(planSlotEntry(region)).toHaveCount(0);
    await expect(scratchRows(region, scratch.dir)).toHaveCount(0);

    const listing = await getScratchListing(page, daemon, session.id);
    expect(listing?.dir).toBe(scratch.dir);
    expect(listing?.files.map((f) => f.path)).toEqual(["findings.md"]);

    await summary.click();
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    await expect(noPlanText(region)).toHaveText("no plan yet");
    const row = scratchRow(region, "findings.md");
    await expect(row).toBeVisible();
    await expect(row).toContainText("tmp");
    await expect(row).toHaveAttribute("title", findings);
    await expect(tmpChip(region)).toHaveText("1 tmp");

    await row.click();
    await expect(renderedBody(region)).toContainText("Scratch marker one");
    await expect(docBar(region).locator(".badge")).toHaveText("tmp");
    await expect(barFileName(region)).toHaveText("findings.md");
    await expect(barPath(region)).toHaveText(findings);
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(row.locator(".dot")).toHaveCount(0);
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("a routed Write hook naming a new .md in the scratchpad moves the chip from 1 tmp to 2 tmp with one silent listing re-fetch, the new row on top and the open file untouched (E2, REQ-6, REQ-11, REQ-9, edge case 13)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-e2";
  const scratch = await makeScratchpad(claudeId);
  try {
    const older = await scratch.write(
      "findings.md",
      "# Findings\n\nFirst marker.\n",
      new Date("2026-11-01T09:00:00Z"),
    );
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-e2",
      claudeSessionId: claudeId,
      scratch,
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-e2");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await unfoldClaudeSection(region);
    await scratchRow(region, "findings.md").click();
    await expect(renderedBody(region)).toContainText("First marker");

    const tracker = new ReaderRequestTracker(page);
    const second = await scratch.write("second.md", "# Second\n\nSecond marker.\n");
    await postHook(
      page,
      daemon,
      withScratchpad(
        rawPostToolUse(claudeId, { toolName: "Write", filePath: second }),
        scratch.dir,
      ),
    );

    await expect(tmpChip(region)).toHaveText("2 tmp");
    await expect(scratchRows(region, scratch.dir)).toHaveCount(2);
    await expect.poll(() => claudeRowOrder(region, scratch.dir)).toEqual([second, older]);
    await expect(scratchRow(region, "second.md")).toContainText("now");

    await settleFor(page, 1_000);
    expect(tracker.listingRequests).toBe(1);
    expect(tracker.fileRequests).toBe(0);
    await expect(renderedBody(region)).toContainText("First marker");
    await expect(renderedBody(region)).not.toHaveAttribute("aria-busy", "true");
    await expect(barFileName(region)).toHaveText("findings.md");
    await expect(scratchRow(region, "findings.md")).toHaveAttribute("aria-current", "true");
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("a routed Write hook naming a non-markdown file in the scratchpad adds no row and causes no re-fetch, while a later .md write is picked up (D7, edge case 11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-json";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n");
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-json",
      claudeSessionId: claudeId,
      scratch,
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-json");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    const tracker = new ReaderRequestTracker(page);

    const json = await scratch.write("data.json", '{"k": 1}\n');
    await postHook(
      page,
      daemon,
      withScratchpad(rawPostToolUse(claudeId, { toolName: "Write", filePath: json }), scratch.dir),
    );
    const md = await scratch.write("later.md", "# Later\n");
    await postHook(
      page,
      daemon,
      withScratchpad(rawPostToolUse(claudeId, { toolName: "Write", filePath: md }), scratch.dir),
    );

    await expect(tmpChip(region)).toHaveText("2 tmp");
    await settleFor(page, 1_000);
    expect(tracker.listingRequests).toBe(1);
    await unfoldClaudeSection(region);
    await expect(scratchRow(region, "data.json")).toHaveCount(0);
    await expect(scratchRows(region, scratch.dir)).toHaveCount(2);
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("a /clear pair naming a new empty scratchpad drops the tmp chip while the open scratch file stays open, and a straggler from the old id never moves the folder back (E3, REQ-2, REQ-11, D2, D3, INV-1, INV-2, edge cases 3-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const oldId = "claude-scratch-e3-old";
  const newId = "claude-scratch-e3-new";
  const oldScratch = await makeScratchpad(oldId);
  const newScratch = await makeScratchpad(newId);
  try {
    const oldFile = await oldScratch.write("findings.md", "# Findings\n\nPre-clear marker.\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-e3",
      claudeSessionId: oldId,
      scratch: oldScratch,
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-e3");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await unfoldClaudeSection(region);
    await scratchRow(region, "findings.md").click();
    await expect(renderedBody(region)).toContainText("Pre-clear marker");
    const tracker = new ReaderRequestTracker(page);

    await postHook(page, daemon, withScratchpad(rawSessionEnd(oldId, "clear"), oldScratch.dir));
    await postHook(
      page,
      daemon,
      withScratchpad(
        envelopedSessionStart(newId, {
          ...(await envelopeOpts(session, daemon)),
          source: "clear",
        }),
        newScratch.dir,
      ),
    );

    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(newScratch.dir);
    await expect(tmpChip(region)).toHaveCount(0);
    await expect(claudeSummary(region)).toBeVisible();
    await expect(scratchRows(region, oldScratch.dir)).toHaveCount(0);
    expect((await getScratchListing(page, daemon, session.id))?.files).toEqual([]);
    expect(tracker.listingRequests).toBe(1);
    await expect(barFileName(region)).toHaveText("findings.md");
    await expect(renderedBody(region)).toContainText("Pre-clear marker");
    expect((await getReaderFile(page, daemon.baseURL, session.id, oldFile)).status).toBe(404);

    const straggler = await envelopeHook(
      session,
      daemon,
      withScratchpad(
        rawPostToolUse(oldId, { toolName: "Write", filePath: oldFile, promptId: "p-old" }),
        oldScratch.dir,
      ),
    );
    await postHook(page, daemon, straggler);
    await awaitHooksApplied(page, daemon, session, newId);
    expect(await getScratchpadDir(page, daemon, session.id)).toBe(newScratch.dir);
    await expect(tmpChip(region)).toHaveCount(0);
  } finally {
    await oldScratch.cleanup();
    await newScratch.cleanup();
    await cleanup();
  }
});

test("a /clear pair reordered, with the SessionStart applied before the late SessionEnd naming the old folder, leaves the folder on the new one (D3, edge case 4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const oldId = "claude-scratch-reorder-old";
  const newId = "claude-scratch-reorder-new";
  const oldScratch = await makeScratchpad(oldId);
  const newScratch = await makeScratchpad(newId);
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-reorder",
      claudeSessionId: oldId,
      scratch: oldScratch,
    });
    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(oldScratch.dir);

    await postHook(
      page,
      daemon,
      withScratchpad(
        envelopedSessionStart(newId, {
          ...(await envelopeOpts(session, daemon)),
          source: "clear",
        }),
        newScratch.dir,
      ),
    );
    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(newScratch.dir);

    await postHook(
      page,
      daemon,
      await envelopeHook(
        session,
        daemon,
        withScratchpad(rawSessionEnd(oldId, "clear"), oldScratch.dir),
      ),
    );
    await awaitHooksApplied(page, daemon, session, newId);
    expect(await getScratchpadDir(page, daemon, session.id)).toBe(newScratch.dir);
  } finally {
    await oldScratch.cleanup();
    await newScratch.cleanup();
    await cleanup();
  }
});

test("ending a session keeps its claude section with the plan and scratch rows openable while a second live session's scratchpad is untouched (E4, REQ-12, D4, edge case 7)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  const idA = "claude-scratch-e4-a";
  const idB = "claude-scratch-e4-b";
  const scratchA = await makeScratchpad(idA);
  const scratchB = await makeScratchpad(idB);
  try {
    const fileA = await scratchA.write("findings.md", "# Findings\n\nEnded-session marker.\n");
    await scratchB.write("other.md", "# Other\n");
    const planPath = join(daemon.dataDir, "plans", "scratch-e4.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Plan\n\nEnded-plan marker.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "scratch-e4.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });

    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchWithScratchpad(page, daemon, {
      directory: dirA.path,
      title: "scratch-e4-a",
      claudeSessionId: idA,
      scratch: scratchA,
      transcriptPath,
    });
    const sessionB = await launchWithScratchpad(page, daemon, {
      directory: dirB.path,
      title: "scratch-e4-b",
      claudeSessionId: idB,
      scratch: scratchB,
    });
    await expect.poll(() => getScratchpadDir(page, daemon, sessionB.id)).toBe(scratchB.dir);

    await sessionCard(page, "scratch-e4-a").click();
    const ended = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionA.id}/end`);
    expect(ended.status()).toBe(200);
    await expect(page.locator("#dead-surface")).toBeVisible();

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-e4-a");
    await expect(claudeSummary(region)).toBeVisible();
    await expect(planChip(region)).toBeVisible();
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await unfoldClaudeSection(region);

    await planSlotEntry(region).click();
    await expect(renderedBody(region)).toContainText("Ended-plan marker");
    await expect(docBar(region).locator(".badge")).toHaveText("plan");
    await scratchRow(region, "findings.md").click();
    await expect(renderedBody(region)).toContainText("Ended-session marker");
    await expect(docBar(region).locator(".badge")).toHaveText("tmp");
    await expect(barPath(region)).toHaveText(fileA);

    expect(await getScratchpadDir(page, daemon, sessionA.id)).toBe(scratchA.dir);
    expect(await getScratchpadDir(page, daemon, sessionB.id)).toBe(scratchB.dir);
    expect((await getScratchListing(page, daemon, sessionB.id))?.files.map((f) => f.path)).toEqual([
      "other.md",
    ]);

    await sessionCard(page, "scratch-e4-b").click();
    await mainheadSurfaceButton(page, "docs").click();
    const regionB = readerRegion(page, "scratch-e4-b");
    await expect(tmpChip(regionB)).toHaveText("1 tmp");
    await unfoldClaudeSection(regionB);
    await expect(scratchRow(regionB, "other.md")).toBeVisible();
  } finally {
    await scratchA.cleanup();
    await scratchB.cleanup();
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("after a daemon restart an ended session keeps its scratchpad folder and its claude section still lists and opens the file (D4, REQ-2, REQ-12, edge case 7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-restart";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n\nSurvived marker.\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-restart",
      claudeSessionId: claudeId,
      scratch,
    });
    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(scratch.dir);
    const ended = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(ended.status()).toBe(200);
    await expect(page.locator("#dead-surface")).toBeVisible();

    await daemon.restart();
    await page.reload();
    await expect(page.locator("#connection-status")).toHaveText(/connected/i);

    expect(await getScratchpadDir(page, daemon, session.id)).toBe(scratch.dir);
    expect((await getScratchListing(page, daemon, session.id))?.files.map((f) => f.path)).toEqual([
      "findings.md",
    ]);
    await sessionCard(page, "scratch-restart").click();
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-restart");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await unfoldClaudeSection(region);
    await scratchRow(region, "findings.md").click();
    await expect(renderedBody(region)).toContainText("Survived marker");
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("the file route serves a session's own scratch .md and answers 404 not_found for a non-markdown file, the tasks folder beside it, an escaping symlink and another live session's scratch file (D6, REQ-5, INV-2, edge cases 9-12)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB, outside] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  const idA = "claude-scratch-route-a";
  const idB = "claude-scratch-route-b";
  const scratchA = await makeScratchpad(idA);
  const scratchB = await makeScratchpad(idB);
  try {
    const own = await scratchA.write("findings.md", "# Findings\n\nOwn marker.\n");
    const nested = await scratchA.write("notes/options.md", "# Options\n\nNested marker.\n");
    const json = await scratchA.write("data.json", '{"k": 1}\n');
    const tasksMd = await scratchA.writeBeside("tasks/report.md", "# Tasks\n");
    const otherSessions = await scratchB.write("theirs.md", "# Theirs\n\nOther marker.\n");
    const outsideMd = join(outside.path, "outside.md");
    await writeFile(outsideMd, "# outside\n");
    await symlink(outsideMd, join(scratchA.dir, "escape.md"));

    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchWithScratchpad(page, daemon, {
      directory: dirA.path,
      title: "scratch-route-a",
      claudeSessionId: idA,
      scratch: scratchA,
    });
    const sessionB = await launchWithScratchpad(page, daemon, {
      directory: dirB.path,
      title: "scratch-route-b",
      claudeSessionId: idB,
      scratch: scratchB,
    });
    await expect.poll(() => getScratchpadDir(page, daemon, sessionA.id)).toBe(scratchA.dir);
    await expect.poll(() => getScratchpadDir(page, daemon, sessionB.id)).toBe(scratchB.dir);

    const get = (id: number, path: string) => getReaderFile(page, daemon.baseURL, id, path);

    const served = await get(sessionA.id, own);
    expect(served.status).toBe(200);
    expect(served.body).toContain("Own marker");
    const servedNested = await get(sessionA.id, nested);
    expect(servedNested.status).toBe(200);
    expect(servedNested.body).toContain("Nested marker");

    for (const [what, path, id] of [
      ["a non-markdown file in the scratchpad", json, sessionA.id],
      ["the tasks folder beside the scratchpad", tasksMd, sessionA.id],
      ["a dot-dot path out of the scratchpad", `${scratchA.dir}/../tasks/report.md`, sessionA.id],
      ["a symlink escaping the scratchpad", join(scratchA.dir, "escape.md"), sessionA.id],
      ["another session's scratch file through this session's route", otherSessions, sessionA.id],
      ["this session's scratch file through another session's route", own, sessionB.id],
    ] as const) {
      const res = await get(id, path);
      expect(res.status, what).toBe(404);
      expect(res.body, what).toContain("not_found");
    }

    const theirsOnTheirs = await get(sessionB.id, otherSessions);
    expect(theirsOnTheirs.status).toBe(200);
    expect(theirsOnTheirs.body).toContain("Other marker");
  } finally {
    await scratchA.cleanup();
    await scratchB.cleanup();
    await Promise.all([dirA.cleanup(), dirB.cleanup(), outside.cleanup()]);
  }
});

test("a malformed, relative, wrong-parent or null scratchpad_dir leaves the scratchpad unset with no tmp chip and a null scratch block, and a well-formed one then sets it (D1, REQ-1, INV-1, edge cases 1-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-malformed";
  const scratch = await makeScratchpad(claudeId);
  const other = await makeScratchpad("claude-scratch-someone-else");
  try {
    await scratch.write("findings.md", "# Findings\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-malformed",
      claudeSessionId: claudeId,
      scratch: null,
    });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-malformed");
    await expect(noPlanChip(region)).toBeVisible();

    const malformed: [string, string | null][] = [
      ["null, as a -p session sends", null],
      ["the /tmp/scratchpad shape of older payloads", "/tmp/scratchpad"],
      ["a relative path", "claude-501/-cwd/claude-scratch-malformed/scratchpad"],
      ["a trailing slash", `${scratch.dir}/`],
      ["an unclean path", `${scratch.sessionFolder}/./scratchpad`],
      ["a parent named for another session", other.dir],
      ["a last element other than scratchpad", join(scratch.sessionFolder, "tasks")],
    ];
    for (const [what, value] of malformed) {
      await postHook(
        page,
        daemon,
        withScratchpad(rawPostToolUse(claudeId, { toolName: "Read" }), value),
      );
      await awaitHooksApplied(page, daemon, session, claudeId);
      expect(await getScratchpadDir(page, daemon, session.id), what).toBeNull();
    }
    expect(await getScratchListing(page, daemon, session.id)).toBeNull();
    await expect(tmpChip(region)).toHaveCount(0);
    await expect(noPlanChip(region)).toBeVisible();

    await postHook(
      page,
      daemon,
      withScratchpad(rawPostToolUse(claudeId, { toolName: "Read" }), scratch.dir),
    );
    await expect.poll(() => getScratchpadDir(page, daemon, session.id)).toBe(scratch.dir);
    await expect(tmpChip(region)).toHaveText("1 tmp");
  } finally {
    await scratch.cleanup();
    await other.cleanup();
    await cleanup();
  }
});

test("a null scratchpad_dir arriving after a well-formed one never clears the folder or the chip (REQ-2, edge case 1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-never-cleared";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-never-cleared",
      claudeSessionId: claudeId,
      scratch,
    });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-never-cleared");
    await expect(tmpChip(region)).toHaveText("1 tmp");

    await postHook(
      page,
      daemon,
      withScratchpad(rawPostToolUse(claudeId, { toolName: "Read" }), null),
    );
    await awaitHooksApplied(page, daemon, session, claudeId);
    expect(await getScratchpadDir(page, daemon, session.id)).toBe(scratch.dir);
    await expect(tmpChip(region)).toHaveText("1 tmp");
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("with a plan and scratch files the folded row carries the plan and 3 tmp chips and unfolding lists the plan row then the .md files newest first, nested and upper-case included, hidden, non-markdown and tasks files left out (REQ-4, REQ-7, REQ-9, REQ-10, REQ-13, D5, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-list";
  const scratch = await makeScratchpad(claudeId);
  try {
    await buildMarkdownFixtureTree(dir);
    const middle = await scratch.write("b.md", "# B\n", FIXED_MIDDLE);
    const newer = await scratch.write("notes/a.md", "# A\n\nNested scratch marker.\n", FIXED_NEWER);
    const older = await scratch.write("UPPER.MD", "# Upper\n", FIXED_OLDER);
    await scratch.write(".hidden/x.md", "# hidden\n");
    await scratch.write("data.json", "{}\n");
    await scratch.writeBeside("tasks/report.md", "# tasks\n");
    const planPath = join(daemon.dataDir, "plans", "scratch-list.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Plan\n\nPlan marker.\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "scratch-list.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });

    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-list",
      claudeSessionId: claudeId,
      scratch,
      transcriptPath,
    });

    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-list");
    await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "false");
    await expect(planChip(region)).toBeVisible();
    await expect(noPlanChip(region)).toHaveCount(0);
    await expect(tmpChip(region)).toHaveText("3 tmp");
    await expect(planSlotEntry(region)).toHaveCount(0);
    await expect(scratchRows(region, scratch.dir)).toHaveCount(0);

    const listing = await getScratchListing(page, daemon, session.id);
    expect(listing?.files.map((f) => f.path)).toEqual(["notes/a.md", "b.md", "UPPER.MD"]);
    expect(listing?.files.map((f) => Date.parse(f.modifiedAt))).toEqual([
      FIXED_NEWER.getTime(),
      FIXED_MIDDLE.getTime(),
      FIXED_OLDER.getTime(),
    ]);

    await claudeSummary(region).click();
    await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() => claudeRowOrder(region, scratch.dir))
      .toEqual(["plan", newer, middle, older]);
    await expect(scratchRow(region, ".hidden")).toHaveCount(0);
    await expect(scratchRow(region, "data.json")).toHaveCount(0);
    await expect(scratchRow(region, "report.md")).toHaveCount(0);
    await expect(planSlotEntry(region)).toContainText("now");

    const badge = docBar(region).locator(".badge");
    await fileEntry(region, "TODO.md").click();
    await expect(renderedBody(region)).toContainText("TODO");
    await expect(badge).toHaveCount(0);

    await scratchRow(region, "notes/a.md").click();
    await expect(renderedBody(region)).toContainText("Nested scratch marker");
    await expect(badge).toHaveText("tmp");
    await expect(scratchRow(region, "notes/a.md")).toHaveAttribute("aria-current", "true");
    await expect(scratchRow(region, "b.md")).not.toHaveAttribute("aria-current", "true");
    await expect(planSlotEntry(region)).not.toHaveAttribute("aria-current", "true");

    await planSlotEntry(region).click();
    await expect(renderedBody(region)).toContainText("Plan marker");
    await expect(badge).toHaveText("plan");
    await expect(scratchRow(region, "notes/a.md")).not.toHaveAttribute("aria-current", "true");
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("the unfolded claude section is toggled by Enter and Space, and the summary row and a scratch row keep focus on the same node across a render tick and an unrelated session update (focus identity, REQ-8, REQ-10)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-focus";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n\nFocus marker.\n");
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-focus",
      claudeSessionId: claudeId,
      scratch,
    });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-focus");
    const summary = claudeSummary(region);
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await expect(summary).toHaveAttribute("aria-expanded", "false");

    await summary.focus();
    await expect(summary).toBeFocused();
    const summaryNode = await summary.elementHandle();
    if (!summaryNode) throw new Error("claude summary row not found");
    await page.keyboard.press("Enter");
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    await settleFor(page, 1_100);
    await expect(summary).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, summaryNode)).toBe(true);

    const row = scratchRow(region, "findings.md");
    await row.focus();
    await expect(row).toBeFocused();
    const rowNode = await row.elementHandle();
    if (!rowNode) throw new Error("scratch row not found");
    await page.keyboard.press("Enter");
    await expect(renderedBody(region)).toContainText("Focus marker");
    await expect(row).toHaveAttribute("aria-current", "true");
    await settleFor(page, 1_100);
    await expect(row).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, rowNode)).toBe(true);

    await postHook(page, daemon, rawUserPromptSubmit(claudeId));
    await settleFor(page, 1_100);
    await expect(row).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, rowNode)).toBe(true);

    await summary.focus();
    await page.keyboard.press("Space");
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await expect(scratchRows(region, scratch.dir)).toHaveCount(0);
    await expect(summary).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, summaryNode)).toBe(true);
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("a focused scratch row keeps focus on the same node when a new scratch file makes the listing re-fetch (focus identity, REQ-11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-focus-refetch";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n", new Date("2026-11-01T09:00:00Z"));
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-focus-refetch",
      claudeSessionId: claudeId,
      scratch,
    });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-focus-refetch");
    await expect(tmpChip(region)).toHaveText("1 tmp");
    await unfoldClaudeSection(region);

    const row = scratchRow(region, "findings.md");
    await row.focus();
    await expect(row).toBeFocused();
    const rowNode = await row.elementHandle();
    if (!rowNode) throw new Error("scratch row not found");

    const second = await scratch.write("second.md", "# Second\n");
    await postHook(
      page,
      daemon,
      withScratchpad(
        rawPostToolUse(claudeId, { toolName: "Write", filePath: second }),
        scratch.dir,
      ),
    );
    await expect(tmpChip(region)).toHaveText("2 tmp");
    await settleFor(page, 1_100);
    await expect(row).toBeFocused();
    expect(await page.evaluate((n) => document.activeElement === n, rowNode)).toBe(true);
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("the fold is remembered per session across a page reload, and another session still starts folded (REQ-8, W1)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  const idA = "claude-scratch-fold-a";
  const idB = "claude-scratch-fold-b";
  const scratchA = await makeScratchpad(idA);
  const scratchB = await makeScratchpad(idB);
  try {
    await scratchA.write("a.md", "# A\n");
    await scratchB.write("b.md", "# B\n");
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dirA.path,
      title: "scratch-fold-a",
      claudeSessionId: idA,
      scratch: scratchA,
    });
    await launchWithScratchpad(page, daemon, {
      directory: dirB.path,
      title: "scratch-fold-b",
      claudeSessionId: idB,
      scratch: scratchB,
    });

    await sessionCard(page, "scratch-fold-a").click();
    await mainheadSurfaceButton(page, "docs").click();
    const regionA = readerRegion(page, "scratch-fold-a");
    await expect(claudeSummary(regionA)).toHaveAttribute("aria-expanded", "false");
    await claudeSummary(regionA).click();
    await expect(scratchRow(regionA, "a.md")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("status")).toHaveText(/connected/i);

    await sessionCard(page, "scratch-fold-a").click();
    await mainheadSurfaceButton(page, "docs").click();
    await expect(claudeSummary(readerRegion(page, "scratch-fold-a"))).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(scratchRow(readerRegion(page, "scratch-fold-a"), "a.md")).toBeVisible();

    await sessionCard(page, "scratch-fold-b").click();
    await mainheadSurfaceButton(page, "docs").click();
    const regionB = readerRegion(page, "scratch-fold-b");
    await expect(claudeSummary(regionB)).toHaveAttribute("aria-expanded", "false");
    await expect(scratchRows(regionB, scratchB.dir)).toHaveCount(0);
  } finally {
    await scratchA.cleanup();
    await scratchB.cleanup();
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a plan named after the reader opened flips the plan chip from no plan to plan with no listing re-fetch (REQ-7, edge case 15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "scratch-plan" });
    await postHook(
      page,
      daemon,
      envelopedSessionStart("claude-scratch-plan-old", await envelopeOpts(session, daemon)),
    );
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-plan");
    await expect(noPlanChip(region)).toBeVisible();
    await expect(tmpChip(region)).toHaveCount(0);
    const tracker = new ReaderRequestTracker(page);

    const planPath = join(daemon.dataDir, "plans", "scratch-plan.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Plan\n");
    const transcriptPath = join(daemon.dataDir, "transcripts", "scratch-plan.jsonl");
    await writeFakeTranscript(transcriptPath, { planFilePath: planPath });
    await postHook(page, daemon, rawSessionEnd("claude-scratch-plan-old", "clear"));
    await postHook(
      page,
      daemon,
      envelopedSessionStart("claude-scratch-plan-new", {
        ...(await envelopeOpts(session, daemon)),
        source: "clear",
        transcriptPath,
      }),
    );

    await expect(planChip(region)).toBeVisible();
    await expect(noPlanChip(region)).toHaveCount(0);
    await settleFor(page, 1_000);
    expect(tracker.listingRequests).toBe(0);
  } finally {
    await cleanup();
  }
});

test("in Tiles, the docs reader of a tile shows the claude summary row and unfolding then clicking a scratch row opens the file in that tile (REQ-7, REQ-8, REQ-10, host view)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-tiles";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write("findings.md", "# Findings\n\nTile marker.\n");
    await page.goto(daemon.dashboardUrl);
    const session = await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-tiles",
      claudeSessionId: claudeId,
      scratch,
    });

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await tileSurfaceButton(page, session.id, "docs").click();
    const region = readerRegionInTile(page, session.id);
    await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "false");
    await expect(tmpChip(region)).toHaveText("1 tmp");

    await claudeSummary(region).click();
    const row = scratchRow(region, "findings.md");
    await expect(row).toBeVisible();
    await row.click();
    await expect(renderedBody(region)).toContainText("Tile marker");
    await expect(docBar(region).locator(".badge")).toHaveText("tmp");
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(navToggle(region)).toBeVisible();
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});

test("the pop-out of an open scratch file shows the claude section with its row current, and a scratch write re-fetches the listing there too (REQ-9, REQ-10, REQ-11, host view)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  const claudeId = "claude-scratch-popout";
  const scratch = await makeScratchpad(claudeId);
  try {
    await scratch.write(
      "findings.md",
      "# Findings\n\nPop-out marker.\n",
      new Date("2026-11-01T09:00:00Z"),
    );
    await page.goto(daemon.dashboardUrl);
    await launchWithScratchpad(page, daemon, {
      directory: dir,
      title: "scratch-popout",
      claudeSessionId: claudeId,
      scratch,
    });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "scratch-popout");
    await unfoldClaudeSection(region);
    await scratchRow(region, "findings.md").click();
    await expect(renderedBody(region)).toContainText("Pop-out marker");

    const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
    await popup.waitForLoadState();
    const popRegion = readerRegion(popup, "scratch-popout");
    await expect(renderedBody(popRegion)).toContainText("Pop-out marker");
    await expect(tmpChip(popRegion)).toHaveText("1 tmp");
    await unfoldClaudeSection(popRegion);
    await expect(scratchRow(popRegion, "findings.md")).toHaveAttribute("aria-current", "true");

    const second = await scratch.write("second.md", "# Second\n");
    await postHook(
      page,
      daemon,
      withScratchpad(
        rawPostToolUse(claudeId, { toolName: "Write", filePath: second }),
        scratch.dir,
      ),
    );
    await expect(tmpChip(popRegion)).toHaveText("2 tmp");
    await expect(scratchRow(popRegion, "second.md")).toBeVisible();
    await expect(renderedBody(popRegion)).toContainText("Pop-out marker");
  } finally {
    await scratch.cleanup();
    await cleanup();
  }
});
