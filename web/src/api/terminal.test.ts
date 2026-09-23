import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locateDroppedFile } from "./terminal";
import { fakeResponse, fakeResponseThatThrows } from "./testfakes";

describe("terminal — locateDroppedFile (POST /api/sessions/{id}/locate, kb:anchor/sessions.locate, plan file-drop-fix)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFile(name: string, contents = "hello"): File {
    return new File([contents], name, { type: "application/octet-stream" });
  }

  it("uploads the file as multipart/form-data under the 'file' part and decodes the 200 path (REQ-2/REQ-3)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { path: "/Users/bob/Desktop/Screenshot 2026-08-30 at 14.35.00.png" }),
    );
    const file = makeFile("Screenshot 2026-08-30 at 14.35.00.png");
    const result = await locateDroppedFile(7, file);
    expect(result).toEqual({
      ok: true,
      value: { path: "/Users/bob/Desktop/Screenshot 2026-08-30 at 14.35.00.png" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("/api/sessions/7/locate");
    expect(call[1].method).toBe("POST");
    expect(call[1].credentials).toBe("same-origin");
    const body = call[1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const part = body.get("file");
    expect(part).toBeInstanceOf(File);
    expect((part as File).name).toBe("Screenshot 2026-08-30 at 14.35.00.png");
  });

  it("sends no Content-Type header itself, leaving the multipart boundary to the browser/FormData", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { path: "/tmp/x" }));
    await locateDroppedFile(1, makeFile("x"));
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[1].headers).toBeUndefined();
  });

  it("decodes a 404 not_located error envelope (REQ-3, zero verified candidates)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "not_located",
          message: "no file named x.png with identical contents was found",
        },
      }),
    );
    const result = await locateDroppedFile(1, makeFile("x.png"));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_located",
        message: "no file named x.png with identical contents was found",
      },
    });
  });

  it("decodes a 409 ambiguous error envelope, carrying the paths array (REQ-3, two+ verified candidates)", async () => {
    const paths = ["/Users/bob/a/dup.png", "/Users/bob/b/dup.png"];
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "ambiguous", message: "2 identical files named dup.png", paths },
      }),
    );
    const result = await locateDroppedFile(1, makeFile("dup.png"));
    expect(result).toEqual({
      ok: false,
      error: { code: "ambiguous", message: "2 identical files named dup.png", paths },
    });
  });

  it("decodes a 413 too_large error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "too_large", message: "file exceeds the 50 MiB limit" },
      }),
    );
    const result = await locateDroppedFile(1, makeFile("huge.mov"));
    expect(result).toEqual({
      ok: false,
      error: { code: "too_large", message: "file exceeds the 50 MiB limit" },
    });
  });

  it("decodes a 400 invalid_request error envelope (empty filename or path separator)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "invalid_request", message: "filename must not contain a path separator" },
      }),
    );
    const result = await locateDroppedFile(1, makeFile("a/b"));
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "filename must not contain a path separator" },
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await locateDroppedFile(999, makeFile("x"));
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 500 internal_error error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "internal_error", message: "session directory is unreadable" },
      }),
    );
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result).toEqual({
      ok: false,
      error: { code: "internal_error", message: "session directory is unreadable" },
    });
  });

  it("falls back to a generic error when the success body is missing path", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { notPath: "oops" }));
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("ignores a non-array paths field on a non-ambiguous error, still decoding code/message", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_located", message: "m", paths: "not-an-array" } }),
    );
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result).toEqual({ ok: false, error: { code: "not_located", message: "m" } });
  });

  it("ignores a paths array containing a non-string element, dropping paths but keeping code/message", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "ambiguous", message: "m", paths: ["/a", 42] } }),
    );
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result).toEqual({ ok: false, error: { code: "ambiguous", message: "m" } });
  });

  it("never throws when the response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});
