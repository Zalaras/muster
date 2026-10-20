// Plan stale-dirs-models-branches — REQ-1 to REQ-17 (a card's branch follows checkouts, a
// `↳` block shows where Claude is when it works in another checkout, the model name is
// never blank or stale after a bind, and long folder and branch names wrap at the `/`).
// Plan acceptance E1-E9 and E12; E13 lives in rail-layout.spec.ts (its E11, rewritten).
// The display properties — E10, E11, REQ-12's line heights, REQ-13's fit at every width and
// REQ-16's tokens — are render tests in web/render/card-location.spec.ts since 2026-10-20
// (plans/_audit/test-audit-2026-10-20-relevel.md): what the card and the Focus header show
// for a given snapshot needs no daemon to falsify. What stays here is every journey: a
// checkout, hook or status-line post changing a card, and resume.
//
// Fixture plan: `startDaemon` in every test, each passing `repoPoll: "200ms"` (via
// `startLocationDaemon`) so a checkout shows well inside the 15 s expect timeout, with a
// per-test scratch git repo as the launch directory. One test (REQ-6) passes `"0"` on
// purpose: the timer is off and only the nudge a reported move triggers can show it.
//
// Claude Code is faked. A branch change is real `git` in the scratch repo (the daemon reads
// the checkout, no hook is involved); a move is a main-agent hook whose common `cwd` names
// another checkout, or a status-line post whose `workspace.current_dir` does
// (kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir). The
// worktree is a real `git worktree add` under `<repo>/.claude/worktrees/`.
//
// Authored before any of this is built: every test here asserts new behaviour and is
// collection-only at authoring.
import { expectLocationPanel } from "./helpers/added-dirs";
import {
  addClaudeWorktree,
  addSubdirectory,
  cardBranch,
  cardFolder,
  cardMoved,
  cardMovedBranch,
  cardMovedFolder,
  cardMovedLead,
  git,
  hookMover,
  hoverLines,
  mainheadBranch,
  mainheadClaudeAt,
  mainheadFolder,
  mainheadLoc,
  mainheadModel,
  railCardByTitle,
  type ScratchRepo,
  scratchPlainDir,
  scratchRepo,
  startLocationDaemon,
  tileMoved,
  tileWhere,
} from "./helpers/card-location";
import {
  type APIRequestContext,
  expect,
  type Page,
  type ScratchDaemon,
  settleFor,
  test,
} from "./helpers/fixtures";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  rawPostToolUse,
  rawStop,
  rawUserPromptSubmit,
  sessionStartResume,
} from "./helpers/payloads";
import {
  browseScratchDirectory,
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  putTitleViaApi,
  type SessionObject,
  mainheadRenameButton,
  stateBadge,
} from "./helpers/session";
import { postResume } from "./helpers/resume";
import { liveTile } from "./helpers/terminal";

/** Launches a session into `repo` and binds it with the enveloped `SessionStart` a real
 * `claude` posts first, carrying `cwd` = the launch directory (kb:fact/hook-payload-fields). */
async function launchBound(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  repo: ScratchRepo,
  title: string,
  claudeId: string,
): Promise<SessionObject> {
  const session = await launchSession(page, daemon, { directory: repo.path, title });
  const res = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, {
      ...(await envelopeOpts(session, daemon)),
      cwd: repo.path,
    }),
  });
  expect(res.status()).toBe(200);
  return session;
}

test("a checkout in the launch directory changes the card's branch with no hook posted, on the rail card and the Focus header (E1, REQ-1)", async ({
  page,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: repo.path, title: "loc-e1" });

    const card = railCardByTitle(page, "loc-e1");
    await expect(cardFolder(card)).toHaveText(`${repo.name} /`);
    await expect(cardBranch(card)).toHaveText("main");

    await card.click();
    await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
    await expect(mainheadBranch(page)).toHaveText("main");

    // Neither the shell pane nor Claude is involved: only the checkout moves.
    await git(repo.path, "checkout", "-b", "fix");
    await expect(cardBranch(card)).toHaveText("fix");
    await expect(mainheadBranch(page)).toHaveText("fix");
    await expect(cardFolder(card)).toHaveText(`${repo.name} /`);

    await git(repo.path, "checkout", "main");
    await expect(cardBranch(card)).toHaveText("main");
    await expect(mainheadBranch(page)).toHaveText("main");
  } finally {
    await repo.cleanup();
  }
});

