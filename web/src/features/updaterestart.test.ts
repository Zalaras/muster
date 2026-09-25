// Plan settings-update-failures (REQ-13-19, W1-W7): the pure banner-override decision
// (computeBannerOverride) table-tested directly with no app/socket/storage/DOM, plus
// initUpdateRestart's stateful wiring — the restart record's REQ-18 lifecycle, the
// REQ-16/W6/W7 reload-and-handoff, and the REQ-17/INV-3 confirmation arming from a
// sessionStorage handoff, all driven through a real createApp() and a fake StorageLike
// (this file's own fakeStorage, matching reader/memory.test.ts's shape).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { Snapshot } from "../protocol/messages";
import type { UpdateInfo } from "../protocol/update";
import type { StorageLike } from "../storage";
import { computeBannerOverride, initUpdateRestart } from "./updaterestart";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
  setItemCalls: number;
} {
  const data = { ...initial };
  const storage = {
    data,
    setItemCalls: 0,
    getItem(key: string) {
      return key in data ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      storage.setItemCalls++;
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
  return storage;
}

function throwingStorage(): StorageLike {
  return {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("storage disabled");
    },
    removeItem() {
      throw new Error("storage disabled");
    },
  };
}

const baseUpdate: UpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  canCheck: true,
  available: null,
  checkedAt: null,
  installed: null,
  apply: { phase: "idle", version: null, error: null },
};

function restartingUpdate(version: string): UpdateInfo {
  return { ...baseUpdate, apply: { phase: "restarting", version, error: null } };
}

function makeSnapshot(update: UpdateInfo | null): Snapshot {
  return {
    type: "snapshot",
    sessions: [],
    usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
    prefs: {
      view: "focus",
      density: "2x2",
      usageModel: "Fable",
      railSort: "manual",
      theme: "follow",
      updateCheck: true,
      railDensity: "comfortable",
      railActivity: "turn",
    },
    claudeTheme: { family: "unknown" },
    update,
  };
}

describe("computeBannerOverride (pure — W1/W2/W3/W5)", () => {
  const arrivedAt = new Date("2026-09-25T10:00:00Z");
  const record = { version: "0.18.1", arrivedAt };

  it("W1: shows the restarting text while the socket is down, under 30s", () => {
    const now = new Date(arrivedAt.getTime() + 29_999);
    expect(computeBannerOverride(record, "reconnecting", now, null)).toEqual({
      text: "Updating musterd to v0.18.1 — restarting; hook output in open panes is Muster's absence, not session failure.",
      neutral: false,
    });
  });

  it("treats any non-connected status (including the initial connecting state) as socket down", () => {
    const now = new Date(arrivedAt.getTime() + 1_000);
    expect(computeBannerOverride(record, "connecting", now, null)).not.toBeNull();
  });

  it("W2: falls through to null (ordinary unreachable text) at exactly the 30s boundary", () => {
    const now = new Date(arrivedAt.getTime() + 30_000);
    expect(computeBannerOverride(record, "reconnecting", now, null)).toBeNull();
  });

  it("W2: stays null well past the 30s fallback, with the record still held (record is untouched by this pure call)", () => {
    const now = new Date(arrivedAt.getTime() + 120_000);
    expect(computeBannerOverride(record, "reconnecting", now, null)).toBeNull();
  });

  it("never shows the restarting text once the socket reads connected, even under 30s", () => {
    const now = new Date(arrivedAt.getTime() + 1_000);
    expect(computeBannerOverride(record, "connected", now, null)).toBeNull();
  });

  it("W3: no record and no confirmation returns null regardless of status", () => {
    expect(computeBannerOverride(null, "reconnecting", new Date(), null)).toBeNull();
  });

  it("W5: shows the confirmation text for a fresh confirmation, neutral styled", () => {
    const startedAt = new Date("2026-09-25T10:05:00Z");
    const now = new Date(startedAt.getTime() + 1_000);
    expect(computeBannerOverride(null, "connected", now, { version: "0.18.1", startedAt })).toEqual(
      { text: "Updated to v0.18.1.", neutral: true },
    );
  });

  it("W5: confirmation expires at exactly the 3s boundary", () => {
    const startedAt = new Date("2026-09-25T10:05:00Z");
    const now = new Date(startedAt.getTime() + 3_000);
    expect(
      computeBannerOverride(null, "connected", now, { version: "0.18.1", startedAt }),
    ).toBeNull();
  });

  it("the confirmation takes priority over a held restart record", () => {
    const startedAt = new Date("2026-09-25T10:05:00Z");
    const now = new Date(startedAt.getTime() + 500);
    expect(
      computeBannerOverride(record, "reconnecting", now, { version: "0.19.0", startedAt }),
    ).toEqual({ text: "Updated to v0.19.0.", neutral: true });
  });
});

