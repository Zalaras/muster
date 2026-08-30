import { describe, expect, it } from "vitest";
import type { Session } from "../protocol";
import { SessionStore } from "./store";

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
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
  };
}

describe("SessionStore", () => {
  it("starts empty", () => {
    const store = new SessionStore();
    expect(store.values()).toEqual([]);
  });

  it("replaceAll populates the store from a snapshot", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
    expect(store.values().map((s) => s.id).sort()).toEqual([1, 2]);
  });

  it("replaceAll wholly discards whatever was there before (no partial merge)", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
    store.replaceAll([makeSession({ id: 3 })]);
    expect(store.values().map((s) => s.id)).toEqual([3]);
  });

  it("upsert adds a new session", () => {
    const store = new SessionStore();
    store.upsert(makeSession({ id: 1 }));
    expect(store.values().map((s) => s.id)).toEqual([1]);
  });

  it("upsert replaces an existing session wholesale by id", () => {
    const store = new SessionStore();
    store.upsert(makeSession({ id: 1, state: "started", title: null }));
    store.upsert(makeSession({ id: 1, state: "working", title: "renamed" }));
    const [session] = store.values();
    expect(session).toBeDefined();
    expect(session?.state).toBe("working");
    expect(session?.title).toBe("renamed");
    expect(store.values()).toHaveLength(1);
  });

  it("upsert after replaceAll only touches the one session id", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1, state: "idle" }), makeSession({ id: 2, state: "idle" })]);
    store.upsert(makeSession({ id: 2, state: "failed" }));
    const byId = new Map(store.values().map((s) => [s.id, s]));
    expect(byId.get(1)?.state).toBe("idle");
    expect(byId.get(2)?.state).toBe("failed");
  });
});

describe("SessionStore.remove (REQ-15, applies a sessionRemoved)", () => {
  it("removes an existing session by id", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
    store.remove(1);
    expect(store.values().map((s) => s.id)).toEqual([2]);
  });

  it("is a no-op on an unknown id (edge case 12: a client that has never seen this id ignores it)", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
    expect(() => store.remove(999)).not.toThrow();
    expect(store.values().map((s) => s.id).sort()).toEqual([1, 2]);
  });

  it("is a no-op on an empty store", () => {
    const store = new SessionStore();
    expect(() => store.remove(1)).not.toThrow();
    expect(store.values()).toEqual([]);
  });

  it("only removes the targeted id, leaving every other session untouched (INV-2 at the store layer)", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1, state: "working" }), makeSession({ id: 2, state: "idle" }), makeSession({ id: 3, state: "failed" })]);
    store.remove(2);
    const byId = new Map(store.values().map((s) => [s.id, s]));
    expect(byId.has(2)).toBe(false);
    expect(byId.get(1)?.state).toBe("working");
    expect(byId.get(3)?.state).toBe("failed");
  });

  it("removing then re-upserting the same id (e.g. a stale broadcast race) works normally", () => {
    const store = new SessionStore();
    store.replaceAll([makeSession({ id: 1 })]);
    store.remove(1);
    store.upsert(makeSession({ id: 1, state: "working" }));
    expect(store.values().map((s) => s.id)).toEqual([1]);
  });
});
