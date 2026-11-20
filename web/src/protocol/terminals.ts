import { asInteger, isBoolean, isRecord, isString, parseListOf } from "./decode";

export interface TerminalInfo {
  n: number;
  name: string;
  busy: boolean;
}

export type TerminalsBySession = Record<number, TerminalInfo[]>;

export interface TerminalsMessage {
  type: "terminals";
  sessionId: number;
  terminals: TerminalInfo[];
}

function parseTerminalInfo(value: unknown): TerminalInfo | null {
  if (!isRecord(value)) return null;
  const n = asInteger(value["n"]);
  const name = value["name"];
  const busy = value["busy"];
  if (n === null || n < 1 || !isString(name) || !isBoolean(busy)) return null;
  return { n, name, busy };
}

function parseTerminalList(value: unknown): TerminalInfo[] | null {
  return parseListOf(value, parseTerminalInfo);
}

export function parseTerminalsMessage(rec: Record<string, unknown>): TerminalsMessage | null {
  const sessionId = asInteger(rec["sessionId"]);
  const terminals = parseTerminalList(rec["terminals"]);
  if (sessionId === null || terminals === null) return null;
  return { type: "terminals", sessionId, terminals };
}

export function parseSnapshotTerminals(value: unknown): TerminalsBySession | null {
  if (!isRecord(value)) return null;
  const bySession: TerminalsBySession = {};
  for (const [key, list] of Object.entries(value)) {
    const id = Number(key);
    const terminals = parseTerminalList(list);
    if (!Number.isInteger(id) || terminals === null) return null;
    bySession[id] = terminals;
  }
  return bySession;
}
