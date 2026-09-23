import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReaderFile, fetchReaderListing } from "./reader";
import { fakeResponse, fakeTextResponse } from "./testfakes";

// Plan markdown-viewing (kb:anchor/sessions.reader, W10): decoding the reader listing,
// including the "measured absence" shapes — a session with no known plan (`plan: null`)
// and a file whose write log has no entry (`writtenAt: null`) — which must decode
// successfully rather than being rejected, per the same "no data yet" discipline as
// Session.context.
describe("reader — fetchReaderListing (GET /api/sessions/{id}/reader, kb:anchor/sessions.reader)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a listing with a populated plan and files, requesting the right URL", async () => {
    const body = {
      directory: "/Users/bob/code/muster",
      plan: {
        path: "/Users/bob/.claude/plans/say-hi.md",
        exists: true,
        writtenAt: "2026-09-13T09:15:00Z",
      },
      files: [
        { path: "TODO.md", writtenAt: null },
        { path: "docs/adr/x.md", writtenAt: "2026-09-13T09:14:58Z" },
      ],
      listing: "git",
      truncated: false,
    };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchReaderListing(7);
    expect(result).toEqual({ ok: true, value: body });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/7/reader", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("decodes plan: null — the transcript names no plan at all, never rejected", async () => {
    const body = {
      directory: "/Users/bob/code/muster",
      plan: null,
      files: [],
      listing: "walk",
      truncated: false,
    };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchReaderListing(7);
    expect(result).toEqual({ ok: true, value: body });
  });

  it("decodes a plan with exists: false and writtenAt: null (plan mode entered, nothing written yet)", async () => {
    const body = {
      directory: "/Users/bob/code/muster",
      plan: { path: "/Users/bob/.claude/plans/say-hi.md", exists: false, writtenAt: null },
      files: [],
      listing: "git",
      truncated: false,
    };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchReaderListing(7);
    expect(result).toEqual({ ok: true, value: body });
  });

  it("decodes truncated: true (the 20,000-file walk cap was hit)", async () => {
    const body = {
      directory: "/Users/bob/code/muster",
      plan: null,
      files: [{ path: "a.md", writtenAt: null }],
      listing: "walk",
      truncated: true,
    };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchReaderListing(7);
    expect(result).toEqual({ ok: true, value: body });
  });

  it("rejects a listing missing directory", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { plan: null, files: [], listing: "git", truncated: false }),
    );
    const result = await fetchReaderListing(7);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects a plan object missing exists", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, {
        directory: "/tmp",
        plan: { path: "/tmp/plan.md" },
        files: [],
        listing: "git",
        truncated: false,
      }),
    );
    const result = await fetchReaderListing(7);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects an unrecognized listing value", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, {
        directory: "/tmp",
        plan: null,
        files: [],
        listing: "find",
        truncated: false,
      }),
    );
    const result = await fetchReaderListing(7);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("decodes a 409 directory_missing error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "directory_missing", message: "/Users/d/gone no longer exists" },
      }),
    );
    const result = await fetchReaderListing(7);
    expect(result).toEqual({
      ok: false,
      error: { code: "directory_missing", message: "/Users/d/gone no longer exists" },
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "unknown session id" } }),
    );
    const result = await fetchReaderListing(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "unknown session id" },
    });
  });
});

describe("reader — fetchReaderFile (GET /api/sessions/{id}/reader/file, kb:anchor/sessions.reader-file)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the raw text body verbatim on 200, never parsed as JSON", async () => {
    fetchMock.mockResolvedValue(fakeTextResponse("# Plan\n\nSome *markdown*.\n"));
    const result = await fetchReaderFile(7, "/Users/bob/code/muster/TODO.md");
    expect(result).toEqual({ ok: true, value: "# Plan\n\nSome *markdown*.\n" });
  });

  it("encodes the absolute path into the query string", async () => {
    fetchMock.mockResolvedValue(fakeTextResponse(""));
    await fetchReaderFile(7, "/Users/bob/code/muster/docs/a b.md");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/7/reader/file?path=" +
        encodeURIComponent("/Users/bob/code/muster/docs/a b.md"),
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("decodes a 400 invalid_request error envelope (path missing or not absolute)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "invalid_request", message: "path must be an absolute file path" },
      }),
    );
    const result = await fetchReaderFile(7, "relative.md");
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "path must be an absolute file path" },
    });
  });

  it("decodes a 404 not_found error envelope (deliberately indistinguishable from a missing file)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_found", message: "no such document" } }),
    );
    const result = await fetchReaderFile(7, "/Users/bob/code/muster/../../etc/passwd");
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "no such document" },
    });
  });

  it("decodes a 413 too_large error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "too_large",
          message: "/Users/d/big.md is 12.4 MB; the reader serves files up to 10 MB",
        },
      }),
    );
    const result = await fetchReaderFile(7, "/Users/d/big.md");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "too_large",
        message: "/Users/d/big.md is 12.4 MB; the reader serves files up to 10 MB",
      },
    });
  });

  it("falls back to the generic error when a non-200 body is not valid JSON", async () => {
    const res = {
      ok: false,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
    fetchMock.mockResolvedValue(res);
    const result = await fetchReaderFile(7, "/Users/d/x.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});
