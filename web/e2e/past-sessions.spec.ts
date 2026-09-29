import { basename } from "node:path";
import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawSessionEnd, sessionStartResume } from "./helpers/payloads";
import { childEntry, crumbButton, launchError, openLaunchDialog } from "./helpers/picker";
import {
  bypassChip,
  bypassRadio,
  bypassWarning,
  getRepos,
  launchPrimaryButton,
  launchTarget,
  newTab,
  pastFilterInput,
  pastList,
  pastListHead,
  pastSessionRow,
  pastSessionsSection,
  postResume,
  resumeTab,
  sessionKindTablist,
} from "./helpers/resume";
import {
  browseScratchDirectory,
  currentRailCard,
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  waitForNextClockSecond,
} from "./helpers/session";
import { activeElementInsideTerminal } from "./helpers/terminal";

// Plan resume-and-dangerously-allow (closes #62) — REQ-6..15, INV-2 (Resume-tab half),
// INV-4. Fixture plan header: this file takes the per-test `daemon` fixture (a resume
// opens the launched session — auto-focus and rail counts are daemon-global, so a
// neighbour test's session on a shared daemon would corrupt both).
//
// The bypass Start-in segment and its chip live in bypass.spec.ts; this file covers only
// the New | Resume tab pair's mechanics and the Resume tab itself: the past-session
// list, filtering, selection, and resuming from it.

test("opening the dialog always lands on the New tab, even right after a previous open was left on Resume (REQ-7)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);
  await expect(sessionKindTablist(dialog)).toBeVisible();
  await expect(newTab(dialog)).toHaveAttribute("aria-selected", "true");

  await resumeTab(dialog).click();
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(pastSessionsSection(dialog)).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Reopen via the masthead button this time (not the chord) — REQ-7 names both.
  const reopened = await openLaunchDialog(page);
  await expect(newTab(reopened)).toHaveAttribute("aria-selected", "true");
  await expect(resumeTab(reopened)).toHaveAttribute("aria-selected", "false");
  await expect(pastSessionsSection(reopened)).toBeHidden();
});

test("switching to Resume and back to New restores the form exactly as it was left (User Flow 3)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-tabs-restore-");
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await dialog.getByLabel("Title").fill("tabs-restore-title");
    await dialog.getByRole("radio", { name: "opus" }).check();
    await dialog.getByRole("radio", { name: "accept edits" }).check();

    await resumeTab(dialog).click();
    await expect(pastSessionsSection(dialog)).toBeVisible();
    await expect(dialog.locator("#launch-form .fields")).toBeHidden();

    await newTab(dialog).click();
    await expect(pastSessionsSection(dialog)).toBeHidden();
    await expect(dialog.locator("#launch-form .fields")).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveValue("tabs-restore-title");
    await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "accept edits" })).toBeChecked();
  } finally {
    await dir.cleanup();
  }
});

test("the Resume tab lists fixture sessions newest first, disables the one already open in Muster, and refuses a POST for it with already_open (REQ-9, E5, edge case 9)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-list-");
  const bystanderDir = await browseScratchDirectory(daemon, "muster-e2e-past-list-bystander-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-newest", {
      title: "Newest fix",
      lastPrompt: "look at the newest one",
      mtime: new Date("2026-01-03T00:00:00Z"),
    });
    await daemon.writeTranscript(dir.path, "past-id-open", {
      title: "Bound session",
      lastPrompt: "already running",
      mtime: new Date("2026-01-02T00:00:00Z"),
    });
    await daemon.writeTranscript(dir.path, "past-id-oldest", {
      title: "Oldest chat",
      lastPrompt: "say hi",
      mtime: new Date("2026-01-01T00:00:00Z"),
    });

    await page.goto(daemon.dashboardUrl);
    // An alive Muster session bound to "past-id-open" — anywhere; `openSessionId` keys
    // only on claudeSessionId, not on the bound session's own directory.
    const bystander = await launchSession(page, daemon, {
      directory: bystanderDir.path,
      title: "past-list-bystander",
    });
    await page.request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("past-id-open", await envelopeOpts(bystander, daemon)),
    });

    const dialog = await openLaunchDialog(page);
    // A fresh daemon opens onto the browse root; go up then into `dir` explicitly since
    // `bystanderDir`'s launch may have made it the initial restore's target instead.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();

    await expect(pastListHead(dialog)).toHaveText(
      new RegExp(`^Claude sessions in ${basename(dir.path)}\\s*·\\s*3$`),
    );

    const rows = pastList(dialog).getByRole("button");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Newest fix");
    await expect(rows.nth(1)).toContainText("Bound session");
    await expect(rows.nth(2)).toContainText("Oldest chat");

    const boundRow = pastSessionRow(dialog, "Bound session");
    await expect(boundRow).toBeDisabled();
    await expect(boundRow.locator(".lp")).toHaveText("open in Muster");

    // A POST anyway (the disabled row can't be clicked) is refused regardless — the
    // server-side half of the same guard (D11).
    const resumed = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "past-id-open",
    });
    expect(resumed.status).toBe(409);
    expect(resumed.body).toMatchObject({ error: { code: "already_open", id: bystander.id } });
  } finally {
    await dir.cleanup();
    await bystanderDir.cleanup();
  }
});

