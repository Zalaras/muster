import { describe, expect, it } from "vitest";
import { isSupportedProtocolVersion, parseMessage, parseSession, PROTOCOL_VERSION, UNKNOWN_USAGE } from "./protocol";

const validHello = {
  type: "hello",
  protocolVersion: 2,
  daemon: { version: "0.1.0" },
  claudeCode: { installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status: "verified" },
};

// Plan auto-update (kb:anchor/ws.update): a fully-populated UpdateInfo, badge showing
// (available set, installed null), no apply in flight. A real daemon always sends a full
// object here (never an explicit `null` — only a pre-plan daemon omits the key entirely,
// which `parseSnapshot` treats differently from an explicit `null`, see the "parseSnapshot
// — update" describe block below), so this — not `null` — is what belongs on validSnapshot.
const validUpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  available: "0.11.0",
  checkedAt: "2026-09-10T20:00:00Z",
  installed: null,
  apply: { phase: "idle", version: null, error: null },
};

const validSnapshot = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
  claudeTheme: { family: "unknown" },
  update: validUpdateInfo,
};

describe("parseMessage — hello (plan version-claude-interface, protocol 2: hello.claudeCode is a verified range)", () => {
  it("parses a fully-populated hello", () => {
    expect(parseMessage(validHello)).toEqual(validHello);
  });

  it("asserts PROTOCOL_VERSION is 2 (breaking bump: {pinned, installed, drift} -> {installed, floor, verified, status})", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it.each(["below", "verified", "above"] as const)(
    "parses claudeCode.status %s with a populated installed version",
    (status) => {
      const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, status, installed: "2.1.250" } };
      expect(parseMessage(hello)).toEqual(hello);
    },
  );

  it("parses claudeCode.status 'unknown' with installed null (INV-1: installed is null iff status is unknown)", () => {
    const hello = { ...validHello, claudeCode: { installed: null, floor: "2.1.246", verified: "2.1.267", status: "unknown" } };
    expect(parseMessage(hello)).toEqual(hello);
  });

  it("structurally accepts (does not reject) a non-unknown status paired with a null installed — a daemon bug INV-1 rules out on the wire, but the parser only type-checks; the renderer (masthead.ts describeClaudeVersion) is what treats this defensively", () => {
    const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, status: "verified", installed: null } };
    expect(parseMessage(hello)).toEqual(hello);
  });

  it("ignores unknown top-level fields (additive evolution, kb:anchor/conventions)", () => {
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

  it("rejects a hello whose claudeCode.floor is missing", () => {
    const { floor, ...rest } = validHello.claudeCode;
    expect(parseMessage({ ...validHello, claudeCode: rest })).toBeNull();
  });

  it("rejects a hello whose claudeCode.floor is not a string", () => {
    const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, floor: 123 } };
    expect(parseMessage(hello)).toBeNull();
  });

  it("rejects a hello whose claudeCode.verified is missing", () => {
    const { verified, ...rest } = validHello.claudeCode;
    expect(parseMessage({ ...validHello, claudeCode: rest })).toBeNull();
  });

  it("rejects a hello whose claudeCode.verified is not a string", () => {
    const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, verified: 123 } };
    expect(parseMessage(hello)).toBeNull();
  });

  it("rejects a hello whose claudeCode.status is an unrecognized string", () => {
    const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, status: "drifted" } };
    expect(parseMessage(hello)).toBeNull();
  });

  it("rejects a hello whose claudeCode.status is missing", () => {
    const { status, ...rest } = validHello.claudeCode;
    expect(parseMessage({ ...validHello, claudeCode: rest })).toBeNull();
  });

  it("rejects a hello whose claudeCode.installed is a non-string, non-null value", () => {
    const hello = { ...validHello, claudeCode: { ...validHello.claudeCode, installed: 123 } };
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

  it("rejects a prefs.density outside the known enum (M2 kb:anchor/prefs.put refinement)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus", density: "4x4" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a snapshot whose prefs.density is missing entirely (M2: density is always present on the wire)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("parses prefs.density '3x2' alongside an explicit usageModel (plan usage-model-bar REQ-8)", () => {
    const snapshot = {
      ...validSnapshot,
      prefs: { view: "tiles", density: "3x2", usageModel: "Opus", railSort: "manual", theme: "follow", updateCheck: true },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("defaults a missing prefs.usageModel to 'Fable' (pre-plan daemon payload, plan usage-model-bar REQ-8)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "tiles", density: "3x2" } };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: { ...snapshot.prefs, usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
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
      prefs: { view: "tiles", density: "3x2", usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
    });
  });
});

describe("parsePrefs — railSort (plan order-sidebar REQ-5 / kb:anchor/prefs.put)", () => {
  it("defaults a missing railSort to 'manual' (pre-plan daemon payload)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus", density: "2x2", usageModel: "Fable" } };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: { ...snapshot.prefs, railSort: "manual", theme: "follow", updateCheck: true },
    });
  });

  it("parses an explicit railSort of 'attention'", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railSort: "attention" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects a railSort value outside the manual|attention enum", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railSort: "priority" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a non-string railSort", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railSort: 1 } };
    expect(parseMessage(snapshot)).toBeNull();
  });
});

