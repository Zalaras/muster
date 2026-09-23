import { describe, expect, it } from "vitest";
import { isSupportedProtocolVersion, PROTOCOL_VERSION } from "./hello";
import { parseMessage } from "./messages";

const validHello = {
  type: "hello",
  protocolVersion: 2,
  daemon: { version: "0.1.0" },
  claudeCode: { installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status: "verified" },
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
      const hello = {
        ...validHello,
        claudeCode: { ...validHello.claudeCode, status, installed: "2.1.250" },
      };
      expect(parseMessage(hello)).toEqual(hello);
    },
  );

  it("parses claudeCode.status 'unknown' with installed null (INV-1: installed is null iff status is unknown)", () => {
    const hello = {
      ...validHello,
      claudeCode: { installed: null, floor: "2.1.246", verified: "2.1.267", status: "unknown" },
    };
    expect(parseMessage(hello)).toEqual(hello);
  });

  it("structurally accepts (does not reject) a non-unknown status paired with a null installed — a daemon bug INV-1 rules out on the wire, but the parser only type-checks; the renderer (features/connectionversion.ts's describeClaudeVersion) is what treats this defensively", () => {
    const hello = {
      ...validHello,
      claudeCode: { ...validHello.claudeCode, status: "verified", installed: null },
    };
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
describe("isSupportedProtocolVersion", () => {
  it("accepts the current protocol version", () => {
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it.each([0, 1, 3, -1, 1.5])("rejects any other version: %p", (version) => {
    expect(isSupportedProtocolVersion(version)).toBe(false);
  });
});