test("resuming a fixture session spawns claude --resume <id> --permission-mode plan with no --model and no --name, seeds the row, and opens it like any launch, leaving a bystander session untouched (REQ-10, REQ-13, E6)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-resume-");
  const bystanderDir = await browseScratchDirectory(daemon, "muster-e2e-past-resume-bystander-");
  try {
    await daemon.writeTranscript(dir.path, "claude-past-resume-e6", {
      title: "Fix e2e flake in shell.spec",
      lastPrompt: "the shell spec still fails when a second suite runs",
      model: "claude-opus-4-1-20250805",
      permissionMode: "plan",
    });

    await page.goto(daemon.dashboardUrl);
    const bystander = await launchSession(page, daemon, {
      directory: bystanderDir.path,
      title: "past-resume-bystander",
    });

    const dialog = await openLaunchDialog(page);
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Fix e2e flake in shell.spec").click();
    await expect(launchTarget(dialog)).toHaveText(
      `Resume Fix e2e flake in shell.spec in ${dir.path}`,
    );
    await expect(launchPrimaryButton(dialog)).toHaveText("Resume");

    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const state = await getState(page, daemon);
    const created = state.sessions.filter((s) => s.directory === dir.path);
    expect(created, "exactly one session created for this directory").toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");

    expect(session.title).toBe("Fix e2e flake in shell.spec");
    // Amended 2026-09-27 (kb:adr/launch-resume-display-name-falls-back-to-id, a user
    // decision made mid-run): displayName falls back to the model id until the status
    // line confirms it, the same as any other launch — not null.
    expect(session.model).toEqual({
      id: "claude-opus-4-1-20250805",
      displayName: "claude-opus-4-1-20250805",
    });
    expect(session.permissionMode).toEqual({ value: "plan", source: "seed" });
    expect(session.claudeSessionId).toBeNull();

    const startCommand = await daemon.paneStartCommand(session.tmuxTarget);
    // Two separate checks rather than one exact adjacent substring: the contract names
    // both flag values (REQ-10) but not their relative order in argv.
    expect(startCommand).toContain("--resume claude-past-resume-e6");
    expect(startCommand).toContain("--permission-mode plan");
    expect(startCommand).not.toContain("--model");
    expect(startCommand).not.toContain("--name");

    // REQ-13/kb:adr/launch-opens-launched-session: opens like any launch.
    await expect(currentRailCard(page)).toHaveCount(1);
    expect(await activeElementInsideTerminal(page, "Fix e2e flake in shell.spec")).toBe(true);

    // The bystander is unaffected by the resume.
    expect(await daemon.tmuxPaneExists(bystander.tmuxTarget)).toBe(true);
    const bystanderNow = findSession(await getState(page, daemon), bystander.id);
    expect(bystanderNow.alive).toBe(true);
  } finally {
    await dir.cleanup();
    await bystanderDir.cleanup();
  }
});

