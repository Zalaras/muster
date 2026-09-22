// Plan terminal-fixes-cleanup: the pure reducer over `shellActivity`/`shellsBusy`/
// surface-selection transitions (REQ-2 through REQ-4, REQ-11, REQ-13, REQ-14, W6-W9). No
// DOM, no real timer — `features/surfaces.ts` owns the actual `setTimeout` calls; this
// file exercises the epoch-guarded resolve functions directly with the epoch a caller's
// `ActivityResult.timer` would have carried, which is exactly how `scheduleActivityTimer`
// invokes them.
import { describe, expect, it } from "vitest";
import {
  clearOnSelect,
  EMPTY_SHELL_ACTIVITY,
  getShellActivity,
  observeBusy,
  observeIdle,
  resolveOnset,
  resolveSelfClear,
  restoreBusy,
  restoreIdle,
  shellGone,
  type ShellActivityState,
} from "./shellactivity";

describe("getShellActivity — default for a session with no entry", () => {
  it("is 'none' for an id never touched", () => {
    expect(getShellActivity(EMPTY_SHELL_ACTIVITY, 1)).toBe("none");
  });
});

describe("observeBusy — live shellActivity{busy:true}", () => {
  it("from 'none': indicator stays 'none' and an onset timer is scheduled (REQ-11's delay, W8's setup)", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    expect(getShellActivity(r.state, 1)).toBe("none");
    expect(r.timer).toEqual({ kind: "onset", id: 1, epoch: 1, delayMs: 600 });
  });

  it("from 'none' again before the pending onset resolves: restarts the delay with a fresh epoch", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const r2 = observeBusy(r1.state, 1);
    expect(r2.timer).toEqual({ kind: "onset", id: 1, epoch: 2, delayMs: 600 });
  });

  it("already 'busy': identity, no timer", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r1.state, 1, r1.timer!.epoch);
    const r2 = observeBusy(busy, 1);
    expect(r2.state).toBe(busy);
    expect(r2.timer).toBeNull();
  });

  it("from 'done' (edge case 5): promotes to 'busy' immediately, no timer — a fresh command replaces a showing tick with no onset delay", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r1.state, 1, r1.timer!.epoch);
    const done = observeIdle(busy, 1, false).state;
    expect(getShellActivity(done, 1)).toBe("done");
    const r2 = observeBusy(done, 1);
    expect(getShellActivity(r2.state, 1)).toBe("busy");
    expect(r2.timer).toBeNull();
  });

  it("does not disturb another session's entry", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy1 = resolveOnset(r1.state, 1, r1.timer!.epoch);
    const r2 = observeBusy(busy1, 2);
    expect(getShellActivity(r2.state, 1)).toBe("busy");
    expect(getShellActivity(r2.state, 2)).toBe("none");
  });
});

describe("resolveOnset — the delayed onset callback", () => {
  it("epoch matches, still 'none': promotes to 'busy'", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const next = resolveOnset(r.state, 1, r.timer!.epoch);
    expect(getShellActivity(next, 1)).toBe("busy");
  });

  it("stale epoch (superseded by a later transition): no-op", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const r2 = observeBusy(r1.state, 1); // epoch bumps to 2, per the restart test above
    const next = resolveOnset(r2.state, 1, r1.timer!.epoch); // fires against the stale epoch 1
    expect(next).toBe(r2.state);
  });

  it("epoch matches but the indicator already moved past 'none': no-op", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r.state, 1, r.timer!.epoch);
    const again = resolveOnset(busy, 1, r.timer!.epoch); // same epoch, already resolved once
    expect(again).toBe(busy);
  });

  // W8: "work shorter than the onset delay produces neither a spinner nor a tick."
  // `observeIdle`'s pending-onset branch bumps the epoch even though `indicator` stays
  // "none" (see its doc comment), so the onset timer `observeBusy` scheduled goes stale
  // and `resolveOnset` no-ops when it fires here.
  it("W8: a busy period that ends before the onset delay elapses never shows a spinner", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const afterIdle = observeIdle(r.state, 1, false).state; // busy:false arrives first
    expect(getShellActivity(afterIdle, 1)).toBe("none"); // still not showing a spinner yet
    const afterOnset = resolveOnset(afterIdle, 1, r.timer!.epoch); // the delayed onset then fires
    expect(getShellActivity(afterOnset, 1)).toBe("none"); // W8: must stay "none"
  });
});

