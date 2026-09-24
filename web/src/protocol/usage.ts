// Wire types and parser for `Usage` and its `usage` broadcast (docs/protocol.md,
// kb:anchor/ws.usage) — one of the protocol/ concept modules, each owning one wire
// concept's type and parser; `decode.ts` holds the primitives every one of them shares.

import { isRecord, parseListOf, parseNullable } from "./decode";
import { parseModelInfo, type SessionModelInfo } from "./session";

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
  // kb:anchor/ws.usage: the freshest sample's model, masthead-only. Optional (not just
  // nullable) so a wire payload that omits the key entirely round-trips unchanged (additive
  // evolution, kb:anchor/conventions) — present-and-null still means "no sample yet", same
  // as the buckets.
  model?: SessionModelInfo | null;
  sampledAt: string | null;
  source: string;
  // kb:anchor/ws.usage — optional wire fields, same
  // "absent key round-trips as absent, not synthesized null" pattern as `model` above,
  // so an older daemon's payload (all four keys absent) round-trips unchanged. That
  // modelScopedAt is null iff modelScoped is null is a daemon-side invariant only — a
  // client reads `usage.modelScoped ?? null` and `usage.modelScopedAt ?? null` uniformly.
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

/** Scores 23 on cognitive complexity, still over Biome's 15 ceiling: the remainder is the
 * four `if ("key" in value)` blocks that implement present-only additive evolution
 * (kb:anchor/conventions), each carrying the comment explaining why an absent key must
 * stay absent rather than become `null`. Splitting the function strands those comments
 * away from the fields they govern. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat guards plus present-only key blocks whose comments must stay with their fields
export function parseUsage(value: unknown): Usage | null {
  if (!isRecord(value)) return null;
  const fiveHour = parseNullable(value["fiveHour"], parseUsageBucket);
  if (fiveHour === undefined) return null;
  const sevenDay = parseNullable(value["sevenDay"], parseUsageBucket);
  if (sevenDay === undefined) return null;
  const sampledAt = value["sampledAt"];
  const source = value["source"];
  if (sampledAt !== null && typeof sampledAt !== "string") return null;
  if (typeof source !== "string") return null;

  const usage: Usage = { fiveHour, sevenDay, sampledAt, source };
  // `model` is read only when the key is actually present on the wire — an absent key
  // stays absent on the parsed object (additive evolution, kb:anchor/conventions), so a
  // payload with no `model` key round-trips byte-for-byte rather than gaining a
  // synthesized `model: null`.
  if ("model" in value) {
    const model = parseNullable(value["model"], parseModelInfo);
    if (model === undefined) return null;
    usage.model = model;
  }
  // kb:anchor/ws.usage: same present-only pattern as `model`
  // above — each of the four new fields is read only when its key is on the wire, and a
  // malformed value (wrong type, an unrecognized `modelScopedError` string, a malformed
  // `modelScoped` element) rejects the whole message rather than silently degrading to
  // "unknown" (guarded by web/src/protocol/usage.test.ts).
  if ("modelScoped" in value) {
    const modelScoped = parseNullable(value["modelScoped"], (v) =>
      parseListOf(v, parseModelWindow),
    );
    if (modelScoped === undefined) return null;
    usage.modelScoped = modelScoped;
  }
  if ("modelScopedAt" in value) {
    const rawModelScopedAt = value["modelScopedAt"];
    if (rawModelScopedAt !== null && typeof rawModelScopedAt !== "string") return null;
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