test('selecting a bypass fixture row shows "Resume without checks", danger; a non-bypass row shows the ordinary "Resume" (REQ-11, E7)', async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-bypass-row-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-bypass-row", {
      title: "Bump Go deps",
      lastPrompt: "update go deps to latest minor",
      permissionMode: "bypassPermissions",
    });
    await daemon.writeTranscript(dir.path, "past-id-plain-row", {
      title: "Say hi",
      lastPrompt: "say hi",
      permissionMode: "acceptEdits",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();

    const bypassRow = pastSessionRow(dialog, "Bump Go deps");
    await expect(bypassChip(bypassRow)).toHaveText("bypass");
    await bypassRow.click();
    await expect(launchPrimaryButton(dialog)).toHaveText("Resume without checks");
    await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);

    await pastSessionRow(dialog, "Say hi").click();
    await expect(launchPrimaryButton(dialog)).toHaveText("Resume");
    await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);
  } finally {
    await dir.cleanup();
  }
});

test("resuming a fixture deleted after listing shows the 404 message in #launch-error and the list drops it on refetch (REQ-10, E8, edge case 7)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-deleted-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-deleted", {
      title: "Will vanish",
      lastPrompt: "this transcript is about to disappear",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Will vanish").click();
    await expect(launchTarget(dialog)).toContainText("Will vanish");

    await daemon.deleteTranscript(dir.path, "past-id-deleted");

    await launchPrimaryButton(dialog).click();
    await expect(launchError(dialog)).toHaveText(
      "no Claude Code session with that id in this directory",
    );
    await expect(dialog).toBeVisible();

    // Refetches: the vanished row is gone from the list.
    await expect(pastSessionRow(dialog, "Will vanish")).toHaveCount(0);
  } finally {
    await dir.cleanup();
  }
});

test("with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' (E9)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  await daemon.kill();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });

  const pastSessionsRequestFailed = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("/api/past-sessions"),
  );
  const dialog = await openLaunchDialog(page);
  await resumeTab(dialog).click();
  await pastSessionsRequestFailed;

  await expect(pastList(dialog)).toHaveText("Couldn't read sessions — try again");
  await expect(launchPrimaryButton(dialog)).toBeDisabled();
});

test("the filter narrows the list case-insensitively over title and last prompt, and shows 'No sessions match' when nothing does (REQ-14, E10)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-filter-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-filter-title", {
      title: "Fix e2e flake in shell.spec",
      lastPrompt: "look at the flaky retry",
    });
    await daemon.writeTranscript(dir.path, "past-id-filter-prompt", {
      title: "Plan the worktree lifecycle",
      lastPrompt: "run plan-work worktree-lifecycle",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await expect(pastList(dialog).getByRole("button")).toHaveCount(2);

    // Case-insensitive title match.
    await pastFilterInput(dialog).fill("FLAKE");
    await expect(pastList(dialog).getByRole("button")).toHaveCount(1);
    await expect(pastSessionRow(dialog, "Fix e2e flake in shell.spec")).toBeVisible();

    // Case-insensitive last-prompt match.
    await pastFilterInput(dialog).fill("WORKTREE-LIFECYCLE");
    await expect(pastList(dialog).getByRole("button")).toHaveCount(1);
    await expect(pastSessionRow(dialog, "Plan the worktree lifecycle")).toBeVisible();

    // Matches nothing.
    await pastFilterInput(dialog).fill("zzz-no-such-session");
    await expect(pastList(dialog)).toHaveText("No sessions match");
    await expect(launchPrimaryButton(dialog)).toBeDisabled();
    // A filter that deselects everything is another "nothing selected" state — the
    // footer must show no target, not "(untitled)".
    await expect(launchTarget(dialog)).toHaveText("Resume —");
  } finally {
    await dir.cleanup();
  }
});

test("a directory with no Claude Code sessions shows the empty state, button disabled", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-empty-");
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();

    await expect(pastList(dialog)).toHaveText("No Claude Code sessions in this directory");
    await expect(launchPrimaryButton(dialog)).toBeDisabled();
    // With nothing selected the footer must show no target — never the
    // selected-row-untitled fallback ("(untitled)") for a plain absence of selection.
    await expect(launchTarget(dialog)).toHaveText("Resume —");
  } finally {
    await dir.cleanup();
  }
});

test("the Resume tab shows a loading state while the fetch is in flight, then renders the list (States)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-loading-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-loading", { title: "Loading fixture" });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();

    let releaseFetch: () => void = () => {};
    const held = new Promise<void>((resolveHeld) => {
      releaseFetch = resolveHeld;
    });
    await page.route("**/api/past-sessions*", async (route) => {
      await held;
      await route.continue();
    });

    await resumeTab(dialog).click();
    await expect(pastList(dialog)).toHaveText("Loading sessions…");
    await expect(launchPrimaryButton(dialog)).toBeDisabled();

    releaseFetch();
    await expect(pastSessionRow(dialog, "Loading fixture")).toBeVisible();
    await expect(launchPrimaryButton(dialog)).toBeEnabled();
  } finally {
    await dir.cleanup();
  }
});