test("a detached HEAD leaves no repo to show, so the card falls back to the folder name alone (REQ-1, edge case 2)", async ({
  page,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: repo.path, title: "loc-detached" });

    const card = railCardByTitle(page, "loc-detached");
    await expect(cardBranch(card)).toHaveText("main");

    await git(repo.path, "checkout", "--detach");
    // REQ-10: with `repo: null` the block is one line, the basename, with no slash.
    await expect(cardFolder(card)).toHaveText(repo.name);
    await expect(cardBranch(card)).toHaveCount(0);
  } finally {
    await repo.cleanup();
  }
});

test("a dead session keeps its last-known branch while a live neighbour follows its checkout, and resume re-reads it (REQ-1, edge case 27)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repoDead = await scratchRepo();
  const repoLive = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const dead = await launchBound(page, request, daemon, repoDead, "loc-dead", "claude-loc-dead");
    await launchSession(page, daemon, { directory: repoLive.path, title: "loc-live" });
    const deadCard = railCardByTitle(page, "loc-dead");
    const liveCard = railCardByTitle(page, "loc-live");
    await expect(cardBranch(deadCard)).toHaveText("main");

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${dead.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(deadCard).toHaveClass(/ended/);

    await git(repoDead.path, "checkout", "-b", "dead-new");
    await git(repoLive.path, "checkout", "-b", "live-new");

    // The live neighbour proves the poll ran after both checkouts...
    await expect(cardBranch(liveCard)).toHaveText("live-new");
    // ...so a dead session that still reads `main` was skipped, not missed. A hold, then the
    // stays-unchanged check.
    await settleFor(page, 1_000);
    await expect(cardBranch(deadCard)).toHaveText("main");

    const resumeRes = await page.request.post(`${daemon.baseURL}/api/sessions/${dead.id}/resume`);
    expect(resumeRes.status()).toBe(200);
    await expect(deadCard).not.toHaveClass(/ended/);
    await expect(cardBranch(deadCard)).toHaveText("dead-new");
  } finally {
    await repoDead.cleanup();
    await repoLive.cleanup();
  }
});

test("a launch directory deleted under a live session keeps the last-known branch while a neighbour still follows its checkout (REQ-2)", async ({
  page,
  startDaemon,
}) => {
  const repoGone = await scratchRepo();
  const repoLive = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: repoGone.path, title: "loc-gone" });
    await launchSession(page, daemon, { directory: repoLive.path, title: "loc-neighbour-live" });
    const goneCard = railCardByTitle(page, "loc-gone");
    const liveCard = railCardByTitle(page, "loc-neighbour-live");
    await expect(cardBranch(goneCard)).toHaveText("main");

    await repoGone.vanish();
    await git(repoLive.path, "checkout", "-b", "still-polled");

    await expect(cardBranch(liveCard)).toHaveText("still-polled");
    await settleFor(page, 1_000);
    await expect(cardFolder(goneCard)).toHaveText(`${repoGone.name} /`);
    await expect(cardBranch(goneCard)).toHaveText("main");
  } finally {
    await repoGone.cleanup();
    await repoLive.cleanup();
  }
});

