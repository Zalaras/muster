import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureIssueSnapshot, fileIssue } from "./issue";
import { fakeResponse, fakeResponseThatThrows } from "./testfakes";

const validIssueCapture = {
  captureId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  capturedAt: "2026-08-31T09:15:00Z",
  snapshot: { capturedAt: "2026-08-31T09:15:00Z", scope: "dashboard" },
  snapshotMarkdown: "## Snapshot\n\n| field | value |\n| --- | --- |\n| musterd | 0.3.1 |",
};

describe("issue — captureIssueSnapshot (POST /api/issue/captures, kb:anchor/issue.captures, plan issue-capture)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts sessionId and decodes a 201 response, renaming the wire's capturedAt to takenAt (REQ-3, api/issue.ts's seam)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validIssueCapture));
    const result = await captureIssueSnapshot(7);
    expect(result).toEqual({
      ok: true,
      value: {
        captureId: validIssueCapture.captureId,
        takenAt: validIssueCapture.capturedAt,
        snapshot: validIssueCapture.snapshot,
        snapshotMarkdown: validIssueCapture.snapshotMarkdown,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issue/captures",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: 7 }),
      }),
    );
  });

  it("sends a literal null sessionId for dashboard scope, not an omitted field (REQ-2's dashboard option)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validIssueCapture));
    await captureIssueSnapshot(null);
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ sessionId: null });
  });

  it("decodes a 400 invalid_request error envelope (sessionId present and not an integer)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "invalid_request", message: "sessionId must be an integer" },
      }),
    );
    const result = await captureIssueSnapshot(7);
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "sessionId must be an integer" },
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await captureIssueSnapshot(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 404 not_found error envelope (feature disabled, -issue-api-url empty, Edge Case 14)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "not_found", message: "issue capture is disabled on this daemon" },
      }),
    );
    const result = await captureIssueSnapshot(null);
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "issue capture is disabled on this daemon" },
    });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unauthorized", message: "missing session cookie" } }),
    );
    const result = await captureIssueSnapshot(null);
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "missing session cookie" },
    });
  });

  it("falls back to a generic error when the success body is missing captureId", async () => {
    const { captureId, ...rest } = validIssueCapture;
    void captureId;
    fetchMock.mockResolvedValue(fakeResponse(true, rest));
    const result = await captureIssueSnapshot(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when snapshot is not an object (e.g. an array or a primitive)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { ...validIssueCapture, snapshot: [] }));
    const result = await captureIssueSnapshot(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when snapshotMarkdown is missing", async () => {
    const { snapshotMarkdown, ...rest } = validIssueCapture;
    void snapshotMarkdown;
    fetchMock.mockResolvedValue(fakeResponse(true, rest));
    const result = await captureIssueSnapshot(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("preserves the snapshot object verbatim as an opaque record (this module never interprets its fields)", async () => {
    const richSnapshot = {
      capturedAt: "2026-08-31T09:15:00Z",
      scope: "session",
      session: { state: "working", context: null, model: null },
    };
    fetchMock.mockResolvedValue(
      fakeResponse(true, { ...validIssueCapture, snapshot: richSnapshot }),
    );
    const result = await captureIssueSnapshot(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.snapshot).toEqual(richSnapshot);
  });
});

const validFiledIssue = {
  number: 14,
  url: "https://github.com/Zalaras/muster/issues/14",
  repo: "Zalaras/muster",
};

describe("issue — fileIssue (POST /api/issues, kb:anchor/issue.create, plan issue-capture)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts captureId/title/note and decodes a 201 FiledIssue response (REQ-3, REQ-9)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validFiledIssue));
    const result = await fileIssue({
      captureId: "abc123",
      title: "Something broke",
      note: "It happened while I was typing.",
    });
    expect(result).toEqual({ ok: true, value: validFiledIssue });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issues",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureId: "abc123",
          title: "Something broke",
          note: "It happened while I was typing.",
        }),
      }),
    );
  });

  it("sends the raw (untrimmed) note field — the daemon owns trimming/CRLF normalisation (web-implementation.md decision)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validFiledIssue));
    await fileIssue({ captureId: "abc123", title: "T", note: "  raw text\r\nwith CRLF  " });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body).note).toBe("  raw text\r\nwith CRLF  ");
  });

  it("decodes a 400 invalid_request error envelope (missing/empty/overlong title, or overlong note)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "invalid_request",
          message: "title must be 1-200 characters after trimming",
        },
      }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "", note: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "title must be 1-200 characters after trimming" },
    });
  });

  it("decodes a 404 not_found error envelope (feature disabled)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "not_found", message: "issue capture is disabled on this daemon" },
      }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "issue capture is disabled on this daemon" },
    });
  });

  it("decodes a 409 capture_expired error envelope (unknown, expired, or already-consumed captureId — REQ-15, D10)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "capture_expired", message: "this snapshot has expired" },
      }),
    );
    const result = await fileIssue({ captureId: "stale", title: "T", note: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "capture_expired", message: "this snapshot has expired" },
    });
  });

  it("decodes a 502 issue_auth_failed error envelope (gh missing/non-zero/empty token — REQ-8, Edge Cases 4/5)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "issue_auth_failed",
          message: "gh auth token: not logged in. run gh auth login.",
        },
      }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "issue_auth_failed",
        message: "gh auth token: not logged in. run gh auth login.",
      },
    });
  });

  it("decodes a 502 issue_post_failed error envelope (GitHub non-2xx/transport failure/unparseable 2xx — Edge Cases 6-9)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "issue_post_failed", message: "GitHub returned 403: rate limit exceeded" },
      }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "issue_post_failed", message: "GitHub returned 403: rate limit exceeded" },
    });
  });

  it("never surfaces a bearer token in a decoded error message (INV-3's UI-side half — the token itself never reaches this module)", async () => {
    // INV-3 is a daemon-side invariant (D9); this only proves the client-side decode path
    // does nothing that could reintroduce a token if one somehow appeared server-side.
    const msg = "gh auth token: not logged in. run gh auth login.";
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "issue_auth_failed", message: msg } }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    if (!result.ok) expect(result.error.message).not.toMatch(/gh[oa]_[A-Za-z0-9]{20,}/);
  });

  it("falls back to a generic error when the success body is not a valid FiledIssue (missing/wrong-typed field)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { number: "14", url: validFiledIssue.url, repo: validFiledIssue.repo }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when the response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});