test("navigating to another directory while on Resume refetches, clears the selection, and selects the first enabled row again (REQ-8, User Flow 4)", async ({
  page,
  daemon,
}) => {
  const dirA = await browseScratchDirectory(daemon, "muster-e2e-past-refetch-a-");
  const dirB = await browseScratchDirectory(daemon, "muster-e2e-past-refetch-b-");
  try {
    await daemon.writeTranscript(dirA.path, "past-id-a-newest", {
      title: "A newest",
      mtime: new Date("2026-01-02T00:00:00Z"),
    });
    await daemon.writeTranscript(dirA.path, "past-id-a-older", {
      title: "A older",
      mtime: new Date("2026-01-01T00:00:00Z"),
    });
    await daemon.writeTranscript(dirB.path, "past-id-b-only", { title: "B only session" });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dirA.path)).click();
    await resumeTab(dialog).click();
    await expect(pastList(dialog).getByRole("button")).toHaveCount(2);

    const olderRow = pastSessionRow(dialog, "A older");
    await olderRow.click();
    await expect(olderRow).toHaveAttribute("aria-pressed", "true");

    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dirB.path)).click();

    await expect(pastList(dialog).getByRole("button")).toHaveCount(1);
    await expect(pastSessionRow(dialog, "A newest")).toHaveCount(0);
    await expect(pastSessionRow(dialog, "A older")).toHaveCount(0);
    const bOnlyRow = pastSessionRow(dialog, "B only session");
    await expect(bOnlyRow).toHaveAttribute("aria-pressed", "true");
  } finally {
    await dirA.cleanup();
    await dirB.cleanup();
  }
});

test("resuming from the list advances the repo's MRU and launch count without overwriting its remembered model or Start-in mode (REQ-15)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-req15-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "req15-seed-launch",
      model: "sonnet",
      permissionMode: "acceptEdits",
    });

    const before = (await getRepos(page, daemon)).find((r) => r.path === dir.path);
    if (!before) throw new Error("repo row not found after the seeding launch");
    expect(before.lastModel).toBe("sonnet");
    expect(before.lastPermissionMode).toBe("acceptEdits");
    expect(before.launchCount).toBe(1);

    await daemon.writeTranscript(dir.path, "past-id-req15", {
      title: "req15-resume-target",
      model: "claude-opus-4-1-20250805",
      permissionMode: "plan",
    });

    await waitForNextClockSecond(); // lastLaunchedAt is whole-second RFC3339 (session.ts)

    const dialog = await openLaunchDialog(page);
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "req15-resume-target").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const after = (await getRepos(page, daemon)).find((r) => r.path === dir.path);
    if (!after) throw new Error("repo row not found after the resume");
    expect(after.launchCount).toBe(before.launchCount + 1);
    expect(after.lastLaunchedAt).not.toBe(before.lastLaunchedAt);
    // The resume's own model/mode (opus/plan) must NOT overwrite the directory's
    // remembered defaults from the ordinary launch above.
    expect(after.lastModel).toBe("sonnet");
    expect(after.lastPermissionMode).toBe("acceptEdits");
  } finally {
    await dir.cleanup();
  }
});

test("INV-2's primary face recomputes on a tab switch in both directions", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-inv2-tabs-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-inv2-plain", {
      title: "Plain past row",
      permissionMode: "acceptEdits",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();

    // New, bypass checked: the danger face and the warning.
    await bypassRadio(dialog).check();
    await expect(launchPrimaryButton(dialog)).toHaveText("Launch without checks");
    await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);
    await expect(bypassWarning(dialog)).toBeVisible();

    // Resume, a non-bypass row selected: the ordinary face, warning hidden.
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Plain past row").click();
    await expect(launchPrimaryButton(dialog)).toHaveText("Resume");
    await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);
    await expect(bypassWarning(dialog)).toBeHidden();

    // New again: the bypass radio was never touched, so the danger face and the
    // warning are back — `refreshDialogFace` must re-run on this second switch too,
    // not only on the first.
    await newTab(dialog).click();
    await expect(launchPrimaryButton(dialog)).toHaveText("Launch without checks");
    await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);
    await expect(bypassWarning(dialog)).toBeVisible();
  } finally {
    await dir.cleanup();
  }
});

