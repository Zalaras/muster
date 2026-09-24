// Wire types and parser for the daemon's `hello` message and the protocol-version gate
// (docs/protocol.md, protocol version 2) — one of the protocol/ concept modules split out
// of the former protocol.ts.

import { isRecord } from "./decode";

export const PROTOCOL_VERSION = 2;

// kb:anchor/ws.hello: the daemon's startup classification of the installed Claude Code
// against the canary-verified range.
export const CLAUDE_CODE_STATUSES = ["unknown", "below", "verified", "above"] as const;
export type ClaudeCodeStatus = (typeof CLAUDE_CODE_STATUSES)[number];

export interface ClaudeCodeInfo {
  installed: string | null;
  floor: string;
  verified: string;
  status: ClaudeCodeStatus;
}

export interface Hello {
  type: "hello";
  protocolVersion: number;
  daemon: { version: string };
  claudeCode: ClaudeCodeInfo;
}

function isClaudeCodeStatus(value: unknown): value is ClaudeCodeStatus {
  return (CLAUDE_CODE_STATUSES as readonly unknown[]).includes(value);
}

function parseClaudeCode(value: unknown): ClaudeCodeInfo | null {
  if (!isRecord(value)) return null;
  const installed = value["installed"];
  const floor = value["floor"];
  const verified = value["verified"];
  const status = value["status"];
  if (installed !== null && typeof installed !== "string") return null;
  if (typeof floor !== "string") return null;
  if (typeof verified !== "string") return null;
  if (!isClaudeCodeStatus(status)) return null;
  return { installed, floor, verified, status };
}

export function parseHello(rec: Record<string, unknown>): Hello | null {
  const protocolVersion = rec["protocolVersion"];
  const daemon = rec["daemon"];
  if (typeof protocolVersion !== "number") return null;
  if (!isRecord(daemon) || typeof daemon["version"] !== "string") return null;
  const claudeCode = parseClaudeCode(rec["claudeCode"]);
  if (!claudeCode) return null;
  return {
    type: "hello",
    protocolVersion,
    daemon: { version: daemon["version"] },
    claudeCode,
  };
}

/** kb:adr/connection-protocol-bumps-only-on-shape-change: a `hello.protocolVersion` the
 * client doesn't know triggers the mismatch view. */
export function isSupportedProtocolVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
