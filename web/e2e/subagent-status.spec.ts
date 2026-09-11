// Plan claude-status-fixes — REQ-1 through REQ-5 (#14 subagent-idle-while-working, #15/
// #20 stale attention/failure). kb:anchor/state.tracked / kb:anchor/state.transitions / kb:anchor/state.ordering: a subagent-marked
// turn-activity or PermissionRequest event for an already-closed prompt is NOT a
// straggler — it moves the session to ACTIVE / needs_input without reopening the closed
// prompt — and every transition into ACTIVE clears both `attention` and `failure`
// (INV-A, INV-F).
//
// Authored against a tree with none of this built yet — every test here was
// collection-only at authoring. Validated live against daemon-impl's landed
// `FromSubagent`/attention-failure-clear changes (including its Fix Attempt 1, which
// closed an INV-F gap in the permission/idle doors too). The pre-existing straggler
// test this plan pins unchanged (REQ-5, INV-G) lives in sessions.spec.ts ("a straggler
// turn-activity for an already-closed prompt does not move the card off idle (E6)") and
// is not duplicated here.
//
// Fixture shapes (`agentId`, `backgroundTasks`) come from spikes/canary-fields.md
// "Subagent and background-task fields" (2.1.259 probe, issue #14) via
// helpers/payloads.ts's `TurnActivityOpts.agentId` / `rawPermissionRequest`'s `opts` /
// `rawStop`'s `backgroundTasks`, added by this plan. `background_tasks` is fixture
// realism only (plan decision 3) — never asserted as a state input, only posted so the
// `Stop` payload matches what a real background-work `Stop` actually carries.
//
// One scratch daemon per file via fileDaemon(): every test launches its own titled
// session into its own scratch directory and asserts only on that card.
import { queryEvents } from "./helpers/db";
import { expect, fileDaemon, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawNotification,
  rawPermissionRequest,
  rawPostToolUse,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
  runningSubagentTask,
} from "./helpers/payloads";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
  waitForNextClockSecond,
} from "./helpers/session";

const daemon = fileDaemon();

test("subagent permission after the parent Stop moves the card to needs input, and the unmarked Notification straggler that follows changes nothing (E2)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "subagent-e2" });
    const card = sessionCard(page, "subagent-e2");
    const claudeId = "claude-e2-subagent";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId, { promptId: "p1" }) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    // Parent Stop with background work still outstanding — decision 3: still lands idle.
    await request.post(daemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningSubagentTask()] }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);

    // REQ-3: a marked PermissionRequest for the now-closed p1 is not a straggler.
    await request.post(daemon().ingestURL("hook"), {
      data: rawPermissionRequest(claudeId, "p1", { agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const afterPermission = findSession(await getState(page, daemon()), session.id);
    expect(afterPermission.state).toBe("needs_input");
    expect(afterPermission.attention?.reason).toBe("permission");
    const sinceAfterPermission = afterPermission.attention?.since;
    expect(sinceAfterPermission).toBeTruthy();

    // The unmarked Notification that follows (measured: it never carries the marker)
    // is a genuine straggler for the closed prompt — no second transition, no field
    // change. Wait for actual persistence before asserting nothing moved (the sqlite
    // oracle sessions.spec.ts's straggler test already uses for the same reason).
    await request.post(daemon().ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });
    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the straggler Notification to be persisted",
      })
      .toBe(5); // SessionStart, UserPromptSubmit, Stop, PermissionRequest, Notification
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const afterNotification = findSession(await getState(page, daemon()), session.id);
    expect(afterNotification.attention?.since).toBe(sinceAfterPermission);

    // REQ-2: a marked PostToolUse for the closed p1 resumes the session and clears
    // attention — the subagent's work continuing past the permission grant.
    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    const afterResume = findSession(await getState(page, daemon()), session.id);
    expect(afterResume.attention).toBeNull();
  } finally {
    await cleanup();
  }
});

