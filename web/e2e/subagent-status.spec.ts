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
// Fixture shapes (`agentId`, `backgroundTasks`) come from docs/history/spikes/canary-fields.md
// "Subagent and background-task fields" (2.1.259 probe, issue #14) via
// helpers/payloads.ts's `TurnActivityOpts.agentId` / `rawPermissionRequest`'s `opts` /
// `rawStop`'s `backgroundTasks`, added by this plan. `background_tasks` is fixture
// realism only (plan decision 3) — never asserted as a state input, only posted so the
// `Stop` payload matches what a real background-work `Stop` actually carries.
//
// Plan status-inconsistencies adds E1-E4 at the bottom (REQ-1 through REQ-4, REQ-8): a
// prompt-less idle_prompt changes nothing (kb:fact/clear-idle-prompt-carries-no-prompt-id),
// PostToolBatch is turn activity (kb:fact/plan-feedback-emits-only-post-tool-batch), a
// permission wait is cleared only by the agent that raised it
// (kb:fact/subagent-hooks-during-permission-wait), and an interrupt, which emits no hook,
// is read from the transcript the hooks name (kb:fact/interrupt-recorded-in-transcript).
// Those tests assert new behaviour and were collection-only at authoring.
//
// One scratch daemon per file via fileDaemon(): every test launches its own titled
// session into its own scratch directory and asserts only on that card.
import { queryEvents } from "./helpers/db";
import { expect, fileDaemon, settleFor, test } from "./helpers/fixtures";
import { appendTranscriptLine, transcriptPathIn, writeTranscript } from "./helpers/interrupt";
import {
  envelopedSessionStart,
  interruptTranscriptLine,
  rawExitPlanModePermissionRequest,
  rawIdlePromptWithoutPromptId,
  rawNotification,
  rawPermissionRequest,
  rawPostToolBatch,
  rawPostToolUse,
  rawPreToolUse,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
  runningSubagentTask,
} from "./helpers/payloads";
import {
  envelopeOpts,
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
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
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
    const session = await launchSession(page, daemon(), {
      directory: dir,
      title: "subagent-e4-plan-auto",
    });
    const card = sessionCard(page, "subagent-e4-plan-auto");
    const claudeId = "claude-e4-plan-auto";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
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
    const session = await launchSession(page, daemon(), {
      directory: dir,
      title: "subagent-e7-failure-clear",
    });
    const card = sessionCard(page, "subagent-e7-failure-clear");
    const claudeId = "claude-e7-failure-clear";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
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
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2" }),
    });
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
    const session = await launchSession(page, daemon(), {
      directory: dir,
      title: "subagent-e8-background",
    });
    const card = sessionCard(page, "subagent-e8-background");
    const claudeId = "claude-e8-background";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
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
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await request.post(daemon().ingestURL("hook"), { data: rawStop(claudeId, { promptId: "p2" }) });
    await expect(stateBadge(card)).toHaveText(/idle/i);
  } finally {
    await cleanup();
  }
});

// Plan status-inconsistencies E1 (REQ-1, #57): after /clear Claude Code posts an idle_prompt
// with no prompt_id; Muster used to read the missing id as an open turn and flip the card to
// needs input.
test("a prompt-less idle_prompt leaves an idle card idle with no attention (E1, REQ-1)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e1" });
    const card = sessionCard(page, "status-e1");
    const claudeId = "claude-status-e1";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawStop(claudeId, { promptId: "p1" }) });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    const before = findSession(await getState(page, daemon()), session.id);

    await request.post(daemon().ingestURL("hook"), {
      data: rawIdlePromptWithoutPromptId(claudeId),
    });
    // The event is persisted even though it changes nothing: wait for that, not a sleep.
    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the prompt-less idle_prompt to be persisted",
      })
      .toBe(4); // SessionStart, UserPromptSubmit, Stop, Notification

    await expect(stateBadge(card)).toHaveText(/idle/i);
    await expect(card.getByText(/needs input/i)).toHaveCount(0);
    const after = findSession(await getState(page, daemon()), session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.failure).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);
  } finally {
    await cleanup();
  }
});

