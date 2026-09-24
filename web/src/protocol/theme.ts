// Wire types and parser for the daemon's Claude Code theme read and its `claudeTheme`
// broadcast (docs/protocol.md, kb:anchor/ws.claude-theme) — one of the protocol/ concept
// modules split out of the former protocol.ts.

import { isRecord } from "./decode";

// kb:anchor/ws.snapshot / kb:anchor/ws.claude-theme: the daemon's latest read of
// Claude Code's own theme setting, folded to a family. Always present on every
// snapshot/GET /api/state — "unknown" while polling is disabled or nothing has been
// read yet.
export const CLAUDE_FAMILIES = ["light", "dark", "unknown"] as const;
export type ClaudeFamily = (typeof CLAUDE_FAMILIES)[number];

export interface ClaudeThemeInfo {
  family: ClaudeFamily;
}

// kb:anchor/ws.claude-theme: sent only when the polled family differs from the
// previously broadcast one — never per tick. Note the flat shape (`family` a top-level
// key, not nested under `claudeTheme` like the snapshot field).
export interface ClaudeThemeMessage {
  type: "claudeTheme";
  family: ClaudeFamily;
}

function isClaudeFamily(value: unknown): value is ClaudeFamily {
  return (CLAUDE_FAMILIES as readonly unknown[]).includes(value);
}

export function parseClaudeThemeInfo(value: unknown): ClaudeThemeInfo | null {
  if (!isRecord(value)) return null;
  const family = value["family"];
  if (!isClaudeFamily(family)) return null;
  return { family };
}

export function parseClaudeThemeMessage(rec: Record<string, unknown>): ClaudeThemeMessage | null {
  const family = rec["family"];
  if (!isClaudeFamily(family)) return null;
  return { type: "claudeTheme", family };
}