describe("initUpdateRestart — restart record lifecycle (REQ-13/14/15/18)", () => {
  it("arms a record from an update message whose apply.phase is restarting, surfaced through bannerOverride", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, fakeStorage());
    app.state.connection = "reconnecting";
    app.emit("update", restartingUpdate("0.18.1"));
    const now = new Date();
    expect(handle.bannerOverride(now, "reconnecting")).toEqual({
      text: "Updating musterd to v0.18.1 — restarting; hook output in open panes is Muster's absence, not session failure.",
      neutral: false,
    });
  });

  it("degrades a null apply.version to the empty string rather than throwing (wire invariant defended defensively)", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, fakeStorage());
    app.emit("update", {
      ...baseUpdate,
      apply: { phase: "restarting", version: null, error: null },
    });
    expect(handle.bannerOverride(new Date(), "reconnecting")?.text).toContain(
      "Updating musterd to v —",
    );
  });

  it("REQ-18: a non-restarting update while connected drops the held record", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, fakeStorage());
    app.emit("update", restartingUpdate("0.18.1"));
    app.state.connection = "connected";
    app.emit("update", { ...baseUpdate, apply: { phase: "idle", version: null, error: null } });
    app.state.connection = "reconnecting"; // simulate a later drop
    expect(handle.bannerOverride(new Date(), "reconnecting")).toBeNull();
  });

  it("REQ-18 is gated on being connected: a non-restarting update while still disconnected leaves the record held", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, fakeStorage());
    app.state.connection = "reconnecting";
    app.emit("update", restartingUpdate("0.18.1"));
    // Another update arrives (e.g. a stray "failed") but the socket never reported connected.
    app.emit("update", {
      ...baseUpdate,
      apply: { phase: "failed", version: "0.18.1", error: "boom" },
    });
    expect(handle.bannerOverride(new Date(), "reconnecting")).not.toBeNull();
  });
});

describe("initUpdateRestart — reload handoff (REQ-16, W6/W7)", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal("location", { reload });
  });

  it("W6: the first hello after a drop, while a record is held, writes the handoff before reloading", () => {
    const app = createApp();
    const storage = fakeStorage();
    // Captured inside the reload stub itself, not read back afterwards — a `reload`
    // that fired first and let the write land later would see `undefined` here, so
    // this fails if the write and the reload are ever reordered.
    let handoffAtReloadTime: string | undefined;
    reload.mockImplementation(() => {
      handoffAtReloadTime = storage.data["muster.update-restart"];
    });
    initUpdateRestart(app, storage);
    app.emit("update", restartingUpdate("0.18.1"));

    app.emit("helloArrived");

    expect(reload).toHaveBeenCalledTimes(1);
    expect(handoffAtReloadTime).toBeDefined();
    expect(JSON.parse(handoffAtReloadTime!)).toEqual({ version: "0.18.1" });
  });

  it("W3: a hello with no record held never reloads and never writes a handoff", () => {
    const app = createApp();
    const storage = fakeStorage();
    initUpdateRestart(app, storage);

    app.emit("helloArrived");

    expect(reload).not.toHaveBeenCalled();
    expect(storage.data["muster.update-restart"]).toBeUndefined();
  });

  it("W7: a second hello before the page unloads does not write the handoff again or reload twice", () => {
    const app = createApp();
    const storage = fakeStorage();
    initUpdateRestart(app, storage);
    app.emit("update", restartingUpdate("0.18.1"));

    app.emit("helloArrived");
    app.emit("helloArrived");

    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.setItemCalls).toBe(1);
  });

  it("still reloads when the handoff write throws (private mode / disabled storage — best-effort per storage.ts)", () => {
    const app = createApp();
    initUpdateRestart(app, throwingStorage());
    app.emit("update", restartingUpdate("0.18.1"));

    expect(() => app.emit("helloArrived")).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("edge 18: a throwing sessionStorage *accessor* (not just its methods) still reloads, no handoff thrown out of init", () => {
    // Chrome with site data blocked throws on the `sessionStorage` global getter itself,
    // before any getItem/setItem call is reachable — a stricter case than throwingStorage
    // above, which throws only from the methods. initUpdateRestart's default parameter
    // evaluates `safeSessionStorage()` at call time, so a throwing global getter (rather
    // than a stubbed value) is what exercises that accessor guard.
    const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get(): never {
        throw new Error("SecurityError: sessionStorage is not available");
      },
    });
    try {
      const app = createApp();

      expect(() => initUpdateRestart(app)).not.toThrow();
      app.emit("update", restartingUpdate("0.18.1"));

      expect(() => app.emit("helloArrived")).not.toThrow();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(globalThis, "sessionStorage", original);
      else Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });
});

