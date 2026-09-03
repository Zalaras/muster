import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browse,
  captureIssueSnapshot,
  endSession,
  fetchPane,
  fetchRepos,
  fileIssue,
  launchSession,
  locateDroppedFile,
  PERMISSION_MODES,
  permissionModeToCheck,
  pinSession,
  putPrefs,
  putSessionOrder,
  refreshUsage,
  removeSession,
  resumeSession,
} from "./api";
import type { Session } from "./protocol";

const validSession: Session = {
  id: 1,
  title: null,
  titleOverride: null,
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
  pinned: false,
  railPos: 0,
};

function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function fakeResponseThatThrows(): Response {
  return { ok: true, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
}

// Plan fix-auto-mode-select (Implementation Notes — "Web pattern"): PERMISSION_MODES is
// the single source for both LaunchRequest's permissionMode union and render/launch.ts's
// radio guard, so REQ-1's four wire values and their dialog/cycle order live in exactly
// one place. Pinning its content here catches an accidental reorder or a fifth value
// (bypassPermissions/dontAsk, deliberately out per the plan) landing silently.
describe("api — PERMISSION_MODES", () => {
  it("is exactly the four accepted wire values in dialog/cycle order (REQ-1)", () => {
    expect(PERMISSION_MODES).toEqual(["default", "acceptEdits", "plan", "auto"]);
  });
});

// Plan fix-auto-mode-select REQ-6 (review cycle 1, Major 2): permissionModeToCheck is the
// single decision point for "which radio should be checked for this stored value" —
// render/launch.ts's setPermissionMode and selectedPermissionMode both go through it
// (review.md Major 1's extraction). Each recognised PERMISSION_MODES value must round-trip
// to itself; anything else — an unrecognised string, null, or "" — must fall back to
// "default" (the "manual" radio), never leave every radio unchecked (the bug the reviewer
// measured on main: `checked: []`).
describe("api — permissionModeToCheck (REQ-6)", () => {
  it.each(PERMISSION_MODES)("round-trips the recognised value %j to itself", (mode) => {
    expect(permissionModeToCheck(mode)).toBe(mode);
  });

  it("falls back to default for an unrecognised string", () => {
    expect(permissionModeToCheck("someFutureMode")).toBe("default");
  });

  it("falls back to default for null", () => {
    expect(permissionModeToCheck(null)).toBe("default");
  });

  it("falls back to default for the empty string", () => {
    expect(permissionModeToCheck("")).toBe("default");
  });
});

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

  // Plan fix-auto-mode-select REQ-2/D3: "auto" is the new fourth permissionMode value —
  // serialises on the request and decodes back off the seeded Session the same as the
  // three pre-existing values above.
  it("serialises permissionMode: 'auto' on the request body (REQ-2)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validSession));
    await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "auto" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ directory: "/tmp", model: "sonnet", permissionMode: "auto" });
  });

  it("decodes a 201 Session whose permissionMode was seeded 'auto' (REQ-2/D3)", async () => {
    const autoSeeded: Session = { ...validSession, permissionMode: { value: "auto", source: "seed" } };
    fetchMock.mockResolvedValue(fakeResponse(true, autoSeeded));
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "auto" });
    expect(result).toEqual({ ok: true, value: autoSeeded });
  });

  it("decodes the 400 invalid_request naming all four accepted values for an unknown permissionMode (D4)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "invalid_request", message: "permissionMode must be one of default, plan, acceptEdits, auto" } }),
    );
    const result = await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "bypassPermissions" as never });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "permissionMode must be one of default, plan, acceptEdits, auto" },
    });
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

  // Plan fix-auto-mode-select REQ-4: lastPermissionMode is an open string (last-known,
  // never authoritative per api.ts's Repo doc) — "auto" round-trips exactly like the three
  // pre-existing values, with no enum check to update.
  it("decodes lastPermissionMode: 'auto' (REQ-4)", async () => {
    const repos = [
      {
        id: 3,
        path: "/Users/damian/code/auto-repo",
        name: "auto-repo",
        isGit: true,
        branch: "main",
        pinned: false,
        lastLaunchedAt: "2026-08-22T00:00:00Z",
        launchCount: 1,
        lastModel: "sonnet",
        lastPermissionMode: "auto",
      },
    ];
    fetchMock.mockResolvedValue(fakeResponse(true, repos));
    const result = await fetchRepos();
    expect(result).toEqual({ ok: true, value: repos });
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

const validIssueCapture = {
  captureId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  capturedAt: "2026-08-31T09:15:00Z",
  snapshot: { capturedAt: "2026-08-31T09:15:00Z", scope: "dashboard" },
  snapshotMarkdown: "## Snapshot\n\n| field | value |\n| --- | --- |\n| musterd | 0.3.1 |",
};

describe("api — captureIssueSnapshot (POST /api/issue/captures, docs/protocol.md §3.12, plan issue-capture)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts sessionId and decodes a 201 response, renaming the wire's capturedAt to takenAt (REQ-3, W3's api.ts seam)", async () => {
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
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "invalid_request", message: "sessionId must be an integer" } }));
    const result = await captureIssueSnapshot(7);
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "sessionId must be an integer" } });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }));
    const result = await captureIssueSnapshot(999);
    expect(result).toEqual({ ok: false, error: { code: "unknown_session", message: "no such session" } });
  });

  it("decodes a 404 not_found error envelope (feature disabled, -issue-api-url empty, Edge Case 14)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_found", message: "issue capture is disabled on this daemon" } }),
    );
    const result = await captureIssueSnapshot(null);
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: "issue capture is disabled on this daemon" } });
  });

  it("decodes a 401 unauthorized error envelope (no/invalid cookie)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "unauthorized", message: "missing session cookie" } }));
    const result = await captureIssueSnapshot(null);
    expect(result).toEqual({ ok: false, error: { code: "unauthorized", message: "missing session cookie" } });
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
    fetchMock.mockResolvedValue(fakeResponse(true, { ...validIssueCapture, snapshot: richSnapshot }));
    const result = await captureIssueSnapshot(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.snapshot).toEqual(richSnapshot);
  });
});

