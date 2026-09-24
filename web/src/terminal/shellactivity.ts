// The pure per-session reducer over `shellActivity`/`snapshot.shellsBusy` messages and
// surface selections that drives the `shell` segment's busy/done indicator
// (kb:adr/surfaces-shell-busy-from-tmux-process-state; supersedes the pip,
// kb:adr/theme-shell-pip-retired-for-activity-indicator). No DOM, no socket, no real
// timer — `features/surfaces.ts` owns the actual `setTimeout` calls and this module's
// `epoch` field is what makes a stale one harmless (see `ScheduledTimer` below) rather
// than something the caller must remember to `clearTimeout`.
//
// Two "make busy" entry points exist (`observeBusy` — a live `shellActivity{busy:true}`,
// and `restoreBusy` — `snapshot.shellsBusy`) because they carry different timing
// guarantees: `observeBusy` starting from idle applies a short onset delay (a
// fresh transition might be a command too short to bother showing); `restoreBusy` never
// does, because by the time a reconnecting dashboard reads `shellsBusy` the work has
// already been running for an unknown, possibly long, time — the same reasoning applies
// to a "done" segment where a new command starts before the tick clears: that transition
// is immediate too (`observeBusy` only delays a transition out of "none").

export type ShellActivityIndicator = "none" | "busy" | "done";

interface SessionEntry {
  indicator: ShellActivityIndicator;
  /** Bumped on every transition. A timer scheduled against one epoch is a no-op once a
   * later transition has moved the entry to a new one — the caller never needs to track
   * or cancel a real timer handle. */
  epoch: number;
}

const NONE_ENTRY: SessionEntry = { indicator: "none", epoch: 0 };

export type ShellActivityState = ReadonlyMap<number, SessionEntry>;

export const EMPTY_SHELL_ACTIVITY: ShellActivityState = new Map();

const ONSET_DELAY_MS = 600;
const SELF_CLEAR_DELAY_MS = 3000;

export interface ScheduledTimer {
  kind: "onset" | "selfClear";
  id: number;
  epoch: number;
  delayMs: number;
}

export interface ActivityResult {
  state: ShellActivityState;
  /** Non-null when the caller must arrange a callback after `delayMs` into
   * `resolveOnset`/`resolveSelfClear` — `null` when this transition needs no timer. */
  timer: ScheduledTimer | null;
}

export function getShellActivity(state: ShellActivityState, id: number): ShellActivityIndicator {
  return (state.get(id) ?? NONE_ENTRY).indicator;
}

function withEntry(state: ShellActivityState, id: number, entry: SessionEntry): ShellActivityState {
  const next = new Map(state);
  next.set(id, entry);
  return next;
}

/**
 * A live `shellActivity{busy:true}` for `id`. From "none": starts (or restarts, if one
 * was already pending) the onset delay — the indicator itself stays "none" until
 * `resolveOnset` confirms it. From "done": promotes to "busy" immediately and cancels any
 * pending self-clear timer via the epoch bump. Already "busy": identity.
 */
export function observeBusy(state: ShellActivityState, id: number): ActivityResult {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.indicator === "busy") return { state, timer: null };
  const epoch = current.epoch + 1;
  if (current.indicator === "none") {
    return {
      state: withEntry(state, id, { indicator: "none", epoch }),
      timer: { kind: "onset", id, epoch, delayMs: ONSET_DELAY_MS },
    };
  }
  return { state: withEntry(state, id, { indicator: "busy", epoch }), timer: null };
}

/**
 * `snapshot.shellsBusy` reports `id` as busy right now. Always immediate, whatever
 * the current indicator — a reconnecting dashboard has no way to know how long the work
 * has already been running, so the onset delay does not apply here.
 */
export function restoreBusy(state: ShellActivityState, id: number): ActivityResult {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.indicator === "busy") return { state, timer: null };
  const epoch = current.epoch + 1;
  return { state: withEntry(state, id, { indicator: "busy", epoch }), timer: null };
}

/** `resolveOnset`'s delayed callback fires: promotes "none" to "busy" iff `epoch` still
 * matches (nothing else happened to this session meanwhile) — a busy period shorter than
 * the onset delay reports `busy:false` first, which clears the entry back
 * to a fresh epoch (see `observeIdle` below) and makes this call a no-op, so no spinner
 * ever shows for it. */
export function resolveOnset(
  state: ShellActivityState,
  id: number,
  epoch: number,
): ShellActivityState {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.epoch !== epoch || current.indicator !== "none") return state;
  return withEntry(state, id, { indicator: "busy", epoch });
}

