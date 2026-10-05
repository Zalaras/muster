import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol/session";
import {
  createShell,
  endSession,
  endSessions,
  fetchPane,
  putSessionOrder,
  putSessionsGroup,
  removeSession,
  removeSessions,
  resumeSession,
} from "./sessions";
import { fakeResponse, fakeResponseThatThrows, fakeStatusResponse } from "./testfakes";

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
  claudeLocation: null,
  model: null,
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  backgroundTasks: 0,
  claudeSessionId: null,
  tmuxTarget: "muster:@1",
  firstLaunchHere: true,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 0,
  unread: false,
  lastPrompt: null,
  groupId: null,
};

const endedSession: Session = { ...validSession, alive: false, endedAt: "2026-08-22T00:05:00Z" };

describe("sessions — endSession (POST /api/sessions/{id}/end, kb:anchor/sessions.end)", () => {
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
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/end", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await endSession(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 409 not_alive error envelope (already ended)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_alive", message: "session already ended" } }),
    );
    const result = await endSession(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "not_alive", message: "session already ended" },
    });
  });

  it("falls back to a generic error when the success body is not a valid Session", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { not: "a session" }));
    const result = await endSession(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("sessions — resumeSession (POST /api/sessions/{id}/resume, kb:anchor/sessions.resume)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the id-scoped resume endpoint and decodes the 200 Session response (state unchanged until SessionStart)", async () => {
    const resumedSession: Session = {
      ...validSession,
      alive: true,
      endedAt: null,
      state: "started",
    };
    fetchMock.mockResolvedValue(fakeResponse(true, resumedSession));
    const result = await resumeSession(1);
    expect(result).toEqual({ ok: true, value: resumedSession });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/resume", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("decodes a 409 not_resumable error envelope (alive, or claudeSessionId is null)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "not_resumable", message: "session is still alive" } }),
    );
    const result = await resumeSession(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "not_resumable", message: "session is still alive" },
    });
  });

  it("decodes a 409 directory_missing error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "directory_missing", message: "directory no longer exists" },
      }),
    );
    const result = await resumeSession(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "directory_missing", message: "directory no longer exists" },
    });
  });

  it("decodes a 500 launch_failed error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "launch_failed", message: "spawn failed" } }),
    );
    const result = await resumeSession(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "launch_failed", message: "spawn failed" },
    });
  });
});

describe("sessions — removeSession (DELETE /api/sessions/{id}, kb:anchor/sessions.remove)", () => {
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
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1", {
      method: "DELETE",
      credentials: "same-origin",
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(404, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await removeSession(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 500 end_failed error envelope (alive, kill failed — row not deleted)", async () => {
    fetchMock.mockResolvedValue(
      fakeStatusResponse(500, { error: { code: "end_failed", message: "kill-session failed" } }),
    );
    const result = await removeSession(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "end_failed", message: "kill-session failed" },
    });
  });

  it("never throws when a non-204 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await removeSession(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("sessions — createShell (POST /api/sessions/{id}/shell, kb:anchor/sessions.shell, plan plain-terminal-session REQ-1)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the id-scoped shell endpoint with no body and decodes created:true on first spawn (D1)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { target: "muster-1-shell", created: true }));
    const result = await createShell(1);
    expect(result).toEqual({ ok: true, value: { target: "muster-1-shell", created: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/shell", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("decodes created:false when the shell already exists (D2 — idempotent, same wire shape)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { target: "muster-1-shell", created: false }));
    const result = await createShell(1);
    expect(result).toEqual({ ok: true, value: { target: "muster-1-shell", created: false } });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await createShell(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 409 directory_missing error envelope (REQ-12/E9 — the session's directory no longer exists)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "directory_missing", message: "/Users/d/gone no longer exists" },
      }),
    );
    const result = await createShell(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "directory_missing", message: "/Users/d/gone no longer exists" },
    });
  });

  it("decodes a 500 shell_spawn_failed error envelope, message carrying the tmux error verbatim (REQ-12)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, {
        error: { code: "shell_spawn_failed", message: "tmux: duplicate session" },
      }),
    );
    const result = await createShell(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "shell_spawn_failed", message: "tmux: duplicate session" },
    });
  });

  it("falls back to a generic error when the success body is missing target", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { created: true }));
    const result = await createShell(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when the success body is missing created", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { target: "muster-1-shell" }));
    const result = await createShell(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("falls back to a generic error when created is not a boolean (e.g. a stray string)", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { target: "muster-1-shell", created: "true" }));
    const result = await createShell(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when a non-200 response body isn't valid JSON at all", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await createShell(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("sessions — fetchPane (GET /api/sessions/{id}/pane, kb:anchor/sessions.pane)", () => {
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
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/1/pane", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("decodes a 404 unknown_session error envelope", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "unknown_session", message: "no such session" } }),
    );
    const result = await fetchPane(999);
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    });
  });

  it("decodes a 404 no_snapshot error envelope — the 'no capture has succeeded yet' honesty case, distinct from unknown_session", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, { error: { code: "no_snapshot", message: "no capture yet" } }),
    );
    const result = await fetchPane(1);
    expect(result).toEqual({
      ok: false,
      error: { code: "no_snapshot", message: "no capture yet" },
    });
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

