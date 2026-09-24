// Shared HTTP plumbing for every daemon endpoint wrapper under `web/src/api/`. This module
// is the *only* place that calls `fetch`, decodes a response, or logs a failure — every
// `api/*.ts` endpoint file calls one of the four `request*` functions below and never
// touches `fetch`, `Response` or `console` itself.
//
// Errors never throw — every exported function in `web/src/api/` returns an `ApiResult` so
// a caller (the launch modal, say) can render `error.message` inline instead of an
// uncaught rejection.
import { isRecord } from "../protocol/decode";

export interface ApiErrorBody {
  code: string;
  message: string;
  // kb:anchor/sessions.locate: only the `409 ambiguous` locate error carries this — every
  // verified match, so the caller can count them. Ignored by every other error path.
  paths?: string[];
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiErrorBody };

function parseApiError(value: unknown): ApiErrorBody | null {
  if (!isRecord(value)) return null;
  const err = value["error"];
  if (!isRecord(err)) return null;
  const code = err["code"];
  const message = err["message"];
  if (typeof code !== "string" || typeof message !== "string") return null;
  const paths = err["paths"];
  if (paths === undefined) return { code, message };
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) return { code, message };
  return { code, message, paths };
}

const genericError: ApiErrorBody = {
  code: "unknown_error",
  message: "Unexpected response from musterd.",
};

// The `network` failure mode (daemon down, connection refused, sleep/wake, aborted
// request): a rejected `fetch` must never propagate — every exported function in
// `web/src/api/` routes its fetch through this so the "errors never throw" contract
// actually holds for every call site, not just JSON-decoding failures.
const networkError: ApiErrorBody = {
  code: "network_error",
  message: "Could not reach musterd.",
};

async function safeFetch(input: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

function requestInit(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method, credentials: "same-origin" };
  return {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  };
}

/** Reads and validates the JSON error envelope off a non-2xx response. Shared by every
 * decode path below — a bad/missing body still returns a usable, generic `ApiErrorBody`
 * rather than throwing. */
async function parseErrorResponse(res: Response): Promise<ApiErrorBody> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return genericError;
  }
  return parseApiError(body) ?? genericError;
}

async function decodeJson<T>(
  res: Response,
  parse: (value: unknown) => T | null,
): Promise<ApiResult<T>> {
  if (!res.ok) return { ok: false, error: await parseErrorResponse(res) };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const value = parse(body);
  if (value === null) return { ok: false, error: genericError };
  return { ok: true, value };
}

/** The `2xx`-with-no-body shape (`putPrefs`'s `204`, `applyUpdate`'s `202`, …): a matching
 * status is success with no value to decode, anything else falls through to the same JSON
 * error envelope every other endpoint uses. */
async function decodeEmpty(res: Response, successStatus: number): Promise<ApiResult<null>> {
  if (res.status === successStatus) return { ok: true, value: null };
  return { ok: false, error: await parseErrorResponse(res) };
}

// The one place that formats a failed `ApiResult` — a controller never spells out an
// API path or re-states `error.code`/`error.message` itself. The four `request*` functions
// below call this on every failure (network, decode, or the daemon's own error envelope),
// so every endpoint logs the same way whether or not its caller also does something with
// the error (e.g. `showActionError`).
function logApiFailure(method: string, url: string, error: ApiErrorBody): void {
  console.error(`${method} ${url} failed: ${error.code} ${error.message}`);
}

function fail<T>(method: string, url: string, error: ApiErrorBody): ApiResult<T> {
  logApiFailure(method, url, error);
  return { ok: false, error };
}

/** A JSON (or empty-GET) request that decodes a `2xx` body with `parse`. Covers every
 * endpoint whose success response carries a value. */
export async function requestJson<T>(
  method: string,
  url: string,
  parse: (value: unknown) => T | null,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await safeFetch(url, requestInit(method, body));
  if (!res) return fail(method, url, networkError);
  const result = await decodeJson(res, parse);
  if (!result.ok) logApiFailure(method, url, result.error);
  return result;
}

/** A request whose success response is `successStatus` with no body — the resulting state
 * change reaches every UI socket via a WS broadcast instead. */
export async function requestEmpty(
  method: string,
  url: string,
  successStatus: number,
  body?: unknown,
): Promise<ApiResult<null>> {
  const res = await safeFetch(url, requestInit(method, body));
  if (!res) return fail(method, url, networkError);
  const result = await decodeEmpty(res, successStatus);
  if (!result.ok) logApiFailure(method, url, result.error);
  return result;
}

/** A `GET` whose success response is raw text, not JSON — `fetchReaderFile`'s one caller
 * (a success response is `text/markdown` bytes); errors still arrive as the usual JSON
 * envelope. */
export async function requestText(url: string): Promise<ApiResult<string>> {
  const res = await safeFetch(url, { method: "GET", credentials: "same-origin" });
  if (!res) return fail("GET", url, networkError);
  if (res.ok) return { ok: true, value: await res.text() };
  const error = await parseErrorResponse(res);
  logApiFailure("GET", url, error);
  return { ok: false, error };
}

/** A `POST` whose body is a `FormData` upload rather than JSON — `locateDroppedFile`'s one
 * caller. */
export async function requestFormData<T>(
  url: string,
  formData: FormData,
  parse: (value: unknown) => T | null,
): Promise<ApiResult<T>> {
  const res = await safeFetch(url, { method: "POST", credentials: "same-origin", body: formData });
  if (!res) return fail("POST", url, networkError);
  const result = await decodeJson(res, parse);
  if (!result.ok) logApiFailure("POST", url, result.error);
  return result;
}