test("a past-sessions response for a directory no longer listed is dropped (W8, edge case 19)", async ({
  page,
  daemon,
}) => {
  const dirA = await browseScratchDirectory(daemon, "muster-e2e-past-stale-a-");
  const dirB = await browseScratchDirectory(daemon, "muster-e2e-past-stale-b-");
  try {
    await daemon.writeTranscript(dirA.path, "past-id-stale-a", { title: "Stale A row" });
    await daemon.writeTranscript(dirB.path, "past-id-stale-b", { title: "Fresh B row" });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dirA.path)).click();

    let releaseA: () => void = () => {};
    const heldA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    await page.route("**/api/past-sessions*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("directory") === dirA.path) {
        await heldA;
      }
      await route.continue();
    });

    // Fires the dirA fetch, held above.
    await resumeTab(dialog).click();
    // Navigates to dirB WHILE the Resume tab is active — its own fetch fires
    // immediately (a different query param, so the route hook above never holds it).
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dirB.path)).click();
    await expect(pastSessionRow(dialog, "Fresh B row")).toBeVisible();

    // The stale dirA response lands only now — `requestId`'s guard
    // (features/launchresume.ts's `fetchList`) must drop it rather than repaint dirB's
    // already-current list with dirA's rows.
    releaseA();
    await settleFor(page, 500); // the sanctioned fixed hold: proving an absence over a bounded window
    await expect(pastSessionRow(dialog, "Fresh B row")).toBeVisible();
    await expect(pastSessionRow(dialog, "Stale A row")).toHaveCount(0);
    await expect(pastListHead(dialog)).toHaveText(
      new RegExp(`^Claude sessions in ${basename(dirB.path)}\\s*·\\s*1$`),
    );
  } finally {
    await dirA.cleanup();
    await dirB.cleanup();
  }
});

test("a resume-bound row (source: resume) stays disabled and refuses a second resume with already_open (REQ-9, REQ-12)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-resume-bound-");
  try {
    await daemon.writeTranscript(dir.path, "claude-past-resume-bound", {
      title: "Resume-bound row",
      lastPrompt: "now bound via source resume",
    });

    await page.goto(daemon.dashboardUrl);
    const resumeRes = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-resume-bound",
    });
    expect(resumeRes.status).toBe(201);
    const resumedSession = resumeRes.body as { id: number; tmuxTarget: string };

    // The exact binding shape a real `claude --resume` produces
    // (kb:fact/resume-keeps-session-identity) — `AliveByClaudeSessionID` must count this
    // row as holding its claude id from this bind, not only from a startup-sourced one.
    await request.post(daemon.ingestURL("hook"), {
      data: sessionStartResume("claude-past-resume-bound", {
        musterSession: resumedSession.id,
        tmuxPane: await daemon.tmuxPaneId(resumedSession.tmuxTarget),
      }),
    });

    const dialog = await openLaunchDialog(page);
    // The resume above just made `dir` the most-recently-launched directory, so
    // `initOpen`'s restore lands the picker on `dir` itself rather than the browse
    // root — go up first, matching the E5 test's own precedent.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    const row = pastSessionRow(dialog, "Resume-bound row");
    await expect(row).toBeDisabled();
    await expect(row.locator(".lp")).toHaveText("open in Muster");

    const second = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-resume-bound",
    });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: { code: "already_open", id: resumedSession.id },
    });
  } finally {
    await dir.cleanup();
  }
});

