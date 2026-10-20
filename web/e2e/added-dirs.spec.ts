// Plan see-added-dirs — REQ-1 to REQ-9 (a live session's added directories, read from every
// status post's `workspace.added_dirs`, show as a `+N` suffix on the Focus header's folder line
// and in a mouse-hover panel with each directory's folder, branch and path). Plan acceptance
// E1, E3-E5 and E7; E6 is `make e2e` itself. The daemon, web and Go unit criteria (D*, W*)
// live in their own suites; the one with a browser-visible half the daemon decides is repeated
// here (W5). What the header and the panel show for a given list — the rows, the ↳ row, the
// no-data panel, the suffix's drawing beside a long folder name and the panel's placement for
// 3, 15 and 22 directories (E2, W2, W3, W4, edge case 15) — is a render test in
// web/render/card-location.spec.ts (re-levelled 2026-10-20, plans/_audit/relevel/misc-core.md).
//
// Fixture plan: `daemon` (fresh per test), as the plan's header says — one criterion restarts
// the daemon and several kill or end sessions. The file passes `repoPoll: "200ms"` through
// `test.use` so a branch read shows well inside the 15 s expect timeout.
//
// Claude Code is faked: a directory list is a status-line post whose `workspace.added_dirs`
// is led by the launch directory as typed (helpers/added-dirs.ts, kb:fact/added-dirs-in-status-line);
// a bind is the enveloped `SessionStart`; a move is a main-agent hook whose `cwd` names another
// checkout. The added directories are real scratch checkouts and a branch change is real `git`.
//
// Authored before any of this is built: every test here asserts new behaviour and is
// collection-only at authoring.
import {
  type AddedDirWire,
  addedCountSuffix,
  expectLocationPanel,
  folderLineEndingInPlus,
  headerFolderLine,
  hoverReadout,
  locationPanel,
  makeSubdirectory,
  type PanelRow,
  panelPattern,
  postWorkspace,
  scratchSymlinkTo,
  statusWithWorkspace,
  typedSpelling,
  wireAddedDirs,
} from "./helpers/added-dirs";
import {
  addClaudeWorktree,
  addSubdirectory,
  cardFolder,
  git,
  hoverLines,
  railCardByTitle,
  type ScratchRepo,
  scratchPlainDir,
  scratchRepo,
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
  rawStop,
  rawUserPromptSubmit,
  rawSessionEnd,
} from "./helpers/payloads";
import {
  envelopeOpts,
  launchSession,
  mainheadRenameButton,
  type SessionObject,
  stateBadge,
} from "./helpers/session";
import { resolvedCssVar } from "./helpers/theme";
import { liveTile } from "./helpers/terminal";

test.use({ daemonOptions: { repoPoll: "200ms" } });

interface AddedDirsSession {
  session: SessionObject;
  claudeId: string;
  title: string;
  repo: ScratchRepo;
  /** Reports `dirs` after the launch directory, which leads the list as typed. */
  report(dirs: string[], sessionName?: string): Promise<void>;
  /** Reports `added_dirs` verbatim (`null`: the post carries no `added_dirs` key at all). */
  reportRaw(addedDirs: string[] | null, sessionName?: string): Promise<void>;
}

/**
 * Launches a session into `repo`, binds it with the enveloped `SessionStart` a real `claude`
 * posts first, and focuses it. Nothing has reported a directory list yet.
 */
async function openSession(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  repo: ScratchRepo,
  title: string,
): Promise<AddedDirsSession> {
  const claudeId = `claude-${title}`;
  const session = await launchSession(page, daemon, { directory: repo.path, title });
  const res = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, {
      ...(await envelopeOpts(session, daemon)),
      cwd: repo.path,
    }),
  });
  expect(res.status()).toBe(200);
  await railCardByTitle(page, title).click();
  await expect(mainheadRenameButton(page)).toHaveText(title);
  const reportRaw = async (addedDirs: string[] | null, sessionName?: string) => {
    await postWorkspace(request, daemon, session, claudeId, {
      launch: repo.path,
      addedDirs,
      ...(sessionName !== undefined ? { sessionName } : {}),
    });
  };
  return {
    session,
    claudeId,
    title,
    repo,
    reportRaw,
    report: async (dirs, sessionName) =>
      await reportRaw([typedSpelling(repo.path), ...dirs], sessionName),
  };
}