test("a main-agent hook whose cwd is a worktree under .claude/worktrees shows the ↳ block on the rail card, the Focus header and the tile header while the card stays on the launch directory (E2, REQ-5, REQ-12, REQ-13, REQ-15)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    // The ↳ block hides first as the header narrows (REQ-2 a), and with the uncapped readout (REQ-1)
    // the scratch repo's row no longer fits beside the cluster in the default 1280px window.
    await page.setViewportSize({ width: 1400, height: 720 });
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-e2", "claude-loc-e2");
    const wt = await addClaudeWorktree(repo, "probewt");
    const card = railCardByTitle(page, "loc-e2");
    await expect(cardMoved(card)).toBeHidden();

    await hookMover(request, daemon, "claude-loc-e2")(wt.path);

    await expect(cardMoved(card)).toBeVisible();
    await expect(cardMovedLead(card)).toHaveText("↳");
    await expect(cardMovedFolder(card)).toHaveText("probewt /");
    await expect(cardMovedBranch(card)).toHaveText("worktree-probewt");
    // The card itself stays on the launch directory (REQ-8's display side).
    await expect(cardFolder(card)).toHaveText(`${repo.name} /`);
    await expect(cardBranch(card)).toHaveText("main");

    await card.click();
    const claudeAt = mainheadClaudeAt(page);
    await expect(claudeAt).toBeVisible();
    await expect(claudeAt.locator(".lead")).toHaveText("↳");
    await expect(claudeAt.locator(".rf")).toHaveText("probewt /");
    await expect(claudeAt.locator(".rb")).toHaveText("worktree-probewt");
    await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
    await expect(mainheadBranch(page)).toHaveText("main");

    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    const tile = liveTile(page, "loc-e2");
    await expect(tileWhere(tile)).toHaveText(`${repo.name} / main`);
    const marker = tileMoved(tile);
    await expect(marker).toBeVisible();
    await expect(marker).toContainText("↳");
    await expect(marker).toContainText(`Claude is in ${wt.path}`);
  } finally {
    await repo.cleanup();
  }
});

test("a status-line post whose workspace.current_dir is a worktree shows the ↳ block, and a later post from the launch directory clears it (REQ-3)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchBound(
      page,
      request,
      daemon,
      repo,
      "loc-status",
      "claude-loc-status",
    );
    const wt = await addClaudeWorktree(repo, "statuswt");
    const card = railCardByTitle(page, "loc-status");
    const env = await envelopeOpts(session, daemon);

    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-loc-status", { ...env, cwd: wt.path }),
    });
    await expect(cardMoved(card)).toBeVisible();
    await expect(cardMovedFolder(card)).toHaveText("statuswt /");
    await expect(cardMovedBranch(card)).toHaveText("worktree-statuswt");

    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-loc-status", { ...env, cwd: repo.path }),
    });
    await expect(cardMoved(card)).toBeHidden();
  } finally {
    await repo.cleanup();
  }
});

test("a hook cwd inside the launch checkout never shows ↳, and returning to the launch directory clears it (E3, REQ-5, edge case 4)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-e3", "claude-loc-e3");
    const wt = await addClaudeWorktree(repo, "e3wt");
    const sub = await addSubdirectory(repo, "sub");
    const card = railCardByTitle(page, "loc-e3");
    const move = hookMover(request, daemon, "claude-loc-e3");

    // `cd sub`: the same top level, so nothing extra renders. A hold, then the check.
    await move(sub);
    await settleFor(page, 1_000);
    await expect(cardMoved(card)).toBeHidden();

    // The worktree is a different top level even though its path lies inside the launch path.
    await move(wt.path);
    await expect(cardMoved(card)).toBeVisible();

    // `cd` back into the launch checkout's subfolder: the recorded directory changed, and the
    // block goes. This is the transition that proves `sub` was recorded and judged "not elsewhere".
    await move(sub);
    await expect(cardMoved(card)).toBeHidden();

    await move(wt.path);
    await expect(cardMoved(card)).toBeVisible();
    // ExitWorktree: the next event reports the launch directory itself.
    await move(repo.path);
    await expect(cardMoved(card)).toBeHidden();
  } finally {
    await repo.cleanup();
  }
});