test("#20's shape — attention latched under plan mode clears when activity arrives under auto, landing working not needs input (E4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "subagent-e4-plan-auto" });
    const card = sessionCard(page, "subagent-e4-plan-auto");
    const claudeId = "claude-e4-plan-auto";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", permissionMode: "plan" }),
    });
    await expect(stateBadge(card)).toHaveText(/planning/i);

    await request.post(daemon().ingestURL("hook"), { data: rawPermissionRequest(claudeId, "p1") });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const latched = findSession(await getState(page, daemon()), session.id);
    expect(latched.attention?.reason).toBe("permission");

    // Same open prompt, activity arrives under a different permission_mode (#20's
    // plan-acceptance path) — REQ-4: every transitioning turn-activity event clears
    // attention and failure, not only Stop-family events.
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", permissionMode: "auto" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await expect(card.getByText(/needs input/i)).toHaveCount(0);

    const resumed = findSession(await getState(page, daemon()), session.id);
    expect(resumed.attention).toBeNull();
    expect(resumed.permissionMode).toEqual({ value: "auto", source: "hook" });
  } finally {
    await cleanup();
  }
});

test("a failed turn's note is cleared once the next turn starts, not carried into working (E7)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "subagent-e7-failure-clear" });
    const card = sessionCard(page, "subagent-e7-failure-clear");
    const claudeId = "claude-e7-failure-clear";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId, { promptId: "p1" }) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawStopFailure(claudeId, { promptId: "p1", error: "server_error" }),
    });
    await expect(stateBadge(card)).toHaveText(/failed/i);
    const failed = findSession(await getState(page, daemon()), session.id);
    expect(failed.failure?.error).toBe("server_error");
    const stateSinceBefore = failed.stateSince;

    // stateSince is wire-formatted RFC3339 (whole-second resolution — see
    // waitForNextClockSecond's doc comment in helpers/session.ts); posting p2 in the
    // same wall-clock second as the StopFailure above would tie on the timestamp even
    // though the transition genuinely happened, so force a real second boundary before
    // asserting the value moved.
    await waitForNextClockSecond();
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId, { promptId: "p2" }) });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await expect(card.getByText(/server_error/)).toHaveCount(0);

    const resumed = findSession(await getState(page, daemon()), session.id);
    expect(resumed.failure).toBeNull();
    // stateSince moved from stateSinceBefore (a real transition happened) — the separate
    // lastActivity field is the daemon-tests' to pin precisely; here only the
    // user-visible failure note is ours.
    expect(resumed.stateSince).not.toBe(stateSinceBefore);
  } finally {
    await cleanup();
  }
});

test("subagent tool activity past the parent Stop keeps the card working, with stateSince moving at each transition (E8)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "subagent-e8-background" });
    const card = sessionCard(page, "subagent-e8-background");
    const claudeId = "claude-e8-background";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId, { promptId: "p1" }) });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningSubagentTask()] }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    const idleState = findSession(await getState(page, daemon()), session.id);
    expect(idleState.state).toBe("idle");
    const idleSince = new Date(idleState.stateSince).getTime();

    // REQ-2: marked PostToolUse for the closed p1 is not a straggler — the subagent is
    // still working past the parent's Stop. stateSince is whole-second RFC3339 (see
    // waitForNextClockSecond's doc comment in helpers/session.ts); force a real second
    // boundary before the next transition so its stateSince is provably later, not
    // merely tied with idleSince from posting both hooks inside one wall-clock second.
    await waitForNextClockSecond();
    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    const workingState = findSession(await getState(page, daemon()), session.id);
    expect(workingState.state).toBe("working");
    const workingSince = new Date(workingState.stateSince).getTime();
    expect(workingSince).toBeGreaterThan(idleSince);

    // Resumption is ordinary from here: a fresh prompt, closed by its own Stop.
    await request.post(daemon().ingestURL("hook"), { data: rawUserPromptSubmit(claudeId, { promptId: "p2" }) });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await request.post(daemon().ingestURL("hook"), { data: rawStop(claudeId, { promptId: "p2" }) });
    await expect(stateBadge(card)).toHaveText(/idle/i);
  } finally {
    await cleanup();
  }
});