async function branchOf(dir: string): Promise<string> {
  return await git(dir, "rev-parse", "--abbrev-ref", "HEAD");
}

/** The wire entry a git checkout on `branch` yields: its folder name, branch and no worktree. */
function wireOf(dir: ScratchRepo, branch: string): AddedDirWire {
  return {
    directory: dir.path,
    repo: { name: dir.name, branch, isWorktree: false },
  };
}

/** Runs `body` and removes every scratch directory afterwards. */
async function withDirs<T>(dirs: ScratchRepo[], body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } finally {
    for (const dir of dirs) await dir.cleanup();
  }
}

// --- E1: the suffix, and the surfaces that must not change (REQ-1, REQ-6, REQ-8, INV-3) ---

test("a status post with two added git directories shows +2 on the Focus header's folder line in --fg-muted, with the wire's repos read from disk, and the rail card and tile header show no suffix and keep their hover text (E1, REQ-1, REQ-5, REQ-6, REQ-8, INV-3)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await git(second.path, "checkout", "-b", "feature-x");
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-e1");
    await s.report([first.path, second.path]);

    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expect(headerFolderLine(page)).toHaveText(folderLineEndingInPlus(repo.name, 2));
    // Neutral, never a state colour: the computed colour is the live --fg-muted token.
    const muted = await resolvedCssVar(page, "--fg-muted");
    await expect(addedCountSuffix(page)).toHaveCSS("color", muted);

    // The independent oracles are the checkouts' own branches; the wire carries them in the
    // reported order with the launch directory removed (it arrived as `/tmp/…`, resolved).
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    expect(secondBranch).toBe("feature-x");
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, secondBranch)]);

    // REQ-8: the rail card and the tile header carry no suffix and their hovers are unchanged.
    const card = railCardByTitle(page, "ad-e1");
    const branch = await branchOf(repo.path);
    await expect(cardFolder(card)).toHaveText(`${repo.name} /`);
    await expect(card.locator(".r2 .rf span")).toHaveCount(0);
    await expect(card.locator(".r2")).toHaveAttribute("title", `${repo.name} / ${branch}`);
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    const tile = liveTile(page, "ad-e1");
    await expect(tileWhere(tile)).toHaveText(`${repo.name} / ${branch}`);
    await expect(tileWhere(tile)).toHaveAttribute(
      "title",
      hoverLines({ repo: repo.name, branch, directory: s.session.directory }),
    );
  });
});

test("a status post whose list is only the launch directory, under any spelling of it, leaves no suffix and an empty list, and a later post with directories brings it back (D1, D3, INV-2, INV-3)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const extra = await scratchRepo();
  await withDirs([repo, extra], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-launch-only");
    const typed = typedSpelling(repo.path);

    // Each launch-only spelling is preceded by a post that sets +1, so the absence that follows
    // is the post taking effect and not a post that was never read.
    for (const spelling of [typed, repo.path, `${repo.path}/`, `${typed}/`]) {
      await s.report([extra.path]);
      await expect(addedCountSuffix(page)).toHaveText("+1");
      await s.reportRaw([spelling]);
      await expect(addedCountSuffix(page)).toHaveCount(0);
      await expect(headerFolderLine(page)).toHaveText(`${repo.name} /`);
      await expect.poll(() => wireAddedDirs(page, daemon, s.session.id)).toEqual([]);
    }

    // The launch directory under its trailing-slash spelling is still not an added directory
    // when it leads a list that also holds one.
    await s.reportRaw([`${repo.path}/`, extra.path]);
    await expect(addedCountSuffix(page)).toHaveText("+1");
    const branch = await branchOf(extra.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(extra, branch)]);
  });
});

test("a post with no added_dirs key leaves the suffix and the list as they were, and a later shorter list lowers it (D2, REQ-1, edge case 1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-keyless");
    await s.report([first.path, second.path]);
    await expect(addedCountSuffix(page)).toHaveText("+2");

    // The title proves the keyless post was read: it carries a new `session_name`.
    await s.reportRaw(null, "ad-keyless-seen");
    await expect(mainheadRenameButton(page)).toHaveText("ad-keyless-seen");
    await expect(addedCountSuffix(page)).toHaveText("+2");
    expect(await wireAddedDirs(page, daemon, s.session.id)).toHaveLength(2);

    await s.report([first.path]);
    await expect(addedCountSuffix(page)).toHaveText("+1");
    const branch = await branchOf(first.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, branch)]);
  });
});

