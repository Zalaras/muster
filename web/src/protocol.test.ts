import { describe, expect, it } from "vitest";
import { isSupportedProtocolVersion, parseMessage, parseSession, PROTOCOL_VERSION, UNKNOWN_USAGE } from "./protocol";

const validHello = {
  type: "hello",
  protocolVersion: 1,
  daemon: { version: "0.1.0" },
  claudeCode: { pinned: "2.1.233", installed: "2.1.233", drift: false },
};

const validSnapshot = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: { view: "focus", density: "2x2" },
};

describe("parseMessage — hello", () => {
  it("parses a fully-populated hello", () => {
    expect(parseMessage(validHello)).toEqual(validHello);
  });

  it("parses the pre-first-response nullability state: installed and drift both null (protocol §5.1)", () => {
    const hello = { ...validHello, claudeCode: { pinned: "2.1.233", installed: null, drift: null } };
    expect(parseMessage(hello)).toEqual(hello);
  });

  it("ignores unknown top-level fields (additive evolution, protocol §1)", () => {
    const hello = { ...validHello, futureField: "surprise" };
    expect(parseMessage(hello)).toEqual(validHello);
  });

  it("rejects a hello missing protocolVersion", () => {
    const { protocolVersion, ...rest } = validHello;
    expect(parseMessage(rest)).toBeNull();
  });

  it("rejects a hello whose daemon.version is not a string", () => {
    const hello = { ...validHello, daemon: { version: 123 } };
    expect(parseMessage(hello)).toBeNull();
  });

  it("rejects a hello whose claudeCode is missing", () => {
    const { claudeCode, ...rest } = validHello;
    expect(parseMessage(rest)).toBeNull();
  });

  it("rejects a hello whose claudeCode.pinned is not a string", () => {
    const hello = { ...validHello, claudeCode: { pinned: null, installed: null, drift: null } };
    expect(parseMessage(hello)).toBeNull();
  });

  it("rejects a hello whose claudeCode.drift is a non-boolean, non-null value", () => {
    const hello = { ...validHello, claudeCode: { pinned: "2.1.233", installed: "2.1.233", drift: "yes" } };
    expect(parseMessage(hello)).toBeNull();
  });
});

