// Issue capture and filing (kb:anchor/issue.captures / kb:anchor/issue.create).
import { isRecord } from "../protocol/decode";
import { requestJson, type ApiResult } from "./http";

/** Plan issue-capture (kb:anchor/issue.captures): the held server-side snapshot a capture
 * produces. `snapshot` is deliberately left as an opaque record here
 * (kb:adr/issue-preview-is-the-leak-check) — features/issue.ts never reads a field out of
 * it; only `snapshotMarkdown` (the daemon's own rendered string) ever reaches the preview. */
// `takenAt` deliberately renames the wire's `capturedAt` — parsing it under a different
// TS-side name here, in api/issue.ts, keeps features/issue.ts from ever having to name the
// wire field the capture's timestamp came from, consistent with treating `snapshot` as
// opaque above.
export interface IssueCapture {
  captureId: string;
  takenAt: string;
  snapshot: Record<string, unknown>;
  snapshotMarkdown: string;
}

function parseIssueCapture(value: unknown): IssueCapture | null {
  if (!isRecord(value)) return null;
  const captureId = value["captureId"];
  const takenAt = value["capturedAt"];
  const snapshot = value["snapshot"];
  const snapshotMarkdown = value["snapshotMarkdown"];
  if (typeof captureId !== "string") return null;
  if (typeof takenAt !== "string") return null;
  if (!isRecord(snapshot)) return null;
  if (typeof snapshotMarkdown !== "string") return null;
  return { captureId, takenAt, snapshot, snapshotMarkdown };
}

/** `POST /api/issue/captures` (kb:anchor/issue.captures). `sessionId` null or omitted is
 * dashboard scope; the daemon holds the resulting capture (at most 8, 15 min TTL) for a
 * later `POST /api/issues`. Errors: `400 invalid_request` / `404 unknown_session` /
 * `404 not_found` (feature disabled, `-issue-api-url` empty). */
export async function captureIssueSnapshot(
  sessionId: number | null,
): Promise<ApiResult<IssueCapture>> {
  return requestJson("POST", "/api/issue/captures", parseIssueCapture, { sessionId });
}

export interface FileIssueRequest {
  captureId: string;
  title: string;
  note: string;
}

export interface FiledIssue {
  number: number;
  url: string;
  repo: string;
}

function parseFiledIssue(value: unknown): FiledIssue | null {
  if (!isRecord(value)) return null;
  const number = value["number"];
  const url = value["url"];
  const repo = value["repo"];
  if (typeof number !== "number") return null;
  if (typeof url !== "string") return null;
  if (typeof repo !== "string") return null;
  return { number, url, repo };
}

/** `POST /api/issues` (kb:anchor/issue.create). Files a held capture — never a
 * client-supplied payload (kb:adr/issue-capture-then-file-server-held). A successful file
 * consumes the capture; a failure does not, so a retry needs no re-capture. Errors:
 * `400 invalid_request` / `404 not_found` (disabled) / `409 capture_expired` / `502 issue_auth_failed` /
 * `502 issue_post_failed`. */
export async function fileIssue(body: FileIssueRequest): Promise<ApiResult<FiledIssue>> {
  return requestJson("POST", "/api/issues", parseFiledIssue, body);
}