test("a relative entry resolves against the launch directory and a symlinked duplicate collapses to the first position (D4, REQ-2, edge cases 4 and 5)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const target = await scratchRepo();
  const link = await scratchSymlinkTo(target.path);
  try {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-normalise");
    const inside = await makeSubdirectory(repo.path, "relative-dir");
    // Relative first, then the target through its symlink, then the target itself: the second
    // and third are one directory, kept at the earlier position.
    await s.report(["relative-dir", link.path, target.path]);

    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expect
      .poll(async () => (await wireAddedDirs(page, daemon, s.session.id)).map((d) => d.directory))
      .toEqual([inside, target.path]);

    const repoBranch = await branchOf(repo.path);
    const targetBranch = await branchOf(target.path);
    await expectLocationPanel(page, {
      launch: { folder: repo.name, branch: repoBranch, path: s.session.directory },
      // `relative-dir` sits inside the launch checkout, so its reading is that checkout's.
      added: [
        { folder: repo.name, branch: repoBranch, path: inside },
        { folder: target.name, branch: targetBranch, path: target.path },
      ],
    });
  } finally {
    await link.cleanup();
    await repo.cleanup();
    await target.cleanup();
  }
});

// --- E2: the panel (REQ-7, REQ-9, W2) ---

// --- E7 and REQ-5a: the git reading never gates the directory ---

test("an added plain directory counts in +N and shows as its folder and path with no branch, gains the branch when it becomes a checkout and loses it again on a detached HEAD (E7, REQ-5, REQ-5a, edge case 17)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const plain = await scratchPlainDir();
  await withDirs([repo, first, plain], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-e7");
    await s.report([first.path, plain.path]);

    await expect(addedCountSuffix(page)).toHaveText("+2");
    const repoBranch = await branchOf(repo.path);
    const firstBranch = await branchOf(first.path);
    const launchRow = { folder: repo.name, branch: repoBranch, path: s.session.directory };
    const firstRow = { folder: first.name, branch: firstBranch, path: first.path };

    // Not a git checkout: the row is the folder and path alone, and the wire's repo is null.
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), { directory: plain.path, repo: null }]);
    await expectLocationPanel(page, {
      launch: launchRow,
      added: [firstRow, { folder: plain.name, branch: null, path: plain.path }],
    });

    // It becomes a checkout: the next reading puts `· main` on the row, the count is unchanged.
    await git(plain.path, "init", "-b", "main");
    await git(plain.path, "commit", "--allow-empty", "-m", "init");
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([
        wireOf(first, firstBranch),
        { directory: plain.path, repo: { name: plain.name, branch: "main", isWorktree: false } },
      ]);
    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expectLocationPanel(page, {
      launch: launchRow,
      added: [firstRow, { folder: plain.name, branch: "main", path: plain.path }],
    });

    // A detached HEAD reads as no repo: the directory stays listed and counted, branch gone.
    await git(plain.path, "checkout", "--detach");
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), { directory: plain.path, repo: null }]);
    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expectLocationPanel(page, {
      launch: launchRow,
      added: [firstRow, { folder: plain.name, branch: null, path: plain.path }],
    });
  });
});

// --- E5: a checkout in an added directory ---

test("a checkout of a new branch in an added directory shows in the panel within one repo-poll tick (E5, REQ-5)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-e5");
    await s.report([first.path, second.path]);
    const repoBranch = await branchOf(repo.path);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    await expect
      .poll(async () =>
        (await wireAddedDirs(page, daemon, s.session.id)).map((d) => d.repo?.branch),
      )
      .toEqual([firstBranch, secondBranch]);

    await git(first.path, "checkout", "-b", "topic-e5");
    expect(await branchOf(first.path)).toBe("topic-e5");
    await expect
      .poll(async () =>
        (await wireAddedDirs(page, daemon, s.session.id)).map((d) => d.repo?.branch),
      )
      .toEqual(["topic-e5", secondBranch]);
    await expectLocationPanel(page, {
      launch: { folder: repo.name, branch: repoBranch, path: s.session.directory },
      added: [
        { folder: first.name, branch: "topic-e5", path: first.path },
        { folder: second.name, branch: secondBranch, path: second.path },
      ],
    });
  });
});

