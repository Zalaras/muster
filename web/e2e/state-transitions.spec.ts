// Plan state-issues — REQ-1 through REQ-13 (#65, #66, #70, #72, #78, #86, #87), driven
// end-to-end: Claude Code is faked by synthesized hook POSTs (shapes from kb:fact/compact-hook-sequence,
// kb:fact/local-command-orphan-idle-prompt, kb:fact/background-subagent-fresh-prompt-id,
// kb:fact/subagent-declared-mode-on-hooks, kb:fact/subagent-stopfailure-carries-agent-id,
// kb:fact/notification-types-observed, kb:fact/permission-wait-gets-no-idle-prompt) and the card's
// state badge is what is asserted, with the daemon's own `GET /api/state` as the oracle for the
// fields the card does not show (`attention`, `failure`, `lastActivity`, `backgroundTasks`,
// `permissionMode`, `stateSince`, the compaction counter).
//
// Fixture plan: one scratch daemon per file via fileDaemon(). Every test launches and drives its
// own title-scoped session (uniqueTitle) and asserts only on that card and that session's
// object; no rail order, count or other daemon-global state is read.
//
// Out of this file by design: the interrupted-compaction / early-Esc gap (#78) has no event to
// drive and is accepted on record (plan edge case 5); a legacy `needs_input`/`idle` row
// (REQ-3's last clause, REQ-5's second sentence, edge case 11) can only be persisted by an
// earlier daemon, so it is the unit tests' (D2/D3); `unread` follows the terminal registry, not
// a hook, and is the unit tests' too.
//
// "Persisted" below is the HookFeed's wait for the daemon's event table to hold every hook sent
// (plus a 500 ms hold): every stays-unchanged assertion makes it first, so it cannot pass only
// because the event had not been applied yet.
import { expect, fileDaemon, test, uniqueTitle } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawIdlePromptWithoutPromptId,
  rawNotification,
  rawPermissionRequest,
  rawPostToolUse,
  rawPreCompact,
  rawPreToolUse,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
  runningSubagentTask,
  sessionStartResume,
} from "./helpers/payloads";
import { envelopeOpts, stateBadge } from "./helpers/session";
import { finishTurn, HookFeed, openBoundSession, snapshot } from "./helpers/state-transitions";

const daemon = fileDaemon();

// ---------------------------------------------------------------------------------------------
// Compaction (REQ-6..REQ-9, REQ-10, INV-C; #65, #66)
// ---------------------------------------------------------------------------------------------

test("a compaction begun on an idle card reads working, and its SessionStart for the same prompt lands idle (E1, REQ-6, REQ-8)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e1"));
  try {
    await finishTurn(s.feed, "p1", { lastAssistantMessage: "first reply" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // kb:fact/compact-hook-sequence step 1: PreCompact under a fresh prompt_id no
    // UserPromptSubmit opened.
    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const during = await snapshot(page, daemon(), s.session.id);
    expect(during.state).toBe("working");
    expect(during.attention).toBeNull();
    expect(during.failure).toBeNull();
    expect(during.context.compactions).toBe(1);

    // Step 3: SessionStart(source:"compact") with the same session_id and the same prompt_id.
    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc1",
        model: null,
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.failure).toBeNull();
    expect(after.lastActivity).toBe("first reply");
    expect(after.lastPrompt).toBe("do the thing");
    expect(after.context.compactions).toBe(1);
    expect(after.backgroundTasks).toBe(0);
  } finally {
    await s.cleanup();
  }
});

test("a compaction on a card that never had a turn reads working and then idle, never started (E1b, INV-C, REQ-6, REQ-8, #66)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e1b"));
  try {
    await expect(stateBadge(s.card)).toHaveText(/started/i);

    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc1",
        model: null,
      }),
    );
    // The compaction's SessionStart used to bind as a plain startup: the card read started.
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    expect((await snapshot(page, daemon(), s.session.id)).state).toBe("idle");
  } finally {
    await s.cleanup();
  }
});

test("a compaction in a plan-mode session reads working, never planning, then lands idle (REQ-6)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-plan-compact"), {
    permissionMode: "plan",
  });
  try {
    // The latch reads plan after a plan-mode turn; the card is idle once it ends.
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1", permissionMode: "plan" }));
    await expect(stateBadge(s.card)).toHaveText(/planning/i);
    await finishTurn(s.feed, "p2", { permissionMode: "plan" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    expect((await snapshot(page, daemon(), s.session.id)).permissionMode.value).toBe("plan");

    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    // stateBadge matches the whole word, so `working` here excludes `planning`.
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc1",
        model: null,
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
  } finally {
    await s.cleanup();
  }
});

