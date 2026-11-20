import {
  asInteger,
  isBoolean,
  isRecord,
  isString,
  parseListOf,
  parseNullable,
} from "../protocol/decode";
import { requestEmpty, requestJson, type ApiResult } from "./http";

export type DiffScope = "uncommitted" | "branch";
export type DiffLineKind = "context" | "del" | "add";
export type DiffStatus = "added" | "modified" | "deleted" | "renamed";
export type CommentSide = "old" | "new";

export interface ScopeCounts {
  files: number;
  additions: number;
  deletions: number;
  fingerprint: string;
}

export interface DiffSummary {
  repo: boolean;
  uncommitted: ScopeCounts;
  branch: ScopeCounts;
  openComments: number;
}

export interface DiffLine {
  kind: DiffLineKind;
  old: number | null;
  new: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: DiffStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffBody {
  scope: DiffScope;
  base: string;
  fingerprint: string;
  files: DiffFile[];
}

export interface CommentPoint {
  side: CommentSide;
  line: number;
}

export interface ReviewComment {
  id: string;
  path: string;
  start: CommentPoint;
  end: CommentPoint;
  quote: string[];
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface DiffReview {
  comments: ReviewComment[];
  ticks: string[];
}

export type CommentWrite = Omit<ReviewComment, "id" | "createdAt">;

function parseCounts(value: unknown): ScopeCounts | null {
  if (!isRecord(value)) return null;
  const files = asInteger(value["files"]);
  const additions = asInteger(value["additions"]);
  const deletions = asInteger(value["deletions"]);
  const fingerprint = value["fingerprint"];
  if (files === null || additions === null || deletions === null) return null;
  if (!isString(fingerprint)) return null;
  return { files, additions, deletions, fingerprint };
}

function parseSummary(value: unknown): DiffSummary | null {
  if (!isRecord(value)) return null;
  const repo = value["repo"];
  const uncommitted = parseCounts(value["uncommitted"]);
  const branch = parseCounts(value["branch"]);
  const openComments = asInteger(value["openComments"]);
  if (!isBoolean(repo) || !uncommitted || !branch || openComments === null) return null;
  return { repo, uncommitted, branch, openComments };
}

function isLineKind(value: unknown): value is DiffLineKind {
  return value === "context" || value === "del" || value === "add";
}

function parseLine(value: unknown): DiffLine | null {
  if (!isRecord(value)) return null;
  const kind = value["kind"];
  const text = value["text"];
  const old = parseNullable(value["old"], asInteger);
  const next = parseNullable(value["new"], asInteger);
  if (!isLineKind(kind) || !isString(text)) return null;
  if (old === undefined || next === undefined) return null;
  return { kind, old, new: next, text };
}

function parseHunk(value: unknown): DiffHunk | null {
  if (!isRecord(value)) return null;
  const header = value["header"];
  const lines = parseListOf(value["lines"], parseLine);
  if (!isString(header) || !lines) return null;
  return { header, lines };
}

function isStatus(value: unknown): value is DiffStatus {
  return value === "added" || value === "modified" || value === "deleted" || value === "renamed";
}

function parseFile(value: unknown): DiffFile | null {
  if (!isRecord(value)) return null;
  const { path, oldPath, status, binary } = value;
  const additions = asInteger(value["additions"]);
  const deletions = asInteger(value["deletions"]);
  const hunks = parseListOf(value["hunks"], parseHunk);
  if (!isString(path) || !isStatus(status) || !isBoolean(binary)) return null;
  if (oldPath !== null && !isString(oldPath)) return null;
  if (additions === null || deletions === null || !hunks) return null;
  return { path, oldPath, status, binary, additions, deletions, hunks };
}

function parseDiff(value: unknown): DiffBody | null {
  if (!isRecord(value)) return null;
  const { scope, base, fingerprint } = value;
  const files = parseListOf(value["files"], parseFile);
  if (scope !== "uncommitted" && scope !== "branch") return null;
  if (!isString(base) || !isString(fingerprint) || !files) return null;
  return { scope, base, fingerprint, files };
}

function parsePoint(value: unknown): CommentPoint | null {
  if (!isRecord(value)) return null;
  const side = value["side"];
  const line = asInteger(value["line"]);
  if ((side !== "old" && side !== "new") || line === null) return null;
  return { side, line };
}

function parseComment(value: unknown): ReviewComment | null {
  if (!isRecord(value)) return null;
  const { id, path, body, resolved, createdAt } = value;
  const start = parsePoint(value["start"]);
  const end = parsePoint(value["end"]);
  const quote = parseListOf(value["quote"], (item) => (isString(item) ? item : null));
  if (!isString(id) || !isString(path) || !isString(body) || !isString(createdAt)) return null;
  if (!isBoolean(resolved) || !start || !end || !quote) return null;
  return { id, path, start, end, quote, body, resolved, createdAt };
}

function parseReview(value: unknown): DiffReview | null {
  if (!isRecord(value)) return null;
  const comments = parseListOf(value["comments"], parseComment);
  const ticks = parseListOf(value["ticks"], (item) => (isString(item) ? item : null));
  if (!comments || !ticks) return null;
  return { comments, ticks };
}

export function fetchDiffSummary(id: number): Promise<ApiResult<DiffSummary>> {
  return requestJson("GET", `/api/sessions/${id}/diff/summary`, parseSummary);
}

export function fetchDiff(id: number, scope: DiffScope): Promise<ApiResult<DiffBody>> {
  return requestJson("GET", `/api/sessions/${id}/diff?scope=${scope}`, parseDiff);
}

export function fetchDiffReview(id: number): Promise<ApiResult<DiffReview>> {
  return requestJson("GET", `/api/sessions/${id}/diff/review`, parseReview);
}

export function putDiffComment(
  id: number,
  commentId: string,
  comment: CommentWrite,
): Promise<ApiResult<null>> {
  return requestEmpty("PUT", `/api/sessions/${id}/diff/comments/${commentId}`, 204, comment);
}

export function deleteDiffComment(id: number, commentId: string): Promise<ApiResult<null>> {
  return requestEmpty("DELETE", `/api/sessions/${id}/diff/comments/${commentId}`, 204);
}

export function postDiffTicks(
  id: number,
  add: readonly string[],
  remove: readonly string[],
): Promise<ApiResult<null>> {
  return requestEmpty("POST", `/api/sessions/${id}/diff/ticks`, 204, { add, remove });
}