test("the Focus header's location hover carries the repo, the directory and, while moved, where Claude is and its branch, and the rail card and tile header carry theirs (E4, REQ-14, REQ-15)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchBound(page, request, daemon, repo, "loc-e4", "claude-loc-e4");
    const wt = await addClaudeWorktree(repo, "hoverwt");
    const card = railCardByTitle(page, "loc-e4");
    await card.click();

    // Independent oracles: the checkouts' own branches, and the directory the API reports.
    const branch = await git(repo.path, "rev-parse", "--abbrev-ref", "HEAD");
    const wtBranch = await git(wt.path, "rev-parse", "--abbrev-ref", "HEAD");

    // Plan see-added-dirs REQ-7: the readout's `title` is gone; the same facts — the repo and
    // branch over the launch directory, and while moved where Claude is and its branch — are
    // the location panel's rows.
    await expect(mainheadLoc(page)).not.toHaveAttribute("title");
    const launchRow = { folder: repo.name, branch, path: session.directory };
    await expectLocationPanel(page, { launch: launchRow, added: [] });
    await expect(card.locator(".r2")).toHaveAttribute("title", `${repo.name} / ${branch}`);

    await hookMover(request, daemon, "claude-loc-e4")(wt.path);
    await expect(cardMoved(card)).toBeVisible();

    const moved = hoverLines({
      repo: repo.name,
      branch,
      directory: session.directory,
      movedTo: { directory: wt.path, branch: wtBranch },
    });
    expect(moved.split("\n")).toHaveLength(4);
    await expect(mainheadLoc(page)).not.toHaveAttribute("title");
    await expectLocationPanel(page, {
      launch: launchRow,
      moved: { folder: wt.name, branch: wtBranch, path: wt.path },
      added: [],
    });
    await expect(card.locator(".r2")).toHaveAttribute("title", `${repo.name} / ${branch}`);
    await expect(card.locator(".r2c")).toHaveAttribute(
      "title",
      `Claude is in ${wt.path}\non ${wtBranch}`,
    );

    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(tileWhere(liveTile(page, "loc-e4"))).toHaveAttribute("title", moved);
  } finally {
    await repo.cleanup();
  }
});

test("a move outside any checkout shows the folder name alone with no branch line, and a three-line hover (REQ-12, REQ-14, edge case 7)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  const plain = await scratchPlainDir();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchBound(page, request, daemon, repo, "loc-plain", "claude-loc-plain");
    const card = railCardByTitle(page, "loc-plain");
    await card.click();

    await hookMover(request, daemon, "claude-loc-plain")(plain.path);

    await expect(cardMoved(card)).toBeVisible();
    await expect(cardMovedFolder(card)).toHaveText(plain.name);
    await expect(cardMovedBranch(card)).toHaveCount(0);
    await expect(mainheadClaudeAt(page).locator(".rf")).toHaveText(plain.name);
    await expect(mainheadClaudeAt(page).locator(".rb")).toHaveCount(0);

    const branch = await git(repo.path, "rev-parse", "--abbrev-ref", "HEAD");
    // Plan see-added-dirs REQ-7: the readout's `title` is gone; the panel's `↳` row is the plain
    // directory's folder over its path with no branch (the old hover's three lines).
    await expect(mainheadLoc(page)).not.toHaveAttribute("title");
    await expectLocationPanel(page, {
      launch: { folder: repo.name, branch, path: session.directory },
      moved: { folder: plain.name, branch: null, path: plain.path },
      added: [],
    });
    await expect(card.locator(".r2c")).toHaveAttribute("title", `Claude is in ${plain.path}`);
  } finally {
    await repo.cleanup();
    await plain.cleanup();
  }
});

test("while Claude is in a worktree the docs reader and the session's directory stay on the launch directory (E5, REQ-8)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchBound(page, request, daemon, repo, "loc-e5", "claude-loc-e5");
    const wt = await addClaudeWorktree(repo, "readerwt");
    const card = railCardByTitle(page, "loc-e5");

    await hookMover(request, daemon, "claude-loc-e5")(wt.path);
    await expect(cardMoved(card)).toBeVisible();

    const res = await page.request.get(`${daemon.baseURL}/api/sessions/${session.id}/reader`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { directory: string };
    expect(body.directory).toBe(session.directory);
    expect(body.directory).not.toBe(wt.path);

    expect(findSession(await getState(page, daemon), session.id).directory).toBe(session.directory);
  } finally {
    await repo.cleanup();
  }
});

