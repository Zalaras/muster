import { describe, expect, it } from "vitest";
import type { ClaudeCodeInfo, Usage } from "../protocol";
import { renderClaudeVersion, renderConnectionStatus, renderUsage, type UsageElements } from "./masthead";

function fakeElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
}

describe("renderConnectionStatus", () => {
  it.each([
    ["connected", "connected"],
    ["connecting", "connecting…"],
    ["reconnecting", "reconnecting…"],
  ] as const)("renders %s as %p", (status, expected) => {
    const el = fakeElement();
    renderConnectionStatus(el, status);
    expect(el.textContent).toBe(expected);
  });
});

describe("renderUsage — honesty rule: null renders 'unknown', never a gauge/percentage", () => {
  const unknown: Usage = { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" };

  function elements(): UsageElements {
    return { fiveHour: fakeElement(), sevenDay: fakeElement() };
  }

  it("renders 'unknown' for both buckets when both are null (pre-hello / M0 state)", () => {
    const els = elements();
    renderUsage(els, unknown);
    expect(els.fiveHour.textContent).toBe("5h unknown");
    expect(els.sevenDay.textContent).toBe("7d unknown");
  });

  it("renders a rounded percentage when a bucket is present", () => {
    const els = elements();
    renderUsage(els, { ...unknown, fiveHour: { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" } });
    expect(els.fiveHour.textContent).toBe("5h 61%");
    expect(els.sevenDay.textContent).toBe("7d unknown");
  });

  it("rounds the boundary values 0 and 99.6 correctly (0% and 100%, never blank)", () => {
    const els = elements();
    renderUsage(els, {
      ...unknown,
      fiveHour: { usedPct: 0, resetsAt: "2026-08-20T11:00:00Z" },
      sevenDay: { usedPct: 99.6, resetsAt: "2026-08-20T11:00:00Z" },
    });
    expect(els.fiveHour.textContent).toBe("5h 0%");
    expect(els.sevenDay.textContent).toBe("7d 100%");
  });

  it("only one bucket null renders independently ('unknown' for that bucket only)", () => {
    const els = elements();
    renderUsage(els, { ...unknown, sevenDay: { usedPct: 23, resetsAt: "2026-08-22T06:00:00Z" } });
    expect(els.fiveHour.textContent).toBe("5h unknown");
    expect(els.sevenDay.textContent).toBe("7d 23%");
  });
});

describe("renderClaudeVersion", () => {
  it("renders 'claude unknown' when no hello has arrived yet (info is null)", () => {
    const el = fakeElement();
    renderClaudeVersion(el, null);
    expect(el.textContent).toBe("claude unknown");
  });

  it("renders installed-unknown when installed is null, regardless of drift (protocol §5.1: null renders as unknown, never drift)", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: null, drift: null };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.233 (installed unknown)");
  });

  it("renders drift text when drift is true", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: "2.1.240", drift: true };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.240 (drift from pinned 2.1.233)");
  });

  it("renders the plain installed version when drift is false", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: "2.1.233", drift: false };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.233");
  });
});