describe("parseMessage — prefs (M2 REQ-10/INV-4: the PUT /api/prefs echo broadcast)", () => {
  const validPrefsMessage = {
    type: "prefs",
    prefs: { view: "tiles", density: "3x2", usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
  };

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
    expect(parseMessage(message)).toEqual({
      type: "prefs",
      prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
    });
  });
});

describe("parsePrefs — theme (plan new-ui-design-colors REQ-19, W7)", () => {
  it("defaults a missing theme key to 'follow' (pre-plan daemon payload)", () => {
    const snapshot = { ...validSnapshot, prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual" } };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: { ...snapshot.prefs, theme: "follow", updateCheck: true },
    });
  });

  it("parses an explicit opaque theme name unchanged (the daemon treats it as opaque, kb:anchor/prefs.put)", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, theme: "dark" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects a non-string theme", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, theme: 42 } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a null theme (the field is required and string, never nullable)", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, theme: null } };
    expect(parseMessage(snapshot)).toBeNull();
  });
});

describe("parsePrefs — updateCheck (plan auto-update REQ-1 / kb:anchor/prefs.put, W6)", () => {
  it("defaults a missing updateCheck key to true (pre-plan daemon payload, the daemon's own documented default)", () => {
    const { updateCheck, ...restPrefs } = validSnapshot.prefs;
    void updateCheck;
    const snapshot = { ...validSnapshot, prefs: restPrefs };
    expect(parseMessage(snapshot)).toEqual({ ...validSnapshot, prefs: { ...restPrefs, updateCheck: true } });
  });

  it("parses an explicit updateCheck: false", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, updateCheck: false } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("parses an explicit updateCheck: true unchanged", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, updateCheck: true } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects a non-boolean updateCheck", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, updateCheck: "true" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a null updateCheck (the field is required and boolean when present, never nullable)", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, updateCheck: null } };
    expect(parseMessage(snapshot)).toBeNull();
  });
});