const validFiledIssue = { number: 14, url: "https://github.com/Zalaras/muster/issues/14", repo: "Zalaras/muster" };

describe("api — fileIssue (POST /api/issues, docs/protocol.md §3.13, plan issue-capture)", () => {
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
    const result = await fileIssue({ captureId: "abc123", title: "Something broke", note: "It happened while I was typing." });
    expect(result).toEqual({ ok: true, value: validFiledIssue });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issues",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId: "abc123", title: "Something broke", note: "It happened while I was typing." }),
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
      fakeResponse(false, { error: { code: "invalid_request", message: "title must be 1-200 characters after trimming" } }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "", note: "" });
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "title must be 1-200 characters after trimming" } });
  });

  it("decodes a 404 not_found error envelope (feature disabled)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_found", message: "issue capture is disabled on this daemon" } }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: "issue capture is disabled on this daemon" } });
  });

  it("decodes a 409 capture_expired error envelope (unknown, expired, or already-consumed captureId — REQ-15, D10)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "capture_expired", message: "this snapshot has expired" } }));
    const result = await fileIssue({ captureId: "stale", title: "T", note: "" });
    expect(result).toEqual({ ok: false, error: { code: "capture_expired", message: "this snapshot has expired" } });
  });

  it("decodes a 502 issue_auth_failed error envelope (gh missing/non-zero/empty token — REQ-8, Edge Cases 4/5)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "issue_auth_failed", message: "gh auth token: not logged in. run gh auth login." } }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "issue_auth_failed", message: "gh auth token: not logged in. run gh auth login." },
    });
  });

  it("decodes a 502 issue_post_failed error envelope (GitHub non-2xx/transport failure/unparseable 2xx — Edge Cases 6-9)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "issue_post_failed", message: "GitHub returned 403: rate limit exceeded" } }),
    );
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    expect(result).toEqual({ ok: false, error: { code: "issue_post_failed", message: "GitHub returned 403: rate limit exceeded" } });
  });

  it("never surfaces a bearer token in a decoded error message (INV-3's UI-side half — the token itself never reaches this module)", async () => {
    // INV-3 is a daemon-side invariant (D9); this only proves the client-side decode path
    // does nothing that could reintroduce a token if one somehow appeared server-side.
    const msg = "gh auth token: not logged in. run gh auth login.";
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "issue_auth_failed", message: msg } }));
    const result = await fileIssue({ captureId: "abc123", title: "T", note: "" });
    if (!result.ok) expect(result.error.message).not.toMatch(/gh[oa]_[A-Za-z0-9]{20,}/);
  });

  it("falls back to a generic error when the success body is not a valid FiledIssue (missing/wrong-typed field)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { number: "14", url: validFiledIssue.url, repo: validFiledIssue.repo }));
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

describe("api — locateDroppedFile (POST /api/sessions/{id}/locate, docs/protocol.md §3.14, plan file-drop-fix)", () => {
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
    fetchMock.mockResolvedValue(fakeResponse(true, { path: "/Users/damian/Desktop/Screenshot 2026-08-30 at 14.35.00.png" }));
    const file = makeFile("Screenshot 2026-08-30 at 14.35.00.png");
    const result = await locateDroppedFile(7, file);
    expect(result).toEqual({ ok: true, value: { path: "/Users/damian/Desktop/Screenshot 2026-08-30 at 14.35.00.png" } });

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
      fakeResponse(false, { error: { code: "not_located", message: "no file named x.png with identical contents was found" } }),
    );
    const result = await locateDroppedFile(1, makeFile("x.png"));
    expect(result).toEqual({
      ok: false,
      error: { code: "not_located", message: "no file named x.png with identical contents was found" },
    });
  });

  it("decodes a 409 ambiguous error envelope, carrying the paths array (REQ-3, two+ verified candidates)", async () => {
    const paths = ["/Users/damian/a/dup.png", "/Users/damian/b/dup.png"];
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "ambiguous", message: "2 identical files named dup.png", paths } }),
    );
    const result = await locateDroppedFile(1, makeFile("dup.png"));
    expect(result).toEqual({
      ok: false,
      error: { code: "ambiguous", message: "2 identical files named dup.png", paths },
    });
  });

  it("decodes a 413 too_large error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "too_large", message: "file exceeds the 50 MiB limit" } }));
    const result = await locateDroppedFile(1, makeFile("huge.mov"));
    expect(result).toEqual({ ok: false, error: { code: "too_large", message: "file exceeds the 50 MiB limit" } });
  });

  it("decodes a 400 invalid_request error envelope (empty filename or path separator)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "invalid_request", message: "filename must not contain a path separator" } }));
    const result = await locateDroppedFile(1, makeFile("a/b"));
    expect(result).toEqual({ ok: false, error: { code: "invalid_request", message: "filename must not contain a path separator" } });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }));
    const result = await locateDroppedFile(999, makeFile("x"));
    expect(result).toEqual({ ok: false, error: { code: "unknown_session", message: "no such session" } });
  });

  it("decodes a 500 internal_error error envelope", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "internal_error", message: "session directory is unreadable" } }));
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result).toEqual({ ok: false, error: { code: "internal_error", message: "session directory is unreadable" } });
  });

  it("falls back to a generic error when the success body is missing path", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { notPath: "oops" }));
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("ignores a non-array paths field on a non-ambiguous error, still decoding code/message", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "not_located", message: "m", paths: "not-an-array" } }));
    const result = await locateDroppedFile(1, makeFile("x"));
    expect(result).toEqual({ ok: false, error: { code: "not_located", message: "m" } });
  });

  it("ignores a paths array containing a non-string element, dropping paths but keeping code/message", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { error: { code: "ambiguous", message: "m", paths: ["/a", 42] } }));
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