describe("observeIdle — live shellActivity{busy:false}", () => {
  it("never observed busy at all (no entry for the session): true no-op, identity", () => {
    const result = observeIdle(EMPTY_SHELL_ACTIVITY, 1, false);
    expect(result.state).toBe(EMPTY_SHELL_ACTIVITY);
    expect(result.timer).toBeNull();
  });

  // W8 fix (680ea45): still "none" but with a pending onset entry is observationally a
  // no-op — the indicator stays "none" and no timer is requested — but not a reference-
  // equality one: the epoch must bump so the onset timer `observeBusy` scheduled goes
  // stale and its later `resolveOnset` never promotes to "busy" (pinned by the W8 case
  // above). A `toBe` identity assertion here is mutually exclusive with that guarantee,
  // since both read the same `observeIdle(r.state, 1, false)` call.
  it("still 'none' with a pending onset: indicator/timer unaffected, but the epoch moves (not the same object)", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const result = observeIdle(r.state, 1, false);
    expect(getShellActivity(result.state, 1)).toBe("none");
    expect(result.timer).toBeNull();
    expect(result.state).not.toBe(r.state);
  });

  it("busy, shell not selected: 'done', with no self-clear timer — REQ-4's 'and stays'", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r.state, 1, r.timer!.epoch);
    const result = observeIdle(busy, 1, false);
    expect(getShellActivity(result.state, 1)).toBe("done");
    expect(result.timer).toBeNull();
  });

  it("busy, shell selected: 'done', with a self-clear timer scheduled (User Flow 5)", () => {
    const r = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r.state, 1, r.timer!.epoch);
    const result = observeIdle(busy, 1, true);
    expect(getShellActivity(result.state, 1)).toBe("done");
    expect(result.timer).toEqual({ kind: "selfClear", id: 1, epoch: 2, delayMs: 3000 });
  });

  it("does not disturb another session's entry", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy1 = resolveOnset(r1.state, 1, r1.timer!.epoch);
    const r2 = observeBusy(busy1, 2);
    const busy2 = resolveOnset(r2.state, 2, r2.timer!.epoch);
    const result = observeIdle(busy2, 1, false);
    expect(getShellActivity(result.state, 2)).toBe("busy");
  });
});

describe("restoreBusy — snapshot.shellsBusy reports a session busy right now (W9)", () => {
  it("from 'none': immediate 'busy', no onset delay (a reconnect has no way to know how long it's been running)", () => {
    const r = restoreBusy(EMPTY_SHELL_ACTIVITY, 1);
    expect(getShellActivity(r.state, 1)).toBe("busy");
    expect(r.timer).toBeNull();
  });

  it("already 'busy': identity, no timer", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const r = restoreBusy(busy, 1);
    expect(r.state).toBe(busy);
    expect(r.timer).toBeNull();
  });

  it("from 'done': promotes to 'busy' immediately, no timer", () => {
    const r1 = observeBusy(EMPTY_SHELL_ACTIVITY, 1);
    const busy = resolveOnset(r1.state, 1, r1.timer!.epoch);
    const done = observeIdle(busy, 1, false).state;
    const r2 = restoreBusy(done, 1);
    expect(getShellActivity(r2.state, 1)).toBe("busy");
    expect(r2.timer).toBeNull();
  });

  // W9: restoring three busy sessions from `shellsBusy` yields three spinners and zero
  // ticks — no onset delay and no self-clear timer for any of them.
  it("restoring three sessions at once yields three spinners and zero pending timers", () => {
    let state: ShellActivityState = EMPTY_SHELL_ACTIVITY;
    for (const id of [1, 2, 3]) {
      const r = restoreBusy(state, id);
      expect(r.timer).toBeNull();
      state = r.state;
    }
    expect(getShellActivity(state, 1)).toBe("busy");
    expect(getShellActivity(state, 2)).toBe("busy");
    expect(getShellActivity(state, 3)).toBe("busy");
  });
});

describe("restoreIdle — a busy session absent from a reconnecting snapshot (W6, edge case 4/E8)", () => {
  it("busy -> 'done', always with a self-clear timer scheduled, whatever else is true", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const result = restoreIdle(busy, 1);
    expect(getShellActivity(result.state, 1)).toBe("done");
    expect(result.timer).toEqual({ kind: "selfClear", id: 1, epoch: 2, delayMs: 3000 });
  });

  it("not currently 'busy': no-op, identity", () => {
    const result = restoreIdle(EMPTY_SHELL_ACTIVITY, 1);
    expect(result.state).toBe(EMPTY_SHELL_ACTIVITY);
    expect(result.timer).toBeNull();
  });

  // Web-impl's recorded deviation: restoreIdle's self-clear always fires, so a shell
  // that's actually gone outright (edge case 4/E8 — reconcile killed it at daemon
  // restart) still reaches "none" on its own even though the session is never reselected.
  it("the self-clear that follows restoreIdle reaches 'none' with no reselection (what makes E8 resolve)", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const { state: done, timer } = restoreIdle(busy, 1);
    const cleared = resolveSelfClear(done, 1, timer!.epoch);
    expect(getShellActivity(cleared, 1)).toBe("none");
  });
});