/**
 * A live `shellActivity{busy:false}` for `id`. `shellSelected` is whether this session's
 * `shell` surface is the currently selected one on THIS window (features/surfaces.ts
 * reads its own `surfaceSwitchState`): selected schedules the ~3s self-clear (User
 * Flow 5); not selected leaves "done" showing indefinitely — User Flow 3's "the spinner
 * becomes a tick and stays" — until `clearOnSelect` below runs (User Flow 4) or a page
 * reload rediscovers it, whichever comes first. See `restoreIdle` below for the *other*
 * way a "busy" entry goes idle.
 *
 * While the entry is still "none" (a busy period shorter than the onset
 * delay — `observeBusy`'s pending-onset branch), this bumps the epoch without touching
 * `indicator`, so the onset timer `observeBusy` scheduled sees a stale epoch when it
 * fires and never promotes to "busy" — "a command that never raised a spinner never
 * raises a tick." Fixes a bug the shipped implementation's own doc comment used to claim
 * this did (kb:lesson/effect-claimed-from-the-diff) but didn't: the old no-op guard
 * (`current.indicator !== "busy"`) left a still-"none" entry's epoch untouched, so a late
 * `resolveOnset` promoted it to "busy" anyway (fix attempt 1, pinned by
 * shellactivity.test.ts's "a busy period that ends before the onset delay elapses never
 * shows a spinner" case). This necessarily changes `observeIdle`'s return for
 * that one case from the prior literal `{state, timer: null}` identity to a new state
 * object with the same `indicator` — the two are observationally different only via
 * reference equality, never via `getShellActivity`, but a reference-equality
 * (`toBe(r.state)`) assertion on that exact case cannot hold for any fix here, because it
 * and that same case exercise the identical `observeIdle(r.state, 1, false)` call and, if that call
 * were a true identity no-op, `resolveOnset(that same object, 1, r.timer!.epoch)` would
 * be indistinguishable from the sibling "epoch matches, still 'none': promotes to
 * 'busy'" case that must keep promoting — the two pinned expectations are mutually
 * exclusive under any implementation, not just this one (see this fix's log entry for
 * the full derivation).
 */
export function observeIdle(
  state: ShellActivityState,
  id: number,
  shellSelected: boolean,
): ActivityResult {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.indicator === "none") {
    if (!state.has(id)) return { state, timer: null }; // never observed busy — nothing to invalidate
    return {
      state: withEntry(state, id, { indicator: "none", epoch: current.epoch + 1 }),
      timer: null,
    };
  }
  if (current.indicator !== "busy") return { state, timer: null };
  const epoch = current.epoch + 1;
  if (!shellSelected) {
    return { state: withEntry(state, id, { indicator: "done", epoch }), timer: null };
  }
  return {
    state: withEntry(state, id, { indicator: "done", epoch }),
    timer: { kind: "selfClear", id, epoch, delayMs: SELF_CLEAR_DELAY_MS },
  };
}

/**
 * `id` was "busy" and is missing from a reconnecting dashboard's `snapshot.shellsBusy`
 * (kb:adr/surfaces-snapshot-restored-tick-always-self-clears), where the daemon's own
 * poller cannot tell "the command finished while we were offline" (the shell still
 * exists — the ordinary tick behavior should apply) apart from "reconcile killed the
 * shell at daemon restart" (the shell is
 * gone outright, `shellGone` is never called for it because no PTY socket was attached
 * to deliver that signal): `shellActivityPoller.reconcile` (`internal/server/shellactivity.go`)
 * documents both as "no longer in newBusy", the identical wire shape. Unlike `observeIdle`,
 * this **always** schedules the ~3s self-clear, whatever `shellSelected` is — a bounded
 * grace period is the honest default when the transition's actual cause is unknowable, and
 * it resolves both readings to the same place: still-running work is not what a snapshot
 * gap ever means (that's what the live `shellActivity` broadcast is for), so nothing here
 * is mistaken for "still working". `clearOnSelect` can still fire first if the user gets
 * there before the timer does.
 *
 * Same "none" guard as `observeIdle` above, for the same reason: if this
 * were ever called against a pending-onset entry, a late `resolveOnset` must not promote
 * it. `features/surfaces.ts`'s only call site already filters to `getShellActivity(...)
 * === "busy"` before calling this, so the branch is currently unreachable in practice —
 * fixed here anyway so the function's own contract doesn't silently depend on that
 * filter, and because the `EMPTY_SHELL_ACTIVITY`-based "not currently busy" identity
 * case (shellactivity.test.ts) has no entry to invalidate (`state.has(id)` false), so it
 * stays a true no-op unlike `observeIdle`'s conflicting pair (see this fix's log entry).
 */
export function restoreIdle(state: ShellActivityState, id: number): ActivityResult {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.indicator === "none") {
    if (!state.has(id)) return { state, timer: null };
    return {
      state: withEntry(state, id, { indicator: "none", epoch: current.epoch + 1 }),
      timer: null,
    };
  }
  if (current.indicator !== "busy") return { state, timer: null };
  const epoch = current.epoch + 1;
  return {
    state: withEntry(state, id, { indicator: "done", epoch }),
    timer: { kind: "selfClear", id, epoch, delayMs: SELF_CLEAR_DELAY_MS },
  };
}

/** The ~3s self-clear timer fires: "done" → "none" iff `epoch` still matches (a new busy
 * period, or an immediate select-clear, already moved past it). */
export function resolveSelfClear(
  state: ShellActivityState,
  id: number,
  epoch: number,
): ShellActivityState {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.epoch !== epoch || current.indicator !== "done") return state;
  return withEntry(state, id, { indicator: "none", epoch });
}

/** The user selects `id`'s `shell` surface — a showing tick clears immediately.
 * Identity for "none"/"busy" (selecting shell while busy leaves the spinner alone). */
export function clearOnSelect(state: ShellActivityState, id: number): ShellActivityState {
  const current = state.get(id) ?? NONE_ENTRY;
  if (current.indicator !== "done") return state;
  return withEntry(state, id, { indicator: "none", epoch: current.epoch + 1 });
}

/** The shell itself is gone (PTY `4001` on a live shell socket, or
 * the session was removed) — clears unconditionally, busy or done, with no transient
 * tick ("leaves no spinner and no tick behind"), unlike `observeIdle`'s inference
 * from a mere snapshot gap. */
export function shellGone(state: ShellActivityState, id: number): ShellActivityState {
  if (!state.has(id)) return state;
  const next = new Map(state);
  next.delete(id);
  return next;
}