// E2 (REQ-2, #32): rejecting a plan with feedback emits only PostToolBatch, so it has to
// count as turn activity and take the wait to planning (the session is still in plan mode).
test("an unmarked PostToolBatch moves a card waiting on ExitPlanMode from needs input to planning (E2, REQ-2)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e2" });
    const card = sessionCard(page, "status-e2");
    const claudeId = "claude-status-e2";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", permissionMode: "plan" }),
    });
    await expect(stateBadge(card)).toHaveText(/planning/i);
    await request.post(daemon().ingestURL("hook"), {
      data: rawPreToolUse(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawExitPlanModePermissionRequest(claudeId, "p1"),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    expect(findSession(await getState(page, daemon()), session.id).attention?.reason).toBe(
      "permission",
    );

    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolBatch(claudeId, { promptId: "p1", permissionMode: "plan" }),
    });
    await expect(stateBadge(card)).toHaveText(/planning/i);
    await expect(card.getByText(/needs input/i)).toHaveCount(0);
    expect(findSession(await getState(page, daemon()), session.id).attention).toBeNull();
  } finally {
    await cleanup();
  }
});

// E3 (REQ-3, #40): a background subagent keeps emitting tool hooks while the main agent
// waits on a permission prompt; only the main agent's own activity ends that wait.
test("subagent-marked tool activity leaves a main-agent permission wait on needs input, and the main agent's own PostToolUse then ends it (E3, REQ-3)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e3" });
    const card = sessionCard(page, "status-e3");
    const claudeId = "claude-status-e3";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), { data: rawPermissionRequest(claudeId, "p1") });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const waiting = findSession(await getState(page, daemon()), session.id);
    const attentionSince = waiting.attention?.since;
    expect(attentionSince).toBeTruthy();

    await request.post(daemon().ingestURL("hook"), {
      data: rawPreToolUse(claudeId, {
        promptId: "p1",
        permissionMode: "default",
        agentId: "agent-1",
        toolName: "Read",
      }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1" }),
    });
    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the subagent's tool hooks to be persisted",
      })
      .toBe(5); // SessionStart, UserPromptSubmit, PermissionRequest, PreToolUse, PostToolUse

    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const stillWaiting = findSession(await getState(page, daemon()), session.id);
    expect(stillWaiting.state).toBe("needs_input");
    expect(stillWaiting.attention?.reason).toBe("permission");
    expect(stillWaiting.attention?.since).toBe(attentionSince);

    // Control: the agent that raised the wait ends it, so the events above were applied
    // rather than dropped.
    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    expect(findSession(await getState(page, daemon()), session.id).attention).toBeNull();
  } finally {
    await cleanup();
  }
});

// REQ-3's other half: a wait raised by a subagent is ended by that subagent, and is not
// ended by the main agent's unmarked activity or a second subagent's.
test("a subagent-raised permission wait survives main-agent and second-subagent activity and ends on the owning subagent's PostToolUse (REQ-3, INV-B)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e3b" });
    const card = sessionCard(page, "status-e3b");
    const claudeId = "claude-status-e3b";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawPermissionRequest(claudeId, "p1", { agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-2" }),
    });
    await expect
      .poll(async () => (await queryEvents(daemon().dbPath, claudeId)).length, {
        message: "waiting for the other agents' PostToolUse hooks to be persisted",
      })
      .toBe(5); // SessionStart, UserPromptSubmit, PermissionRequest, PostToolUse x2
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const held = findSession(await getState(page, daemon()), session.id);
    expect(held.state).toBe("needs_input");
    expect(held.attention?.reason).toBe("permission");

    await request.post(daemon().ingestURL("hook"), {
      data: rawPostToolUse(claudeId, { promptId: "p1", agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    expect(findSession(await getState(page, daemon()), session.id).attention).toBeNull();
  } finally {
    await cleanup();
  }
});

// REQ-8: the main turn ending does not answer a subagent's open prompt.
test("a main Stop while a subagent owns the permission wait keeps needs input and its attention (REQ-8)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-req8" });
    const card = sessionCard(page, "status-req8");
    const claudeId = "claude-status-req8";

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon())),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawPermissionRequest(claudeId, "p1", { agentId: "agent-1" }),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);

    await request.post(daemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningSubagentTask()] }),
    });
    await expect
      .poll(async () => findSession(await getState(page, daemon()), session.id).backgroundTasks, {
        message: "waiting for the Stop to be applied (it carries one running task)",
      })
      .toBe(1);
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    const after = findSession(await getState(page, daemon()), session.id);
    expect(after.state).toBe("needs_input");
    expect(after.attention?.reason).toBe("permission");
  } finally {
    await cleanup();
  }
});