describe("resolveSelfClear — the REQ-4 ~3s self-clear callback", () => {
  it("epoch matches, still 'done': clears to 'none'", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const { state: done, timer } = restoreIdle(busy, 1);
    expect(getShellActivity(done, 1)).toBe("done");
    const cleared = resolveSelfClear(done, 1, timer!.epoch);
    expect(getShellActivity(cleared, 1)).toBe("none");
  });

  it("stale epoch: no-op", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const { state: done, timer } = restoreIdle(busy, 1);
    const stale = resolveSelfClear(done, 1, timer!.epoch - 1);
    expect(stale).toBe(done);
  });

  // W7: a new busy period cancels a pending tick timer rather than letting it fire
  // later — the epoch bump from observeBusy's "done" branch makes the old self-clear
  // callback's epoch stale, so it is a no-op when it eventually fires.
  it("W7: a new busy period starting while a tick is showing leaves the old self-clear timer harmless", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const { state: done, timer: selfClear } = restoreIdle(busy, 1);
    expect(getShellActivity(done, 1)).toBe("done");
    const busyAgain = observeBusy(done, 1);
    expect(getShellActivity(busyAgain.state, 1)).toBe("busy");
    // The pending self-clear timer from the first "done" fires late, against its old epoch.
    const afterStaleTimer = resolveSelfClear(busyAgain.state, 1, selfClear!.epoch);
    expect(getShellActivity(afterStaleTimer, 1)).toBe("busy");
  });

  it("does not disturb another session's entry", () => {
    const { state: done1, timer: t1 } = restoreIdle(restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state, 1);
    const done2 = restoreIdle(restoreBusy(done1, 2).state, 2).state;
    const cleared = resolveSelfClear(done2, 1, t1!.epoch);
    expect(getShellActivity(cleared, 1)).toBe("none");
    expect(getShellActivity(cleared, 2)).toBe("done");
  });
});

describe("clearOnSelect — REQ-4: selecting the shell surface clears a showing tick immediately", () => {
  it("'done' -> 'none'", () => {
    const done = restoreIdle(restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state, 1).state;
    const cleared = clearOnSelect(done, 1);
    expect(getShellActivity(cleared, 1)).toBe("none");
  });

  it("'none': identity", () => {
    expect(clearOnSelect(EMPTY_SHELL_ACTIVITY, 1)).toBe(EMPTY_SHELL_ACTIVITY);
  });

  it("'busy': identity — selecting shell mid-spinner leaves the spinner alone", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    expect(clearOnSelect(busy, 1)).toBe(busy);
  });

  it("a subsequent self-clear against the pre-clear epoch is a no-op (clearOnSelect got there first)", () => {
    const { state: done, timer } = restoreIdle(restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state, 1);
    const cleared = clearOnSelect(done, 1);
    const late = resolveSelfClear(cleared, 1, timer!.epoch);
    expect(getShellActivity(late, 1)).toBe("none");
  });
});

describe("shellGone — REQ-8/edge cases 1-2: the shell itself is gone, no transient tick", () => {
  it("removes a 'busy' entry outright, with no intermediate 'done'", () => {
    const busy = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const gone = shellGone(busy, 1);
    expect(gone.has(1)).toBe(false);
    expect(getShellActivity(gone, 1)).toBe("none");
  });

  it("removes a 'done' entry outright", () => {
    const done = restoreIdle(restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state, 1).state;
    const gone = shellGone(done, 1);
    expect(gone.has(1)).toBe(false);
  });

  it("identity when the session has no entry", () => {
    expect(shellGone(EMPTY_SHELL_ACTIVITY, 1)).toBe(EMPTY_SHELL_ACTIVITY);
  });

  it("does not disturb another session's entry", () => {
    const busy1 = restoreBusy(EMPTY_SHELL_ACTIVITY, 1).state;
    const busy2 = restoreBusy(busy1, 2).state;
    const gone = shellGone(busy2, 1);
    expect(getShellActivity(gone, 2)).toBe("busy");
  });
});