test("a subagent-marked hook whose cwd is a worktree shows no ↳, while the same cwd from the main agent does (E6, REQ-4, INV-4)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-e6", "claude-loc-e6");
    const wt = await addClaudeWorktree(repo, "subagentwt");
    const card = railCardByTitle(page, "loc-e6");
    const claudeId = "claude-loc-e6";
    const post = async (data: Record<string, unknown>) =>
      expect((await request.post(daemon.ingestURL("hook"), { data })).status()).toBe(200);

    await post(rawUserPromptSubmit(claudeId, { promptId: "p1", cwd: repo.path }));
    await post(rawStop(claudeId, { promptId: "p1", cwd: repo.path }));
    await expect(stateBadge(card)).toHaveText(/idle/i);

    // A marked event for the closed p1 moves the card to working (claude-status-fixes
    // REQ-2), so the badge proves the daemon applied it before the absence is asserted.
    await post(rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1", cwd: wt.path }));
    await expect(stateBadge(card)).toHaveText(/working/i);
    await settleFor(page, 800);
    await expect(cardMoved(card)).toBeHidden();

    // Positive control: the same directory from the main agent is a move.
    await post(rawUserPromptSubmit(claudeId, { promptId: "p2", cwd: wt.path }));
    await expect(cardMoved(card)).toBeVisible();
    await expect(cardMovedFolder(card)).toHaveText("subagentwt /");
  } finally {
    await repo.cleanup();
  }
});

test("a subagent-marked hook naming a second worktree does not retarget an existing ↳ block (E6, REQ-4, INV-4)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-e6b", "claude-loc-e6b");
    const wtA = await addClaudeWorktree(repo, "mainwt");
    const wtB = await addClaudeWorktree(repo, "subwt");
    const card = railCardByTitle(page, "loc-e6b");
    const claudeId = "claude-loc-e6b";
    const post = async (data: Record<string, unknown>) =>
      expect((await request.post(daemon.ingestURL("hook"), { data })).status()).toBe(200);

    await post(rawUserPromptSubmit(claudeId, { promptId: "p1", cwd: wtA.path }));
    await expect(cardMovedFolder(card)).toHaveText("mainwt /");
    await post(rawStop(claudeId, { promptId: "p1", cwd: wtA.path }));
    await expect(stateBadge(card)).toHaveText(/idle/i);

    await post(rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1", cwd: wtB.path }));
    await expect(stateBadge(card)).toHaveText(/working/i);
    await settleFor(page, 800);
    await expect(cardMovedFolder(card)).toHaveText("mainwt /");
    await expect(cardMovedBranch(card)).toHaveText("worktree-mainwt");
  } finally {
    await repo.cleanup();
  }
});

