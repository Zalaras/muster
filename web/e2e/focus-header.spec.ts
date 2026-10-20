// Plan title-crop-stop-resume-button — REQ-1 to REQ-7 (the Focus header's readout is as wide
// as its text and gives way before the title; the surface switch sits with the actions in
// one right-aligned cluster; Stop and Resume are one button that swaps in place without a
// layout shift). Plan acceptance E1-E7; E6's live-session half and E8's rewrites live in
// actions.spec.ts, theme.spec.ts, card-location.spec.ts and rename.spec.ts.
//
// The journeys: a real Stop, Resume or Enter swapping the one button in place (its node
// identity through the transition), the disabled button across a WebSocket drop, a rename and
// a Claude move lengthening the row, the surface switch's focus across a hook re-render, and
// Tiles and back. What the header shows for a given state — the E3 give-way sweeps over the
// state-table rows, the 35-character folder's whole line, the stacked band at 640 px, the INV-6
// sweeps comparing the header alive with the same session ended, the cluster's order at three
// widths and the unbound dead session's disabled Resume (E3, E5, REQ-1 to REQ-4) — moved to the
// render tier on 2026-10-20: web/render/focus.spec.ts against the `focus-header-rows-*` and
// `unbound-sessions` fixtures (plans/_audit/relevel/focus.md). The one E3 row left here has the
// `shell` segment selected, which spawns a shell over the API.
//
// Fixture plan: `daemon` (fresh per test) in every test, as the plan's header says — each
// launches the only session and relies on auto-focus, and the file passes `repoPoll: "200ms"`
// through `test.use` so a checkout and a Claude move show inside the 15 s expect timeout.
//
// Claude Code is faked: a bind is the enveloped `SessionStart` a real `claude` posts first, a
// move is a main-agent hook whose `cwd` names another checkout, a long title is the status
// line's `session_name` (the daemon caps a rename at 100 characters), a branch is real `git`
// in the scratch repo. Every shape is a builder from helpers/payloads.ts.
//
// The invariants are asserted by sweeps in 16 px steps, never at chosen widths
// (kb:lesson/layout-invariant-needs-its-width-range).
import {
  addClaudeWorktree,
  git,
  hookMover,
  mainheadClaudeAt,
  mainheadFitProblems,
  railCardByTitle,
  type ScratchRepo,
  scratchRepo,
} from "./helpers/card-location";
import {
  type Box,
  boxOf,
  clusterShiftProblems,
  endedAgeAbsentProblems,
  endedAgeProblems,
  focusedNode,
  headerButton,
  headerInvariantProblems,
  headerStopResume,
  onTwoRows,
  rectOf,
  readHeaderSnapshot,
  sameBox,
  settleLayout,
  settledSnapshot,
  sweepHeader,
  tagNode,
} from "./helpers/focus-header";
import {
  type APIRequestContext,
  expect,
  type Page,
  type ScratchDaemon,
  settleFor,
  test,
} from "./helpers/fixtures";
import { createGroupViaApi } from "./helpers/groups";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import {
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  mainheadRenameButton,
  mainheadRenameField,
  type SessionObject,
} from "./helpers/session";
import { mainheadSurfaceButton, mainheadSurfaceGroup } from "./helpers/shell";

test.use({ daemonOptions: { repoPoll: "200ms" } });

const FULL_MODEL_ID = "claude-haiku-4-5-20251001";
const NO_CLAUDE_ID_REASON = "Can't resume — this session never started a Claude conversation.";

/** `text` cut to exactly `n` characters, the last one never a space. */
function exactly(text: string, n: number): string {
  const body = text.repeat(Math.ceil(n / text.length)).slice(0, n - 1);
  return `${body}x`;
}

const TITLE_9 = "Game Play";
const TITLE_52 = exactly("rework shift-swap approval for the weekend rostering ", 52);
const FOLDER_6 = "abc123";
const FOLDER_35 = "economic-game-theory-simulation-lab";
const FOLDER_60 = "long-folder-name-for-wrapping-".repeat(2);
const BRANCH_4 = "main";

