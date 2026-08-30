import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browse, endSession, fetchPane, fetchRepos, launchSession, putPrefs, refreshUsage, removeSession, resumeSession } from "./api";
import type { Session } from "./protocol";

const validSession: Session = {
  id: 1,
  title: null,
  state: "started",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/damian/code/muster",
  repo: null,
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: null,
  tmuxTarget: "muster:@1",
  firstLaunchHere: true,
  createdAt: "2026-08-22T00:00:00Z",
};

function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function fakeResponseThatThrows(): Response {
  return { ok: true, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
}

describe("api — launchSession (POST /api/sessions)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the launch request and decodes a 201 Session response (REQ-1/REQ-2)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validSession));
    const result = await launchSession({ directory: "/Users/damian/code/muster", model: "sonnet", permissionMode: "default" });
    expect(result).toEqual({ ok: true, value: validSession });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: "/Users/damian/code/muster", model: "sonnet", permissionMode: "default" }),
      }),
    );
  });

  it("decodes a 400 invalid_request error envelope (Protocol Contract)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "invalid_request", message: "model must not be empty" } }));
    const result = await launchSession({ directory: "/tmp", model: "", permissionMode: "default" });
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "model must not be empty" } });
  });

  it("decodes a 500 launch_failed error envelope naming the settings file (Protocol Contract)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "launch_failed", message: "settings.local.json is not valid JSON" } }),
    );
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" });
    expect(result).toEqual({ ok: false, error: { code: "launch_failed", message: "settings.local.json is not valid JSON" } });
  });

  it("falls back to a generic error when the success body is not a valid Session", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { not: "a session" }));
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when the error body doesn't match the error envelope shape", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { oops: "no error field" }));
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when the response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("omits the title field entirely rather than sending an empty string when the caller doesn't supply one", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validSession));
    await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "plan" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ directory: "/tmp", model: "sonnet", permissionMode: "plan" });
  });
});

describe("api — fetchRepos (GET /api/repos)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a repo list including the nullable per-directory launch defaults (REQ-5)", async () => {
    const repos = [
      {
        id: 1,
        path: "/Users/damian/code/muster",
        name: "muster",
        isGit: true,
        branch: "main",
        pinned: false,
        lastLaunchedAt: "2026-08-22T00:00:00Z",
        launchCount: 3,
        lastModel: "opus",
        lastPermissionMode: "acceptEdits",
      },
      {
        id: 2,
        path: "/Users/damian/code/fresh",
        name: "fresh",
        isGit: false,
        branch: null,
        pinned: false,
        lastLaunchedAt: "2026-08-22T00:00:00Z",
        launchCount: 0,
        lastModel: null,
        lastPermissionMode: null,
      },
    ];
    fetchMock.mockResolvedValue(fakeResponse(true, repos));
    const result = await fetchRepos();
    expect(result).toEqual({ ok: true, value: repos });
  });

  it("requests with same-origin credentials", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, []));
    await fetchRepos();
    expect(fetchMock).toHaveBeenCalledWith("/api/repos", { credentials: "same-origin" });
  });

  it("rejects the whole list when one repo entry is malformed", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, [{ id: 1, path: "/x", name: "x", isGit: true, branch: null, pinned: false, lastLaunchedAt: "t", launchCount: "oops", lastModel: null, lastPermissionMode: null }]),
    );
    const result = await fetchRepos();
    expect(result.ok).toBe(false);
  });
});

describe("api — browse (GET /api/browse)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the bare endpoint when no path is given (daemon defaults to the home directory)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { path: "/Users/damian", parent: "/Users", dirs: [] }));
    await browse();
    expect(fetchMock).toHaveBeenCalledWith("/api/browse", { credentials: "same-origin" });
  });

  it("URL-encodes the path query parameter", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { path: "/Users/damian/my code", parent: "/Users/damian", dirs: [] }));
    await browse("/Users/damian/my code");
    expect(fetchMock).toHaveBeenCalledWith("/api/browse?path=%2FUsers%2Fdamian%2Fmy%20code", { credentials: "same-origin" });
  });

  it("decodes dirs with isGit markers and a null parent at filesystem root", async () => {
    const result0 = { path: "/", parent: null, dirs: [{ name: "Users", path: "/Users", isGit: false }] };
    fetchMock.mockResolvedValue(fakeResponse(true, result0));
    const result = await browse("/");
    expect(result).toEqual({ ok: true, value: result0 });
  });

  it("decodes a 400 invalid_request for a relative path", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "invalid_request", message: "path must be absolute" } }));
    const result = await browse("relative/path");
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "path must be absolute" } });
  });

  it("decodes a 404 not_found for a missing/unreadable directory", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "not_found", message: "no such directory" } }));
    const result = await browse("/does/not/exist");
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: "no such directory" } });
  });
});

function fakeStatusResponse(status: number, body?: unknown): Response {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  } as unknown as Response;
}

describe("api — putPrefs (PUT /api/prefs, docs/protocol.md §3.3 / M2 REQ-10)", () => {
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
    fetchMock.mockResolvedValue(fakeStatusResponse(400, { error: { code: "invalid_request", message: "density must be 2x2 or 3x2" } }));
    const result = await putPrefs({ density: "4x4" as never });
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "density must be 2x2 or 3x2" } });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(401, { error: { code: "unauthorized", message: "missing session cookie" } }));
    const result = await putPrefs({ view: "tiles" });
    expect(result).toEqual({ ok: false, error: { code: "unauthorized", message: "missing session cookie" } });
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
    expect(JSON.parse(call[1].body)).toEqual({ view: "tiles", density: "3x2", usageModel: "Fable" });
  });

  it("decodes a 400 invalid_request error envelope for an out-of-range usageModel (empty or >32 chars)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(400, { error: { code: "invalid_request", message: "usageModel must be 1-32 characters" } }));
    const result = await putPrefs({ usageModel: "" });
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "usageModel must be 1-32 characters" } });
  });
});

