// Pure DOM updates for the masthead: connection status, usage readouts, Claude Code
// version/drift. Brand ("Muster") is static markup in index.html — nothing to render.
//
// Honesty rules (design-system §6.1): a null usage bucket renders the word "unknown"
// and no track/gauge markup at all — never a 0%-filled bar.
import type { ClaudeCodeInfo, Usage } from "../protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export function renderConnectionStatus(el: HTMLElement, status: ConnectionStatus): void {
  const text = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting…" : "connecting…";
  el.textContent = text;
}

export interface UsageElements {
  fiveHour: HTMLElement;
  sevenDay: HTMLElement;
}

export function renderUsage(elements: UsageElements, usage: Usage): void {
  elements.fiveHour.textContent = usage.fiveHour
    ? `5h ${Math.round(usage.fiveHour.usedPct)}%`
    : "5h unknown";
  elements.sevenDay.textContent = usage.sevenDay
    ? `7d ${Math.round(usage.sevenDay.usedPct)}%`
    : "7d unknown";
}

export function renderClaudeVersion(el: HTMLElement, info: ClaudeCodeInfo | null): void {
  if (!info) {
    el.textContent = "claude unknown";
    return;
  }
  if (info.installed === null) {
    el.textContent = `claude ${info.pinned} (installed unknown)`;
    return;
  }
  if (info.drift) {
    el.textContent = `claude ${info.installed} (drift from pinned ${info.pinned})`;
    return;
  }
  el.textContent = `claude ${info.installed}`;
}