interface Row {
  label: string;
  title: string;
  folder: string;
  branch: string;
  grouped: boolean;
  moved: boolean;
  dead: boolean;
  /** Launched in bypass mode, so the danger chip follows the name (edge case 13). */
  bypass?: boolean;
  /** The `shell` segment selected while the header wraps (edge case 14). */
  shell?: boolean;
  /** A status line carries the full model id as the display name, the widest model readout. */
  fullModel?: boolean;
}

// The one state-table row swept here: the `shell` segment selected while the header wraps
// (edge case 14). Selecting it spawns a shell over the API, which the render tier cannot do;
// the other rows are swept in web/render/focus.spec.ts.
const ROWS: Row[] = [
  {
    label: "title 52, folder 60, branch 4, moved, alive, ungrouped, shell segment selected",
    title: TITLE_52,
    folder: FOLDER_60,
    branch: BRANCH_4,
    grouped: false,
    moved: true,
    dead: false,
    shell: true,
  },
];

/** The session's display title lands via the status line when it is over the rename cap. */
const OVER_RENAME_CAP = 100;

/** Launches a bound session on a scratch repo shaped by `row`, Focus open at 1280x800. */
async function openRow(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  repo: ScratchRepo,
  row: Row,
  claudeId: string,
): Promise<SessionObject> {
  if (row.branch !== BRANCH_4) await git(repo.path, "checkout", "-b", row.branch);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(daemon.dashboardUrl);
  const long = row.title.length > OVER_RENAME_CAP;
  const session = await launchSession(page, daemon, {
    directory: repo.path,
    ...(long ? {} : { title: row.title }),
    ...(row.bypass ? { permissionMode: "bypassPermissions" as const } : {}),
  });
  const envelope = await envelopeOpts(session, daemon);
  const bind = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, { ...envelope, cwd: repo.path }),
  });
  expect(bind.status()).toBe(200);
  if (long || row.fullModel) {
    // A status line with no model rename: the display name stays the full id, the widest model.
    const status = await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        ...envelope,
        ...(long ? { sessionName: row.title } : {}),
        model: { id: FULL_MODEL_ID, displayName: FULL_MODEL_ID },
      }),
    });
    expect(status.status()).toBe(200);
  }
  if (row.grouped) await createGroupViaApi(page, daemon, "Game", [session.id]);

  await expect(mainheadRenameButton(page)).toHaveText(row.title);
  await expect(page.locator("#mainhead .meta .loc .repo .rf")).toHaveText(`${repo.name} /`);
  await expect(page.locator("#mainhead .meta .loc .repo .rb")).toHaveText(row.branch);
  if (row.bypass) await expect(page.locator("#mainhead .chip-danger")).toHaveText("bypass");
  if (row.moved) {
    const worktree = await addClaudeWorktree(repo, "probe-worktree");
    await hookMover(request, daemon, claudeId)(worktree.path);
    await expect(mainheadClaudeAt(page)).not.toHaveAttribute("hidden");
  }
  if (row.dead) {
    const end = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(end.status()).toBe(200);
    await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
    await expect(headerButton(page, "Resume")).toBeEnabled();
  } else {
    await expect(headerButton(page, "Stop")).toBeEnabled();
  }
  if (row.shell) {
    await mainheadSurfaceButton(page, "shell").click();
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "true");
  }
  return session;
}

/** A launched session bound to a Claude id, the only one on its daemon, Focus open. */
async function launchBound(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  repo: ScratchRepo,
  title: string,
  claudeId: string,
): Promise<SessionObject> {
  await page.goto(daemon.dashboardUrl);
  const session = await launchSession(page, daemon, { directory: repo.path, title });
  const bind = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, {
      ...(await envelopeOpts(session, daemon)),
      cwd: repo.path,
    }),
  });
  expect(bind.status()).toBe(200);
  await expect(mainheadRenameButton(page)).toHaveText(title);
  return session;
}

async function confirmStop(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Stop session?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stop session" }).click();
  await expect(dialog).toBeHidden();
}

// ---------------------------------------------------------------------------------------
// E3 — the give-way order and its invariants, swept
// ---------------------------------------------------------------------------------------

