import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol/session";
import { browse, checkModels, fetchRepos, launchSession } from "./launch";
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

describe("launch — checkModels (GET /api/models, plan maintainability-regressions REQ-1)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends one repeated model= query parameter per requested model, in order", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { models: [] }));
    await checkModels(["sonnet", "opus", "haiku", "fable"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/models?model=sonnet&model=opus&model=haiku&model=fable",
      {
        method: "GET",
        credentials: "same-origin",
      },
    );
  });

  it("URL-encodes a custom model value", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { models: [] }));
    await checkModels(["my model"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/models?model=my+model", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("decodes a 200 with one entry per verdict kind, message present only on unrecognized", async () => {
    const models = [
      { model: "sonnet", verdict: "recognized" as const },
      {
        model: "fable",
        verdict: "unrecognized" as const,
        message:
          'Claude Code doesn\'t recognise the model "fable" — update Claude Code, or pick another model',
      },
      { model: "opus", verdict: "unchecked" as const },
    ];
    fetchMock.mockResolvedValue(fakeResponse(true, { models }));
    const result = await checkModels(["sonnet", "fable", "opus"]);
    expect(result).toEqual({ ok: true, value: models });
  });

  it("decodes an empty models array as a valid, distinct empty result", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { models: [] }));
    const result = await checkModels(["sonnet"]);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("rejects an unrecognized verdict with no message", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { models: [{ model: "fable", verdict: "unrecognized" }] }),
    );
    const result = await checkModels(["fable"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects an unrecognized verdict whose message is not a string", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, {
        models: [{ model: "fable", verdict: "unrecognized", message: 42 }],
      }),
    );
    const result = await checkModels(["fable"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("ignores a message field on a recognized verdict rather than rejecting it", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, {
        models: [{ model: "sonnet", verdict: "recognized", message: "unexpected" }],
      }),
    );
    const result = await checkModels(["sonnet"]);
    expect(result).toEqual({ ok: true, value: [{ model: "sonnet", verdict: "recognized" }] });
  });

  it("rejects a non-string model field", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { models: [{ model: 7, verdict: "recognized" }] }),
    );
    const result = await checkModels(["sonnet"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects a non-array models field", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { models: "sonnet" }));
    const result = await checkModels(["sonnet"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects a body with no models key", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, {}));
    const result = await checkModels(["sonnet"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("rejects a non-record top-level value (null, array, or bare string)", async () => {
    for (const body of [null, ["sonnet"], "sonnet"]) {
      fetchMock.mockResolvedValue(fakeResponse(true, body));
      const result = await checkModels(["sonnet"]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("unknown_error");
    }
  });

  it("rejects the whole list when one element among several is malformed (all-or-nothing)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, {
        models: [
          { model: "sonnet", verdict: "recognized" },
          { model: "opus", verdict: "nope" },
        ],
      }),
    );
    const result = await checkModels(["sonnet", "opus"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("decodes a 400 invalid_request (D6 shape: no parameter / too many / empty value)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: {
          code: "invalid_request",
          message: "model must be given 1 to 8 times, each non-empty",
        },
      }),
    );
    const result = await checkModels(["sonnet"]);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "model must be given 1 to 8 times, each non-empty",
      },
    });
  });

  it("decodes a 401 unauthorized without the UI cookie", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unauthorized", message: "no session cookie" } }),
    );
    const result = await checkModels(["sonnet"]);
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "no session cookie" },
    });
  });

  it("falls back to a generic error when the success body doesn't match the verdict shape (REQ-10 fail path)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(true, { models: [{ model: "sonnet", verdict: "maybe" }] }),
    );
    const result = await checkModels(["sonnet"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when the daemon is unreachable (REQ-10 — a failed request marks nothing)", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const result = await checkModels(["sonnet"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("network_error");
  });
});
