import { describe, expect, it } from "vitest";
import { parseMessage } from "./messages";
import { UNKNOWN_USAGE } from "./usage";

describe("parseMessage — usage (kb:anchor/ws.usage: broadcast on value/model change)", () => {
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

  it("parses a fully-populated usage message including the model field", () => {
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
    const message = {
      ...knownUsage,
      usage: { ...knownUsage.usage, model: { id: "claude-opus-5" } },
    };
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
    const message = {
      ...knownUsage,
      usage: { ...knownUsage.usage, fiveHour: { usedPct: "61", resetsAt: "2026-08-23T11:00:00Z" } },
    };
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
    const usage =
      parsed && "usage" in parsed ? (parsed.usage as unknown as Record<string, unknown>) : {};
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
      usage: {
        ...baseUsage,
        modelScoped: null,
        modelScopedAt: null,
        modelScopedError: null,
        modelScopedSource: "subscription-api",
      },
    };
    expect(parseMessage(message)).toEqual(message);
  });

  it("parses an empty modelScoped list as distinct from null (a successful fetch with no scoped windows)", () => {
    const message = {
      type: "usage",
      usage: {
        ...baseUsage,
        modelScoped: [],
        modelScopedAt: "2026-08-30T10:00:00Z",
        modelScopedError: null,
        modelScopedSource: "subscription-api",
      },
    };
    const parsed = parseMessage(message);
    expect(parsed).toEqual(message);
    expect(Array.isArray((parsed as { usage: { modelScoped: unknown } }).usage.modelScoped)).toBe(
      true,
    );
  });

  it.each(["no-credentials", "unauthorized", "unreachable"] as const)(
    "parses each modelScopedError enum value (%s), keeping the last-good list",
    (errorKind) => {
      const message = {
        type: "usage",
        usage: {
          ...baseUsage,
          modelScoped: [window1],
          modelScopedAt: "2026-08-30T10:00:00Z",
          modelScopedError: errorKind,
          modelScopedSource: "subscription-api",
        },
      };
      expect(parseMessage(message)).toEqual(message);
    },
  );

  it("rejects an unrecognized modelScopedError string", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: null, modelScopedAt: null, modelScopedError: "offline" },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element is missing displayName", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [{ usedPct: 61, resetsAt: "2026-09-01T13:59:59Z" }] },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element has a non-numeric usedPct", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [{ ...window1, usedPct: "61" }] },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when one modelScoped element has a non-string resetsAt", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [{ ...window1, resetsAt: 123 }] },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects the whole message when modelScoped is a non-array, non-null value", () => {
    const message = { type: "usage", usage: { ...baseUsage, modelScoped: "Fable" } };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a non-string modelScopedAt (e.g. epoch number instead of RFC3339)", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: null, modelScopedAt: 1735689600 },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("rejects a non-string modelScopedSource", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [], modelScopedSource: 1 },
    };
    expect(parseMessage(message)).toBeNull();
  });

  it("ignores unknown fields inside one modelScoped element (additive evolution)", () => {
    const message = {
      type: "usage",
      usage: { ...baseUsage, modelScoped: [{ ...window1, futureField: "x" }] },
    };
    expect(parseMessage(message)).toEqual({
      type: "usage",
      usage: { ...baseUsage, modelScoped: [window1] },
    });
  });
});
describe("UNKNOWN_USAGE", () => {
  it("is the fully-null pre-hello usage state, never zero/empty-gauge shaped", () => {
    expect(UNKNOWN_USAGE).toEqual({
      fiveHour: null,
      sevenDay: null,
      sampledAt: null,
      source: "subscription",
    });
  });
});
