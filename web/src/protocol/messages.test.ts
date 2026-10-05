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
  groups: [],
  ungrouped: { pos: 0, collapsed: false },
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
  claudeLocation: null,
  model: { id: "claude-sonnet-4-5", displayName: "sonnet" },
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  backgroundTasks: 0,
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
  groupId: null,
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
  claudeLocation: null,
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  backgroundTasks: 0,
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
  groupId: null,
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
      groups: [],
      ungrouped: { pos: 0, collapsed: false },
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
// kb:anchor/ws.groups: the whole list, broadcast on every change; the snapshot carries the same two
// keys, and an older daemon's snapshot (neither key) is the flat, no-groups rail.
describe("parseMessage — groups (plan groups kb:anchor/ws.groups)", () => {
  const groupsMessage = {
    type: "groups",
    groups: [
      { id: 3, name: "PR reviews", pos: 0, collapsed: false },
      { id: 5, name: "Hotfix", pos: 2, collapsed: true },
    ],
    ungrouped: { pos: 1, collapsed: false },
  };

  it("parses a groups message whole, in the order sent (the client sorts by pos)", () => {
    expect(parseMessage(groupsMessage)).toEqual(groupsMessage);
  });

  it("parses an empty groups message: no groups, Ungrouped alone", () => {
    const message = { type: "groups", groups: [], ungrouped: { pos: 0, collapsed: true } };
    expect(parseMessage(message)).toEqual(message);
  });

  it("ignores unknown fields on the message, a group and the Ungrouped layout (additive evolution)", () => {
    const message = {
      ...groupsMessage,
      futureField: 1,
      groups: [{ ...groupsMessage.groups[0], color: "red" }],
      ungrouped: { ...groupsMessage.ungrouped, color: "blue" },
    };
    expect(parseMessage(message)).toEqual({
      type: "groups",
      groups: [groupsMessage.groups[0]],
      ungrouped: groupsMessage.ungrouped,
    });
  });

  it.each([
    ["groups missing", { type: "groups", ungrouped: { pos: 0, collapsed: false } }],
    ["ungrouped missing", { type: "groups", groups: [] }],
    [
      "groups not an array",
      { type: "groups", groups: {}, ungrouped: { pos: 0, collapsed: false } },
    ],
    ["ungrouped null", { type: "groups", groups: [], ungrouped: null }],
    ["ungrouped without collapsed", { type: "groups", groups: [], ungrouped: { pos: 0 } }],
    [
      "one malformed group rejects the whole list",
      {
        type: "groups",
        groups: [groupsMessage.groups[0], { id: "5", name: "Hotfix", pos: 2, collapsed: true }],
        ungrouped: { pos: 1, collapsed: false },
      },
    ],
  ])("rejects a groups message with %s", (_label, message) => {
    expect(parseMessage(message)).toBeNull();
  });
});

describe("parseMessage — snapshot groups (plan groups kb:anchor/ws.snapshot)", () => {
  const base = {
    type: "snapshot",
    sessions: [],
    usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
    prefs: { view: "focus", density: "2x2" },
  };
  const group = { id: 3, name: "PR reviews", pos: 0, collapsed: false };

  it("parses groups and ungrouped as sent", () => {
    const parsed = parseMessage({
      ...base,
      groups: [group],
      ungrouped: { pos: 1, collapsed: true },
    });
    expect(parsed).toMatchObject({ groups: [group], ungrouped: { pos: 1, collapsed: true } });
  });

  it("a snapshot with neither key (an older daemon) parses as no groups, Ungrouped last and expanded", () => {
    expect(parseMessage(base)).toMatchObject({
      groups: [],
      ungrouped: { pos: 0, collapsed: false },
    });
  });

  it.each([
    ["groups without ungrouped", { groups: [group] }],
    ["ungrouped without groups", { ungrouped: { pos: 0, collapsed: false } }],
    [
      "a malformed group",
      { groups: [{ ...group, collapsed: "no" }], ungrouped: { pos: 1, collapsed: false } },
    ],
    ["a malformed ungrouped", { groups: [], ungrouped: { pos: "0", collapsed: false } }],
    ["groups null", { groups: null, ungrouped: { pos: 0, collapsed: false } }],
  ])("rejects the whole snapshot with %s", (_label, fields) => {
    expect(parseMessage({ ...base, ...fields })).toBeNull();
  });

  it("a session in the snapshot with no groupId rejects the whole snapshot", () => {
    const { groupId, ...noGroup } = validSession;
    expect(
      parseMessage({
        ...base,
        sessions: [noGroup],
        groups: [],
        ungrouped: { pos: 0, collapsed: false },
      }),
    ).toBeNull();
  });
});

describe("parseMessage — sessionUpsert groupId (plan groups)", () => {
  it("carries a session's group through an upsert, and null for Ungrouped", () => {
    expect(
      parseMessage({ type: "sessionUpsert", session: { ...validSession, groupId: 7 } }),
    ).toEqual({
      type: "sessionUpsert",
      session: { ...validSession, groupId: 7 },
    });
    expect(
      parseMessage({ type: "sessionUpsert", session: { ...validSession, groupId: null } }),
    ).toEqual({
      type: "sessionUpsert",
      session: { ...validSession, groupId: null },
    });
  });

  it("rejects an upsert whose session has no groupId", () => {
    const { groupId, ...rest } = validSession;
    expect(parseMessage({ type: "sessionUpsert", session: rest })).toBeNull();
  });
});