test("an added directory removed under a live session stays listed with its last-known branch while a neighbour's checkout still refreshes (D9, REQ-5, edge case 12)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-vanish");
    await s.report([first.path, second.path]);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, secondBranch)]);

    await first.vanish();
    await git(second.path, "checkout", "-b", "after-vanish");
    // The neighbour's new branch proves a poll tick ran after the removal; the vanished
    // directory still reads what it read last.
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, "after-vanish")]);
    await expect(addedCountSuffix(page)).toHaveText("+2");
  });
});

// --- E3 and REQ-3: death empties the list ---

test("stopping the session removes the suffix and the panel's Added section (E3, REQ-3, INV-1, REQ-6)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-e3");
    await s.report([first.path, second.path]);
    await expect(addedCountSuffix(page)).toHaveText("+2");
    const repoBranch = await branchOf(repo.path);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    await expectLocationPanel(page, {
      launch: { folder: repo.name, branch: repoBranch, path: s.session.directory },
      added: [
        { folder: first.name, branch: firstBranch, path: first.path },
        { folder: second.name, branch: secondBranch, path: second.path },
      ],
    });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${s.session.id}/end`);
    expect(endRes.status()).toBe(200);

    await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
    await expect(addedCountSuffix(page)).toHaveCount(0);
    await expect.poll(() => wireAddedDirs(page, daemon, s.session.id)).toEqual([]);
    await expectLocationPanel(page, {
      launch: { folder: repo.name, branch: repoBranch, path: s.session.directory },
      added: [],
    });
  });
});

test("stopping one of two sessions that both have added directories empties only that one's list, and a straggler status post cannot refill the dead session (E3, D5, D7, INV-1, edge case 8)", async ({
  page,
  request,
  daemon,
}) => {
  const repoA = await scratchRepo();
  const repoB = await scratchRepo();
  const shared = await scratchRepo();
  const onlyB = await scratchRepo();
  await withDirs([repoA, repoB, shared, onlyB], async () => {
    await page.goto(daemon.dashboardUrl);
    const a = await openSession(page, request, daemon, repoA, "ad-multi-a");
    const b = await openSession(page, request, daemon, repoB, "ad-multi-b");
    await a.report([shared.path]);
    await b.report([shared.path, onlyB.path]);
    const sharedBranch = await branchOf(shared.path);
    const onlyBBranch = await branchOf(onlyB.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, a.session.id))
      .toEqual([wireOf(shared, sharedBranch)]);
    await expect
      .poll(() => wireAddedDirs(page, daemon, b.session.id))
      .toEqual([wireOf(shared, sharedBranch), wireOf(onlyB, onlyBBranch)]);

    // The envelope's pane id is read while the pane still exists.
    const strayEnv = await envelopeOpts(a.session, daemon);
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${a.session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(railCardByTitle(page, "ad-multi-a")).toHaveClass(/ended/);

    await expect.poll(() => wireAddedDirs(page, daemon, a.session.id)).toEqual([]);
    expect(await wireAddedDirs(page, daemon, b.session.id)).toEqual([
      wireOf(shared, sharedBranch),
      wireOf(onlyB, onlyBBranch),
    ]);
    await railCardByTitle(page, "ad-multi-b").click();
    await expect(mainheadRenameButton(page)).toHaveText("ad-multi-b");
    await expect(addedCountSuffix(page)).toHaveText("+2");

    // A late status post for the dead session (the previous turn's straggler).
    const stray = await request.post(daemon.ingestURL("status"), {
      data: statusWithWorkspace(a.claudeId, strayEnv, {
        launch: repoA.path,
        addedDirs: [typedSpelling(repoA.path), shared.path],
      }),
    });
    expect(stray.status()).toBe(200);
    // A stays-unchanged check: the dead session is not routed a status post, so nothing
    // arrives to wait for.
    await settleFor(page, 1_000);
    expect(await wireAddedDirs(page, daemon, a.session.id)).toEqual([]);
    expect(await wireAddedDirs(page, daemon, b.session.id)).toHaveLength(2);
  });
});

test("a pane that dies without a SessionEnd empties the list through liveness, with the neighbour's list untouched (REQ-3, D5, INV-1, edge case 11)", async ({
  page,
  request,
  daemon,
}) => {
  const repoA = await scratchRepo();
  const repoB = await scratchRepo();
  const dirA = await scratchRepo();
  const dirB = await scratchRepo();
  await withDirs([repoA, repoB, dirA, dirB], async () => {
    await page.goto(daemon.dashboardUrl);
    const a = await openSession(page, request, daemon, repoA, "ad-live-a");
    const b = await openSession(page, request, daemon, repoB, "ad-live-b");
    await a.report([dirA.path]);
    await b.report([dirB.path]);
    await expect.poll(async () => (await wireAddedDirs(page, daemon, a.session.id)).length).toBe(1);
    await expect.poll(async () => (await wireAddedDirs(page, daemon, b.session.id)).length).toBe(1);

    await daemon.killTmuxWindow(a.session.tmuxTarget);
    await expect(railCardByTitle(page, "ad-live-a")).toHaveClass(/ended/);
    await expect.poll(() => wireAddedDirs(page, daemon, a.session.id)).toEqual([]);
    expect(await wireAddedDirs(page, daemon, b.session.id)).toEqual([
      wireOf(dirB, await branchOf(dirB.path)),
    ]);
    await railCardByTitle(page, "ad-live-b").click();
    await expect(mainheadRenameButton(page)).toHaveText("ad-live-b");
    await expect(addedCountSuffix(page)).toHaveText("+1");
  });
});

test("a pane that is gone when the daemon starts is ended by reconcile with an empty list (REQ-3, D5, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const dir = await scratchRepo();
  await withDirs([repo, dir], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-reconcile");
    await s.report([dir.path]);
    await expect(addedCountSuffix(page)).toHaveText("+1");

    await daemon.kill();
    await daemon.killTmuxWindow(s.session.tmuxTarget);
    await daemon.restart();
    await page.reload();

    await expect(railCardByTitle(page, "ad-reconcile")).toHaveClass(/ended/);
    await expect.poll(() => wireAddedDirs(page, daemon, s.session.id)).toEqual([]);
    await expect(addedCountSuffix(page)).toHaveCount(0);
  });
});

test("a resumed session starts with no directories until its first status post reports them again (REQ-3, D5, edge case 9)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const dir = await scratchRepo();
  await withDirs([repo, dir], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-resume");
    await s.report([dir.path]);
    await expect(addedCountSuffix(page)).toHaveText("+1");

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${s.session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(railCardByTitle(page, "ad-resume")).toHaveClass(/ended/);

    const resumeRes = await page.request.post(
      `${daemon.baseURL}/api/sessions/${s.session.id}/resume`,
    );
    expect(resumeRes.status()).toBe(200);
    await expect(railCardByTitle(page, "ad-resume")).not.toHaveClass(/ended/);

    // Resumed and alive, but nothing has reported yet: empty, no suffix.
    await expect.poll(() => wireAddedDirs(page, daemon, s.session.id)).toEqual([]);
    await expect(addedCountSuffix(page)).toHaveCount(0);

    // The first post after the resume brings the surviving directory back.
    await s.report([dir.path]);
    await expect(addedCountSuffix(page)).toHaveText("+1");
  });
});

// --- E4 and REQ-4: the list survives a restart and a /clear ---

test("restarting the daemon while the session is alive keeps +2 and the branches in the panel (E4, REQ-4, D8)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await git(second.path, "checkout", "-b", "feature-x");
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-e4");
    await s.report([first.path, second.path]);
    const firstBranch = await branchOf(first.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, "feature-x")]);

    await daemon.restart();
    // A fresh document load: what it shows can only have come from the restarted daemon, and no
    // status post has been sent since.
    await page.reload();

    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, "feature-x")]);
    await expectLocationPanel(page, {
      launch: {
        folder: repo.name,
        branch: await branchOf(repo.path),
        path: s.session.directory,
      },
      added: [
        { folder: first.name, branch: firstBranch, path: first.path },
        { folder: second.name, branch: "feature-x", path: second.path },
      ],
    });
  });
});

for (const order of ["end-then-start", "start-then-end"] as const) {
  test(`a /clear pair applied ${order === "end-then-start" ? "SessionEnd first" : "SessionStart first"} keeps the list until the next post re-reports it, and the new id's post can change it (REQ-4, D6, edge cases 6 and 7)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = await scratchRepo();
    const first = await scratchRepo();
    const second = await scratchRepo();
    await withDirs([repo, first, second], async () => {
      await page.goto(daemon.dashboardUrl);
      const title = `ad-clear-${order}`;
      const s = await openSession(page, request, daemon, repo, title);
      await s.report([first.path, second.path]);
      await expect(addedCountSuffix(page)).toHaveText("+2");

      // The /clear sequence: the turn closes, then the old id's SessionEnd(reason:"clear") and
      // the new id's SessionStart(source:"clear") arrive in either order.
      const env = await envelopeOpts(s.session, daemon);
      const newClaudeId = `${s.claudeId}-new`;
      await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(s.claudeId) });
      await request.post(daemon.ingestURL("hook"), { data: rawStop(s.claudeId) });
      const sessionEnd = () =>
        request.post(daemon.ingestURL("hook"), { data: rawSessionEnd(s.claudeId, "clear") });
      const sessionStart = () =>
        request.post(daemon.ingestURL("hook"), {
          data: envelopedSessionStart(newClaudeId, { ...env, source: "clear" }),
        });
      if (order === "end-then-start") {
        await sessionEnd();
        await sessionStart();
      } else {
        await sessionStart();
        await sessionEnd();
      }
      await expect(stateBadge(railCardByTitle(page, title))).toHaveText(/started/i);

      // Neither event is a death, so the list is as the last post reported it...
      await expect(addedCountSuffix(page)).toHaveText("+2");
      expect(await wireAddedDirs(page, daemon, s.session.id)).toHaveLength(2);

      // ...and the new id's first post carries the same list (kb:fact/added-dirs-in-status-line).
      await postWorkspace(request, daemon, s.session, newClaudeId, {
        launch: repo.path,
        addedDirs: [typedSpelling(repo.path), first.path, second.path],
      });
      await expect(addedCountSuffix(page)).toHaveText("+2");
      await postWorkspace(request, daemon, s.session, newClaudeId, {
        launch: repo.path,
        addedDirs: [typedSpelling(repo.path), first.path],
      });
      await expect(addedCountSuffix(page)).toHaveText("+1");
    });
  });
}