function jsonCall(method: string, body: unknown) {
  return expect.objectContaining({
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sessions — putSessionOrder (PUT /api/sessions/order, kb:anchor/sessions.order)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(fakeStatusResponse(204));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("without a groupId sends only ids and pinnedCount, leaving membership untouched (the pre-groups call)", async () => {
    expect(await putSessionOrder([4, 9, 2], 1)).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/order",
      jsonCall("PUT", { ids: [4, 9, 2], pinnedCount: 1 }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect("groupId" in body).toBe(false);
  });

  it("with a group id sends it, so the dragged card joins that section as the order applies", async () => {
    await putSessionOrder([4, 9, 2], 1, 3);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/order",
      jsonCall("PUT", { ids: [4, 9, 2], pinnedCount: 1, groupId: 3 }),
    );
  });

  it("with null sends groupId:null, which moves the cards to Ungrouped — not the same as omitting it", async () => {
    await putSessionOrder([4, 9], 0, null);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/order",
      jsonCall("PUT", { ids: [4, 9], pinnedCount: 0, groupId: null }),
    );
  });

  it("decodes a 404 unknown_group", async () => {
    const error = { code: "unknown_group", message: "unknown group" };
    fetchMock.mockResolvedValue(fakeStatusResponse(404, { error }));
    expect(await putSessionOrder([1], 0, 99)).toEqual({ ok: false, error });
  });
});

describe("sessions — putSessionsGroup (PUT /api/sessions/group, kb:anchor/sessions.group)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the ids and the target group and treats 204 as success", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await putSessionsGroup([4, 9], 3)).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/group",
      jsonCall("PUT", { ids: [4, 9], groupId: 3 }),
    );
  });

  it("sends groupId:null for Ungrouped; the key is required, so it is never omitted", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await putSessionsGroup([4], null);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/group",
      jsonCall("PUT", { ids: [4], groupId: null }),
    );
  });

  it("decodes a 404 unknown_group and a 400 invalid_request", async () => {
    const missing = { code: "unknown_group", message: "unknown group" };
    fetchMock.mockResolvedValueOnce(fakeStatusResponse(404, { error: missing }));
    expect(await putSessionsGroup([4], 99)).toEqual({ ok: false, error: missing });
    const bad = {
      code: "invalid_request",
      message: "ids must be known session ids without duplicates",
    };
    fetchMock.mockResolvedValueOnce(fakeStatusResponse(400, { error: bad }));
    expect(await putSessionsGroup([4, 4], 3)).toEqual({ ok: false, error: bad });
  });
});

// kb:anchor/sessions.end-many and kb:anchor/sessions.remove-many share one request and report shape.
describe.each([
  ["endSessions", endSessions, "/api/sessions/end"],
  ["removeSessions", removeSessions, "/api/sessions/remove"],
] as const)("sessions — %s (POST %s)", (_name, call, url) => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the ids as one request and decodes the per-id report", async () => {
    const report = { done: [4], skipped: [9], failed: [2] };
    fetchMock.mockResolvedValue(fakeResponse(true, report));
    expect(await call([4, 9, 2])).toEqual({ ok: true, value: report });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, jsonCall("POST", { ids: [4, 9, 2] }));
  });

  it("a report with a skipped or failed id is still a success: the caller reports it, not the transport", async () => {
    const report = { done: [], skipped: [4], failed: [9] };
    fetchMock.mockResolvedValue(fakeResponse(true, report));
    expect(await call([4, 9])).toEqual({ ok: true, value: report });
  });

  it("decodes a 400 invalid_request (an empty or duplicated id list)", async () => {
    const error = {
      code: "invalid_request",
      message: "ids must be a non-empty list of session ids without duplicates",
    };
    fetchMock.mockResolvedValue(fakeResponse(false, { error }));
    expect(await call([])).toEqual({ ok: false, error });
  });

  it("falls back to a generic error when the 200 body is not a report", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, { done: [1] }));
    const result = await call([1]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("resolves to network_error rather than throwing when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await call([1]);
    expect(result).toEqual({
      ok: false,
      error: { code: "network_error", message: "Could not reach musterd." },
    });
  });
});