// REQ-13's `network` failure mode (daemon down, connection refused, sleep/wake, aborted
// request): plan new-session-dialog Fix Attempt 3 added `safeFetch`, a try/catch choke
// point that every exported function routes its `fetch` call through, so a *rejected*
// fetch promise (never surfaced by `fakeResponse`/`fakeStatusResponse` above, which only
// ever simulate a *resolved* Response) short-circuits to a `network_error` ApiResult
// instead of propagating out of the `async function` and rejecting the caller's promise.
// Table-driven over all 11 exported functions per web-implementation.md's Fix Attempt 3
// audit ("Category swept, not just the cited functions") — a per-function regression here
// would mean one call site's `safeFetch` guard was missed or a decode path after it still
// assumes `res` is non-null.
describe("api — network_error short-circuit on a rejected fetch (REQ-13, plan new-session-dialog Fix Attempt 3)", () => {
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
    ["launchSession", () => launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "default" })],
    ["fetchRepos", () => fetchRepos()],
    ["browse (no path)", () => browse()],
    ["browse (with path)", () => browse("/tmp")],
    ["putPrefs", () => putPrefs({ view: "focus" })],
    ["refreshUsage", () => refreshUsage()],
    ["endSession", () => endSession(1)],
    ["resumeSession", () => resumeSession(1)],
    ["removeSession", () => removeSession(1)],
    ["fetchPane", () => fetchPane(1)],
    ["pinSession", () => pinSession(1, true)],
    ["putSessionOrder", () => putSessionOrder([1, 2, 3], 1)],
    ["captureIssueSnapshot", () => captureIssueSnapshot(1)],
    ["fileIssue", () => fileIssue({ captureId: "abc123", title: "T", note: "" })],
    ["locateDroppedFile", () => locateDroppedFile(1, new File(["x"], "x.txt"))],
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