describe("api — refreshUsage (POST /api/usage/refresh, docs/protocol.md §3.9, plan usage-model-bar REQ-7)", () => {
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
    expect(fetchMock).toHaveBeenCalledWith("/api/usage/refresh", { method: "POST", credentials: "same-origin" });
  });

  it("decodes a 404 not_found error envelope when polling is disabled (-usage-poll 0, edge case 14)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(404, { error: { code: "not_found", message: "usage polling is disabled" } }));
    const result = await refreshUsage();
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: "usage polling is disabled" } });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(401, { error: { code: "unauthorized", message: "missing session cookie" } }));
    const result = await refreshUsage();
    expect(result).toEqual({ ok: false, error: { code: "unauthorized", message: "missing session cookie" } });
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

const endedSession: Session = { ...validSession, alive: false, endedAt: "2026-08-22T00:05:00Z" };

describe("api — endSession (POST /api/sessions/{id}/end, docs/protocol.md §3.7)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the id-scoped end endpoint and decodes the 200 Session response (alive:false, endedAt set)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, endedSession));
    const result = await endSession(1);
    expect(result).toEqual({ ok: true, value: endedSession });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/end", { method: "POST", credentials: "same-origin" });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }));
    const result = await endSession(999);
    expect(result).toEqual({ ok: false, error: { code: "unknown_session", message: "no such session" } });
  });

  it("decodes a 409 not_alive error envelope (already ended)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "not_alive", message: "session already ended" } }));
    const result = await endSession(1);
    expect(result).toEqual({ ok: false, error: { code: "not_alive", message: "session already ended" } });
  });

  it("falls back to a generic error when the success body is not a valid Session", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { not: "a session" }));
    const result = await endSession(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("api — resumeSession (POST /api/sessions/{id}/resume, docs/protocol.md §3.5)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the id-scoped resume endpoint and decodes the 200 Session response (state unchanged until SessionStart)", async () => {
    const resumedSession: Session = { ...validSession, alive: true, endedAt: null, state: "started" };
    fetchMock.mockResolvedValue(fakeResponse(true, resumedSession));
    const result = await resumeSession(1);
    expect(result).toEqual({ ok: true, value: resumedSession });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/resume", { method: "POST", credentials: "same-origin" });
  });

  it("decodes a 409 not_resumable error envelope (alive, or claudeSessionId is null)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "not_resumable", message: "session is still alive" } }));
    const result = await resumeSession(1);
    expect(result).toEqual({ ok: false, error: { code: "not_resumable", message: "session is still alive" } });
  });

  it("decodes a 409 directory_missing error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "directory_missing", message: "directory no longer exists" } }));
    const result = await resumeSession(1);
    expect(result).toEqual({ ok: false, error: { code: "directory_missing", message: "directory no longer exists" } });
  });

  it("decodes a 500 launch_failed error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "launch_failed", message: "spawn failed" } }));
    const result = await resumeSession(1);
    expect(result).toEqual({ ok: false, error: { code: "launch_failed", message: "spawn failed" } });
  });
});

describe("api — removeSession (DELETE /api/sessions/{id}, docs/protocol.md §3.8)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a bare 204 with no body as success, never trying to parse a body (the removal reaches the client via sessionRemoved, not the response)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    const result = await removeSession(1);
    expect(result).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1", { method: "DELETE", credentials: "same-origin" });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(404, { error: { code: "unknown_session", message: "no such session" } }));
    const result = await removeSession(999);
    expect(result).toEqual({ ok: false, error: { code: "unknown_session", message: "no such session" } });
  });

  it("decodes a 500 end_failed error envelope (alive, kill failed — row not deleted)", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500, { error: { code: "end_failed", message: "kill-session failed" } }));
    const result = await removeSession(1);
    expect(result).toEqual({ ok: false, error: { code: "end_failed", message: "kill-session failed" } });
  });

  it("never throws when a non-204 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await removeSession(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("api — fetchPane (GET /api/sessions/{id}/pane, docs/protocol.md §3.4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a 200 pane snapshot (text + capturedAt)", async () => {
    const pane = { text: "$ claude\nWorking on it...", capturedAt: "2026-08-22T00:05:00Z" };
    fetchMock.mockResolvedValue(fakeResponse(true, pane));
    const result = await fetchPane(1);
    expect(result).toEqual({ ok: true, value: pane });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/pane", { credentials: "same-origin" });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }));
    const result = await fetchPane(999);
    expect(result).toEqual({ ok: false, error: { code: "unknown_session", message: "no such session" } });
  });

  it("decodes a 404 no_snapshot error envelope — the 'no capture has succeeded yet' honesty case, distinct from unknown_session", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "no_snapshot", message: "no capture yet" } }));
    const result = await fetchPane(1);
    expect(result).toEqual({ ok: false, error: { code: "no_snapshot", message: "no capture yet" } });
  });

  it("preserves an empty-string pane text verbatim rather than treating it as missing", async () => {
    const pane = { text: "", capturedAt: "2026-08-22T00:05:00Z" };
    fetchMock.mockResolvedValue(fakeResponse(true, pane));
    const result = await fetchPane(1);
    expect(result).toEqual({ ok: true, value: pane });
  });

  it("rejects a success body missing capturedAt", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { text: "hello" }));
    const result = await fetchPane(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});
