import { describe, expect, it } from "vitest";
import { parseMessage } from "./messages";

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
describe("parsePrefs — railSort (plan order-sidebar REQ-5 / kb:anchor/prefs.put)", () => {
  it("defaults a missing railSort to 'manual' (pre-plan daemon payload)", () => {
    const snapshot = {
      ...validSnapshot,
      prefs: { view: "focus", density: "2x2", usageModel: "Fable" },
    };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: {
        ...snapshot.prefs,
        railSort: "manual",
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
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
// Plan rail-card-improvements (kb:anchor/prefs.put, W7): same missing-key-defaults /
// out-of-enum-rejects shape as railSort above — a pre-plan daemon payload (no
// railDensity/railActivity keys at all) must still parse, defaulting to the daemon's own
// documented defaults ("comfortable"/"turn").
describe("parsePrefs — railDensity (plan rail-card-improvements / kb:anchor/prefs.put)", () => {
  it("defaults a missing railDensity to 'comfortable' (pre-plan daemon payload)", () => {
    const { railDensity, ...restPrefs } = validSnapshot.prefs;
    const snapshot = { ...validSnapshot, prefs: restPrefs };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: { ...restPrefs, railDensity: "comfortable" },
    });
  });

  it.each(["compact", "comfortable", "expanded"] as const)(
    "parses an explicit railDensity of '%s'",
    (railDensity) => {
      const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railDensity } };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    },
  );

  it("rejects a railDensity value outside the compact|comfortable|expanded enum", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railDensity: "cosy" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a non-string railDensity", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railDensity: 1 } };
    expect(parseMessage(snapshot)).toBeNull();
  });
});
describe("parsePrefs — railActivity (plan rail-card-improvements / kb:anchor/prefs.put)", () => {
  it("defaults a missing railActivity to 'turn' (pre-plan daemon payload)", () => {
    const { railActivity, ...restPrefs } = validSnapshot.prefs;
    const snapshot = { ...validSnapshot, prefs: restPrefs };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: { ...restPrefs, railActivity: "turn" },
    });
  });

  it.each(["turn", "prompt", "reply", "both"] as const)(
    "parses an explicit railActivity of '%s'",
    (railActivity) => {
      const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railActivity } };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    },
  );

  it("rejects a railActivity value outside the turn|prompt|reply|both enum", () => {
    const snapshot = {
      ...validSnapshot,
      prefs: { ...validSnapshot.prefs, railActivity: "summary" },
    };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects a non-string railActivity", () => {
    const snapshot = { ...validSnapshot, prefs: { ...validSnapshot.prefs, railActivity: 1 } };
    expect(parseMessage(snapshot)).toBeNull();
  });
});
describe("parseMessage — prefs (the PUT /api/prefs echo broadcast)", () => {
  const validPrefsMessage = {
    type: "prefs",
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
    });
  });
});
describe("parsePrefs — theme (plan new-ui-design-colors REQ-19, W7)", () => {
  it("defaults a missing theme key to 'follow' (pre-plan daemon payload)", () => {
    const snapshot = {
      ...validSnapshot,
      prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual" },
    };
    expect(parseMessage(snapshot)).toEqual({
      ...snapshot,
      prefs: {
        ...snapshot.prefs,
        theme: "follow",
        updateCheck: true,
        railDensity: "comfortable",
        railActivity: "turn",
      },
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
    expect(parseMessage(snapshot)).toEqual({
      ...validSnapshot,
      prefs: { ...restPrefs, updateCheck: true },
    });
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
