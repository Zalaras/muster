import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browse, fetchRepos, launchSession } from "./api";
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