for (const row of ROWS) {
  test(`sweeping the window from 2000px to 600px and back in 16px steps, the Focus header holds INV-1 to INV-4 and INV-8 and retraces its give-way order: ${row.label} (E3, REQ-1, REQ-2, REQ-3, REQ-7)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = await scratchRepo(row.folder);
    try {
      await openRow(page, request, daemon, repo, row, "claude-fh-sweep");
      await sweepHeader(page, row.label, async () => await mainheadFitProblems(page));
    } finally {
      await repo.cleanup();
    }
  });
}

// ---------------------------------------------------------------------------------------
// E1, E2 — the one button swaps in place
// ---------------------------------------------------------------------------------------

test("clicking Stop in the header and confirming turns that same element into an enabled Resume in the same box, with Remove unmoved (E1, REQ-5, REQ-6, INV-6, INV-7)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    const session = await launchBound(page, request, daemon, repo, "swap-stop", "claude-fh-e1");

    const button = headerStopResume(page);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText("Stop");
    await expect(button).toBeEnabled();
    await expect(headerButton(page, "Resume")).toHaveCount(0);
    await tagNode(button, "stop-resume");
    const stopBox = await boxOf(button);
    const removeBefore = await boxOf(headerButton(page, "Remove"));

    await button.click();
    await confirmStop(page);

    const same = page.locator('#mainhead [data-e2e-node="stop-resume"]');
    await expect(same).toHaveText("Resume");
    await expect(same).toBeEnabled();
    // INV-7: still exactly one of the two, and it is the element that read Stop.
    await expect(headerStopResume(page)).toHaveCount(1);
    await expect(headerStopResume(page)).toHaveAttribute("data-e2e-node", "stop-resume");
    await expect(headerButton(page, "Stop")).toHaveCount(0);
    // INV-6: both sides re-read inside the retry, so a layout still settling times out.
    await expect
      .poll(async () => sameBox(await boxOf(same), stopBox), {
        message: "the Resume box equals the Stop box",
      })
      .toBe(true);
    await expect
      .poll(async () => sameBox(await boxOf(headerButton(page, "Remove")), removeBefore), {
        message: "Remove did not move when Stop became Resume",
      })
      .toBe(true);
    expect(findSession(await getState(page, daemon), session.id).alive).toBe(false);
  } finally {
    await repo.cleanup();
  }
});

test("clicking Resume in the header on a dead session turns that same element into Stop once the session is alive, in the same box, with Remove unmoved (E2, REQ-5, REQ-6, INV-6, INV-7)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    const session = await launchBound(page, request, daemon, repo, "swap-resume", "claude-fh-e2");
    const end = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(end.status()).toBe(200);

    const button = headerStopResume(page);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText("Resume");
    await expect(button).toBeEnabled();
    await expect(headerButton(page, "Stop")).toHaveCount(0);
    await tagNode(button, "stop-resume");
    const resumeBox = await boxOf(button);
    const removeBefore = await boxOf(headerButton(page, "Remove"));

    await button.click();
    // No confirm dialog for Resume.
    await expect(page.getByRole("dialog", { name: "Stop session?" })).toBeHidden();

    const same = page.locator('#mainhead [data-e2e-node="stop-resume"]');
    await expect(same).toHaveText("Stop");
    await expect(same).toBeEnabled();
    await expect(headerStopResume(page)).toHaveCount(1);
    await expect(headerStopResume(page)).toHaveAttribute("data-e2e-node", "stop-resume");
    await expect(headerButton(page, "Resume")).toHaveCount(0);
    await expect
      .poll(async () => sameBox(await boxOf(same), resumeBox), {
        message: "the Stop box equals the Resume box",
      })
      .toBe(true);
    await expect
      .poll(async () => sameBox(await boxOf(headerButton(page, "Remove")), removeBefore), {
        message: "Remove did not move when Resume became Stop",
      })
      .toBe(true);
    expect(findSession(await getState(page, daemon), session.id).alive).toBe(true);
  } finally {
    await repo.cleanup();
  }
});

// A focus round-trip with a real key (never `locator.press()`, which bundles focus and key):
// Resume needs no dialog, so the label swaps under the focused element, which must stay
// focused and be the same node through the swap and a render tick
// (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
test("the header's Resume keeps focus and node identity when a real Enter resumes the session and the label becomes Stop, then across a tick (REQ-5, REQ-6)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    const session = await launchBound(page, request, daemon, repo, "swap-keys", "claude-fh-keys");
    const end = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(end.status()).toBe(200);

    const button = headerStopResume(page);
    await expect(button).toHaveText("Resume");
    await expect(button).toBeEnabled();
    await tagNode(button, "stop-resume");
    await button.focus();
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "stop-resume" });

    await page.keyboard.press("Enter");
    await expect(button).toHaveText("Stop");
    await expect
      .poll(() => focusedNode(page), { message: "focus stays on the node that swapped labels" })
      .toEqual({ tag: "BUTTON", node: "stop-resume" });

    // A stays-unchanged hold: the render tick itself is under test.
    await settleFor(page, 1_400);
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "stop-resume" });
    await expect(headerStopResume(page)).toHaveText("Stop");
  } finally {
    await repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------
// INV-6 across a real Stop and Resume at the narrow widths (review cycle 1, browser Major 1)
//
// E1 and E2 above prove the swap at 1600 px, where the header is one row and the ended clause
// has room, so they could not fail for the shift the review measured below 784 px (the ended
// clause took a row of its own and pushed the cluster down 13 px). The 16 px sweeps comparing
// the header alive with the same session ended at every width are render tests now
// (web/render/focus.spec.ts); the clicks below keep the transition itself under test at the
// widths the review measured, tagging the node so the element that read Stop is the one that
// reads Resume.
// ---------------------------------------------------------------------------------------

const SWAP_CLICKS: { title: string; label: string; viewport: number }[] = [
  { title: TITLE_9, label: "title 9", viewport: 784 },
  { title: TITLE_9, label: "title 9", viewport: 600 },
  { title: TITLE_52, label: "title 52", viewport: 600 },
];

for (const { title, label, viewport } of SWAP_CLICKS) {
  test(`at ${viewport}px with a ${label} a Stop and then a Resume in the header leave Remove, the button and the header where they were, with the ended age under the model while stopped (E1, E2, REQ-6, INV-6)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = await scratchRepo(FOLDER_35);
    try {
      await page.setViewportSize({ width: viewport, height: 800 });
      const session = await launchBound(
        page,
        request,
        daemon,
        repo,
        title,
        "claude-fh-swap-narrow",
      );

      const button = headerStopResume(page);
      await expect(button).toHaveText("Stop");
      await tagNode(button, "stop-resume");
      const alive = await settledSnapshot(page, viewport);
      expect(await endedAgeAbsentProblems(page)).toEqual([]);

      await button.click();
      await confirmStop(page);
      const same = page.locator('#mainhead [data-e2e-node="stop-resume"]');
      await expect(same).toHaveText("Resume");
      await expect
        .poll(
          async () => [
            ...clusterShiftProblems(alive, await settledSnapshot(page, viewport)),
            ...(await endedAgeProblems(page)),
          ],
          { message: `the header after a Stop at ${viewport}px` },
        )
        .toEqual([]);
      expect(findSession(await getState(page, daemon), session.id).alive).toBe(false);

      await same.click();
      await expect(same).toHaveText("Stop");
      await expect
        .poll(
          async () => [
            ...clusterShiftProblems(alive, await settledSnapshot(page, viewport)),
            ...(await endedAgeAbsentProblems(page)),
          ],
          { message: `the header after a Resume at ${viewport}px` },
        )
        .toEqual([]);
      expect(findSession(await getState(page, daemon), session.id).alive).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });
}

