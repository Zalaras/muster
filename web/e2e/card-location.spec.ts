// Plan stale-dirs-models-branches — REQ-1 to REQ-17 (a card's branch follows checkouts, a
// `↳` block shows where Claude is when it works in another checkout, the model name is
// never blank or stale after a bind, and long folder and branch names wrap at the `/`).
// Plan acceptance E1-E12; E13 lives in rail-layout.spec.ts (its E11, rewritten).
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
  mainheadFitProblems,
  mainheadFolder,
  mainheadLoc,
  mainheadMeta,
  mainheadModel,
  mainheadTitleEllipsized,
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
  type ScratchDaemonOptions,
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
import { bodyRailDensity, railDensityButton } from "./helpers/railcards";
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

// 60-character folder and 80-character branch (plan edge case 24, E11).
const LONG_FOLDER = "long-folder-name-for-wrapping-".repeat(2);
const LONG_BRANCH = `${"long-branch-name-for-wrapping-".repeat(3).slice(0, 79)}z`;

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

test("the ↳ glyph is --fg-muted and the ↳ text --fg-dim, on the rail card and in the Focus header, never a state colour (REQ-16)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo();
  try {
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchBound(page, request, daemon, repo, "loc-tokens", "claude-loc-tokens");
    const wt = await addClaudeWorktree(repo, "tokenwt");
    const card = railCardByTitle(page, "loc-tokens");
    await card.click();

    await hookMover(request, daemon, "claude-loc-tokens")(wt.path);
    await expect(cardMoved(card)).toBeVisible();
    await expect(mainheadClaudeAt(page)).toBeVisible();

    // The live token, resolved by a probe element: the computed colour of
    // `color: var(--token)` is what the page's own cascade produces for that variable.
    const tokenColor = async (token: string) =>
      await page.evaluate((name) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }, token);
    const colorOf = async (loc: ReturnType<typeof cardMoved>) =>
      await loc.evaluate((el) => getComputedStyle(el).color);

    const muted = await tokenColor("--fg-muted");
    const dim = await tokenColor("--fg-dim");
    expect(muted).not.toBe(dim);

    await expect.poll(() => colorOf(cardMovedLead(card))).toBe(muted);
    await expect.poll(() => colorOf(cardMovedFolder(card))).toBe(dim);
    await expect.poll(() => colorOf(cardMovedBranch(card))).toBe(dim);
    await expect.poll(() => colorOf(mainheadClaudeAt(page).locator(".lead"))).toBe(muted);
    await expect.poll(() => colorOf(mainheadClaudeAt(page).locator(".rf"))).toBe(dim);
    await expect.poll(() => colorOf(mainheadClaudeAt(page).locator(".rb"))).toBe(dim);
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

    const unmoved = hoverLines({ repo: repo.name, branch, directory: session.directory });
    await expect(mainheadLoc(page)).toHaveAttribute("title", unmoved);
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
    await expect(mainheadLoc(page)).toHaveAttribute("title", moved);
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
    const hover = hoverLines({
      repo: repo.name,
      branch,
      directory: session.directory,
      movedTo: { directory: plain.path },
    });
    expect(hover.split("\n")).toHaveLength(3);
    await expect(mainheadLoc(page)).toHaveAttribute("title", hover);
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
    await expect(mainheadModel(page)).toHaveText("claude-sonnet-5-5");
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
    await expect(mainheadModel(page)).toHaveText("unknown");

    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume("past-loc-e9", {
        ...(await envelopeOpts(session, daemon)),
        model: "claude-sonnet-5-5",
      }),
    });
    await expect(mainheadModel(page)).toHaveText("claude-sonnet-5-5");
    const bound = findSession(await getState(page, daemon), session.id);
    expect(bound.model).toEqual({ id: "claude-sonnet-5-5", displayName: "claude-sonnet-5-5" });
    expect(bound.model?.displayName).not.toBe("");
  } finally {
    await dir.cleanup();
  }
});