test("a compaction inside a working turn only counts: no transition, and its SessionStart under a fresh prompt id changes nothing (E1c, REQ-7, REQ-9)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e1c"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const before = await snapshot(page, daemon(), s.session.id);

    // An auto-compaction was not measured; its prompt_id here is the strictest choice for
    // REQ-7 ("the turn's current prompt is unchanged"): one the turn never used.
    await s.feed.post(rawPreCompact(s.claudeId, "pc-auto"));
    await expect(s.card.getByText(/⟳1\b/)).toBeVisible();
    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc-auto",
        model: null,
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("working");
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.context.compactions).toBe(1);

    // The turn's own Stop still ends it.
    await s.feed.post(rawStop(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
  } finally {
    await s.cleanup();
  }
});

test("a compaction inside a working turn whose SessionStart names the turn's own prompt changes nothing (E1d, REQ-7, REQ-9)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e1d"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const before = await snapshot(page, daemon(), s.session.id);

    // The turn's current prompt is open and named by the SessionStart, but no REQ-6
    // compaction opened it: it must not be read as "the compaction's prompt".
    await s.feed.post(rawPreCompact(s.claudeId, "p1"));
    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "p1",
        model: null,
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("working");
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.context.compactions).toBe(1);
  } finally {
    await s.cleanup();
  }
});

test("a compact SessionStart on an idle card whose PreCompact was lost changes nothing (edge case 1, REQ-9)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-lost-pre"));
  try {
    await finishTurn(s.feed, "p1", { lastAssistantMessage: "first reply" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc-lost",
        model: null,
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.lastActivity).toBe("first reply");
  } finally {
    await s.cleanup();
  }
});

test("a compact SessionStart that arrives before its PreCompact is a no-op, and the later idle_prompt ends the compaction (edge case 3, REQ-8, REQ-9, REQ-2)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-reorder"));
  try {
    await finishTurn(s.feed, "p1");
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc1",
        model: null,
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    // The 60 s idle_prompt after a compaction names the compaction's prompt
    // (kb:fact/compact-hook-sequence) and ends it.
    await s.feed.post(rawNotification(s.claudeId, "pc1", "idle_prompt"));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    expect((await snapshot(page, daemon(), s.session.id)).attention).toBeNull();
  } finally {
    await s.cleanup();
  }
});

test("when a compaction's SessionStart is lost, or nothing was compacted, the idle_prompt naming its prompt lands idle, never needs input (edge cases 2 and 4, REQ-2, INV-B)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-compact-idle"));
  try {
    await finishTurn(s.feed, "p1");
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // "Not enough messages to compact": PreCompact only (kb:fact/compact-hook-sequence).
    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(rawNotification(s.claudeId, "pc1", "idle_prompt"));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.context.compactions).toBe(1);
  } finally {
    await s.cleanup();
  }
});