test("an alive, unbound resumed row keeps its claude id disabled and refuses a second resume before it binds (kb:adr/launch-resume-pending-resume-holds-id)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-pending-");
  try {
    await daemon.writeTranscript(dir.path, "claude-past-pending", {
      title: "Pending resume row",
      lastPrompt: "sits at the bypass warning",
    });

    await page.goto(daemon.dashboardUrl);
    const first = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-pending",
    });
    expect(first.status).toBe(201);
    const firstSession = first.body as { id: number };

    // No SessionStart has arrived at all — the row is alive but still unbound
    // (`claudeSessionId` null on the wire) — yet the pending claim already holds the id
    // from the moment it was created, not only from its eventual bind.
    const second = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-pending",
    });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: { code: "already_open", id: firstSession.id },
    });

    const dialog = await openLaunchDialog(page);
    // Same reason as the resume-bound test above: the two postResume calls just made
    // `dir` the most-recently-launched directory, so go up first.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    const row = pastSessionRow(dialog, "Pending resume row");
    await expect(row).toBeDisabled();
    await expect(row.locator(".lp")).toHaveText("open in Muster");
  } finally {
    await dir.cleanup();
  }
});

test("a pending resume still holds its claude id across a daemon restart: the row stays disabled and a second resume is refused with 409 already_open", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-pending-restart-");
  try {
    await daemon.writeTranscript(dir.path, "claude-past-pending-restart", {
      title: "Pending resume survives restart",
      lastPrompt: "sits at the bypass warning across a restart",
    });

    await page.goto(daemon.dashboardUrl);
    const first = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-pending-restart",
    });
    expect(first.status).toBe(201);
    const firstSession = first.body as { id: number; tmuxTarget: string };

    await daemon.restart();
    const restored = findSession(await getState(page, daemon), firstSession.id);
    expect(restored.alive).toBe(true);
    expect(restored.claudeSessionId).toBeNull();
    expect(await daemon.tmuxPaneExists(restored.tmuxTarget)).toBe(true);

    await page.reload();
    const dialog = await openLaunchDialog(page);
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    const row = pastSessionRow(dialog, "Pending resume survives restart");
    await expect(row).toBeDisabled();
    await expect(row.locator(".lp")).toHaveText("open in Muster");

    const second = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-past-pending-restart",
    });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: { code: "already_open", id: firstSession.id },
    });
  } finally {
    await dir.cleanup();
  }
});

test("a session id freed by a /clear rebind is listed and resumable again (edge case 11)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-clear-rebind-");
  const holderDir = await browseScratchDirectory(daemon, "muster-e2e-clear-rebind-holder-");
  try {
    await daemon.writeTranscript(dir.path, "claude-clear-rebind-x", {
      title: "Freed by clear",
      lastPrompt: "will be resumed after being freed",
    });

    await page.goto(daemon.dashboardUrl);
    const holder = await launchSession(page, daemon, {
      directory: holderDir.path,
      title: "clear-rebind-holder",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-clear-rebind-x", await envelopeOpts(holder, daemon)),
    });

    const dialog = await openLaunchDialog(page);
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    const row = pastSessionRow(dialog, "Freed by clear");
    await expect(row).toBeDisabled();
    await expect(row.locator(".lp")).toHaveText("open in Muster");

    // The ordinary /clear pair (kb:fact/clear-mints-new-session-id): a
    // SessionEnd(reason:"clear") that is not a death hint, then a
    // SessionStart(source:"clear") minting a new id in the same pane.
    await request.post(daemon.ingestURL("hook"), {
      data: rawSessionEnd("claude-clear-rebind-x", "clear"),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-clear-rebind-y", {
        ...(await envelopeOpts(holder, daemon)),
        source: "clear",
      }),
    });

    // Reactivating the Resume tab refetches — the freed id now lists enabled and
    // resumable, per plan edge case 11.
    await newTab(dialog).click();
    await resumeTab(dialog).click();
    await expect(row).toBeEnabled();
    await expect(row.locator(".lp")).toHaveText("will be resumed after being freed");

    const resumed = await postResume(page, daemon, {
      directory: dir.path,
      resumeSessionId: "claude-clear-rebind-x",
    });
    expect(resumed.status).toBe(201);
  } finally {
    await dir.cleanup();
    await holderDir.cleanup();
  }
});

test("a resumed session with no recorded model shows unknown in the mainhead meta (kb:adr/launch-resume-null-model-reads-unknown)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-no-model-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-no-model", {
      title: "No recorded model",
      permissionMode: "acceptEdits",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "No recorded model").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const state = await getState(page, daemon);
    const created = state.sessions.filter((s) => s.directory === dir.path);
    expect(created, "exactly one session created for this directory").toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(session.model).toBeNull();

    await expect(page.locator("#mainhead .meta")).toContainText("unknown");
  } finally {
    await dir.cleanup();
  }
});

