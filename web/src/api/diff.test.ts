import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDiffComment,
  fetchDiff,
  fetchDiffReview,
  fetchDiffSummary,
  postDiffTicks,
  putDiffComment,
  type CommentWrite,
  type ReviewComment,
} from "./diff";
import { fakeResponse, fakeStatusResponse } from "./testfakes";

const counts = { files: 2, additions: 5, deletions: 1, fingerprint: "9f2c41d0" };
const summary = {
  repo: true,
  uncommitted: counts,
  branch: { ...counts, files: 0 },
  openComments: 3,
};
const line = { kind: "add", old: null, new: 4, text: "x" };
const file = {
  path: "a.go",
  oldPath: null,
  status: "added",
  binary: false,
  additions: 1,
  deletions: 0,
  hunks: [{ header: "@@ -0,0 +1 @@", lines: [line] }],
};
const diff = { scope: "branch", base: "main", fingerprint: "ab", files: [file] };
const comment: ReviewComment = {
  id: "c-1",
  path: "a.go",
  start: { side: "new", line: 4 },
  end: { side: "new", line: 4 },
  quote: ["x"],
  body: "why",
  resolved: false,
  createdAt: "2026-11-19T19:02:00Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api/diff — fetchDiffSummary (kb:anchor/diff.summary)", () => {
  it("decodes a summary and GETs the session's summary path", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, summary));
    expect(await fetchDiffSummary(7)).toEqual({ ok: true, value: summary });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/7/diff/summary",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it.each([
    ["repo not boolean", { ...summary, repo: "yes" }],
    ["openComments missing", { ...summary, openComments: undefined }],
    ["openComments fractional", { ...summary, openComments: 1.5 }],
    ["uncommitted null", { ...summary, uncommitted: null }],
    ["branch fingerprint missing", { ...summary, branch: { ...counts, fingerprint: undefined } }],
    ["branch count a string", { ...summary, branch: { ...counts, files: "2" } }],
    ["not an object", []],
  ])("rejects a malformed summary: %s", async (_name, body) => {
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchDiffSummary(7);
    expect(result.ok).toBe(false);
  });

  it("decodes the 500 diff_failed envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "diff_failed", message: "could not read the diff" } }),
    );
    expect(await fetchDiffSummary(7)).toEqual({
      ok: false,
      error: { code: "diff_failed", message: "could not read the diff" },
    });
  });

  it("returns network_error rather than throwing when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    const result = await fetchDiffSummary(7);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("network_error");
  });
});

describe("api/diff — fetchDiff (kb:anchor/diff.read)", () => {
  it("decodes a diff with a null oldPath and a null line number, and sends the scope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, diff));
    expect(await fetchDiff(7, "branch")).toEqual({ ok: true, value: diff });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/7/diff?scope=branch");
  });

  it("decodes a renamed file with a string oldPath and an empty file list", async () => {
    const renamed = { ...file, status: "renamed", oldPath: "b.go", hunks: [] };
    fetchMock.mockResolvedValue(fakeResponse(true, { ...diff, files: [renamed] }));
    const result = await fetchDiff(7, "uncommitted");
    expect(result.ok && result.value.files[0]?.oldPath).toBe("b.go");
    fetchMock.mockResolvedValue(fakeResponse(true, { ...diff, files: [] }));
    expect(await fetchDiff(7, "uncommitted")).toEqual({
      ok: true,
      value: { ...diff, files: [] },
    });
  });

  it.each([
    ["unknown scope", { ...diff, scope: "staged" }],
    ["files not a list", { ...diff, files: null }],
    ["unknown status", { ...diff, files: [{ ...file, status: "copied" }] }],
    ["oldPath a number", { ...diff, files: [{ ...file, oldPath: 3 }] }],
    ["oldPath missing", { ...diff, files: [{ ...file, oldPath: undefined }] }],
    ["binary not boolean", { ...diff, files: [{ ...file, binary: 0 }] }],
    [
      "unknown line kind",
      { ...diff, files: [{ ...file, hunks: [{ header: "h", lines: [{ ...line, kind: "mv" }] }] }] },
    ],
    [
      "line number a string",
      { ...diff, files: [{ ...file, hunks: [{ header: "h", lines: [{ ...line, new: "4" }] }] }] },
    ],
    ["one bad file spoils the list", { ...diff, files: [file, { path: 1 }] }],
  ])("rejects a malformed diff: %s", async (_name, body) => {
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    expect((await fetchDiff(7, "branch")).ok).toBe(false);
  });
});

describe("api/diff — fetchDiffReview (kb:anchor/diff.review)", () => {
  it("decodes comments and ticks, and an empty review", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { comments: [comment], ticks: ["k1:a"] }));
    expect(await fetchDiffReview(7)).toEqual({
      ok: true,
      value: { comments: [comment], ticks: ["k1:a"] },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/7/diff/review");
    fetchMock.mockResolvedValue(fakeResponse(true, { comments: [], ticks: [] }));
    expect(await fetchDiffReview(7)).toEqual({ ok: true, value: { comments: [], ticks: [] } });
  });

  it.each([
    ["ticks missing", { comments: [] }],
    ["tick not a string", { comments: [], ticks: [4] }],
    ["bad side", { comments: [{ ...comment, start: { side: "left", line: 1 } }], ticks: [] }],
    ["fractional line", { comments: [{ ...comment, end: { side: "new", line: 1.5 } }], ticks: [] }],
    ["quote not strings", { comments: [{ ...comment, quote: [1] }], ticks: [] }],
    ["resolved missing", { comments: [{ ...comment, resolved: undefined }], ticks: [] }],
    ["createdAt missing", { comments: [{ ...comment, createdAt: undefined }], ticks: [] }],
  ])("rejects a malformed review: %s", async (_name, body) => {
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    expect((await fetchDiffReview(7)).ok).toBe(false);
  });

  it("decodes 404 unknown_session", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "unknown session id" } }),
    );
    const result = await fetchDiffReview(9);
    expect(!result.ok && result.error.code).toBe("unknown_session");
  });
});

describe("api/diff — writes (kb:anchor/diff.comment, diff.comment-delete, diff.ticks)", () => {
  const write: CommentWrite = {
    path: comment.path,
    start: comment.start,
    end: comment.end,
    quote: comment.quote,
    body: comment.body,
    resolved: false,
  };

  it("PUTs the comment write as the JSON body and treats 204 as success", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await putDiffComment(7, "c-1", write)).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/7/diff/comments/c-1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(write) }),
    );
  });

  it("DELETEs with no body and treats 204 as success", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await deleteDiffComment(7, "c-1")).toEqual({ ok: true, value: null });
    const init = fetchMock.mock.calls[0]?.[1] as { method: string; body?: string };
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("POSTs both tick lists, empty one included", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await postDiffTicks(7, ["k1:a"], [])).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/7/diff/ticks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ add: ["k1:a"], remove: [] }),
      }),
    );
  });

  it.each([
    ["put", () => putDiffComment(7, "c-1", write)],
    ["delete", () => deleteDiffComment(7, "c-1")],
    ["ticks", () => postDiffTicks(7, ["a"], [])],
  ])("%s decodes a 413 request_too_large envelope", async (_name, call) => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(413, { error: { code: "request_too_large", message: "too large" } }),
    );
    const result = await call();
    expect(!result.ok && result.error.code).toBe("request_too_large");
  });
});