test("a new prompt during a compaction is an ordinary turn, and the compaction's late SessionStart then changes nothing (edge case 7, REQ-9)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-compact-turn"));
  try {
    await finishTurn(s.feed, "p1");
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    await s.feed.post(rawPreCompact(s.claudeId, "pc1", { trigger: "manual" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await finishTurn(s.feed, "p2", { lastAssistantMessage: "second reply" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(
      envelopedSessionStart(s.claudeId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "compact",
        promptId: "pc1",
        model: null,
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.lastActivity).toBe("second reply");
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-10): runs green at authoring — startup, clear and resume binds are
// untouched by the compact-bind change.
test("SessionStart with source startup, clear and resume still lands started, started and idle (REQ-10 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-sources"));
  try {
    await expect(stateBadge(s.card)).toHaveText(/started/i);
    await finishTurn(s.feed, "p1");
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // /clear: a new session id in the same pane (kb:fact/clear-mints-new-session-id).
    const clearedId = `${s.claudeId}-cleared`;
    const clearedFeed = new HookFeed(request, daemon(), clearedId);
    await clearedFeed.post(
      envelopedSessionStart(clearedId, {
        ...(await envelopeOpts(s.session, daemon())),
        source: "clear",
        model: null,
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/started/i);

    // --resume: the same session id re-binds and lands idle (kb:fact/resume-keeps-session-identity).
    await clearedFeed.post(
      sessionStartResume(clearedId, {
        ...(await envelopeOpts(s.session, daemon())),
        model: null,
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
  } finally {
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------
// idle_prompt (REQ-1..REQ-5, INV-B; #72, #87)
// ---------------------------------------------------------------------------------------------

test("an idle_prompt naming a prompt no hook opened leaves an idle card idle, then closes that prompt (E2, REQ-1, REQ-3, #87)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e2"));
  try {
    await finishTurn(s.feed, "p1", { lastAssistantMessage: "first reply" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const before = await snapshot(page, daemon(), s.session.id);

    // A local slash command such as /context mints a prompt_id with no hook; the idle_prompt
    // ~60 s later carries that never-opened id (kb:fact/local-command-orphan-idle-prompt).
    await s.feed.post(rawNotification(s.claudeId, "local-cmd-1", "idle_prompt"));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.lastActivity).toBe("first reply");

    // REQ-3: the idle_prompt closed that prompt, so an unmarked event still carrying it is a
    // straggler that cannot start a turn (an unseen id would).
    await s.feed.post(rawPostToolUse(s.claudeId, { promptId: "local-cmd-1" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    expect((await snapshot(page, daemon(), s.session.id)).stateSince).toBe(before.stateSince);
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-4): runs green at authoring — a closed prompt's idle_prompt was
// already inert.
test("an idle_prompt for the prompt a Stop already closed changes nothing (REQ-4 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-closed-idle"));
  try {
    await finishTurn(s.feed, "p1", { lastAssistantMessage: "first reply" });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(rawNotification(s.claudeId, "p1", "idle_prompt"));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-4, edge case 13): runs green at authoring.
test("a straggler idle_prompt for a closed prompt arriving after the next turn started leaves the card working (edge case 13, REQ-4 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-straggler-idle"));
  try {
    await finishTurn(s.feed, "p1");
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p2" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(rawNotification(s.claudeId, "p1", "idle_prompt"));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("working");
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.attention).toBeNull();
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-4): runs green at authoring — it is the existing #57 shape, kept.
test("an idle_prompt with no prompt_id after /clear changes nothing (REQ-4 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-no-prompt-id"));
  try {
    await finishTurn(s.feed, "p1");
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(rawIdlePromptWithoutPromptId(s.claudeId));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);
  } finally {
    await s.cleanup();
  }
});

test("an idle_prompt naming the open turn's prompt ends the turn: a working card lands idle with its earlier fields intact (E3, REQ-2)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e3"));
  try {
    await finishTurn(s.feed, "p1", {
      lastAssistantMessage: "first reply",
      backgroundTasks: [runningSubagentTask()],
    });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p2" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(rawNotification(s.claudeId, "p2", "idle_prompt"));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();
    expect(after.failure).toBeNull();
    // REQ-2: lastActivity and backgroundTasks are not the idle_prompt's to change.
    expect(after.lastActivity).toBe("first reply");
    expect(after.backgroundTasks).toBe(1);

    // The turn's prompt is closed: a late unmarked tool event for it cannot reopen it.
    await s.feed.post(rawPostToolUse(s.claudeId, { promptId: "p2" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
  } finally {
    await s.cleanup();
  }
});

test("an idle_prompt naming the open turn's prompt lands a planning card idle (REQ-2)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-plan-idle"), {
    permissionMode: "plan",
  });
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1", permissionMode: "plan" }));
    await expect(stateBadge(s.card)).toHaveText(/planning/i);

    await s.feed.post(rawNotification(s.claudeId, "p1", "idle_prompt"));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    expect((await snapshot(page, daemon(), s.session.id)).attention).toBeNull();
  } finally {
    await s.cleanup();
  }
});

test("an idle_prompt naming a background subagent's fresh prompt id ends that stretch: working lands idle, never stuck on needs input (edge case 9, REQ-2, #72)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-bg-fresh"));
  try {
    await finishTurn(s.feed, "p1", {
      lastAssistantMessage: "launched it",
      backgroundTasks: [runningSubagentTask("agent-bg")],
    });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // kb:fact/background-subagent-fresh-prompt-id: after the main Stop the subagents' tool
    // hooks arrive under a fresh prompt_id no UserPromptSubmit opened and no Stop closes.
    await s.feed.post(
      rawPreToolUse(s.claudeId, {
        promptId: "bg-fresh-1",
        permissionMode: "default",
        agentId: "agent-bg",
        toolName: "Read",
        filePath: "/tmp/x.txt",
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(rawNotification(s.claudeId, "bg-fresh-1", "idle_prompt"));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/needs input/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.attention).toBeNull();

    // Edge case 9's tail: a later subagent-marked event on the now-closed prompt moves the
    // card back to working, as it does today (kb:adr/lifecycle-subagent-marked-events-not-stragglers).
    await s.feed.post(
      rawPostToolUse(s.claudeId, {
        promptId: "bg-fresh-1",
        permissionMode: "default",
        agentId: "agent-bg",
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/working/i);
  } finally {
    await s.cleanup();
  }
});

test("an idle_prompt for the open prompt of a PermissionRequest leaves the card on needs input with the same wait (E4, REQ-1, REQ-3)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e4"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await s.feed.post(rawPermissionRequest(s.claudeId, "p1"));
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const before = await snapshot(page, daemon(), s.session.id);
    expect(before.attention?.reason).toBe("permission");

    await s.feed.post(rawNotification(s.claudeId, "p1", "idle_prompt"));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("needs_input");
    expect(after.attention?.reason).toBe("permission");
    expect(after.attention?.since).toBe(before.attention?.since);
    expect(after.stateSince).toBe(before.stateSince);
  } finally {
    await s.cleanup();
  }
});

test("an idle_prompt on a subagent's permission wait keeps the wait, and the subagent's own next activity still clears it (edge case 10, REQ-3, REQ-5)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e4-sub"));
  try {
    await finishTurn(s.feed, "p1", { backgroundTasks: [runningSubagentTask("agent-1")] });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // A background subagent's PermissionRequest under a fresh, still-open prompt id.
    await s.feed.post(rawPermissionRequest(s.claudeId, "bg-perm-1", { agentId: "agent-1" }));
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const before = await snapshot(page, daemon(), s.session.id);
    expect(before.attention?.reason).toBe("permission");

    await s.feed.post(rawNotification(s.claudeId, "bg-perm-1", "idle_prompt"));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("needs_input");
    expect(after.attention?.reason).toBe("permission");
    expect(after.attention?.since).toBe(before.attention?.since);

    // REQ-5 for a permission wait: only the agent that raised it ends it.
    await s.feed.post(rawPostToolUse(s.claudeId, { promptId: "bg-perm-1", agentId: "agent-1" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    expect((await snapshot(page, daemon(), s.session.id)).attention).toBeNull();
  } finally {
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------
// Mode latch (REQ-12; #70)
// ---------------------------------------------------------------------------------------------

test("a subagent-marked event carrying dontAsk leaves a planning card planning and the latch on plan (E5, REQ-12, #70)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e5"), {
    permissionMode: "plan",
  });
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1", permissionMode: "plan" }));
    await expect(stateBadge(s.card)).toHaveText(/planning/i);

    // kb:fact/subagent-declared-mode-on-hooks: the built-in claude-code-guide declares dontAsk
    // and its tool hooks carry it with their agent_id, under a plan-mode parent.
    await s.feed.post(
      rawPreToolUse(s.claudeId, {
        promptId: "p1",
        permissionMode: "dontAsk",
        agentId: "agent-guide",
        agentType: "claude-code-guide",
        toolName: "Read",
        filePath: "/tmp/x.txt",
      }),
    );
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/planning/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("planning");
    expect(after.permissionMode).toEqual({ value: "plan", source: "hook" });
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-12, "main-agent events latch exactly as today"): runs green at
// authoring — approving a plan mid-turn is still a real mode change, and still reads working.
test("a main-agent event carrying acceptEdits still moves a planning card to working and the latch to acceptEdits (REQ-12 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-main-latch"), {
    permissionMode: "plan",
  });
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1", permissionMode: "plan" }));
    await expect(stateBadge(s.card)).toHaveText(/planning/i);

    // kb:fact/subagent-hooks-carry-parent-permission-mode: approving the plan fires
    // PostToolUse{ExitPlanMode, permission_mode:"acceptEdits"} and the rest of the turn runs so.
    await s.feed.post(
      rawPostToolUse(s.claudeId, {
        promptId: "p1",
        permissionMode: "acceptEdits",
        toolName: "ExitPlanMode",
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("working");
    expect(after.permissionMode).toEqual({ value: "acceptEdits", source: "hook" });
  } finally {
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------
// Subagent StopFailure (REQ-13; #86)
// ---------------------------------------------------------------------------------------------

test("a subagent-marked StopFailure for the closed prompt leaves an idle card idle, never failed (E6, REQ-13, #86)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e6"));
  try {
    await finishTurn(s.feed, "p1", {
      lastAssistantMessage: "first reply",
      backgroundTasks: [runningSubagentTask("agent-bg")],
    });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    const before = await snapshot(page, daemon(), s.session.id);

    // kb:fact/subagent-stopfailure-carries-agent-id: a background subagent's API failure,
    // on the parent's already-closed prompt.
    await s.feed.post(rawStopFailure(s.claudeId, { promptId: "p1", agentId: "agent-bg" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
    await expect(s.card.getByText(/failed/i)).toHaveCount(0);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("idle");
    expect(after.failure).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);
    expect(after.lastActivity).toBe("first reply");
  } finally {
    await s.cleanup();
  }
});

test("a subagent's failure leaves the card idle, and the main agent's own background-completion turn failing then reads failed (edge case 18, REQ-13)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e6-seq"));
  try {
    await finishTurn(s.feed, "p1", { backgroundTasks: [runningSubagentTask("agent-bg")] });
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    await s.feed.post(rawStopFailure(s.claudeId, { promptId: "p1", agentId: "agent-bg" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/idle/i);

    // The main agent's background-completion turn: a fresh prompt id whose prompt begins
    // <task-notification> (kb:fact/background-completion-new-prompt-id), failing with an
    // unmarked StopFailure.
    await s.feed.post(
      rawUserPromptSubmit(s.claudeId, {
        promptId: "p2",
        prompt: "<task-notification>agent-bg failed</task-notification>",
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    await s.feed.post(rawStopFailure(s.claudeId, { promptId: "p2", error: "server_error" }));
    await expect(stateBadge(s.card)).toHaveText(/failed/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("failed");
    expect(after.failure?.error).toBe("server_error");
  } finally {
    await s.cleanup();
  }
});

test("a subagent-marked StopFailure while the main turn is open leaves the card working, and the turn's own Stop still lands idle (edge case 16, REQ-13)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e6-open"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(rawStopFailure(s.claudeId, { promptId: "p1", agentId: "agent-bg" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/working/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("working");
    expect(after.failure).toBeNull();
    expect(after.stateSince).toBe(before.stateSince);

    // "No prompt closed": the turn still ends with its own Stop.
    await s.feed.post(rawStop(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/idle/i);
  } finally {
    await s.cleanup();
  }
});

test("a subagent-marked StopFailure during a permission wait keeps the card on needs input with the same wait (edge case 17, REQ-13)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-e6-wait"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await s.feed.post(rawPermissionRequest(s.claudeId, "p1"));
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const before = await snapshot(page, daemon(), s.session.id);

    await s.feed.post(rawStopFailure(s.claudeId, { promptId: "p1", agentId: "agent-bg" }));
    await s.feed.persisted(page);
    await expect(stateBadge(s.card)).toHaveText(/needs input/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("needs_input");
    expect(after.failure).toBeNull();
    expect(after.attention?.since).toBe(before.attention?.since);
  } finally {
    await s.cleanup();
  }
});

// Regression pin (REQ-13, "an unmarked StopFailure behaves exactly as today"): runs green at
// authoring.
test("an unmarked StopFailure still fails the open turn, with its raw error and message (REQ-13 regression)", async ({
  page,
  request,
}) => {
  const s = await openBoundSession(page, request, daemon(), uniqueTitle("st-unmarked-fail"));
  try {
    await s.feed.post(rawUserPromptSubmit(s.claudeId, { promptId: "p1" }));
    await expect(stateBadge(s.card)).toHaveText(/working/i);

    await s.feed.post(
      rawStopFailure(s.claudeId, {
        promptId: "p1",
        error: "rate_limit",
        lastAssistantMessage: "Rate limited",
      }),
    );
    await expect(stateBadge(s.card)).toHaveText(/failed/i);
    const after = await snapshot(page, daemon(), s.session.id);
    expect(after.state).toBe("failed");
    expect(after.failure?.error).toBe("rate_limit");
    expect(after.attention).toBeNull();
  } finally {
    await s.cleanup();
  }
});
