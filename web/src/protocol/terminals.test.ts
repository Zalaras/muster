// The `terminals` broadcast and `snapshot.terminals` decoders (docs/protocol.md,
// kb:anchor/ws.shell-activity): whole-list shapes, never null, and a malformed list is
// rejected whole rather than half-applied. Also pins that `parseMessage` routes both and
// that the retired `shellActivity` type is now an unknown message.
import { describe, expect, it } from "vitest";
import { parseMessage } from "./messages";
import { parseSnapshotTerminals, parseTerminalsMessage } from "./terminals";
import { validSnapshot } from "./wirefixtures";

const one = { n: 1, name: "shell 1", busy: false };
const two = { n: 2, name: "build", busy: true };

describe("parseTerminalsMessage", () => {
  it("decodes a two-terminal list, keeping order, names and busy flags", () => {
    expect(
      parseTerminalsMessage({
        type: "terminals",
        sessionId: 7,
        rev: 4,
        terminals: [one, two],
      }),
    ).toEqual({ type: "terminals", sessionId: 7, rev: 4, terminals: [one, two] });
  });

  it("decodes the empty list sent once the last terminal ends", () => {
    expect(
      parseTerminalsMessage({ type: "terminals", sessionId: 7, rev: 1, terminals: [] }),
    ).toEqual({
      type: "terminals",
      sessionId: 7,
      rev: 1,
      terminals: [],
    });
  });

  it.each([
    ["terminals null", { sessionId: 7, rev: 1, terminals: null }],
    ["terminals missing", { sessionId: 7 }],
    ["terminals not an array", { sessionId: 7, rev: 1, terminals: {} }],
    ["rev missing", { sessionId: 7, terminals: [one] }],
    ["rev null", { sessionId: 7, rev: null, terminals: [one] }],
    ["rev a string", { sessionId: 7, rev: "4", terminals: [one] }],
    ["rev zero", { sessionId: 7, rev: 0, terminals: [one] }],
    ["rev negative", { sessionId: 7, rev: -1, terminals: [one] }],
    ["rev fractional", { sessionId: 7, rev: 1.5, terminals: [one] }],
    ["sessionId missing", { rev: 1, terminals: [one] }],
    ["sessionId a string", { sessionId: "7", terminals: [one] }],
    ["an entry with n 0", { sessionId: 7, rev: 1, terminals: [{ ...one, n: 0 }] }],
    ["an entry with a negative n", { sessionId: 7, rev: 1, terminals: [{ ...one, n: -1 }] }],
    ["an entry with a fractional n", { sessionId: 7, rev: 1, terminals: [{ ...one, n: 1.5 }] }],
    ["an entry with no name", { sessionId: 7, rev: 1, terminals: [{ n: 1, busy: false }] }],
    ["an entry with a non-string name", { sessionId: 7, rev: 1, terminals: [{ ...one, name: 4 }] }],
    ["an entry with no busy", { sessionId: 7, rev: 1, terminals: [{ n: 1, name: "x" }] }],
    [
      "an entry with a non-boolean busy",
      { sessionId: 7, rev: 1, terminals: [{ ...one, busy: "yes" }] },
    ],
    ["an entry that is not an object", { sessionId: 7, rev: 1, terminals: [one, 3] }],
  ])("rejects %s", (_label, rec) => {
    expect(parseTerminalsMessage({ type: "terminals", ...rec })).toBeNull();
  });
});

describe("parseSnapshotTerminals", () => {
  it("decodes a per-session map keyed by session id", () => {
    expect(parseSnapshotTerminals({ "7": [one], "12": [one, two] })).toEqual({
      7: [one],
      12: [one, two],
    });
  });

  it("decodes the empty map a daemon with no terminals sends", () => {
    expect(parseSnapshotTerminals({})).toEqual({});
  });

  it.each([
    ["null", null],
    ["an array", [one]],
    ["a non-numeric session key", { abc: [one] }],
    ["a fractional session key", { "1.5": [one] }],
    ["one session's list malformed", { "7": [one], "8": [{ n: 0, name: "x", busy: false }] }],
    ["a session's list null", { "7": null }],
  ])("rejects %s", (_label, value) => {
    expect(parseSnapshotTerminals(value)).toBeNull();
  });
});

describe("parseMessage — terminals", () => {
  it("routes a terminals message", () => {
    expect(parseMessage({ type: "terminals", sessionId: 3, rev: 2, terminals: [two] })).toEqual({
      type: "terminals",
      sessionId: 3,
      rev: 2,
      terminals: [two],
    });
  });

  it("drops a malformed terminals message as null (a later whole list corrects it)", () => {
    expect(parseMessage({ type: "terminals", sessionId: 3, terminals: [{ n: 0 }] })).toBeNull();
  });

  it("treats the retired shellActivity message as unknown", () => {
    expect(parseMessage({ type: "shellActivity", sessionId: 3, busy: true })).toBeNull();
  });

  it("parses snapshot.terminals when present", () => {
    const snapshot = { ...validSnapshot, terminals: { "7": [one, two] } };
    const parsed = parseMessage(snapshot);
    expect(parsed).toMatchObject({
      type: "snapshot",
      terminals: { 7: [one, two] },
    });
  });

  it("parses a snapshot with no terminals key (older fixture) leaving it absent", () => {
    const parsed = parseMessage(validSnapshot);
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("terminals");
  });

  it("reads a snapshot with no terminalsRev as absent (the app treats it as 0)", () => {
    expect(parseMessage(validSnapshot)).not.toHaveProperty("terminalsRev");
  });

  it("parses snapshot.terminalsRev", () => {
    expect(parseMessage({ ...validSnapshot, terminalsRev: 9 })).toMatchObject({
      type: "snapshot",
      terminalsRev: 9,
    });
  });

  it.each([
    ["null", null],
    ["a string", "9"],
    ["negative", -1],
    ["fractional", 1.5],
  ])("rejects a snapshot whose terminalsRev is %s", (_label, terminalsRev) => {
    expect(parseMessage({ ...validSnapshot, terminalsRev })).toBeNull();
  });

  it("rejects a snapshot whose terminals is malformed rather than dropping it silently", () => {
    expect(parseMessage({ ...validSnapshot, terminals: { "7": "nope" } })).toBeNull();
  });

  it("ignores a stray legacy shellsBusy key on a snapshot", () => {
    const parsed = parseMessage({ ...validSnapshot, shellsBusy: [1, 2] });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("shellsBusy");
  });
});
