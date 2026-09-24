// kb:anchor/sessions.reader / kb:anchor/sessions.reader-file.
import { isRecord, parseListOf, parseNullable } from "../protocol/decode";
import { requestJson, requestText, type ApiResult } from "./http";

export interface ReaderPlan {
  path: string;
  exists: boolean;
  writtenAt: string | null;
}

export interface ReaderFileEntry {
  path: string;
  writtenAt: string | null;
}

export const READER_LISTING_KINDS = ["git", "walk"] as const;
export type ReaderListingKind = (typeof READER_LISTING_KINDS)[number];

export interface ReaderListing {
  directory: string;
  plan: ReaderPlan | null;
  files: ReaderFileEntry[];
  listing: ReaderListingKind;
  truncated: boolean;
}

function isReaderListingKind(value: unknown): value is ReaderListingKind {
  return (READER_LISTING_KINDS as readonly unknown[]).includes(value);
}

function parseReaderPlan(value: unknown): ReaderPlan | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  const exists = value["exists"];
  const writtenAt = value["writtenAt"];
  if (typeof path !== "string") return null;
  if (typeof exists !== "boolean") return null;
  if (writtenAt !== null && typeof writtenAt !== "string") return null;
  return { path, exists, writtenAt };
}

function parseReaderFileEntry(value: unknown): ReaderFileEntry | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  const writtenAt = value["writtenAt"];
  if (typeof path !== "string") return null;
  if (writtenAt !== null && typeof writtenAt !== "string") return null;
  return { path, writtenAt };
}

function parseReaderListing(value: unknown): ReaderListing | null {
  if (!isRecord(value)) return null;
  const directory = value["directory"];
  const listing = value["listing"];
  const truncated = value["truncated"];
  if (typeof directory !== "string") return null;
  const plan = parseNullable(value["plan"], parseReaderPlan);
  if (plan === undefined) return null;
  const files = parseListOf(value["files"], parseReaderFileEntry);
  if (!files) return null;
  if (!isReaderListingKind(listing)) return null;
  if (typeof truncated !== "boolean") return null;
  return { directory, plan, files, listing, truncated };
}

/** `GET /api/sessions/{id}/reader` (kb:anchor/sessions.reader). Lists the session's
 * readable markdown and, as a side effect, runs the daemon's transcript scan — a changed
 * plan reaches this same UI socket as a `sessionUpsert` before this response is written.
 * Errors: `404 unknown_session` / `409 directory_missing`. */
export async function fetchReaderListing(id: number): Promise<ApiResult<ReaderListing>> {
  return requestJson("GET", `/api/sessions/${id}/reader`, parseReaderListing);
}

/** `GET /api/sessions/{id}/reader/file` (kb:anchor/sessions.reader-file). `path` is the
 * absolute path (the listing's `plan.path`, or `directory` joined with a `files[i].path`).
 * A success response is raw `text/markdown` bytes, not JSON; errors still arrive as the
 * usual JSON envelope. Errors: `400 invalid_request` / `404 unknown_session` /
 * `404 not_found` / `413 too_large`. */
export async function fetchReaderFile(id: number, path: string): Promise<ApiResult<string>> {
  const url = `/api/sessions/${id}/reader/file?path=${encodeURIComponent(path)}`;
  return requestText(url);
}
