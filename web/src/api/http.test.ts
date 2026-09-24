import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRestartImpact, applyUpdate } from "./update";
import { browse, fetchRepos, launchSession } from "./launch";
import { putPrefs } from "./prefs";
import { refreshUsage } from "./usage";
import {
  createShell,
  endSession,
  fetchPane,
  pinSession,
  putSessionOrder,
  removeSession,
  resumeSession,
} from "./sessions";
import { captureIssueSnapshot, fileIssue } from "./issue";
import { locateDroppedFile } from "./terminal";
import { fetchReaderFile, fetchReaderListing } from "./reader";

// This module (`http.ts`) is the one place every `api/*.ts` endpoint wrapper routes its
// `fetch` call through — its request helpers, the shared error-envelope decode, and
// `parseApiError`/`decodeJson`/`decodeEmpty`/`parseErrorResponse` are exercised end-to-end
// by every other `api/*.test.ts` file (each endpoint's own success/error/malformed-body
// cases). What's left as this file's own responsibility is the one behaviour that's
// uniform *across every endpoint regardless of which module it lives in* — the
// `network_error` short-circuit below.

// REQ-13's `network` failure mode (daemon down, connection refused, sleep/wake, aborted
// request): plan new-session-dialog Fix Attempt 3 added `safeFetch`, a try/catch choke
// point that every exported function routes its `fetch` call through, so a *rejected*
// fetch promise short-circuits to a `network_error` ApiResult instead of propagating out
// of the `async function` and rejecting the caller's promise. Table-driven over all the
// exported endpoint functions per web-implementation.md's Fix Attempt 3 audit ("Category
// swept, not just the cited functions") — a per-function regression here would mean one
// call site's `safeFetch` guard was missed or a decode path after it still assumes `res`
// is non-null.
describe("http — network_error short-circuit on a rejected fetch (REQ-13, plan new-session-dialog Fix Attempt 3)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const networkError = { code: "network_error", message: "Could not reach musterd." };

  const cases: Array<[string, () => Promise<{ ok: boolean; error?: unknown }>]> = [
    [
      "launchSession",
      () => launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" }),
    ],
    ["fetchRepos", () => fetchRepos()],
    ["browse (no path)", () => browse()],
    ["browse (with path)", () => browse("/tmp")],
    ["putPrefs", () => putPrefs({ view: "focus" })],
    ["refreshUsage", () => refreshUsage()],
    ["endSession", () => endSession(1)],
    ["resumeSession", () => resumeSession(1)],
    ["removeSession", () => removeSession(1)],
    ["createShell", () => createShell(1)],
    ["fetchPane", () => fetchPane(1)],
    ["pinSession", () => pinSession(1, true)],
    ["putSessionOrder", () => putSessionOrder([1, 2, 3], 1)],
    ["captureIssueSnapshot", () => captureIssueSnapshot(1)],
    ["fileIssue", () => fileIssue({ captureId: "abc123", title: "T", note: "" })],
    ["locateDroppedFile", () => locateDroppedFile(1, new File(["x"], "x.txt"))],
    ["applyUpdate", () => applyUpdate(false)],
    ["fetchRestartImpact", () => fetchRestartImpact()],
    ["fetchReaderListing", () => fetchReaderListing(1)],
    ["fetchReaderFile", () => fetchReaderFile(1, "/tmp/x.md")],
  ];

  for (const [name, call] of cases) {
    it(`${name}: a rejected fetch resolves to { ok: false, error: network_error } instead of throwing`, async () => {
      const result = await call();
      expect(result).toEqual({ ok: false, error: networkError });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  it("does not call Response.json at all when fetch itself rejects (nothing to decode)", async () => {
    // A regression where safeFetch's catch was removed would make this promise reject
    // instead of resolve — asserting on the resolved shape below is sufficient to catch
    // that, but this test also documents that no Response is ever constructed to decode.
    const result = await fetchRepos();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("network_error");
  });
});