describe("initUpdateRestart — confirmation from the sessionStorage handoff (REQ-17, W5, INV-3)", () => {
  it("reads and consumes the handoff at construction so a later reload of the same tab finds nothing", () => {
    const storage = fakeStorage({ "muster.update-restart": JSON.stringify({ version: "0.18.1" }) });
    const app = createApp();
    initUpdateRestart(app, storage);
    expect(storage.data["muster.update-restart"]).toBeUndefined();
  });

  it("arms the confirmation when the first snapshot's update.running matches the handed-off version", () => {
    const storage = fakeStorage({ "muster.update-restart": JSON.stringify({ version: "0.18.1" }) });
    const app = createApp();
    const handle = initUpdateRestart(app, storage);
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
    expect(handle.bannerOverride(new Date(), "connected")).toEqual({
      text: "Updated to v0.18.1.",
      neutral: true,
    });
  });

  it("schedules one extra render just past the 3s confirmation mark, independent of main.ts's own 1s tick phase (browser Minor 1)", () => {
    // The confirmation's own hide is a pure function of elapsed time
    // (computeBannerOverride, covered by the W5-boundary cases above); this test covers
    // only the scheduling side — that arming a confirmation asks for exactly one more
    // render at ~CONFIRMATION_MS, not zero (which left the hide to whatever the next 1s
    // tick happened to land on) and not more than one.
    vi.useFakeTimers();
    try {
      const storage = fakeStorage({
        "muster.update-restart": JSON.stringify({ version: "0.18.1" }),
      });
      const app = createApp();
      initUpdateRestart(app, storage);
      const renderSpy = vi.spyOn(app, "render");

      app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
      expect(renderSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3_049);
      expect(renderSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // No second render fires later — this is a one-shot, not a recurring tick.
      vi.advanceTimersByTime(10_000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("INV-3: never confirms when the first snapshot's running differs from the handed-off version", () => {
    const storage = fakeStorage({ "muster.update-restart": JSON.stringify({ version: "0.18.1" }) });
    const app = createApp();
    const handle = initUpdateRestart(app, storage);
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.19.0" }));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });

  it("INV-3: never confirms when no handoff was ever written", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, fakeStorage());
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });

  it("INV-3: never confirms when the first snapshot has no update object yet (measured absence, pre-first-response state)", () => {
    const storage = fakeStorage({ "muster.update-restart": JSON.stringify({ version: "0.18.1" }) });
    const app = createApp();
    const handle = initUpdateRestart(app, storage);
    app.emit("snapshot", makeSnapshot(null));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });

  it("INV-3: never confirms from a throwing storage (private mode) — degrades the same as no handoff", () => {
    const app = createApp();
    const handle = initUpdateRestart(app, throwingStorage());
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });

  it("INV-3: a foreign/malformed handoff shape (no version field) is treated as absent", () => {
    const storage = fakeStorage({
      "muster.update-restart": JSON.stringify({ notVersion: "0.18.1" }),
    });
    const app = createApp();
    const handle = initUpdateRestart(app, storage);
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });

  it("only the first snapshot of the page's life may arm the confirmation — a later reconnect snapshot never re-arms it", () => {
    const storage = fakeStorage({ "muster.update-restart": JSON.stringify({ version: "0.18.1" }) });
    const app = createApp();
    const handle = initUpdateRestart(app, storage);
    // First snapshot doesn't match — the handoff is "used up" regardless.
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.9.0" }));
    // A later snapshot (e.g. after an unrelated reconnect) does match, but must not confirm.
    app.emit("snapshot", makeSnapshot({ ...baseUpdate, running: "0.18.1" }));
    expect(handle.bannerOverride(new Date(), "connected")).toBeNull();
  });
});