test("ending a moved session removes its ↳ block and leaves a second moved session's, and resuming shows none until a new move is reported (E7, REQ-5, REQ-7)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repoA = await scratchRepo();
  const repoB = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const a = await launchBound(page, request, daemon, repoA, "loc-e7-a", "claude-loc-e7-a");
    await launchBound(page, request, daemon, repoB, "loc-e7-b", "claude-loc-e7-b");
    const wtA = await addClaudeWorktree(repoA, "e7a");
    const wtB = await addClaudeWorktree(repoB, "e7b");
    const cardA = railCardByTitle(page, "loc-e7-a");
    const cardB = railCardByTitle(page, "loc-e7-b");
    const moveA = hookMover(request, daemon, "claude-loc-e7-a");

    await moveA(wtA.path);
    await hookMover(request, daemon, "claude-loc-e7-b")(wtB.path);
    await expect(cardMovedFolder(cardA)).toHaveText("e7a /");
    await expect(cardMovedFolder(cardB)).toHaveText("e7b /");

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${a.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(cardA).toHaveClass(/ended/);
    await expect(cardMoved(cardA)).toBeHidden();
    // The bystander, still alive, keeps its own location.
    await expect(cardMovedFolder(cardB)).toHaveText("e7b /");
    await expect(cardMovedBranch(cardB)).toHaveText("worktree-e7b");

    const resumeRes = await page.request.post(`${daemon.baseURL}/api/sessions/${a.id}/resume`);
    expect(resumeRes.status()).toBe(200);
    const resumed = (await resumeRes.json()) as SessionObject;
    await expect(cardA).not.toHaveClass(/ended/);
    // Resume cleared the recorded directory: Claude starts in the launch directory again.
    await settleFor(page, 800);
    await expect(cardMoved(cardA)).toBeHidden();

    // The resumed Claude's own bind, from the NEW pane (see actions.spec.ts E-resume).
    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume("claude-loc-e7-a", {
        musterSession: a.id,
        tmuxPane: await daemon.tmuxPaneId(resumed.tmuxTarget),
        cwd: repoA.path,
      }),
    });
    await expect(stateBadge(cardA)).toHaveText(/idle/i);
    await expect(cardMoved(cardA)).toBeHidden();

    await moveA(wtA.path);
    await expect(cardMovedFolder(cardA)).toHaveText("e7a /");
    await expect(cardMovedFolder(cardB)).toHaveText("e7b /");
  } finally {
    await repoA.cleanup();
    await repoB.cleanup();
  }
});

test("one session's move never marks another session launched in the same directory (edge case 20, INV-1)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-same-a", "claude-loc-same-a");
    await launchBound(page, request, daemon, repo, "loc-same-b", "claude-loc-same-b");
    const wt = await addClaudeWorktree(repo, "samewt");
    const cardA = railCardByTitle(page, "loc-same-a");
    const cardB = railCardByTitle(page, "loc-same-b");

    await hookMover(request, daemon, "claude-loc-same-a")(wt.path);
    await expect(cardMovedFolder(cardA)).toHaveText("samewt /");
    await settleFor(page, 800);
    await expect(cardMoved(cardB)).toBeHidden();
    await expect(cardFolder(cardB)).toHaveText(`${repo.name} /`);
  } finally {
    await repo.cleanup();
  }
});

test("with the repo timer disabled a reported move still shows, by the nudge alone (REQ-6, edge case 25)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    // "0" turns the timer off: only the nudge a changed working directory fires can derive it.
    const daemon = await startLocationDaemon(startDaemon, "0");
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-nudge", "claude-loc-nudge");
    const wt = await addClaudeWorktree(repo, "nudgewt");
    const card = railCardByTitle(page, "loc-nudge");

    await hookMover(request, daemon, "claude-loc-nudge")(wt.path);
    await expect(cardMoved(card)).toBeVisible();
    await expect(cardMovedFolder(card)).toHaveText("nudgewt /");
    await expect(cardMovedBranch(card)).toHaveText("worktree-nudgewt");
  } finally {
    await repo.cleanup();
  }
});

test("a SessionStart naming a different model id shows the id, not the launch alias, until the status line confirms the display name (E8, REQ-9)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: repo.path,
      title: "loc-e8",
      model: "sonnet",
    });
    const env = await envelopeOpts(session, daemon);
    await railCardByTitle(page, "loc-e8").click();

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-loc-e8", { ...env, model: "claude-sonnet-5-5" }),
    });
    await expect(mainheadModel(page)).toHaveText("claude-sonnet-5-5 (…)");
    const bound = findSession(await getState(page, daemon), session.id);
    expect(bound.model).toEqual({ id: "claude-sonnet-5-5", displayName: "claude-sonnet-5-5" });

    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-loc-e8", {
        ...env,
        model: { id: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
      }),
    });
    await expect(mainheadModel(page)).toHaveText("Sonnet 5.5");
  } finally {
    await repo.cleanup();
  }
});