for (const density of ["comfortable", "expanded"] as const) {
  test(`in ${density} density the rail card's folder and branch sit on two lines and each truncates at the end on its own, with the full text on hover (E10, REQ-10)`, async ({
    page,
    startDaemon,
  }) => {
    const repo = await scratchRepo(LONG_FOLDER);
    try {
      await git(repo.path, "checkout", "-b", LONG_BRANCH);
      const daemon = await startLocationDaemon(startDaemon);
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: repo.path, title: `loc-e10-${density}` });
      if (density !== "comfortable") {
        await railDensityButton(page, density).click();
      }
      await expect.poll(() => bodyRailDensity(page)).toBe(density);

      const card = railCardByTitle(page, `loc-e10-${density}`);
      await expect(cardFolder(card)).toHaveText(`${LONG_FOLDER} /`);
      await expect(cardBranch(card)).toHaveText(LONG_BRANCH);

      const geometry = async (line: ReturnType<typeof cardFolder>) =>
        await line.evaluate((el) => {
          const cs = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return {
            textOverflow: cs.textOverflow,
            whiteSpace: cs.whiteSpace,
            overflow: cs.overflowX,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            top: box.top,
            bottom: box.bottom,
            height: box.height,
          };
        });
      await expect
        .poll(
          async () => {
            const rf = await geometry(cardFolder(card));
            const rb = await geometry(cardBranch(card));
            return rb.top >= rf.bottom - 0.5;
          },
          { message: "the branch line sits below the folder line" },
        )
        .toBe(true);

      for (const line of [cardFolder(card), cardBranch(card)]) {
        const g = await geometry(line);
        expect(g.textOverflow).toBe("ellipsis");
        expect(g.whiteSpace).toBe("nowrap");
        expect(g.overflow).toBe("hidden");
        // Truly clipped: the full text is wider than the line that shows it.
        expect(g.scrollWidth).toBeGreaterThan(g.clientWidth);
      }

      await expect(card.locator(".r2")).toHaveAttribute("title", `${repo.name} / ${LONG_BRANCH}`);
    } finally {
      await repo.cleanup();
    }
  });
}

test("in compact density the rail card's folder and branch stay on one line, clipped inside the card (E10, REQ-11, edge case 26)", async ({
  page,
  startDaemon,
}) => {
  const repo = await scratchRepo(LONG_FOLDER);
  try {
    await git(repo.path, "checkout", "-b", LONG_BRANCH);
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: repo.path, title: "loc-e10-compact" });
    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    const card = railCardByTitle(page, "loc-e10-compact");
    await expect(cardFolder(card)).toHaveText(`${LONG_FOLDER} /`);
    await expect(cardBranch(card)).toHaveText(LONG_BRANCH);

    const metrics = await card.locator(".r2").evaluate((r2) => {
      const rf = r2.querySelector(".rf");
      const rb = r2.querySelector(".rb");
      if (!rf || !rb) throw new Error("missing .rf/.rb");
      // .r2 computes `line-height: normal` (parseFloat gives NaN), so one line's height is
      // measured from a probe in the card's own font rather than read from the style.
      const probe = document.createElement("span");
      probe.textContent = "x";
      probe.style.whiteSpace = "nowrap";
      r2.appendChild(probe);
      const lineHeight = probe.getBoundingClientRect().height;
      probe.remove();
      const r2box = r2.getBoundingClientRect();
      const rfBox = rf.getBoundingClientRect();
      const rbBox = rb.getBoundingClientRect();
      const clipped = [r2, rf, rb].filter(
        (el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth,
      ).length;
      return {
        lineHeight,
        r2Height: r2box.height,
        sameLine: rbBox.top < rfBox.bottom && rfBox.top < rbBox.bottom,
        rbAfterRf: rbBox.left >= rfBox.right - 1,
        rbInsideR2: rbBox.right <= r2box.right + 0.5,
        clipped,
      };
    });
    expect(metrics.sameLine).toBe(true);
    expect(metrics.rbAfterRf).toBe(true);
    expect(metrics.r2Height).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
    expect(metrics.rbInsideR2).toBe(true);
    expect(metrics.clipped).toBeGreaterThan(0);
  } finally {
    await repo.cleanup();
  }
});

