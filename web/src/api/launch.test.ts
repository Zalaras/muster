import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol";
import { browse, fetchRepos, launchSession } from "./launch";
import { fakeResponse, fakeResponseThatThrows } from "./testfakes";

const validSession: Session = {
  id: 1,
  title: null,
  titleOverride: null,
  plan: null,
  state: "started",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/bob/code/muster",
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
  unread: false,
  lastPrompt: null,
};

describe("launch — launchSession (POST /api/sessions)", () => {
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
    const result = await launchSession({
      directory: "/Users/bob/code/muster",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(result).toEqual({ ok: true, value: validSession });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory: "/Users/bob/code/muster",
          model: "sonnet",
          permissionMode: "default",
        }),
      }),
    );
  });

  it("decodes a 400 invalid_request error envelope (Protocol Contract)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "invalid_request", message: "model must not be empty" },
      }),
    );
    const result = await launchSession({ directory: "/tmp", model: "", permissionMode: "default" });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "model must not be empty" },
    });
  });

  it("decodes a 500 launch_failed error envelope naming the settings file (Protocol Contract)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "launch_failed", message: "settings.local.json is not valid JSON" },
      }),
    );
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "launch_failed", message: "settings.local.json is not valid JSON" },
    });
  });

  it("falls back to a generic error when the success body is not a valid Session", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { not: "a session" }));
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when the error body doesn't match the error envelope shape", async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, { oops: "no error field" }));
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when the response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "default",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("omits the title field entirely rather than sending an empty string when the caller doesn't supply one", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validSession));
    await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "plan" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "plan",
    });
  });

  // Plan fix-auto-mode-select REQ-2/D3: "auto" is the new fourth permissionMode value —
  // serialises on the request and decodes back off the seeded Session the same as the
  // three pre-existing values above.
  it("serialises permissionMode: 'auto' on the request body (REQ-2)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, validSession));
    await launchSession({ directory: "/tmp", model: "sonnet", permissionMode: "auto" });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "auto",
    });
  });

  it("decodes a 201 Session whose permissionMode was seeded 'auto' (REQ-2/D3)", async () => {
    const autoSeeded: Session = {
      ...validSession,
      permissionMode: { value: "auto", source: "seed" },
    };
    fetchMock.mockResolvedValue(fakeResponse(true, autoSeeded));
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "auto",
    });
    expect(result).toEqual({ ok: true, value: autoSeeded });
  });

  it("decodes the 400 invalid_request naming all four accepted values for an unknown permissionMode (D4)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "invalid_request",
          message: "permissionMode must be one of default, plan, acceptEdits, auto",
        },
      }),
    );
    const result = await launchSession({
      directory: "/tmp",
      model: "sonnet",
      permissionMode: "bypassPermissions" as never,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "permissionMode must be one of default, plan, acceptEdits, auto",
      },
    });
  });
});

describe("launch — fetchRepos (GET /api/repos)", () => {
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
        path: "/Users/bob/code/muster",
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
        path: "/Users/bob/code/fresh",
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
    expect(fetchMock).toHaveBeenCalledWith("/api/repos", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("rejects the whole list when one repo entry is malformed", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, [
        {
          id: 1,
          path: "/x",
          name: "x",
          isGit: true,
          branch: null,
          pinned: false,
          lastLaunchedAt: "t",
          launchCount: "oops",
          lastModel: null,
          lastPermissionMode: null,
        },
      ]),
    );
    const result = await fetchRepos();
    expect(result.ok).toBe(false);
  });

  // Plan fix-auto-mode-select REQ-4: lastPermissionMode is an open string (last-known,
  // never authoritative per api/launch.ts's Repo doc) — "auto" round-trips exactly like
  // the three pre-existing values, with no enum check to update.
  it("decodes lastPermissionMode: 'auto' (REQ-4)", async () => {
    const repos = [
      {
        id: 3,
        path: "/Users/bob/code/auto-repo",
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

describe("launch — browse (GET /api/browse)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the bare endpoint when no path is given (daemon defaults to the home directory)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { path: "/Users/bob", parent: "/Users", dirs: [] }),
    );
    await browse();
    expect(fetchMock).toHaveBeenCalledWith("/api/browse", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("URL-encodes the path query parameter", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { path: "/Users/bob/my code", parent: "/Users/bob", dirs: [] }),
    );
    await browse("/Users/bob/my code");
    expect(fetchMock).toHaveBeenCalledWith("/api/browse?path=%2FUsers%2Fbob%2Fmy%20code", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("decodes dirs with isGit markers and a null parent at filesystem root", async () => {
    const result0 = {
      path: "/",
      parent: null,
      dirs: [{ name: "Users", path: "/Users", isGit: false }],
    };
    fetchMock.mockResolvedValue(fakeResponse(true, result0));
    const result = await browse("/");
    expect(result).toEqual({ ok: true, value: result0 });
  });

  it("decodes a 400 invalid_request for a relative path", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "invalid_request", message: "path must be absolute" } }),
    );
    const result = await browse("relative/path");
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_request", message: "path must be absolute" },
    });
  });

  it("decodes a 404 not_found for a missing/unreadable directory", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_found", message: "no such directory" } }),
    );
    const result = await browse("/does/not/exist");
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", message: "no such directory" },
    });
  });
});
