import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol/session";
import { createShell, endSession, fetchPane, removeSession, resumeSession } from "./sessions";
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