test("a late SessionStart naming the same model id leaves the display name the status line confirmed (REQ-9, edge case 21)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: repo.path,
      title: "loc-e8-late",
      model: "sonnet",
    });
    const env = await envelopeOpts(session, daemon);
    await railCardByTitle(page, "loc-e8-late").click();

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-loc-e8-late", { ...env, model: "claude-sonnet-5-5" }),
    });
    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-loc-e8-late", {
        ...env,
        model: { id: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
      }),
    });
    await expect(mainheadModel(page)).toHaveText("Sonnet 5.5");

    // The same id again (a resume-style rebind): nothing to replace, so the name survives.
    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume("claude-loc-e8-late", { ...env, model: "claude-sonnet-5-5" }),
    });
    await expect(stateBadge(railCardByTitle(page, "loc-e8-late"))).toHaveText(/idle/i);
    await expect(mainheadModel(page)).toHaveText("Sonnet 5.5");
  } finally {
    await repo.cleanup();
  }
});

test("a resumed-from-list session with no recorded model reads unknown, then shows the id a SessionStart names, never an empty string (E9, REQ-9, edge case 22)", async ({
  page,
  request,
  startDaemon,
}) => {
  const daemon = await startLocationDaemon(startDaemon);
  const dir = await browseScratchDirectory(daemon, "muster-e2e-loc-nomodel-");
  try {
    await daemon.writeTranscript(dir.path, "past-loc-e9", {
      title: "loc-e9",
      permissionMode: "acceptEdits",
    });
    await page.goto(daemon.dashboardUrl);
    const resumed = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "past-loc-e9",
    });
    expect(resumed.status).toBe(201);
    const created = (await getState(page, daemon)).sessions.filter((s) => s.directory === dir.path);
    expect(created).toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(session.model).toBeNull();

    await railCardByTitle(page, "loc-e9").click();
    await expect(mainheadModel(page)).toHaveText("unknown (…)");

    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume("past-loc-e9", {
        ...(await envelopeOpts(session, daemon)),
        model: "claude-sonnet-5-5",
      }),
    });
    await expect(mainheadModel(page)).toHaveText("claude-sonnet-5-5 (…)");
    const bound = findSession(await getState(page, daemon), session.id);
    expect(bound.model).toEqual({ id: "claude-sonnet-5-5", displayName: "claude-sonnet-5-5" });
    expect(bound.model?.displayName).not.toBe("");
  } finally {
    await dir.cleanup();
  }
});

test("the Focus header's session name carries its full text as a hover title, and follows a rename (E12, REQ-17)", async ({
  page,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const title = "loc-e12 a session name long enough that the header may truncate it";
    const session = await launchSession(page, daemon, { directory: repo.path, title });
    await railCardByTitle(page, "loc-e12").click();

    const rename = mainheadRenameButton(page);
    await expect(rename).toHaveAttribute("title", title);

    await putTitleViaApi(page, daemon.baseURL, session.id, "loc-e12 renamed");
    await expect(rename).toHaveText("loc-e12 renamed");
    await expect(rename).toHaveAttribute("title", "loc-e12 renamed");
  } finally {
    await repo.cleanup();
  }
});

test("the rename button keeps focus and node identity across a repo-poll re-render of the header (focus survival, REQ-1)", async ({
  page,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: repo.path, title: "loc-focus" });
    await railCardByTitle(page, "loc-focus").click();

    const rename = mainheadRenameButton(page);
    await rename.focus();
    await rename.evaluate((el) => {
      (el as HTMLElement).dataset.e2eNode = "rename-1";
    });
    const focused = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return {
          tag: active?.tagName ?? null,
          node: active?.dataset.e2eNode ?? null,
          inRename: active?.closest("h2.name") !== null,
        };
      });
    expect(await focused()).toEqual({ tag: "BUTTON", node: "rename-1", inRename: true });

    // A checkout re-renders the Focus header's repo block through a sessionUpsert; the
    // focused button must survive it and a further tick (> 1 s).
    await git(repo.path, "checkout", "-b", "focus-branch");
    await expect(mainheadBranch(page)).toHaveText("focus-branch");
    await settleFor(page, 1_200);
    expect(await focused()).toEqual({ tag: "BUTTON", node: "rename-1", inRename: true });
  } finally {
    await repo.cleanup();
  }
});