test("with a 60-character folder and an 80-character branch at 1280x800 the Focus header caps each line and the model is not clipped (E11, REQ-13)", async ({
  page,
  request,
  startDaemon,
}) => {
  const repo = await scratchRepo(LONG_FOLDER);
  try {
    await git(repo.path, "checkout", "-b", LONG_BRANCH);
    expect(LONG_FOLDER).toHaveLength(60);
    expect(LONG_BRANCH).toHaveLength(80);
    await page.setViewportSize({ width: 1280, height: 800 });
    const daemon = await startLocationDaemon(startDaemon);
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: repo.path,
      title: "loc-e11",
      model: "sonnet",
    });
    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull("claude-loc-e11", {
        ...(await envelopeOpts(session, daemon)),
        model: { id: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
      }),
    });
    await railCardByTitle(page, "loc-e11").click();

    await expect(mainheadFolder(page)).toHaveText(`${LONG_FOLDER} /`);
    await expect(mainheadBranch(page)).toHaveText(LONG_BRANCH);
    await expect(mainheadModel(page)).toHaveText("Sonnet 5.5");

    const model = mainheadModel(page);
    const modelMetrics = await model.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      right: el.getBoundingClientRect().right,
      metaRight: (el.closest(".meta") as HTMLElement).getBoundingClientRect().right,
    }));
    expect(modelMetrics.scrollWidth).toBeLessThanOrEqual(modelMetrics.clientWidth);
    expect(modelMetrics.right).toBeLessThanOrEqual(modelMetrics.metaRight + 0.5);

    // The caps: each line is clipped at exactly its `ch` budget, measured against a clone
    // of the line itself so the font (and so the `ch` unit) is the line's own.
    const capped = async (cls: ".rf" | ".rb", ch: number) =>
      await mainheadMeta(page)
        .locator(`.loc .repo ${cls}`)
        .evaluate((el, budget) => {
          const probe = el.cloneNode(false) as HTMLElement;
          probe.textContent = "";
          probe.style.maxWidth = "none";
          probe.style.width = `${budget}ch`;
          el.after(probe);
          const expected = probe.getBoundingClientRect().width;
          probe.remove();
          return {
            actual: el.getBoundingClientRect().width,
            expected,
            clipped: el.scrollWidth > el.clientWidth,
          };
        }, ch);
    const rf = await capped(".rf", 30);
    const rb = await capped(".rb", 44);
    expect(rf.clipped).toBe(true);
    expect(rb.clipped).toBe(true);
    expect(Math.abs(rf.actual - rf.expected)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(rb.actual - rb.expected)).toBeLessThanOrEqual(1.5);
  } finally {
    await repo.cleanup();
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

// The Focus header at every window width (kb:adr/focus-model-never-truncates-name-blocks-give-way,
// kb:adr/focus-mainhead-wraps-to-second-row-when-narrow). The full model id is on the header
// because the bind (the enveloped SessionStart `launchBound` posts) names it and no status line
// has confirmed a display name. The invariants are asserted, never the pixel at which the
// header wraps or a name block gives way: the model whole, every name block whole, the repo
// block on `.loc`'s first line (the developer's decision: the header wraps before the repo
// block drops below its floor, so narrowing never hides it), no blank `.loc` at any width
// (review cycle 4: not for a `↳` block that gave way, nor for a folder line under the floor),
// and End, Resume and Remove on screen.
//
// The title is long (66 characters) so that it is ellipsized at the narrow widths, where a
// blank `.loc` would cost the title room; the tests prove it was clipped there.
const FULL_MODEL_ID = "claude-haiku-4-5-20251001";
const LONG_WORKTREE = "long-worktree-name-for-wrapping-".repeat(2).slice(0, 59).concat("z");
const LONG_TITLE = "rework shift-swap approval for the weekend rostering rule changes";
const SHORT_FOLDER = "muster-app";
// Folder and branch lines under the 8-character floor (`api /`, `main`; moved, `wt /`).
const TINY_FOLDER = "api";

interface NameSet {
  folder: string;
  /** Undefined keeps the scratch repo on `main`. */
  branch: string | undefined;
  worktree: string;
  label: string;
}
const NAME_SETS: Record<"long" | "short" | "tiny", NameSet> = {
  long: {
    folder: LONG_FOLDER,
    branch: LONG_BRANCH,
    worktree: LONG_WORKTREE,
    label: "60-character folder and 80-character branch names",
  },
  short: {
    folder: SHORT_FOLDER,
    branch: undefined,
    worktree: "probe-wt",
    label: "short folder and branch names",
  },
  tiny: {
    folder: TINY_FOLDER,
    branch: undefined,
    worktree: "wt",
    label: "folder and branch lines under the 8-character floor",
  },
};
type FitState = "unmoved" | "moved" | "ended";
type StartDaemon = (opts?: ScratchDaemonOptions) => Promise<ScratchDaemon>;

/** Launches a bound session on a scratch repo with `names` and the long title, Focus view open. */
async function openFitSession(
  page: Page,
  request: APIRequestContext,
  startDaemon: StartDaemon,
  names: NameSet,
  repo: ScratchRepo,
) {
  if (names.branch !== undefined) await git(repo.path, "checkout", "-b", names.branch);
  await page.setViewportSize({ width: 1280, height: 800 });
  const daemon = await startLocationDaemon(startDaemon);
  await page.goto(daemon.dashboardUrl);
  const session = await launchBound(page, request, daemon, repo, LONG_TITLE, "claude-loc-fit");
  await railCardByTitle(page, LONG_TITLE).click();
  await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
  await expect(mainheadBranch(page)).toHaveText(names.branch ?? "main");
  await expect(mainheadModel(page)).toHaveText(FULL_MODEL_ID);
  return { daemon, session };
}

/** Puts the session into `state` at the 1280 px viewport, before any narrowing. */
async function enterFitState(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  repo: ScratchRepo,
  names: NameSet,
  state: FitState,
) {
  if (state === "moved") {
    const wt = await addClaudeWorktree(repo, names.worktree);
    await hookMover(request, daemon, "claude-loc-fit")(wt.path);
    await expect(cardMoved(railCardByTitle(page, LONG_TITLE))).toBeVisible();
    await expect(mainheadClaudeAt(page)).not.toHaveAttribute("hidden");
    await expect(mainheadClaudeAt(page).locator(".rf")).toHaveText(`${names.worktree} /`);
    await expect(mainheadClaudeAt(page).locator(".rb")).toHaveText(`worktree-${names.worktree}`);
  } else if (state === "ended") {
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(mainheadMeta(page).locator(".ended-at")).toBeVisible();
  } else {
    await expect(mainheadClaudeAt(page)).toHaveAttribute("hidden");
  }
}

async function assertFocusHeaderFits(
  page: Page,
  request: APIRequestContext,
  startDaemon: StartDaemon,
  names: NameSet,
  width: number,
  state: FitState,
) {
  const repo = await scratchRepo(names.folder);
  try {
    const { daemon, session } = await openFitSession(page, request, startDaemon, names, repo);
    await enterFitState(page, request, daemon, session, repo, names, state);

    await page.setViewportSize({ width, height: 800 });
    await expect(mainheadModel(page)).toHaveText(FULL_MODEL_ID);
    await expect
      .poll(() => mainheadFitProblems(page), {
        message: `${state} header layout at ${width}px`,
      })
      .toEqual([]);
    if (width <= 1024) {
      // The blank-.loc check only means something while the title is clipped: prove it was,
      // so the check above was not true by default. A 66-character title cannot fit beside
      // the model, the repo block, the surface switch and the actions in 1024 px.
      await expect
        .poll(() => mainheadTitleEllipsized(page), {
          message: `the title is ellipsized at ${width}px, so the blank-.loc check applied`,
        })
        .toBe(true);
    }
    // Not a pixel breakpoint: a window too narrow for one row gets a second one, so the
    // header grows rather than a control leaving the screen.
    for (const action of ["End", "Resume", "Remove"]) {
      await expect(
        page.locator("#mainhead").getByRole("button", { name: action, exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
  } finally {
    await repo.cleanup();
  }
}

for (const width of [1280, 1024, 960, 900, 800, 700]) {
  for (const state of ["unmoved", "moved", "ended"] as const) {
    test(`at ${width}px the Focus header of a session that is ${state}, with 60-character folder and 80-character branch names never clips the model, keeps every name block whole and keeps End, Resume and Remove on screen (REQ-13)`, async ({
      page,
      request,
      startDaemon,
    }) => {
      await assertFocusHeaderFits(page, request, startDaemon, NAME_SETS.long, width, state);
    });

    test(`at ${width}px the Focus header of a session that is ${state}, with short folder and branch names keeps the repo block on its first line, no blank beside an ellipsized title, the model whole and End, Resume and Remove on screen (REQ-13, review cycle 3)`, async ({
      page,
      request,
      startDaemon,
    }) => {
      await assertFocusHeaderFits(page, request, startDaemon, NAME_SETS.short, width, state);
    });

    test(`at ${width}px the Focus header of a session that is ${state}, with folder and branch lines under the 8-character floor keeps .loc no wider than what it shows, the model whole and End, Resume and Remove on screen (REQ-13, review cycle 4)`, async ({
      page,
      request,
      startDaemon,
    }) => {
      await assertFocusHeaderFits(page, request, startDaemon, NAME_SETS.tiny, width, state);
    });
  }
}

// The repo readout never comes and goes as the window changes (the developer's decision,
// review cycle 3: "narrowing never brings it back"). One daemon, one session, the window swept
// from wide to narrow and back in 16 px steps: at every width the same invariants hold, which
// includes the repo block on `.loc`'s first line. The widths around where the header wraps,
// where cycle 3's browser review saw the repo block vanish at 1024-976 and return at 975, are
// inside the sweep without the test naming a breakpoint.
for (const nameSet of ["long", "short", "tiny"] as const) {
  for (const state of ["unmoved", "moved"] as const) {
    test(`sweeping the window from 1440px to 700px and back, the Focus header of a session that is ${state}, with ${NAME_SETS[nameSet].label}, shows its repo block on its first line at every width and never leaves blank in .loc (REQ-13, review cycles 3 and 4)`, async ({
      page,
      request,
      startDaemon,
    }) => {
      const names = NAME_SETS[nameSet];
      const repo = await scratchRepo(names.folder);
      try {
        const { daemon, session } = await openFitSession(page, request, startDaemon, names, repo);
        await enterFitState(page, request, daemon, session, repo, names, state);

        const widths: number[] = [];
        for (let w = 1440; w >= 700; w -= 16) widths.push(w);
        const sweep = [...widths, ...[...widths].reverse()];
        let ellipsizedAt = 0;
        for (const width of sweep) {
          await page.setViewportSize({ width, height: 800 });
          await expect
            .poll(() => mainheadFitProblems(page), {
              message: `${state} header layout at ${width}px in the sweep`,
            })
            .toEqual([]);
          if (await mainheadTitleEllipsized(page)) ellipsizedAt += 1;
        }
        // The blank check applied across the sweep: the title was clipped at a good part of
        // it, so the sweep was not silent about the Minor it guards.
        expect(ellipsizedAt).toBeGreaterThan(sweep.length / 4);
      } finally {
        await repo.cleanup();
      }
    });
  }
}

for (const density of ["comfortable", "compact", "expanded"] as const) {
  test(`in ${density} density the rail card's ↳ block lines are exactly as tall as the repo block's lines (REQ-12, review cycle 2 Minor 1)`, async ({
    page,
    request,
    startDaemon,
  }) => {
    const repo = await scratchRepo();
    try {
      const daemon = await startLocationDaemon(startDaemon);
      await page.goto(daemon.dashboardUrl);
      await launchBound(
        page,
        request,
        daemon,
        repo,
        `loc-lh-${density}`,
        `claude-loc-lh-${density}`,
      );
      if (density !== "comfortable") {
        await railDensityButton(page, density).click();
      }
      await expect.poll(() => bodyRailDensity(page)).toBe(density);
      const wt = await addClaudeWorktree(repo, "lineheightwt");
      await hookMover(request, daemon, `claude-loc-lh-${density}`)(wt.path);

      const card = railCardByTitle(page, `loc-lh-${density}`);
      await expect(cardMovedFolder(card)).toHaveText("lineheightwt /");
      await expect(cardMovedBranch(card)).toHaveText("worktree-lineheightwt");
      await expect(cardBranch(card)).toHaveText("main");

      const heights = async () =>
        await card.evaluate((el) => {
          const h = (sel: string) => {
            const node = el.querySelector(sel);
            if (!node) throw new Error(`missing ${sel}`);
            return node.getBoundingClientRect().height;
          };
          return {
            r2: h(".r2"),
            r2c: h(".r2c"),
            rf: h(".r2 .rf"),
            movedRf: h(".r2c .rf"),
            rb: h(".r2 .rb"),
            movedRb: h(".r2c .rb"),
          };
        });
      // Re-read both sides inside the retry: a layout still settling from the density
      // switch must time out, not pass on a stale pair.
      await expect
        .poll(async () => {
          const g = await heights();
          return {
            block: Math.abs(g.r2c - g.r2) <= 0.5,
            folder: Math.abs(g.movedRf - g.rf) <= 0.5,
            branch: Math.abs(g.movedRb - g.rb) <= 0.5,
            measured: g.r2 > 0 && g.rf > 0 && g.rb > 0,
          };
        })
        .toEqual({ block: true, folder: true, branch: true, measured: true });
    } finally {
      await repo.cleanup();
    }
  });
}
