export interface TerminalsRevState {
  readonly base: number;
  readonly bySession: ReadonlyMap<number, number>;
  readonly appliedBase: number;
  readonly appliedBySession: ReadonlyMap<number, number>;
}

export const EMPTY_TERMINALS_REV: TerminalsRevState = {
  base: 0,
  bySession: new Map(),
  appliedBase: 0,
  appliedBySession: new Map(),
};

export function seenRev(state: TerminalsRevState, id: number): number {
  return state.bySession.get(id) ?? state.base;
}

export function raiseSeenRev(state: TerminalsRevState, id: number, rev: number): TerminalsRevState {
  if (rev <= seenRev(state, id)) return state;
  return { ...state, bySession: new Map(state.bySession).set(id, rev) };
}

export function resetSeenRev(terminalsRev: number): TerminalsRevState {
  return {
    base: terminalsRev,
    bySession: new Map(),
    appliedBase: terminalsRev,
    appliedBySession: new Map(),
  };
}

export function forgetSeenRev(state: TerminalsRevState, id: number): TerminalsRevState {
  if (!state.bySession.has(id) && !state.appliedBySession.has(id)) return state;
  const bySession = new Map(state.bySession);
  bySession.delete(id);
  const appliedBySession = new Map(state.appliedBySession);
  appliedBySession.delete(id);
  return { ...state, bySession, appliedBySession };
}

export function appliedRev(state: TerminalsRevState, id: number): number {
  return state.appliedBySession.get(id) ?? state.appliedBase;
}

export function applyListRev(state: TerminalsRevState, id: number, rev: number): TerminalsRevState {
  const floored = raiseSeenRev(state, id, rev);
  if (rev <= appliedRev(floored, id)) return floored;
  return { ...floored, appliedBySession: new Map(floored.appliedBySession).set(id, rev) };
}

export function isStaleList(state: TerminalsRevState, id: number, rev: number): boolean {
  return rev < seenRev(state, id);
}
