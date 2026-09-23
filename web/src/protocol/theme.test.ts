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
