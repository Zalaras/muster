import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { putPrefs } from "./prefs";
import { refreshUsage } from "./usage";
import { fakeStatusResponse } from "./testfakes";

describe("prefs — putPrefs (PUT /api/prefs, kb:anchor/prefs.put)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a bare 204 with no body as success, never trying to parse a body", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    const result = await putPrefs({ view: "tiles" });
    expect(result).toEqual({ ok: true, value: null });
  });

  it("sends only the field(s) the caller supplies (a single-field PUT), with same-origin credentials", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await putPrefs({ density: "3x2" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prefs",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ density: "3x2" }),
      }),
    );
  });

  it("can send both fields in one request", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await putPrefs({ view: "focus", density: "2x2" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ view: "focus", density: "2x2" });
  });

  it("decodes a 400 invalid_request error envelope (unknown/out-of-enum field)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(400, {
        error: { code: "invalid_request", message: "density must be 2x2 or 3x2" },
      }),
    );
    const result = await putPrefs({ density: "4x4" as never });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "density must be 2x2 or 3x2" },
    });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(401, {
        error: { code: "unauthorized", message: "missing session cookie" },
      }),
    );
    const result = await putPrefs({ view: "tiles" });
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "missing session cookie" },
    });
  });

  it("falls back to a generic error when a non-204 error body doesn't match the error envelope shape", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500, { oops: "no error field" }));
    const result = await putPrefs({ view: "tiles" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when a non-204 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await putPrefs({ view: "tiles" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  // Plan usage-model-bar REQ-8: usageModel joins view/density as a third optional field.
  it("sends a usageModel-only PUT (a select change) as its own single field", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    const result = await putPrefs({ usageModel: "Opus" });
    expect(result).toEqual({ ok: true, value: null });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ usageModel: "Opus" });
  });

  it("can send usageModel alongside view/density in one request", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await putPrefs({ view: "tiles", density: "3x2", usageModel: "Fable" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({
      view: "tiles",
      density: "3x2",
      usageModel: "Fable",
    });
  });

  it("decodes a 400 invalid_request error envelope for an out-of-range usageModel (empty or >32 chars)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(400, {
        error: { code: "invalid_request", message: "usageModel must be 1-32 characters" },
      }),
    );
    const result = await putPrefs({ usageModel: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "usageModel must be 1-32 characters" },
    });
  });
});

describe("prefs — refreshUsage (POST /api/usage/refresh, kb:anchor/usage.refresh, plan usage-model-bar REQ-7)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a bare 202 with no body as success, never trying to parse a body", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(202));
    const result = await refreshUsage();
    expect(result).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/usage/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("decodes a 404 not_found error envelope when polling is disabled (-usage-poll 0, edge case 14)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(404, {
        error: { code: "not_found", message: "usage polling is disabled" },
      }),
    );
    const result = await refreshUsage();
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "usage polling is disabled" },
    });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(401, {
        error: { code: "unauthorized", message: "missing session cookie" },
      }),
    );
    const result = await refreshUsage();
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "missing session cookie" },
    });
  });

  it("falls back to a generic error when a non-202 error body doesn't match the error envelope shape", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500, { oops: "no error field" }));
    const result = await refreshUsage();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when a non-202 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await refreshUsage();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});
