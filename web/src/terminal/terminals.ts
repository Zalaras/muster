import type { TerminalInfo, TerminalsBySession } from "../protocol/terminals";

export type TerminalsState = ReadonlyMap<number, readonly TerminalInfo[]>;

export const EMPTY_TERMINALS: TerminalsState = new Map();

const NO_TERMINALS: readonly TerminalInfo[] = [];

export function getTerminals(state: TerminalsState, id: number): readonly TerminalInfo[] {
  return state.get(id) ?? NO_TERMINALS;
}

export function anyBusy(list: readonly TerminalInfo[]): boolean {
  return list.some((terminal) => terminal.busy);
}

function sameList(a: readonly TerminalInfo[], b: readonly TerminalInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.n === b[i]?.n && t.name === b[i]?.name && t.busy === b[i]?.busy)
  );
}

export function setTerminals(
  state: TerminalsState,
  id: number,
  list: readonly TerminalInfo[],
): TerminalsState {
  if (sameList(getTerminals(state, id), list)) return state;
  const next = new Map(state);
  if (list.length === 0) next.delete(id);
  else next.set(id, list);
  return next;
}

export function forgetTerminals(state: TerminalsState, id: number): TerminalsState {
  return setTerminals(state, id, NO_TERMINALS);
}

export function terminalsFromSnapshot(bySession: TerminalsBySession): TerminalsState {
  const next = new Map<number, readonly TerminalInfo[]>();
  for (const [key, list] of Object.entries(bySession)) {
    if (list.length > 0) next.set(Number(key), list);
  }
  return next;
}
