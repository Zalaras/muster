// Wire types and parser for `Usage` and its `usage` broadcast (docs/protocol.md,
// kb:anchor/ws.usage) — one of the protocol/ concept modules, each owning one wire
// concept's type and parser; `decode.ts` holds the primitives every one of them shares.

import { isNullableString, isRecord, parseListOf, parseNullable } from "./decode";

export interface UsageBucket {
  usedPct: number;
  resetsAt: string;
}

/** kb:anchor/ws.usage: one model-scoped weekly window, as
 * musterd's own `GET /api/oauth/usage` poller reports it — a second usage source,
 * independent of the status-line buckets above. */
export interface ModelWindow {
  displayName: string;
  usedPct: number;
  resetsAt: string;
}

/** The three failure kinds a model-scoped poll can end in; `null` after a
 * successful fetch. */
export const MODEL_SCOPED_ERRORS = ["no-credentials", "unauthorized", "unreachable"] as const;
export type ModelScopedError = (typeof MODEL_SCOPED_ERRORS)[number];

export interface Usage {
  fiveHour: UsageBucket | null;
  sevenDay: UsageBucket | null;
  sampledAt: string | null;
  source: string;
  modelScoped?: ModelWindow[] | null;
  modelScopedAt?: string | null;
  modelScopedError?: ModelScopedError | null;
  modelScopedSource?: string;
}

export const UNKNOWN_USAGE: Usage = {
  fiveHour: null,
  sevenDay: null,
  sampledAt: null,
  source: "subscription",
};

// kb:anchor/ws.usage: broadcast whenever a routed status post's bucket values or
// model changed — a bare `sampledAt` advance produces no broadcast (server-side dedup).
export interface UsageMessage {
  type: "usage";
  usage: Usage;
}

function parseUsageBucket(value: unknown): UsageBucket | null {
  if (!isRecord(value)) return null;
  const usedPct = value["usedPct"];
  const resetsAt = value["resetsAt"];
  if (typeof usedPct !== "number" || typeof resetsAt !== "string") return null;
  return { usedPct, resetsAt };
}

function parseModelWindow(value: unknown): ModelWindow | null {
  if (!isRecord(value)) return null;
  const displayName = value["displayName"];
  const usedPct = value["usedPct"];
  const resetsAt = value["resetsAt"];
  if (typeof displayName !== "string") return null;
  if (typeof usedPct !== "number") return null;
  if (typeof resetsAt !== "string") return null;
  return { displayName, usedPct, resetsAt };
}

function isModelScopedError(value: unknown): value is ModelScopedError {
  return (MODEL_SCOPED_ERRORS as readonly unknown[]).includes(value);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat per-field guards plus one present-only block per optional modelScoped* key
export function parseUsage(value: unknown): Usage | null {
  if (!isRecord(value)) return null;
  const fiveHour = parseNullable(value["fiveHour"], parseUsageBucket);
  if (fiveHour === undefined) return null;
  const sevenDay = parseNullable(value["sevenDay"], parseUsageBucket);
  if (sevenDay === undefined) return null;
  const sampledAt = value["sampledAt"];
  const source = value["source"];
  if (!isNullableString(sampledAt)) return null;
  if (typeof source !== "string") return null;

  const usage: Usage = { fiveHour, sevenDay, sampledAt, source };
  if ("modelScoped" in value) {
    const modelScoped = parseNullable(value["modelScoped"], (v) =>
      parseListOf(v, parseModelWindow),
    );
    if (modelScoped === undefined) return null;
    usage.modelScoped = modelScoped;
  }
  if ("modelScopedAt" in value) {
    const rawModelScopedAt = value["modelScopedAt"];
    if (!isNullableString(rawModelScopedAt)) return null;
    usage.modelScopedAt = rawModelScopedAt;
  }
  if ("modelScopedError" in value) {
    const rawModelScopedError = value["modelScopedError"];
    if (rawModelScopedError !== null && !isModelScopedError(rawModelScopedError)) return null;
    usage.modelScopedError = rawModelScopedError;
  }
  if ("modelScopedSource" in value) {
    const rawModelScopedSource = value["modelScopedSource"];
    if (typeof rawModelScopedSource !== "string") return null;
    usage.modelScopedSource = rawModelScopedSource;
  }
  return usage;
}

export function parseUsageMessage(rec: Record<string, unknown>): UsageMessage | null {
  const usage = parseUsage(rec["usage"]);
  if (!usage) return null;
  return { type: "usage", usage };
}