describe("parseMessage — snapshot", () => {
  it("parses the M0 empty-sessions, null-usage snapshot", () => {
    expect(parseMessage(validSnapshot)).toEqual(validSnapshot);
  });

  it("parses a snapshot with a populated usage bucket", () => {
    const snapshot = {
      ...validSnapshot,
      usage: {
        fiveHour: { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" },
        sevenDay: null,
        sampledAt: "2026-08-20T09:15:31Z",
        source: "subscription",
      },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("parses a snapshot whose usage carries the M3 model field (REQ-11/12)", () => {
    const snapshot = {
      ...validSnapshot,
      usage: {
        fiveHour: { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" },
        sevenDay: null,
        model: { id: "claude-haiku-4-5", displayName: "Haiku 4.5" },
        sampledAt: "2026-08-20T09:15:31Z",
        source: "subscription",
      },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects a snapshot whose sessions field is not an array", () => {
    const snapshot = { ...validSnapshot, sessions: null };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a snapshot whose usage is missing", () => {
    const { usage, ...rest } = validSnapshot;
    expect(parseMessage(rest)).toBeNull();
  });

  it("rejects a usage bucket with a non-numeric usedPct", () => {
    const snapshot = {
      ...validSnapshot,
      usage: { fiveHour: { usedPct: "61", resetsAt: "2026-08-20T11:00:00Z" }, sevenDay: null, sampledAt: null, source: "subscription" },
    };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a usage object whose source is not a string", () => {
    const snapshot = { ...validSnapshot, usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: null } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a prefs.view outside the known enum", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "grid", density: "2x2" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a prefs.density outside the known enum (M2 §3.3 refinement)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus", density: "4x4" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a snapshot whose prefs.density is missing entirely (M2: density is always present on the wire)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("parses prefs.density '3x2'", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "tiles", density: "3x2" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("ignores unknown fields inside usage and prefs (additive evolution)", () => {
    const snapshot = {
      ...validSnapshot,
      usage: { ...validSnapshot.usage, futureUsageField: 1 },
      prefs: { view: "tiles", density: "3x2", futurePrefsField: true },
    };
    const parsed = parseMessage(snapshot);
    expect(parsed).toEqual({ ...validSnapshot, prefs: { view: "tiles", density: "3x2" } });
  });
});

describe("parseMessage — prefs (M2 REQ-10/INV-4: the PUT /api/prefs echo broadcast)", () => {
  const validPrefsMessage = { type: "prefs", prefs: { view: "tiles", density: "3x2" } };

  it("parses a fully-populated prefs message", () => {
    expect(parseMessage(validPrefsMessage)).toEqual(validPrefsMessage);
  });

  it("rejects a prefs message missing the prefs field", () => {
    expect(parseMessage({ type: "prefs" })).toBeNull();
  });

  it("rejects a prefs message whose density is invalid", () => {
    expect(parseMessage({ type: "prefs", prefs: { view: "focus", density: "1x1" } })).toBeNull();
  });

  it("rejects a prefs message whose prefs is not an object", () => {
    expect(parseMessage({ type: "prefs", prefs: "tiles" })).toBeNull();
  });

  it("ignores unknown fields inside prefs (additive evolution)", () => {
    const message = { type: "prefs", prefs: { view: "focus", density: "2x2", futureField: 1 } };
    expect(parseMessage(message)).toEqual({ type: "prefs", prefs: { view: "focus", density: "2x2" } });
  });
});

describe("parseMessage — usage (M3 REQ-5/protocol §5.4: broadcast on value/model change)", () => {
  const knownUsage = {
    type: "usage",
    usage: {
      fiveHour: { usedPct: 61.2, resetsAt: "2026-08-23T11:00:00Z" },
      sevenDay: { usedPct: 23.0, resetsAt: "2026-08-25T06:00:00Z" },
      model: { id: "claude-opus-5", displayName: "Opus 5" },
      sampledAt: "2026-08-23T09:15:31Z",
      source: "subscription",
    },
  };

  it("parses a fully-populated usage message including the M3 model field", () => {
    expect(parseMessage(knownUsage)).toEqual(knownUsage);
  });

  it("parses the boot/no-hydration state: null buckets, no model key at all, null sampledAt (REQ-7)", () => {
    const message = {
      type: "usage",
      usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
    };
    const parsed = parseMessage(message);
    expect(parsed).toEqual(message);
    // Distinguishes "no model key on the wire" from "model: null" — additive evolution
    // (protocol.ts's parseUsage comment): the parsed object must not gain a synthesized key.
    expect(parsed && "usage" in parsed && "model" in (parsed.usage as object)).toBe(false);
  });

  it("parses an explicit usage.model: null the same as an absent key (both mean 'no sample yet')", () => {
    const message = { ...knownUsage, usage: { ...knownUsage.usage, model: null } };
    expect(parseMessage(message)).toEqual(message);
  });

  it("rejects a usage.model missing displayName", () => {
    const message = { ...knownUsage, usage: { ...knownUsage.usage, model: { id: "claude-opus-5" } } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a usage.model that isn't an object", () => {
    const message = { ...knownUsage, usage: { ...knownUsage.usage, model: "Opus 5" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a usage message missing the usage field", () => {
    expect(parseMessage({ type: "usage" })).toBeNull();
  });

  it("rejects a usage message whose bucket has a non-numeric usedPct", () => {
    const message = { ...knownUsage, usage: { ...knownUsage.usage, fiveHour: { usedPct: "61", resetsAt: "2026-08-23T11:00:00Z" } } };
    expect(parseMessage(message)).toBeNull();
  });

  it("ignores unknown fields inside usage (additive evolution)", () => {
    const message = { ...knownUsage, usage: { ...knownUsage.usage, futureField: 1 } };
    expect(parseMessage(message)).toEqual(knownUsage);
  });
});

describe("parseMessage — unknown/malformed envelopes", () => {
  it("ignores an unknown message type (forward compatibility, protocol §1)", () => {
    expect(parseMessage({ type: "futureMessageType", payload: {} })).toBeNull();
  });

  it("ignores a message with no type field", () => {
    expect(parseMessage({ daemon: { version: "0.1.0" } })).toBeNull();
  });

  it.each([null, undefined, "hello", 42, true, ["hello"]])("rejects non-object top-level data: %p", (value) => {
    expect(parseMessage(value)).toBeNull();
  });
});

describe("isSupportedProtocolVersion", () => {
  it("accepts the current protocol version", () => {
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it.each([0, 2, -1, 1.5])("rejects any other version: %p", (version) => {
    expect(isSupportedProtocolVersion(version)).toBe(false);
  });
});

describe("UNKNOWN_USAGE", () => {
  it("is the fully-null pre-hello usage state, never zero/empty-gauge shaped", () => {
    expect(UNKNOWN_USAGE).toEqual({ fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" });
  });
});

// A fully-populated Session per docs/protocol.md §5.3, used as the baseline every
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
  directory: "/Users/damian/code/muster",
  repo: { name: "muster", branch: "main", isWorktree: false },
  model: { id: "claude-sonnet-4-5", displayName: "sonnet" },
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: "claude-session-abc",
  tmuxTarget: "muster:@1",
  firstLaunchHere: false,
  createdAt: "2026-08-22T00:00:00Z",
};

// The measured "no data yet" shape (spikes/canary-fields.md): a session that has just
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
  directory: "/Users/damian/code/muster",
  repo: null,
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: null,
  tmuxTarget: "muster:@2",
  firstLaunchHere: true,
  createdAt: "2026-08-22T00:00:00Z",
};

describe("parseSession — full §5.3 shape", () => {
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
    const session = { ...validSession, attention: { reason: "confused", since: "2026-08-22T00:01:00Z" } };
    expect(parseSession(session)).toBeNull();
  });

  it("parses a failed session with the raw error token and message", () => {
    const session = { ...validSession, state: "failed", failure: { error: "ETOOLERROR", message: "Something broke." } };
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
    const session = { ...validSession, context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 3 } };
    expect(parseSession(session)).toEqual(session);
  });

  it("parses a context with populated numeric fields (post-M3, forward-compatible)", () => {
    const session = { ...validSession, context: { usedPct: 42.5, totalInputTokens: 1000, windowSize: 200000, compactions: 0 } };
    expect(parseSession(session)).toEqual(session);
  });

  it("rejects a context missing compactions", () => {
    const session = { ...validSession, context: { usedPct: null, totalInputTokens: null, windowSize: null } };
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

describe("parseMessage — sessionUpsert", () => {
  it("parses a sessionUpsert carrying a fully-populated session", () => {
    const message = { type: "sessionUpsert", session: validSession };
    expect(parseMessage(message)).toEqual(message);
  });

  it("parses a sessionUpsert carrying the fresh-launch session (REQ-2: card must render before any hook)", () => {
    const message = { type: "sessionUpsert", session: freshLaunchSession };
    expect(parseMessage(message)).toEqual(message);
  });

  it("rejects a sessionUpsert whose session is malformed", () => {
    const message = { type: "sessionUpsert", session: { ...validSession, state: "bogus" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a sessionUpsert missing the session field", () => {
    expect(parseMessage({ type: "sessionUpsert" })).toBeNull();
  });
});

describe("parseMessage — snapshot with sessions (M1: non-empty for the first time)", () => {
  it("parses a snapshot with multiple valid sessions", () => {
    const snapshot = {
      type: "snapshot",
      sessions: [validSession, freshLaunchSession],
      usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
      prefs: { view: "focus", density: "2x2" },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects the whole snapshot if any one session in the array is malformed", () => {
    const snapshot = {
      type: "snapshot",
      sessions: [validSession, { ...freshLaunchSession, state: "bogus" }],
      usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
      prefs: { view: "focus", density: "2x2" },
    };
    expect(parseMessage(snapshot)).toBeNull();
  });
});