// --- W5: the daemon-down state ---

test("with the daemon down the panel still opens on hover with the last-known directories and branches (W5, REQ-7, edge case 16)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-down");
    await s.report([first.path, second.path]);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([wireOf(first, firstBranch), wireOf(second, secondBranch)]);
    // The page has the branches before the daemon goes away: they arrive on the same upsert.
    await expectLocationPanel(page, {
      launch: {
        folder: repo.name,
        branch: await branchOf(repo.path),
        path: s.session.directory,
      },
      added: [
        { folder: first.name, branch: firstBranch, path: first.path },
        { folder: second.name, branch: secondBranch, path: second.path },
      ],
    });

    await daemon.kill();
    await expect(page.getByRole("alert")).toBeVisible();

    await expect(addedCountSuffix(page)).toHaveText("+2");
    await expectLocationPanel(page, {
      launch: {
        folder: repo.name,
        branch: await branchOf(repo.path),
        path: s.session.directory,
      },
      added: [
        { folder: first.name, branch: firstBranch, path: first.path },
        { folder: second.name, branch: secondBranch, path: second.path },
      ],
    });
  });
});

// --- Review cycle 1, wave 3: the open panel follows the session, worktree flags, overflow ---

test("with the mouse resting on the readout an added directory's new branch shows in the open panel without reopening it (REQ-5, REQ-7, review cycle 1 browser Minor 1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-open-branch");
    await s.report([first.path, second.path]);
    const repoBranch = await branchOf(repo.path);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    await expect
      .poll(async () =>
        (await wireAddedDirs(page, daemon, s.session.id)).map((d) => d.repo?.branch),
      )
      .toEqual([firstBranch, secondBranch]);

    const launch: PanelRow = { folder: repo.name, branch: repoBranch, path: s.session.directory };
    // Open it once, with its first reading, and from here on never move the mouse.
    await expect(async () => {
      await hoverReadout(page);
      await expect(locationPanel(page)).toHaveText(
        panelPattern({
          launch,
          added: [
            { folder: first.name, branch: firstBranch, path: first.path },
            { folder: second.name, branch: secondBranch, path: second.path },
          ],
        }),
        { timeout: 2_000 },
      );
    }).toPass({ timeout: 15_000 });

    await git(first.path, "checkout", "-b", "while-open");
    expect(await branchOf(first.path)).toBe("while-open");
    // The one expectation retries against the open panel: no leave, no second hover.
    await expect(locationPanel(page)).toHaveText(
      panelPattern({
        launch,
        added: [
          { folder: first.name, branch: "while-open", path: first.path },
          { folder: second.name, branch: secondBranch, path: second.path },
        ],
      }),
    );
    await expect(locationPanel(page)).toHaveCount(1);
    await expect(addedCountSuffix(page)).toHaveText("+2");
  });
});

