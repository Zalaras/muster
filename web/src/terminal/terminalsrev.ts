export interface TerminalsRevState {
  readonly base: number;
  readonly bySession: ReadonlyMap<number, number>;
}

export const EMPTY_TERMINALS_REV: TerminalsRevState = { base: 0, bySession: new Map() };

export function seenRev(state: TerminalsRevState, id: number): number {
  return state.bySession.get(id) ?? state.base;
}

export function raiseSeenRev(state: TerminalsRevState, id: number, rev: number): TerminalsRevState {
  if (rev <= seenRev(state, id)) return state;
  return { base: state.base, bySession: new Map(state.bySession).set(id, rev) };
}

export function resetSeenRev(terminalsRev: number): TerminalsRevState {
  return { base: terminalsRev, bySession: new Map() };
}

export function forgetSeenRev(state: TerminalsRevState, id: number): TerminalsRevState {
  if (!state.bySession.has(id)) return state;
  const bySession = new Map(state.bySession);
  bySession.delete(id);
  return { base: state.base, bySession };
}

export function isStaleList(state: TerminalsRevState, id: number, rev: number): boolean {
  return rev < seenRev(state, id);
}
