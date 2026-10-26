// Plan title-crop-stop-resume-button — REQ-1 to REQ-7 (the Focus header's readout is as wide
// as its text and gives way before the title; the surface switch sits with the actions in
// one right-aligned cluster), and plan remove-unread-right-click-1 — REQ-4, REQ-5 (the cluster
// now holds the surface switch and one Session actions ⋯ that opens the card menu; the Stop,
// Resume and Remove buttons it held are gone). Plan acceptance E1-E7 of the first plan; its E1
// and E2 (the Stop↔Resume swap in place) and E6 (the disabled button across a drop) pinned the
// removed button and went with it.
//
// The journeys: the ⋯'s menu stopping and resuming the focused session, the ⋯'s focus across a
// key and a tick, a rename and a Claude move lengthening the row, the surface switch's focus
// across a hook re-render, and Tiles and back. What the header shows for a given state — the E3
// give-way sweeps over the state-table rows, the 35-character folder's whole line, the stacked
// band at 640 px, the INV-6 sweeps comparing the header alive with the same session ended, the
// cluster's order at three widths (E3, E5, REQ-1 to REQ-4) — moved to the render tier on
// 2026-10-20: web/render/focus.spec.ts against the `focus-header-rows-*` and `unbound-sessions`
// fixtures (plans/_audit/relevel/focus.md). The one E3 row left here has the `shell` segment
// selected, which spawns a shell over the API.
//
// Fixture plan: `daemon` (fresh per test) in every test, as the plan's header says — each
// launches the only session and relies on auto-focus (the Stop/Resume test launches a second to
// prove it is untouched), and the file passes `repoPoll: "200ms"` through `test.use` so a
// checkout and a Claude move show inside the 15 s expect timeout.
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
  type ScratchRepo,
  scratchRepo,
} from "./helpers/card-location";
import {
  type Box,
  boxOf,
  focusedNode,
  headerInvariantProblems,
  headerLifecycleButtons,
  headerMore,
  onTwoRows,
  rectOf,
  readHeaderSnapshot,
  sameBox,
  settleLayout,
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
import { cardMenu, cardMenuItem } from "./helpers/rail-menu";
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
  }
  await expect(headerMore(page)).toBeVisible();
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
// The Session actions ⋯ (plan remove-unread-right-click-1, REQ-4, REQ-5): the one button that
// replaced the header's Stop/Resume and Remove. The swap-in-place journeys that pinned the
// old Stop↔Resume button (E1, E2, their narrow-width clicks and the disabled-across-a-drop
// test) are gone with it; a Stop, Resume and Remove now run from the card menu, which
// rail-menu.spec.ts, actions.spec.ts and effort-header.spec.ts drive.
// ---------------------------------------------------------------------------------------

test("choosing Stop… and then Resume from the header's Session actions menu ends and restarts only the focused session, and the ⋯ stays the same node in the same box (REQ-4, REQ-5, INV-6)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const neighbourDir = await scratchRepo();
  try {
    await page.setViewportSize({ width: 1600, height: 900 });
    const focused = await launchBound(page, request, daemon, repo, "hdr-menu-a", "claude-hdr-a");
    const neighbour = await launchSession(page, daemon, {
      directory: neighbourDir.path,
      title: "hdr-menu-b",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-hdr-b", await envelopeOpts(neighbour, daemon)),
    });
    await expect(mainheadRenameButton(page)).toHaveText("hdr-menu-a");

    const more = headerMore(page);
    await expect(more).toBeVisible();
    await tagNode(more, "session-actions");
    const before = await boxOf(more);

    await more.click();
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for hdr-menu-a");
    await cardMenuItem(page, "Stop…").click();
    await confirmStop(page);
    await expect
      .poll(async () => findSession(await getState(page, daemon), focused.id).alive)
      .toBe(false);
    await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
    expect(findSession(await getState(page, daemon), neighbour.id).alive).toBe(true);
    expect(await daemon.tmuxPaneExists(neighbour.tmuxTarget)).toBe(true);
    await expect(headerLifecycleButtons(page)).toHaveCount(0);
    const same = page.locator('#mainhead [data-e2e-node="session-actions"]');
    await expect(same).toHaveCount(1);
    // INV-6: both sides re-read inside the retry, so a layout still settling times out.
    await expect
      .poll(async () => sameBox(await boxOf(same), before), {
        message: "the Session actions ⋯ did not move when the session ended",
      })
      .toBe(true);

    await same.click();
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for hdr-menu-a");
    await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
    await cardMenuItem(page, "Resume").click();
    await expect(page.getByRole("dialog", { name: "Stop session?" })).toBeHidden();
    await expect
      .poll(async () => findSession(await getState(page, daemon), focused.id).alive)
      .toBe(true);
    await expect(page.locator("#mainhead .meta .ended-at")).toBeHidden();
    await expect(same).toHaveCount(1);
    await expect
      .poll(async () => sameBox(await boxOf(same), before), {
        message: "the Session actions ⋯ did not move when the session resumed",
      })
      .toBe(true);
  } finally {
    await Promise.all([repo.cleanup(), neighbourDir.cleanup()]);
  }
});

// A focus round-trip with a real key (never `locator.press()`, which bundles focus and key): the
// ⋯ is focused, a real Enter opens its menu, Escape closes it, and the same node holds focus
// through the close and a render tick (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
test("the Session actions ⋯ keeps focus and node identity when a real Enter opens its menu and Escape closes it, with aria-expanded in step, then across a tick (REQ-4, REQ-5)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  try {
    await launchBound(page, request, daemon, repo, "hdr-keys", "claude-hdr-keys");

    const more = headerMore(page);
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await tagNode(more, "session-actions");
    await more.focus();
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "session-actions" });

    await page.keyboard.press("Enter");
    await expect(cardMenu(page)).toHaveAccessibleName("Actions for hdr-keys");
    await expect(more).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(() => focusedNode(page), { message: "focus is back on the node that opened the menu" })
      .toEqual({ tag: "BUTTON", node: "session-actions" });

    // A stays-unchanged hold: the render tick itself is under test.
    await settleFor(page, 1_400);
    expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "session-actions" });
    await expect(headerMore(page)).toHaveCount(1);
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
  more: Box;
  gap: number;
  twoRows: boolean;
}

async function readCluster(page: Page): Promise<Cluster> {
  const s = await readHeaderSnapshot(page);
  if (!s?.surf || !s.more) throw new Error("a cluster part is missing");
  return {
    surf: s.surf,
    more: s.more,
    gap: s.more.left - s.surf.right,
    twoRows: onTwoRows(s),
  };
}

// Both widths keep the header on one row after the lengthening: the cluster is placed by the
// header's width, and below roughly 1200px a 40-character title beside the lengthened readout
// legitimately drops it to row two (kb:adr/focus-header-give-way-order-title-last), which the
// render sweeps own.
for (const viewport of [2000, 1500]) {
  test(`at ${viewport}px renaming to a longer title and moving Claude to lengthen the readout leaves the surface switch and the Session actions ⋯ where they were (E4, REQ-4, INV-5)`, async ({
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
            moreRight: Math.abs(after.more.right - before.more.right) <= 0.5,
            gap: Math.abs(after.gap - before.gap) <= 0.5,
          };
        })
        .toEqual({ sameRows: true, surf: true, moreRight: true, gap: true });

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
