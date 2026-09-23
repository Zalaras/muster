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
      update: {
        running: "v0.10.0-4-ge5102b8",
        install: "dev",
        remedy: null,
        // A dev install can never check (REQ-9's "install kind is not dev" clause).
        canCheck: false,
        available: null,
        checkedAt: null,
        installed: null,
        apply: { phase: "idle", version: null, error: null },
      },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it.each(["homebrew", "unmanaged"] as const)(
    "parses install kind %s carrying a remedy string",
    (install) => {
      const snapshot = {
        ...validSnapshot,
        update: { ...validUpdateInfo, install, remedy: "run brew upgrade musterd" },
      };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    },
  );

  it("parses installed non-null alongside available non-null (swap done, restart pending)", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, installed: "0.11.0" } };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it.each(["downloading", "verifying", "installing", "restarting", "done"] as const)(
    "parses apply.phase %s with a non-null version",
    (phase) => {
      const snapshot = {
        ...validSnapshot,
        update: { ...validUpdateInfo, apply: { phase, version: "0.11.0", error: null } },
      };
      expect(parseMessage(snapshot)).toEqual(snapshot);
    },
  );

  it("parses apply.phase 'failed' with a non-null error", () => {
    const snapshot = {
      ...validSnapshot,
      update: {
        ...validUpdateInfo,
        apply: {
          phase: "failed",
          version: "0.11.0",
          error: "signature on checksums.txt did not verify",
        },
      },
    };
    expect(parseMessage(snapshot)).toEqual(snapshot);
  });

  it("rejects the whole snapshot when update.install is outside the known enum", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, install: "manual" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update.apply.phase is outside the known enum", () => {
    const snapshot = {
      ...validSnapshot,
      update: { ...validUpdateInfo, apply: { phase: "checking", version: null, error: null } },
    };
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

  // Plan rail-card-improvements-2, edge case 21: a pre-plan daemon's `update` object
  // carries every other field but predates `canCheck` entirely — the measured-absence case
  // for this field, same "present but malformed rejects the whole snapshot" discipline as
  // every other required `update` field above (`running`, `apply`), not a separate leniency.
  it("rejects the whole snapshot when update.canCheck is missing (pre-plan daemon, edge case 21)", () => {
    const { canCheck, ...rest } = validUpdateInfo;
    void canCheck;
    const snapshot = { ...validSnapshot, update: rest };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("rejects the whole snapshot when update.canCheck is not a boolean", () => {
    const snapshot = { ...validSnapshot, update: { ...validUpdateInfo, canCheck: "true" } };
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