test("at 600px a real Enter on the header's Resume swaps the label to Stop with focus, node identity, Remove, the button and the header all unmoved (REQ-5, REQ-6, INV-6)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo(FOLDER_35);
  try {
    await page.setViewportSize({ width: 600, height: 800 });
    const session = await launchBound(
      page,
      request,
      daemon,
      repo,
      TITLE_9,
      "claude-fh-keys-narrow",
    );
    const end = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(end.status()).toBe(200);

    const button = headerStopResume(page);
    await expect(button).toHaveText("Resume");
    await expect(button).toBeEnabled();
    await expect.poll(async () => await endedAgeProblems(page)).toEqual([]);
    const dead = await settledSnapshot(page, 600);
    await tagNode(button, "stop-resume");
    await button.focus();
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "stop-resume" });

    await page.keyboard.press("Enter");
    await expect(button).toHaveText("Stop");
    await expect
      .poll(() => focusedNode(page), { message: "focus stays on the node that swapped labels" })
      .toEqual({ tag: "BUTTON", node: "stop-resume" });
    await expect
      .poll(async () => clusterShiftProblems(dead, await settledSnapshot(page, 600)), {
        message: "the header after a Resume at 600px",
      })
      .toEqual([]);

    // A stays-unchanged hold: the render tick itself is under test.
    await settleFor(page, 1_400);
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "stop-resume" });
    expect(clusterShiftProblems(dead, await settledSnapshot(page, 600))).toEqual([]);
    expect(await endedAgeAbsentProblems(page)).toEqual([]);
  } finally {
    await repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------
// E6 — the disabled state across a WebSocket drop (E5, the unbound dead session's disabled
// Resume, is a render test)
// ---------------------------------------------------------------------------------------

// The WebSocket is closed from outside (not by killing the daemon, whose restart sweeps a
// dead row away) and reconnects on the client's own backoff. Resume is enabled iff connected
// and a Claude id is bound: an unbound one stays disabled after the reconnect.
test("with the WebSocket closed the header's one button is disabled under its label, and a dead session with no Claude id stays disabled after the reconnect (E6, REQ-5)", async ({
  page,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    const wsRoute: { close: (() => Promise<void>) | null } = { close: null };
    await page.routeWebSocket("**/ws", (ws) => {
      ws.connectToServer();
      wsRoute.close = () => ws.close();
      ws.onClose(() => {
        wsRoute.close = null;
      });
    });
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: repo.path,
      title: "down-unbound",
    });
    await daemon.killTmuxWindow(session.tmuxTarget);
    await page.reload();
    await railCardByTitle(page, "down-unbound").click();

    const button = headerStopResume(page);
    await expect(button).toHaveText("Resume");
    await expect(button).toBeDisabled();

    if (!wsRoute.close) throw new Error("expected the dashboard's WebSocket route to be active");
    await wsRoute.close();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(button).toHaveText("Resume");
    await expect(button).toBeDisabled();
    await expect(headerButton(page, "Remove")).toBeDisabled();

    await expect(banner).toBeHidden();
    await expect(headerStopResume(page)).toHaveText("Resume");
    await expect(headerStopResume(page)).toBeDisabled();
    await expect(headerStopResume(page)).toHaveAttribute("title", NO_CLAUDE_ID_REASON);
    await expect(headerButton(page, "Remove")).toBeEnabled();
  } finally {
    await repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------
// E4 — the right-aligned cluster stays put as the title and the readout lengthen (REQ-4's
// order and edge at three widths is a render test)
// ---------------------------------------------------------------------------------------

interface Cluster {
  surf: Box;
  stopResume: Box;
  remove: Box;
  gap: number;
  twoRows: boolean;
}

async function readCluster(page: Page): Promise<Cluster> {
  const s = await readHeaderSnapshot(page);
  if (!s?.surf || !s.stopResume || !s.remove) throw new Error("a cluster part is missing");
  return {
    surf: s.surf,
    stopResume: s.stopResume,
    remove: s.remove,
    gap: s.stopResume.left - s.surf.right,
    twoRows: onTwoRows(s),
  };
}

for (const viewport of [2000, 1000]) {
  test(`at ${viewport}px renaming to a longer title and moving Claude to lengthen the readout leaves the surface switch, Stop and Remove where they were (E4, REQ-4, INV-5)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = await scratchRepo(FOLDER_6);
    try {
      await page.setViewportSize({ width: viewport, height: 800 });
      const session = await launchBound(page, request, daemon, repo, TITLE_9, "claude-fh-e4");
      await createGroupViaApi(page, daemon, "Game", [session.id]);
      await settleLayout(page);
      const before = await readCluster(page);
      const groupBefore = (await readHeaderSnapshot(page))?.group;
      const repoBefore = (await readHeaderSnapshot(page))?.repo;

      const longTitle = exactly("a much longer title for the header ", 40);
      await mainheadRenameButton(page).click();
      await mainheadRenameField(page).fill(longTitle);
      await mainheadRenameField(page).press("Enter");
      await expect(mainheadRenameButton(page)).toHaveText(longTitle);

      await git(repo.path, "checkout", "-b", exactly("a-longer-branch-name-", 40));
      const worktree = await addClaudeWorktree(repo, "an-unusually-long-worktree-name");
      await hookMover(request, daemon, "claude-fh-e4")(worktree.path);
      await expect(mainheadClaudeAt(page)).not.toHaveAttribute("hidden");

      await settleLayout(page);
      await expect
        .poll(async () => {
          const after = await readCluster(page);
          return {
            sameRows: after.twoRows === before.twoRows,
            surf: sameBox(rectOf(after.surf), rectOf(before.surf)),
            stopLeft: Math.abs(after.stopResume.left - before.stopResume.left) <= 0.5,
            removeRight: Math.abs(after.remove.right - before.remove.right) <= 0.5,
            gap: Math.abs(after.gap - before.gap) <= 0.5,
          };
        })
        .toEqual({ sameRows: true, surf: true, stopLeft: true, removeRight: true, gap: true });

      if (viewport === 2000) {
        // User Flow 4: with room on the row, the title grows and the group control and the
        // readout move right with it, while the cluster stays put.
        const after = await readHeaderSnapshot(page);
        expect(after?.group?.left ?? 0).toBeGreaterThan((groupBefore?.left ?? 0) + 20);
        expect(after?.repo?.left ?? 0).toBeGreaterThan((repoBefore?.left ?? 0) + 20);
      }
    } finally {
      await repo.cleanup();
    }
  });
}

// A focusable control the plan moves: the surface switch now lives in `.acts`. A render
// pass (a hook upsert) and a tick must not rebuild it or drop focus
// (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
test("the surface switch's claude segment keeps focus and node identity across a hook-driven re-render and a tick, and a real Enter on it (REQ-4)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    const session = await launchBound(
      page,
      request,
      daemon,
      repo,
      "switch-focus",
      "claude-fh-switch",
    );
    const claude = mainheadSurfaceButton(page, "claude");
    await expect(claude).toHaveAttribute("aria-pressed", "true");
    await tagNode(claude, "claude-segment");
    await claude.focus();
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "claude-segment" });

    const prompt = await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-fh-switch", { promptId: "p-switch" }),
    });
    expect(prompt.status()).toBe(200);
    await expect
      .poll(async () => findSession(await getState(page, daemon), session.id).state)
      .toBe("working");
    await settleFor(page, 1_400);
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "claude-segment" });

    await page.keyboard.press("Enter");
    await expect(claude).toHaveAttribute("aria-pressed", "true");
    await settleFor(page, 1_400);
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "claude-segment" });
    await expect(mainheadSurfaceGroup(page)).toHaveCount(1);
  } finally {
    await repo.cleanup();
  }
});

// ---------------------------------------------------------------------------------------
// E7 — Tiles and back
// ---------------------------------------------------------------------------------------

test("switching to Tiles and back to Focus at 1000px leaves the header satisfying INV-1 to INV-4 with no stale measurement (E7, edge case 16)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo(FOLDER_35);
  try {
    await page.setViewportSize({ width: 1000, height: 800 });
    const session = await launchBound(page, request, daemon, repo, TITLE_52, "claude-fh-e7");
    await createGroupViaApi(page, daemon, "Game", [session.id]);

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#view-tiles")).toBeVisible();
    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.locator("#view-focus")).toBeVisible();

    await settleLayout(page);
    await expect(page.locator("#mainhead .meta .loc .repo .rf")).toHaveText(`${repo.name} /`);
    await expect
      .poll(() => headerInvariantProblems(page), {
        message: "the header after Tiles and back at 1000px",
      })
      .toEqual([]);
  } finally {
    await repo.cleanup();
  }
});
