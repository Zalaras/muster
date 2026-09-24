// The file-drop fingerprint lookup — the only endpoint whose request body is a `FormData`
// upload rather than JSON.
import { isRecord } from "../protocol/decode";
import { requestFormData, type ApiResult } from "./http";

/** The `200` body of `POST /api/sessions/{id}/locate` (kb:anchor/sessions.locate). */
export interface LocatedFile {
  path: string;
}

function parseLocatedFile(value: unknown): LocatedFile | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  if (typeof path !== "string") return null;
  return { path };
}

/** `POST /api/sessions/{id}/locate` (kb:anchor/sessions.locate). Uploads one dropped
 * file's bytes as a fingerprint — never a transfer, the daemon never persists it
 * (kb:adr/drop-daemon-locates-original-never-stages) — and gets back the single on-disk
 * path whose basename, size and bytes match, or an error the caller classifies via
 * `terminal/drop.ts`'s `noticeForFailure`. Errors: `400 invalid_request` /
 * `404 unknown_session` / `404 not_located` / `409 ambiguous` (carries `paths`) /
 * `413 too_large` / `500 internal_error`. */
export async function locateDroppedFile(
  sessionId: number,
  file: File,
): Promise<ApiResult<LocatedFile>> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return requestFormData(`/api/sessions/${sessionId}/locate`, formData, parseLocatedFile);
}
