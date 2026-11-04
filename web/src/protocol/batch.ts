// Wire type and parser for a batch's report (kb:anchor/sessions.end-many,
// kb:anchor/sessions.remove-many, kb:anchor/sessions.restart-many, and the `sessions` member of kb:anchor/groups.delete's
// response) — one of the protocol/ concept modules. Each id is processed under its own lock, so a
// batch is never all-or-nothing: the report says which ids landed where.

import { asInteger, isRecord, parseListOf } from "./decode";

export interface BatchResult {
  done: number[];
  skipped: number[];
  failed: number[];
}

export function parseBatchResult(value: unknown): BatchResult | null {
  if (!isRecord(value)) return null;
  const done = parseListOf(value["done"], asInteger);
  const skipped = parseListOf(value["skipped"], asInteger);
  const failed = parseListOf(value["failed"], asInteger);
  if (!done || !skipped || !failed) return null;
  return { done, skipped, failed };
}

export interface RestartResult extends BatchResult {
  queued: number[];
}

export function parseRestartResult(value: unknown): RestartResult | null {
  const batch = parseBatchResult(value);
  if (!batch || !isRecord(value)) return null;
  const queued = parseListOf(value["queued"], asInteger);
  if (!queued) return null;
  return { ...batch, queued };
}
