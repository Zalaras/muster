import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, fetchRestartImpact } from "./update";
import { fakeResponse, fakeStatusResponse } from "./testfakes";

describe("update — applyUpdate (POST /api/update/apply, kb:anchor/update.apply, plan auto-update)", () => {
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
    const result = await applyUpdate(false);
    expect(result).toEqual({ ok: true, value: null });
  });

  it("sends {restart:false} by default, with same-origin credentials", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(202));
    await applyUpdate(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/update/apply",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart: false }),
      }),
    );
  });

  it("sends {restart:true} for Update and restart / Restart now", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(202));
    await applyUpdate(true);
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ restart: true });
  });

  it("a second apply already in flight still decodes the 202 as success (REQ-20 — no error surfaced client-side)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(202));
    const result = await applyUpdate(true);
    expect(result).toEqual({ ok: true, value: null });
  });

  it("decodes a 404 not_found error envelope (updates disabled, or install 'dev')", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(404, {
        error: { code: "not_found", message: "updates are disabled for this daemon" },
      }),
    );
    const result = await applyUpdate(false);
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "updates are disabled for this daemon" },
    });
  });

  it("decodes a 409 update_unsupported error envelope, message carrying the remedy (homebrew/unmanaged)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(409, {
        error: {
          code: "update_unsupported",
          message: "installed by Homebrew — run brew upgrade musterd",
        },
      }),
    );
    const result = await applyUpdate(false);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "update_unsupported",
        message: "installed by Homebrew — run brew upgrade musterd",
      },
    });
  });

  it("decodes a 409 nothing_to_apply error envelope (available and installed both null)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(409, {
        error: { code: "nothing_to_apply", message: "no newer release is known" },
      }),
    );
    const result = await applyUpdate(false);
    expect(result).toEqual({
      ok: false,
      error: { code: "nothing_to_apply", message: "no newer release is known" },
    });
  });

  it("decodes a 409 shutting_down error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(409, {
        error: { code: "shutting_down", message: "musterd is shutting down" },
      }),
    );
    const result = await applyUpdate(false);
    expect(result).toEqual({
      ok: false,
      error: { code: "shutting_down", message: "musterd is shutting down" },
    });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(401, {
        error: { code: "unauthorized", message: "missing session cookie" },
      }),
    );
    const result = await applyUpdate(false);
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "missing session cookie" },
    });
  });

  it("falls back to a generic error when a non-202 error body doesn't match the error envelope shape", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500, { oops: "no error field" }));
    const result = await applyUpdate(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when a non-202 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await applyUpdate(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("update — fetchRestartImpact (GET /api/update/restart-impact, kb:anchor/update.restart-impact, plan auto-update REQ-27)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a 200 with one shell, title populated", async () => {
    const body = { shells: [{ sessionId: 3, title: "fix auth" }] };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchRestartImpact();
    expect(result).toEqual({ ok: true, value: body });
    expect(fetchMock).toHaveBeenCalledWith("/api/update/restart-impact", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("decodes a 200 with an empty shells array (no plain-terminal shells open)", async () => {
    const body = { shells: [] };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchRestartImpact();
    expect(result).toEqual({ ok: true, value: body });
  });

  it("decodes a shell with a null title (the owning session is unknown)", async () => {
    const body = { shells: [{ sessionId: 9, title: null }] };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchRestartImpact();
    expect(result).toEqual({ ok: true, value: body });
  });

  it("decodes multiple shells in order", async () => {
    const body = {
      shells: [
        { sessionId: 1, title: "fix auth" },
        { sessionId: 2, title: "spike" },
      ],
    };
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await fetchRestartImpact();
    expect(result).toEqual({ ok: true, value: body });
  });

  it("rejects a 200 body whose shells is not an array", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { shells: "none" }));
    const result = await fetchRestartImpact();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects a shell entry with a non-numeric sessionId", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { shells: [{ sessionId: "3", title: "fix auth" }] }),
    );
    const result = await fetchRestartImpact();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unauthorized", message: "missing session cookie" } }),
    );
    const result = await fetchRestartImpact();
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "missing session cookie" },
    });
  });
});
