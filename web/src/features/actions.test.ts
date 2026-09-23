// loadPane wraps GET /api/sessions/{id}/pane into the three-state PaneState the dead
// surface renders (REQ-13, plan m4-reconcile) — a bare fetch-result mapper, no DOM
// involved. Mocking ../api/sessions keeps this a pure logic test. render/dead.ts's own
// DOM-facing exports (renderDeadSurface, showDeadSurfaceNotice, etc.) are tested in
// ../render/dead.test.ts, not here.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../api/http";
import type { PaneSnapshot } from "../api/sessions";

vi.mock("../api/sessions", () => ({
  fetchPane: vi.fn(),
}));

import { loadPane } from "./actions";

import { fetchPane } from "../api/sessions";

const fetchPaneMock = vi.mocked(fetchPane);

afterEach(() => {
  vi.resetAllMocks();
});

describe("loadPane (REQ-13, plan m4-reconcile): wraps GET /api/sessions/{id}/pane into the three-state PaneState", () => {
  it("maps a successful fetch to status 'ok' carrying the text and capturedAt", async () => {
    const pane: PaneSnapshot = { text: "$ claude\nWorking...", capturedAt: "2026-08-22T00:05:00Z" };
    fetchPaneMock.mockResolvedValue({ ok: true, value: pane } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "ok", text: pane.text, capturedAt: pane.capturedAt });
  });

  it("maps a 404 no_snapshot error to status 'missing' — the 'unknown, not empty' honesty case (edge case 13)", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "no_snapshot", message: "no capture yet" },
    } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "missing" });
  });

  it("maps any other error (e.g. unknown_session, a network-level fallback) to 'missing' too — never distinguishes error causes", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    } as ApiResult<PaneSnapshot>);
    const result = await loadPane(999);
    expect(result).toEqual({ status: "missing" });
  });

  it("preserves an empty-string snapshot text as 'ok', not 'missing' (an empty pane is still a captured pane)", async () => {
    const pane: PaneSnapshot = { text: "", capturedAt: "2026-08-22T00:05:00Z" };
    fetchPaneMock.mockResolvedValue({ ok: true, value: pane } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "ok", text: "", capturedAt: pane.capturedAt });
  });

  it("calls fetchPane with the given session id", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "no_snapshot", message: "no capture yet" },
    } as ApiResult<PaneSnapshot>);
    await loadPane(42);
    expect(fetchPaneMock).toHaveBeenCalledWith(42);
  });
});