test("with the mouse resting on the readout the session ending drops the open panel's Added directories section and keeps the Location row (REQ-3, REQ-7, INV-1, review cycle 1 browser Minor 1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const first = await scratchRepo();
  const second = await scratchRepo();
  await withDirs([repo, first, second], async () => {
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-open-stop");
    await s.report([first.path, second.path]);
    const repoBranch = await branchOf(repo.path);
    const firstBranch = await branchOf(first.path);
    const secondBranch = await branchOf(second.path);
    const launch: PanelRow = { folder: repo.name, branch: repoBranch, path: s.session.directory };
    await expect(async () => {
      await hoverReadout(page);
      await expect(locationPanel(page)).toHaveText(
        panelPattern({
          launch,
          added: [
            { folder: first.name, branch: firstBranch, path: first.path },
            { folder: second.name, branch: secondBranch, path: second.path },
          ],
        }),
        { timeout: 2_000 },
      );
    }).toPass({ timeout: 15_000 });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${s.session.id}/end`);
    expect(endRes.status()).toBe(200);

    // No re-hover: the panel that was open is rebuilt to the ended session's model, which is
    // the Location row alone (the anchored pattern fails on any `Added directories` text).
    await expect(locationPanel(page)).toHaveText(panelPattern({ launch, added: [] }));
    await expect(locationPanel(page)).toHaveCount(1);
    await expect(locationPanel(page)).not.toContainText("Added directories");
    await expect(addedCountSuffix(page)).toHaveCount(0);
    await expect.poll(() => wireAddedDirs(page, daemon, s.session.id)).toEqual([]);
  });
});

test("an added subdirectory of an ordinary checkout reads isWorktree false and one inside a linked worktree reads true, each naming its checkout's top level (correctness Major 1, REQ-5)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = await scratchRepo();
  const ordinary = await scratchRepo();
  const linkedHome = await scratchRepo();
  await withDirs([repo, ordinary, linkedHome], async () => {
    const ordinarySub = await addSubdirectory(ordinary, "pkg");
    const linked = await addClaudeWorktree(linkedHome, "linked-wt");
    const linkedSub = await makeSubdirectory(linked.path, "pkg");
    await page.goto(daemon.dashboardUrl);
    const s = await openSession(page, request, daemon, repo, "ad-worktree-flag");
    await s.report([ordinary.path, ordinarySub, linked.path, linkedSub]);

    const ordinaryBranch = await branchOf(ordinary.path);
    // The independent oracle for "linked": git's own two directories differ there.
    expect(await git(linked.path, "rev-parse", "--git-dir")).not.toBe(
      await git(linked.path, "rev-parse", "--git-common-dir"),
    );
    await expect
      .poll(() => wireAddedDirs(page, daemon, s.session.id))
      .toEqual([
        {
          directory: ordinary.path,
          repo: { name: ordinary.name, branch: ordinaryBranch, isWorktree: false },
        },
        {
          directory: ordinarySub,
          repo: { name: ordinary.name, branch: ordinaryBranch, isWorktree: false },
        },
        {
          directory: linked.path,
          repo: { name: linked.name, branch: linked.branch, isWorktree: true },
        },
        {
          directory: linkedSub,
          repo: { name: linked.name, branch: linked.branch, isWorktree: true },
        },
      ]);
  });
});
