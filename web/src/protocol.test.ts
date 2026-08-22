import { describe, expect, it } from "vitest";
import { isSupportedProtocolVersion, parseMessage, PROTOCOL_VERSION, UNKNOWN_USAGE } from "./protocol";

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
  prefs: { view: "focus" },
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
    const snapshot = { ...validSnapshot, prefs: { view: "grid" } };
    expect(parseMessage(snapshot)).toBeNull();
  });

  it("ignores unknown fields inside usage and prefs (additive evolution)", () => {
    const snapshot = {
      ...validSnapshot,
      usage: { ...validSnapshot.usage, futureUsageField: 1 },
      prefs: { view: "tiles", futurePrefsField: true },
    };
    const parsed = parseMessage(snapshot);
    expect(parsed).toEqual({ ...validSnapshot, prefs: { view: "tiles" } });
  });
});

describe("parseMessage — unknown/malformed envelopes", () => {
  it("ignores an unknown message type (forward compatibility, protocol §1)", () => {
    expect(parseMessage({ type: "usage", usage: {} })).toBeNull();
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
