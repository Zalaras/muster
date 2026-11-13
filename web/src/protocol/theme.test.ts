import { describe, expect, it } from "vitest";
import { parseMessage } from "./messages";
import { validSnapshot } from "./wirefixtures";

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