test("a long-titled bypass row's chip stays visible inside the row (REQ-11)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-long-title-");
  try {
    const longTitle =
      "A very long past-session title meant to overflow the row's ellipsised title column entirely on its own, word after word after word after word";
    await daemon.writeTranscript(dir.path, "past-id-long-title", {
      title: longTitle,
      permissionMode: "bypassPermissions",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();

    const row = pastSessionRow(dialog, longTitle);
    const chip = bypassChip(row);
    await expect(chip).toBeVisible();
    const rowBox = await row.boundingBox();
    const chipBox = await chip.boundingBox();
    if (!rowBox || !chipBox) throw new Error("both boxes must be measurable once visible");
    expect(chipBox.x).toBeGreaterThanOrEqual(rowBox.x - 0.5);
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  } finally {
    await dir.cleanup();
  }
});

test("selecting a past-session row by keyboard keeps focus on the chosen row", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-kbd-select-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-kbd-a", {
      title: "Keyboard row A",
      mtime: new Date("2026-01-02T00:00:00Z"),
    });
    await daemon.writeTranscript(dir.path, "past-id-kbd-b", {
      title: "Keyboard row B",
      mtime: new Date("2026-01-01T00:00:00Z"),
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();

    const rowB = pastSessionRow(dialog, "Keyboard row B");
    await rowB.focus();
    await page.keyboard.press("Space");
    await expect(rowB).toHaveAttribute("aria-pressed", "true");

    // A render tick — `renderPastList`'s `replaceChildren` rebuild is exactly what blew
    // focus to `<body>` before the fix (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
    await settleFor(page, 1200);
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      claudeSessionId:
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset["claudeSessionId"]
          : undefined,
    }));
    expect(active.tag).toBe("BUTTON");
    expect(active.claudeSessionId).toBe("past-id-kbd-b");
    await expect(rowB).toBeFocused();
  } finally {
    await dir.cleanup();
  }
});

test("#launch-error clears when switching tabs", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-error-tab-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-error-tab", { title: "Will vanish for tab" });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Will vanish for tab").click();

    await daemon.deleteTranscript(dir.path, "past-id-error-tab");
    await launchPrimaryButton(dialog).click();
    await expect(launchError(dialog)).toHaveText(
      "no Claude Code session with that id in this directory",
    );

    await newTab(dialog).click();
    await expect(launchError(dialog)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("#launch-error clears when a new row is selected", async ({ page, daemon }) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-error-select-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-error-select-gone", {
      title: "Will vanish for selection",
      mtime: new Date("2026-01-02T00:00:00Z"),
    });
    await daemon.writeTranscript(dir.path, "past-id-error-select-stays", {
      title: "Stays around",
      mtime: new Date("2026-01-01T00:00:00Z"),
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Will vanish for selection").click();

    await daemon.deleteTranscript(dir.path, "past-id-error-select-gone");
    await launchPrimaryButton(dialog).click();
    await expect(launchError(dialog)).toHaveText(
      "no Claude Code session with that id in this directory",
    );

    await pastSessionRow(dialog, "Stays around").click();
    await expect(launchError(dialog)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session'", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);
  // The tablist sitting inside the dialog's own labelling <h2> must not leak its own
  // text ("New session Session kind") into the dialog's accessible name.
  await expect(page.getByRole("dialog", { name: "New session", exact: true })).toBeVisible();

  await newTab(dialog).click();
  await expect(newTab(dialog)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(resumeTab(dialog)).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(newTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(newTab(dialog)).toBeFocused();
});

test("a fixture recorded with an unoffered permission mode resumes with it passed verbatim (kb:adr/launch-resume-passes-any-recorded-mode)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-past-dontask-");
  try {
    await daemon.writeTranscript(dir.path, "past-id-dontask", {
      title: "Unoffered mode row",
      permissionMode: "dontAsk",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Unoffered mode row").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const state = await getState(page, daemon);
    const created = state.sessions.filter((s) => s.directory === dir.path);
    expect(created, "exactly one session created for this directory").toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(session.permissionMode).toEqual({ value: "dontAsk", source: "seed" });

    const startCommand = await daemon.paneStartCommand(session.tmuxTarget);
    expect(startCommand).toContain("--permission-mode dontAsk");
  } finally {
    await dir.cleanup();
  }
});