// E4 (REQ-4, #59): Esc emits no hook at all; the daemon finds the interrupt in the
// transcript the hooks name, on its ~5 s liveness-poll tick.
test("a working card whose transcript gains an interrupt line for its current prompt reads idle within 10 s (E4, REQ-4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e4" });
    const card = sessionCard(page, "status-e4");
    const claudeId = "claude-status-e4";
    const transcriptPath = transcriptPathIn(dir);

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, {
        ...(await envelopeOpts(session, daemon())),
        transcriptPath,
      }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", transcriptPath }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    const working = findSession(await getState(page, daemon()), session.id);

    await writeTranscript(transcriptPath, [interruptTranscriptLine("p1")]);

    // Shortened from the 15 s default to the plan's own bound: one poll tick is ~5 s.
    await expect(stateBadge(card)).toHaveText(/idle/i, { timeout: 10_000 });
    const idle = findSession(await getState(page, daemon()), session.id);
    expect(idle.state).toBe("idle");
    expect(idle.attention).toBeNull();
    expect(idle.failure).toBeNull();
    expect(idle.lastActivity).toBe(working.lastActivity);
  } finally {
    await cleanup();
  }
});

test("declining a permission prompt, an interrupt for tool use, takes a needs input card to idle and clears its attention (E4, REQ-4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e4c" });
    const card = sessionCard(page, "status-e4c");
    const claudeId = "claude-status-e4c";
    const transcriptPath = transcriptPathIn(dir);

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, {
        ...(await envelopeOpts(session, daemon())),
        transcriptPath,
      }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", transcriptPath }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawPermissionRequest(claudeId, "p1", { transcriptPath }),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);

    await writeTranscript(transcriptPath, [interruptTranscriptLine("p1", true)]);

    // Shortened from 15 s to the plan's 10 s bound for one ~5 s poll tick.
    await expect(stateBadge(card)).toHaveText(/idle/i, { timeout: 10_000 });
    const idle = findSession(await getState(page, daemon()), session.id);
    expect(idle.attention).toBeNull();
    expect(idle.failure).toBeNull();
  } finally {
    await cleanup();
  }
});

// Edge case 7 (D8): an interrupt line for an older prompt is not the current turn's.
test("an interrupt line for an older prompt id leaves a working card working until the current prompt's line arrives (REQ-4)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon().dashboardUrl);
    const session = await launchSession(page, daemon(), { directory: dir, title: "status-e4d" });
    const card = sessionCard(page, "status-e4d");
    const claudeId = "claude-status-e4d";
    const transcriptPath = transcriptPathIn(dir);

    await request.post(daemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, {
        ...(await envelopeOpts(session, daemon())),
        transcriptPath,
      }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", transcriptPath }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", transcriptPath }),
    });
    await request.post(daemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2", transcriptPath }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);

    await writeTranscript(transcriptPath, [interruptTranscriptLine("p1")]);
    // A stays-unchanged hold over more than one ~5 s poll tick.
    await settleFor(page, 6_000);
    await expect(stateBadge(card)).toHaveText(/working/i);

    await appendTranscriptLine(transcriptPath, interruptTranscriptLine("p2"));
    // Shortened from 15 s to the plan's 10 s bound for one ~5 s poll tick.
    await expect(stateBadge(card)).toHaveText(/idle/i, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});
