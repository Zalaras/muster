import { describe, expect, it } from "vitest";
import type { Session } from "./protocol";
import { createApp } from "./app";

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
    titleOverride: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/tmp/repo",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: null,
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    ...overrides,
  } as Session;
}

describe("createApp initial state", () => {
  it("starts with the documented defaults", () => {
    const app = createApp();
    expect(app.state.view).toBe("focus");
    expect(app.state.density).toBe("2x2");
    expect(app.state.railSort).toBe("manual");
    expect(app.state.focusedId).toBeNull();
    expect(app.state.connection).toBe("connecting");
  });

  it("starts with an empty store", () => {
    const app = createApp();
    expect(app.store.values()).toEqual([]);
  });
});

describe("event bus fan-out and registration order (REQ-3)", () => {
  it("calls a single listener with the emitted args", () => {
    const app = createApp();
    const calls: number[] = [];
    app.on("sessionRemoved", (id) => calls.push(id));
    app.emit("sessionRemoved", 7);
    expect(calls).toEqual([7]);
  });

  it("calls multiple listeners for the same event in registration order", () => {
    const app = createApp();
    const calls: string[] = [];
    app.on("cancelRenames", () => calls.push("first"));
    app.on("cancelRenames", () => calls.push("second"));
    app.on("cancelRenames", () => calls.push("third"));
    app.emit("cancelRenames");
    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("isolates events: a listener registered for one event is never called for another", () => {
    const app = createApp();
    const usageCalls: unknown[] = [];
    const updateCalls: unknown[] = [];
    app.on("usage", (u) => usageCalls.push(u));
    app.on("update", (u) => updateCalls.push(u));
    const usage = { plans: [] } as never;
    app.emit("usage", usage);
    expect(usageCalls).toEqual([usage]);
    expect(updateCalls).toEqual([]);
  });

  it("emitting an event with no registered listeners is a no-op, not a throw", () => {
    const app = createApp();
    expect(() => app.emit("cancelRenames")).not.toThrow();
  });

  it("a listener added by another listener during emit is not invoked in that same emit call", () => {
    // The bus snapshots the listener list (`list.slice()`) before iterating, so a
    // handler that calls `on()` mid-emit only takes effect on the next emit.
    const app = createApp();
    const calls: string[] = [];
    app.on("cancelRenames", () => {
      calls.push("first");
      app.on("cancelRenames", () => calls.push("added-during-emit"));
    });
    app.emit("cancelRenames");
    expect(calls).toEqual(["first"]);
    app.emit("cancelRenames");
    expect(calls).toEqual(["first", "first", "added-during-emit"]);
  });

  it("keeps calling every registered listener, in order, across repeated emits", () => {
    const app = createApp();
    const calls: string[] = [];
    app.on("focusChanged", (id) => calls.push(`a:${id}`));
    app.on("focusChanged", (id) => calls.push(`b:${id}`));
    app.emit("focusChanged", 3);
    app.emit("focusChanged", null);
    expect(calls).toEqual(["a:3", "b:3", "a:null", "b:null"]);
  });
});

describe("render-phase order (REQ-3)", () => {
  it("runs render phases in registration order", () => {
    const app = createApp();
    const calls: string[] = [];
    app.onRender(() => calls.push("phase1"));
    app.onRender(() => calls.push("phase2"));
    app.onRender(() => calls.push("phase3"));
    app.render();
    expect(calls).toEqual(["phase1", "phase2", "phase3"]);
  });

  it("re-runs every phase, in the same order, on each render() call", () => {
    const app = createApp();
    const calls: string[] = [];
    app.onRender(() => calls.push("a"));
    app.onRender(() => calls.push("b"));
    app.render();
    app.render();
    expect(calls).toEqual(["a", "b", "a", "b"]);
  });

  it("a phase registered has no effect on renders that already ran, but fires on the next", () => {
    const app = createApp();
    const calls: string[] = [];
    app.onRender(() => calls.push("early"));
    app.render();
    app.onRender(() => calls.push("late"));
    app.render();
    expect(calls).toEqual(["early", "early", "late"]);
  });

  it("passes every phase the same frame instance for a given render() call", () => {
    const app = createApp();
    const seen: unknown[] = [];
    app.onRender((frame) => seen.push(frame));
    app.onRender((frame) => seen.push(frame));
    app.render();
    expect(seen[0]).toBe(seen[1]);
  });
});

describe("frame derivation (RenderFrame, REQ-3)", () => {
  it("derives sessions from the store's current values", () => {
    const app = createApp();
    app.store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
    let seenIds: number[] = [];
    app.onRender((frame) => {
      seenIds = frame.sessions.map((s) => s.id);
    });
    app.render();
    expect(seenIds.sort()).toEqual([1, 2]);
  });

  it("reflects store mutations made between renders", () => {
    const app = createApp();
    app.store.replaceAll([makeSession({ id: 1 })]);
    const lengths: number[] = [];
    app.onRender((frame) => lengths.push(frame.sessions.length));
    app.render();
    app.store.upsert(makeSession({ id: 2 }));
    app.render();
    expect(lengths).toEqual([1, 2]);
  });

  it("stamps now as a Date instance", () => {
    const app = createApp();
    let now: unknown;
    app.onRender((frame) => (now = frame.now));
    app.render();
    expect(now).toBeInstanceOf(Date);
  });

  it("derives connected as true only when state.connection is 'connected'", () => {
    const app = createApp();
    let connected: boolean | undefined;
    app.onRender((frame) => (connected = frame.connected));

    app.render();
    expect(connected).toBe(false); // default state is "connecting"

    app.state.connection = "connected";
    app.render();
    expect(connected).toBe(true);

    app.state.connection = "reconnecting";
    app.render();
    expect(connected).toBe(false);
  });
});

describe("focus() (REQ-3)", () => {
  it("sets state.focusedId", () => {
    const app = createApp();
    app.focus(5);
    expect(app.state.focusedId).toBe(5);
  });

  it("accepts null to clear focus", () => {
    const app = createApp();
    app.focus(5);
    app.focus(null);
    expect(app.state.focusedId).toBeNull();
  });

  it("emits focusChanged with the new id", () => {
    const app = createApp();
    const calls: (number | null)[] = [];
    app.on("focusChanged", (id) => calls.push(id));
    app.focus(9);
    expect(calls).toEqual([9]);
  });

  it("emits focusChanged synchronously before focus() returns, ahead of any render the caller triggers next", () => {
    const app = createApp();
    const order: string[] = [];
    app.on("focusChanged", () => order.push("focusChanged"));
    app.onRender(() => order.push("render"));
    app.focus(1);
    app.render();
    expect(order).toEqual(["focusChanged", "render"]);
  });

  it("does not itself trigger a render pass", () => {
    const app = createApp();
    const calls: string[] = [];
    app.onRender(() => calls.push("render"));
    app.focus(1);
    expect(calls).toEqual([]);
  });

  it("state.focusedId is already updated by the time focusChanged listeners run", () => {
    const app = createApp();
    let seenDuringEmit: number | null | undefined;
    app.on("focusChanged", () => {
      seenDuringEmit = app.state.focusedId;
    });
    app.focus(42);
    expect(seenDuringEmit).toBe(42);
  });
});
