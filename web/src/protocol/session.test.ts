import { describe, expect, it } from "vitest";
import { parseSession } from "./session";

// A fully-populated Session per kb:anchor/ws.session, used as the baseline every
// parseSession/sessionUpsert test mutates a single field of.
const validSession = {
  id: 1,
  title: "fix the thing",
  state: "working",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/bob/code/muster",
  repo: { name: "muster", branch: "main", isWorktree: false },
  model: { id: "claude-sonnet-4-5", displayName: "sonnet" },
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: "claude-session-abc",
  tmuxTarget: "muster:@1",
  firstLaunchHere: false,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 5,
  titleOverride: null,
  plan: null,
  unread: false,
  lastPrompt: null,
};
// The measured "no data yet" shape (docs/history/spikes/canary-fields.md): a session that has just
// been launched — no Claude session id bound yet, no repo/model/attention/failure known,
// context fully null. This must decode successfully (a view renders it as "unknown",
// never rejected outright and never an empty gauge).
const freshLaunchSession = {
  id: 2,
  title: null,
  state: "started",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/bob/code/muster",
  repo: null,
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: null,
  tmuxTarget: "muster:@2",
  firstLaunchHere: true,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 6,
  titleOverride: null,
  plan: null,
  unread: false,
  lastPrompt: null,
};
describe("parseSession — full kb:anchor/ws.session shape", () => {
  it("parses a fully-populated session", () => {
    expect(parseSession(validSession)).toEqual(validSession);
  });

  it("parses the fresh-launch 'no data yet' shape: no claudeSessionId, no repo/model, null context — never rejected", () => {
    expect(parseSession(freshLaunchSession)).toEqual(freshLaunchSession);
  });

  it("parses every displayed state value", () => {
    for (const state of ["started", "planning", "working", "needs_input", "failed", "idle"]) {
      expect(parseSession({ ...validSession, state })).toEqual({ ...validSession, state });
    }
  });

  it("rejects an unrecognized state value", () => {
    expect(parseSession({ ...validSession, state: "unknown_state" })).toBeNull();
  });

  it("parses a needs_input session with attention populated", () => {
    const session = {
      ...validSession,
      state: "needs_input",
      attention: { reason: "permission", since: "2026-08-22T00:01:00Z" },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects an attention object with an unrecognized reason", () => {
    const session = {
      ...validSession,
      attention: { reason: "confused", since: "2026-08-22T00:01:00Z" },
    };
    expect(parseSession(session)).toBeNull();
  });

  it("parses a failed session with the raw error token and message", () => {
    const session = {
      ...validSession,
      state: "failed",
      failure: { error: "ETOOLERROR", message: "Something broke." },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a failure object missing the error field", () => {
    const session = { ...validSession, failure: { message: "Something broke." } };
    expect(parseSession(session)).toBeNull();
  });

  it("parses a null repo (no directory match / not git)", () => {
    const session = { ...validSession, repo: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a repo with a null branch and isWorktree true", () => {
    const session = { ...validSession, repo: { name: "muster", branch: null, isWorktree: true } };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a repo object missing isWorktree", () => {
    const session = { ...validSession, repo: { name: "muster", branch: "main" } };
    expect(parseSession(session)).toBeNull();
  });

  it("parses a null model (before SessionStart's optional model field arrives)", () => {
    const session = { ...validSession, model: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a model object missing displayName", () => {
    const session = { ...validSession, model: { id: "claude-sonnet-4-5" } };
    expect(parseSession(session)).toBeNull();
  });

  it("parses permissionMode with source 'hook'", () => {
    const session = { ...validSession, permissionMode: { value: "acceptEdits", source: "hook" } };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a permissionMode with an unrecognized source", () => {
    const session = { ...validSession, permissionMode: { value: "default", source: "guessed" } };
    expect(parseSession(session)).toBeNull();
  });

  it("rejects a session missing permissionMode entirely", () => {
    const { permissionMode, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("parses a context with all-null numeric fields and a positive compaction count (REQ-21)", () => {
    const session = {
      ...validSession,
      context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 3 },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a context with populated numeric fields", () => {
    const session = {
      ...validSession,
      context: { usedPct: 42.5, totalInputTokens: 1000, windowSize: 200000, compactions: 0 },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a context missing compactions", () => {
    const session = {
      ...validSession,
      context: { usedPct: null, totalInputTokens: null, windowSize: null },
    };
    expect(parseSession(session)).toBeNull();
  });

  it("rejects a session missing context entirely", () => {
    const { context, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("parses a null title (REQ-15 'untitled' fallback is the view's job, not the parser's)", () => {
    const session = { ...validSession, title: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a session missing the firstLaunchHere field", () => {
    const { firstLaunchHere, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a non-boolean firstLaunchHere", () => {
    expect(parseSession({ ...validSession, firstLaunchHere: "true" })).toBeNull();
  });

  it("parses alive:false with a populated endedAt", () => {
    const session = { ...validSession, alive: false, endedAt: "2026-08-22T00:10:00Z" };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a non-object session value", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("session")).toBeNull();
    expect(parseSession(42)).toBeNull();
  });

  it("rejects a session missing id", () => {
    const { id, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });
});
describe("parseSession — pinned/railPos (plan order-sidebar kb:anchor/ws.session: required on every wire Session, never defaulted)", () => {
  it("parses pinned:true with a positive railPos", () => {
    const session = { ...validSession, pinned: true, railPos: 0 };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a session missing pinned entirely (no pre-plan-daemon tolerance for this field)", () => {
    const { pinned, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a session missing railPos entirely", () => {
    const { railPos, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a non-boolean pinned", () => {
    expect(parseSession({ ...validSession, pinned: "true" })).toBeNull();
  });

  it("rejects a non-numeric railPos", () => {
    expect(parseSession({ ...validSession, railPos: "5" })).toBeNull();
  });

  it("rejects a null pinned (the field is required and boolean, never nullable)", () => {
    expect(parseSession({ ...validSession, pinned: null })).toBeNull();
  });

  it("rejects a null railPos (the field is required and numeric, never nullable)", () => {
    expect(parseSession({ ...validSession, railPos: null })).toBeNull();
  });
});
describe("parseSession — titleOverride (plan ui-text-and-focus kb:anchor/ws.session / REQ-11 / W7: required on every wire Session, never defaulted)", () => {
  it("parses titleOverride: null (no override set)", () => {
    const session = { ...validSession, titleOverride: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a titleOverride string (the user's rename)", () => {
    const session = { ...validSession, titleOverride: "hunting flake" };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a session missing titleOverride entirely (no pre-plan-daemon tolerance for this field)", () => {
    const { titleOverride, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a non-string, non-null titleOverride (e.g. numeric)", () => {
    expect(parseSession({ ...validSession, titleOverride: 42 })).toBeNull();
  });
});
describe("parseSession — plan (plan markdown-viewing kb:anchor/ws.session REQ-17, W10: required on every wire Session, never defaulted)", () => {
  it("parses plan: null (the transcript names no plan at all — never entered plan mode, or /clear minted a fresh planless transcript)", () => {
    const session = { ...validSession, plan: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a populated plan object (exists: true)", () => {
    const session = {
      ...validSession,
      plan: { path: "/Users/bob/.claude/plans/say-hi-golden-finch.md", exists: true },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a plan object with exists: false (plan mode entered, nothing written yet)", () => {
    const session = {
      ...validSession,
      plan: { path: "/Users/bob/.claude/plans/say-hi-golden-finch.md", exists: false },
    };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a session missing plan entirely (no pre-plan-daemon tolerance for this field)", () => {
    const { plan, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a plan object missing path", () => {
    expect(parseSession({ ...validSession, plan: { exists: true } })).toBeNull();
  });

  it("rejects a plan object missing exists", () => {
    expect(
      parseSession({ ...validSession, plan: { path: "/Users/bob/.claude/plans/x.md" } }),
    ).toBeNull();
  });

  it("rejects a non-object, non-null plan (e.g. a bare string)", () => {
    expect(parseSession({ ...validSession, plan: "no plan yet" })).toBeNull();
  });
});
// Plan rail-card-improvements (kb:anchor/ws.session REQ-7/REQ-12, W7): required on every
// wire Session, same "no pre-plan-daemon tolerance" reasoning as pinned/railPos/
// titleOverride/plan above — the daemon and client ship together for this plan.
describe("parseSession — unread/lastPrompt (plan rail-card-improvements kb:anchor/ws.session)", () => {
  it("parses unread:true", () => {
    const session = { ...validSession, unread: true };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a populated lastPrompt", () => {
    const session = { ...validSession, lastPrompt: "fix the flaky retry and rerun the suite" };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses lastPrompt: null (no prompt yet, or /clear reset it)", () => {
    const session = { ...validSession, lastPrompt: null };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a session missing unread entirely (no pre-plan-daemon tolerance for this field)", () => {
    const { unread, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a session missing lastPrompt entirely", () => {
    const { lastPrompt, ...rest } = validSession;
    expect(parseSession(rest)).toBeNull();
  });

  it("rejects a non-boolean unread", () => {
    expect(parseSession({ ...validSession, unread: "true" })).toBeNull();
  });

  it("rejects a null unread (the field is required and boolean, never nullable)", () => {
    expect(parseSession({ ...validSession, unread: null })).toBeNull();
  });

  it("rejects a non-string, non-null lastPrompt (e.g. numeric)", () => {
    expect(parseSession({ ...validSession, lastPrompt: 42 })).toBeNull();
  });
});
