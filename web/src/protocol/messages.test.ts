import { describe, expect, it } from "vitest";
import { parseDocChanged, parseMessage } from "./messages";

// Plan auto-update (kb:anchor/ws.update): a fully-populated UpdateInfo, badge showing
// (available set, installed null), no apply in flight. A real daemon always sends a full
// object here (never an explicit `null` — only a pre-plan daemon omits the key entirely,
// which `parseSnapshot` treats differently from an explicit `null`, see the "parseSnapshot
// — update" describe block below), so this — not `null` — is what belongs on validSnapshot.
const validUpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  // Plan rail-card-improvements-2 (kb:anchor/ws.update): true iff a release check is
  // possible at all — see the "canCheck is missing/not a boolean" cases in the
  // "parseSnapshot — update" describe block below.
  canCheck: true,
  available: "0.11.0",
  checkedAt: "2026-09-10T20:00:00Z",
  installed: null,
  apply: { phase: "idle", version: null, error: null },
};
const validSnapshot = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: {
    view: "focus",
    density: "2x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
    updateCheck: true,
    railDensity: "comfortable",
    railActivity: "turn",
  },
  claudeTheme: { family: "unknown" },
  update: validUpdateInfo,
};
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
describe("parseMessage — snapshot", () => {
  it("parses the empty-sessions, null-usage snapshot", () => {
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

  it("parses a snapshot whose usage carries the model field", () => {
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
      usage: {
        fiveHour: { usedPct: "61", resetsAt: "2026-08-20T11:00:00Z" },
        sevenDay: null,
        sampledAt: null,
        source: "subscription",
      },
    };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a usage object whose source is not a string", () => {
    const snapshot = {
      ...validSnapshot,
      usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: null },
    };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a prefs.view outside the known enum", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "grid", density: "2x2" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a prefs.density outside the known enum", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus", density: "4x4" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a snapshot whose prefs.density is missing entirely (density is always present on the wire)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("parses prefs.density '3x2' alongside an explicit usageModel (plan usage-model-bar REQ-8)", () => {
    const snapshot = {
      ...validSnapshot,
      prefs: {
        view: "tiles",
        density: "3x2",
        usageModel: "Opus",
        railSort: "manual",
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("defaults a missing prefs.usageModel to 'Fable' (pre-plan daemon payload, plan usage-model-bar REQ-8)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "tiles", density: "3x2" } };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: {
        ...snapshot.prefs,
        usageModel: "Fable",
        railSort: "manual",
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
    });
  });

  it("rejects a prefs.usageModel that is not a string", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "tiles", density: "3x2", usageModel: 42 } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("ignores unknown fields inside usage and prefs (additive evolution)", () => {
    const snapshot = {
      ...validSnapshot,
      usage: { ...validSnapshot.usage, futureUsageField: 1 },
      prefs: { view: "tiles", density: "3x2", futurePrefsField: true },
    };
    const parsed = parseMessage(snapshot);
    expect(parsed).toEqual({
      ...validSnapshot,
      prefs: {
        view: "tiles",
        density: "3x2",
        usageModel: "Fable",
        railSort: "manual",
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
    });
  });
});
describe("parseMessage — unknown/malformed envelopes", () => {
  it("ignores an unknown message type (forward compatibility, kb:anchor/conventions)", () => {
    expect(parseMessage({ type: "futureMessageType", payload: {} })).toBeNull();
  });

  it("ignores a message with no type field", () => {
    expect(parseMessage({ daemon: { version: "0.1.0" } })).toBeNull();
  });

  it.each([null, undefined, "hello", 42, true, ["hello"]])(
    "rejects non-object top-level data: %p",
    (value) => {
      expect(parseMessage(value)).toBeNull();
    },
  );
});
describe("parseDocChanged (plan markdown-viewing kb:anchor/ws.doc-changed, W10)", () => {
  const validDocChanged = {
    type: "docChanged",
    id: 7,
    path: "/Users/bob/code/Projects/muster/TODO.md",
    at: "2026-09-13T09:15:00Z",
  };

  it("parses a well-formed docChanged message", () => {
    expect(parseDocChanged(validDocChanged)).toEqual(validDocChanged);
  });

  it("rejects a docChanged missing path", () => {
    const { path, ...rest } = validDocChanged;
    expect(parseDocChanged(rest)).toBeNull();
  });

  it("rejects a docChanged missing id", () => {
    const { id, ...rest } = validDocChanged;
    expect(parseDocChanged(rest)).toBeNull();
  });

  it("rejects a docChanged missing at", () => {
    const { at, ...rest } = validDocChanged;
    expect(parseDocChanged(rest)).toBeNull();
  });

  it("rejects a non-numeric id", () => {
    expect(parseDocChanged({ ...validDocChanged, id: "7" })).toBeNull();
  });

  it("rejects a non-string path", () => {
    expect(parseDocChanged({ ...validDocChanged, path: 42 })).toBeNull();
  });

  it("routes through parseMessage the same way (dispatch parity with every other message type)", () => {
    expect(parseMessage(validDocChanged)).toEqual(validDocChanged);
  });

  it("parseMessage rejects a docChanged with a missing field, same as calling parseDocChanged directly", () => {
    const { path, ...rest } = validDocChanged;
    expect(parseMessage(rest)).toBeNull();
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
describe("parseMessage — snapshot with sessions", () => {
  it("parses a snapshot with multiple valid sessions", () => {
    const snapshot = {
      type: "snapshot",
      sessions: [validSession, freshLaunchSession],
      usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
      prefs: {
        view: "focus",
        density: "2x2",
        usageModel: "Fable",
        railSort: "manual",
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
      claudeTheme: { family: "unknown" },
      update: validUpdateInfo,
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
describe("parseMessage — sessionRemoved (W6, plan m4-reconcile REQ-15, kb:anchor/ws.session-removed)", () => {
  it("parses a well-formed sessionRemoved", () => {
    const message = { type: "sessionRemoved", id: 7 };
    expect(parseMessage(message)).toEqual(message);
  });

  it("ignores unknown top-level fields (additive evolution, kb:anchor/conventions)", () => {
    const message = { type: "sessionRemoved", id: 7, futureField: "surprise" };
    expect(parseMessage(message)).toEqual({ type: "sessionRemoved", id: 7 });
  });

  it("rejects a sessionRemoved missing id", () => {
    expect(parseMessage({ type: "sessionRemoved" })).toBeNull();
  });

  it.each(["7", null, undefined, {}, [7], true])(
    "rejects a sessionRemoved whose id is not a number: %p",
    (id) => {
      expect(parseMessage({ type: "sessionRemoved", id })).toBeNull();
    },
  );

  it("accepts id 0 (a valid session id, not a falsy 'missing' sentinel)", () => {
    expect(parseMessage({ type: "sessionRemoved", id: 0 })).toEqual({
      type: "sessionRemoved",
      id: 0,
    });
  });
});