describe("parseSnapshot — update (plan auto-update kb:anchor/ws.snapshot / kb:anchor/ws.update, W6, edge case 32)", () => {
  it("defaults a missing update key to null (pre-plan daemon payload — no throw, no synthesized object)", () => {
    const { update, ...rest } = validSnapshot;
    void update;
    expect(parseMessage(rest)).toEqual({ ...validSnapshot, update: null });
  });

  it("parses a fully-populated update object with a badge showing (available set, installed null)", () => {
    const snapshot = { ...validSnapshot, update: validUpdateInfo };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("parses install kind 'dev' with available/remedy/installed all null", () => {
    const snapshot = {
      ...validSnapshot,
      update: { running: "v0.10.0-4-ge5102b8", install: "dev", remedy: null, available: null, checkedAt: null, installed: null, apply: { phase: "idle", version: null, error: null } },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it.each(["homebrew", "unmanaged"] as const)("parses install kind %s carrying a remedy string", (install) => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, install, remedy: "run brew upgrade musterd" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("parses installed non-null alongside available non-null (swap done, restart pending)", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, installed: "0.11.0" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it.each(["downloading", "verifying", "installing", "restarting", "done"] as const)(
    "parses apply.phase %s with a non-null version",
    (phase) => {
      const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, apply: { phase, version: "0.11.0", error: null } } };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    },
  );

  it("parses apply.phase 'failed' with a non-null error", () => {
    const snapshot = {
      ...validSnapshot,
      update: { ...validUpdateInfo, apply: { phase: "failed", version: "0.11.0", error: "signature on checksums.txt did not verify" } },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects the whole snapshot when update.install is outside the known enum", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, install: "manual" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update.apply.phase is outside the known enum", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, apply: { phase: "checking", version: null, error: null } } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update.apply is missing", () => {
    const { apply, ...restApply } = validUpdateInfo;
    void apply;
    const snapshot = { ...validSnapshot, update: restApply };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update.running is missing", () => {
    const { running, ...rest } = validUpdateInfo;
    void running;
    const snapshot = { ...validSnapshot, update: rest };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update is present but not an object (e.g. a bare string)", () => {
    const snapshot = { ...validSnapshot, update: "checking" };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("ignores unknown fields inside update (additive evolution)", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, futureField: "surprise" } };
    expect(parseMessage(snapshot)).toEqual({ ...validSnapshot, update: validUpdateInfo });
  });
});

describe("parseMessage — update (plan auto-update kb:anchor/ws.update, W6): sent on every apply phase/check/toggle change", () => {
  it("decodes a well-formed update message", () => {
    const message = { type: "update", update: validUpdateInfo };
    expect(parseMessage(message)).toEqual(message);
  });

  it("rejects an update message missing the update field", () => {
    expect(parseMessage({ type: "update" })).toBeNull();
  });

  it("rejects an update message whose update object is malformed (bad install kind)", () => {
    const message = { type: "update", update: { ...validUpdateInfo, install: "brew" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("ignores unknown top-level fields (additive evolution, kb:anchor/conventions)", () => {
    const message = { type: "update", update: validUpdateInfo, futureField: "surprise" };
    expect(parseMessage(message)).toEqual({ type: "update", update: validUpdateInfo });
  });
});

describe("parseSnapshot — claudeTheme (plan new-ui-design-colors REQ-19, W8)", () => {
  it("defaults a missing claudeTheme key to {family: 'unknown'} (pre-plan daemon payload — the 'no data yet' state, kb:anchor/ws.snapshot)", () => {
    const { claudeTheme, ...rest } = validSnapshot;
    void claudeTheme;
    expect(parseMessage(rest)).toEqual(validSnapshot);
  });

  it("parses each known family value", () => {
    for (const family of ["light", "dark", "unknown"] as const) {
      const snapshot = { ...validSnapshot, claudeTheme: { family } };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    }
  });

  it("rejects a family outside light|dark|unknown", () => {
    const snapshot = { ...validSnapshot, claudeTheme: { family: "sepia" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a claudeTheme that isn't an object", () => {
    const snapshot = { ...validSnapshot, claudeTheme: "unknown" };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a claudeTheme missing the family field", () => {
    const snapshot = { ...validSnapshot, claudeTheme: {} };
    expect(parseMessage(snapshot)).toBeNull();
  });
});

describe("parseMessage — claudeTheme (plan new-ui-design-colors kb:anchor/ws.claude-theme, W9)", () => {
  it("decodes a well-formed claudeTheme message", () => {
    const message = { type: "claudeTheme", family: "light" };
    expect(parseMessage(message)).toEqual(message);
  });

  it("decodes each known family value", () => {
    for (const family of ["light", "dark", "unknown"] as const) {
      const message = { type: "claudeTheme", family };
      expect(parseMessage(message)).toEqual(message);
    }
  });

  it("ignores unknown top-level fields (additive evolution, kb:anchor/conventions)", () => {
    const message = { type: "claudeTheme", family: "dark", futureField: "surprise" };
    expect(parseMessage(message)).toEqual({ type: "claudeTheme", family: "dark" });
  });

  it("rejects a claudeTheme message with an unrecognized family", () => {
    expect(parseMessage({ type: "claudeTheme", family: "sepia" })).toBeNull();
  });

  it("rejects a claudeTheme message missing family", () => {
    expect(parseMessage({ type: "claudeTheme" })).toBeNull();
  });

  it("rejects a non-string family", () => {
    expect(parseMessage({ type: "claudeTheme", family: 1 })).toBeNull();
  });
});

describe("parseMessage — usage (M3 REQ-5/kb:anchor/ws.usage: broadcast on value/model change)", () => {
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

describe("parseMessage — usage.modelScoped (plan usage-model-bar REQ-4/REQ-14/W5)", () => {
  const baseUsage = { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" };
  const window1 = { displayName: "Fable", usedPct: 61.0, resetsAt: "2026-09-01T13:59:59Z" };
  const window2 = { displayName: "Opus", usedPct: 20.0, resetsAt: "2026-09-01T13:59:59Z" };

  it("parses a fully-populated modelScoped list with modelScopedAt/Error/Source", () => {
    const message = {
      type: "usage",
      usage: {
        ...baseUsage,
        modelScoped: [window1, window2],
        modelScopedAt: "2026-08-30T10:00:00Z",
        modelScopedError: null,
        modelScopedSource: "subscription-api",
      },
    };
    expect(parseMessage(message)).toEqual(message);
  });

  it("treats a fully-absent set of the four keys as absent, not synthesized null (pre-plan daemon payload, additive evolution)", () => {
    const message = { type: "usage", usage: baseUsage };
    const parsed = parseMessage(message);
    expect(parsed).toEqual(message);
    const usage = parsed && "usage" in parsed ? (parsed.usage as unknown as Record<string, unknown>) : {};
    expect("modelScoped" in usage).toBe(false);
    expect("modelScopedAt" in usage).toBe(false);
    expect("modelScopedError" in usage).toBe(false);
    expect("modelScopedSource" in usage).toBe(false);
    // The pattern every consumer relies on (protocol.ts's parseUsage comment): reading
    // `usage.modelScoped ?? null` treats an absent key the same as an explicit null.
    expect((usage as { modelScoped?: unknown }).modelScoped ?? null).toBeNull();
  });

  it("parses explicit nulls for all four fields the same as the boot/no-hydration state (INV-1 shape)", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: null, modelScopedAt: null, modelScopedError: null, modelScopedSource: "subscription-api" },
    };
    expect(parseMessage(message)).toEqual(message);
  });

  it("parses an empty modelScoped list as distinct from null (a successful fetch with no scoped windows)", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [], modelScopedAt: "2026-08-30T10:00:00Z", modelScopedError: null, modelScopedSource: "subscription-api" },
    };
    const parsed = parseMessage(message);
    expect(parsed).toEqual(message);
    expect(Array.isArray((parsed as { usage: { modelScoped: unknown } }).usage.modelScoped)).toBe(true);
  });

  it.each(["no-credentials", "unauthorized", "unreachable"] as const)(
    "parses each modelScopedError enum value (%s), keeping the last-good list",
    (errorKind) => {
      const message = {
        type: "usage",
        usage: { ...baseUsage, modelScoped: [window1], modelScopedAt: "2026-08-30T10:00:00Z", modelScopedError: errorKind, modelScopedSource: "subscription-api" },
      };
      expect(parseMessage(message)).toEqual(message);
    },
  );

  it("rejects an unrecognized modelScopedError string", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: null, modelScopedAt: null, modelScopedError: "offline" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element is missing displayName", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: [{ usedPct: 61, resetsAt: "2026-09-01T13:59:59Z" }] } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element has a non-numeric usedPct", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: [{ ...window1, usedPct: "61" }] } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element has a non-string resetsAt", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: [{ ...window1, resetsAt: 123 }] } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when modelScoped is a non-array, non-null value", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: "Fable" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a non-string modelScopedAt (e.g. epoch number instead of RFC3339)", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: null, modelScopedAt: 1735689600 } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a non-string modelScopedSource", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: [], modelScopedSource: 1 } };
    expect(parseMessage(message)).toBeNull();
  });

  it("ignores unknown fields inside one modelScoped element (additive evolution)", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: [{ ...window1, futureField: "x" }] } };
    expect(parseMessage(message)).toEqual({ type: "usage", usage: { ...baseUsage, modelScoped: [window1] } });
  });
});

describe("parseMessage — unknown/malformed envelopes", () => {
  it("ignores an unknown message type (forward compatibility, kb:anchor/conventions)", () => {
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

  it.each([0, 1, 3, -1, 1.5])("rejects any other version: %p", (version) => {
    expect(isSupportedProtocolVersion(version)).toBe(false);
  });
});

describe("UNKNOWN_USAGE", () => {
  it("is the fully-null pre-hello usage state, never zero/empty-gauge shaped", () => {
    expect(UNKNOWN_USAGE).toEqual({ fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" });
  });
});

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
  pinned: false,
  railPos: 5,
  titleOverride: null,
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
  pinned: false,
  railPos: 6,
  titleOverride: null,
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
      prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual", theme: "follow", updateCheck: true },
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

  it.each(["7", null, undefined, {}, [7], true])("rejects a sessionRemoved whose id is not a number: %p", (id) => {
    expect(parseMessage({ type: "sessionRemoved", id })).toBeNull();
  });

  it("accepts id 0 (a valid session id, not a falsy 'missing' sentinel)", () => {
    expect(parseMessage({ type: "sessionRemoved", id: 0 })).toEqual({ type: "sessionRemoved", id: 0 });
  });
});
