import { describe, expect, it, vi } from "vitest";
import { createDraftStore } from "./notesdrafts";
import {
  createNoteSaver,
  outcomeOf,
  SAVE_DEBOUNCE_MS,
  type NoteSaver,
  type SaveOutcome,
  type SendOptions,
} from "./notessave";
import type { KeyedStorage } from "../storage";
import { failingAfter, memoryStorage, throwingStorage } from "../storagefakes";

interface Call {
  id: number;
  text: string;
  options: SendOptions;
  resolve(outcome: SaveOutcome): Promise<void>;
}

function rig(storage: KeyedStorage = memoryStorage()) {
  const drafts = createDraftStore(storage);
  const calls: Call[] = [];
  const timers = new Map<number, { run: () => void; ms: number }>();
  let nextTimer = 1;
  const onChange = vi.fn();
  const saver = createNoteSaver({
    drafts,
    send: (id, text, options) =>
      new Promise<SaveOutcome>((done) => {
        calls.push({
          id,
          text,
          options,
          resolve: async (outcome) => {
            done(outcome);
            await flushMicrotasks();
          },
        });
      }),
    setTimer: (run, ms) => {
      const handle = nextTimer++;
      timers.set(handle, { run, ms });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
    onChange,
  });
  return {
    drafts,
    saver,
    calls,
    timers,
    onChange,
    fire: async () => {
      for (const [handle, timer] of [...timers]) {
        timers.delete(handle);
        timer.run();
      }
      await flushMicrotasks();
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function sendAll(r: ReturnType<typeof rig>, saver: NoteSaver, id: number, text: string) {
  saver.edit(id, text);
  await r.fire();
}

describe("outcomeOf", () => {
  it.each<[string, Parameters<typeof outcomeOf>[0], SaveOutcome]>([
    ["success", { ok: true, value: null }, "saved"],
    ["404 unknown_session", { ok: false, error: { code: "unknown_session", message: "" } }, "gone"],
    [
      "a network error",
      { ok: false, error: { code: "network_error", message: "" } },
      "unreachable",
    ],
    [
      "413 request_too_large",
      { ok: false, error: { code: "request_too_large", message: "" } },
      "unreachable",
    ],
    ["a 5xx envelope", { ok: false, error: { code: "internal", message: "" } }, "unreachable"],
    [
      "an unreadable body",
      { ok: false, error: { code: "unknown_error", message: "" } },
      "unreachable",
    ],
  ])("%s -> %s", (_label, result, expected) => {
    expect(outcomeOf(result)).toBe(expected);
  });
});

describe("debounce", () => {
  it("sends about one second after the last edit, with the latest text", async () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.edit(1, "ab");
    r.saver.edit(1, "abc");
    expect(r.timers.size).toBe(1);
    expect([...r.timers.values()][0]?.ms).toBe(SAVE_DEBOUNCE_MS);
    expect(r.calls).toEqual([]);
    await r.fire();
    expect(r.calls.map((c) => [c.id, c.text])).toEqual([[1, "abc"]]);
  });

  it("keeps the text as a draft the moment it is typed, before any send", () => {
    const r = rig();
    r.saver.edit(1, "typed");
    expect(r.drafts.get(1)).toBe("typed");
  });

  it("debounces each session on its own timer and addresses each by its own id", async () => {
    const r = rig();
    r.saver.edit(1, "one");
    r.saver.edit(2, "two");
    expect(r.timers.size).toBe(2);
    await r.fire();
    expect(r.calls.map((c) => [c.id, c.text]).sort()).toEqual([
      [1, "one"],
      [2, "two"],
    ]);
  });

  it("sends a plain (non-keepalive) request from the debounce", async () => {
    const r = rig();
    await sendAll(r, r.saver, 1, "x");
    expect(r.calls[0]?.options).toEqual({ keepalive: false });
  });
});

describe("flush", () => {
  it("sends at once, cancelling the pending timer", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    expect(r.timers.size).toBe(0);
    expect(r.calls.map((c) => c.text)).toEqual(["x"]);
  });

  it("passes keepalive through for a page-hide flush", () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1, { keepalive: true });
    expect(r.calls[0]?.options).toEqual({ keepalive: true });
  });

  it("sends the draft typed for session 1 to session 1 after focus moved to session 2", () => {
    const r = rig();
    r.saver.edit(1, "for one");
    r.saver.flush(1);
    r.saver.edit(2, "for two");
    r.saver.flush(2);
    expect(r.calls.map((c) => [c.id, c.text])).toEqual([
      [1, "for one"],
      [2, "for two"],
    ]);
  });

  it("does nothing when the session has no draft", () => {
    const r = rig();
    r.saver.flush(7);
    expect(r.calls).toEqual([]);
  });

  it("flushAll sends every pending draft, keepalive when asked", () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.edit(2, "b");
    r.saver.flushAll({ keepalive: true });
    expect(r.timers.size).toBe(0);
    expect(r.calls.map((c) => [c.id, c.text, c.options.keepalive]).sort()).toEqual([
      [1, "a", true],
      [2, "b", true],
    ]);
  });

  it("flushAll also sends drafts that survived in the browser from an earlier page", () => {
    const r = rig();
    r.drafts.set(9, "left over");
    r.saver.flushAll();
    expect(r.calls.map((c) => [c.id, c.text])).toEqual([[9, "left over"]]);
  });
});

describe("in-flight serialisation", () => {
  it("never has two requests for one session in flight", () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.flush(1);
    r.saver.edit(1, "ab");
    r.saver.flush(1);
    expect(r.calls).toHaveLength(1);
  });

  it("after the first is acknowledged, sends the newer text and keeps no draft once acknowledged", async () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.flush(1);
    r.saver.edit(1, "ab");
    r.saver.flush(1);
    await r.calls[0]!.resolve("saved");
    expect(r.calls.map((c) => c.text)).toEqual(["a", "ab"]);
    expect(r.drafts.get(1)).toBe("ab");
    await r.calls[1]!.resolve("saved");
    expect(r.drafts.get(1)).toBeUndefined();
  });

  it("an acknowledgement of older text does not clear a newer draft", async () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.flush(1);
    r.saver.edit(1, "ab");
    await r.calls[0]!.resolve("saved");
    expect(r.drafts.get(1)).toBe("ab");
  });

  it("sessions are independent: one in flight does not hold another", () => {
    const r = rig();
    r.saver.edit(1, "a");
    r.saver.edit(2, "b");
    r.saver.flush(1);
    r.saver.flush(2);
    expect(r.calls).toHaveLength(2);
  });
});

describe("failure and the unsaved status (W5)", () => {
  it("marks the session failed when the save cannot reach musterd, keeping the draft", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    expect(r.saver.failed(1)).toBe(false);
    await r.calls[0]!.resolve("unreachable");
    expect(r.saver.failed(1)).toBe(true);
    expect(r.drafts.get(1)).toBe("x");
    expect(r.onChange).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a timer after a failure", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    expect(r.timers.size).toBe(0);
    expect(r.calls).toHaveLength(1);
  });

  it("stays failed through a second failure without announcing a change twice", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    r.saver.resend(1);
    await r.calls[1]!.resolve("unreachable");
    expect(r.saver.failed(1)).toBe(true);
    expect(r.onChange).toHaveBeenCalledTimes(1);
  });

  it("clears the failed state when a later save succeeds, and announces it", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    r.saver.resend(1);
    await r.calls[1]!.resolve("saved");
    expect(r.saver.failed(1)).toBe(false);
    expect(r.drafts.get(1)).toBeUndefined();
    expect(r.onChange).toHaveBeenCalledTimes(2);
  });

  it("the next edit after a failure sends again", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    await sendAll(r, r.saver, 1, "xy");
    expect(r.calls[1]?.text).toBe("xy");
  });

  it("failure is per session", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    expect(r.saver.failed(2)).toBe(false);
  });

  it("a session that is gone (404) drops its draft silently, never failed", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("gone");
    expect(r.drafts.get(1)).toBeUndefined();
    expect(r.saver.failed(1)).toBe(false);
    expect(r.onChange).not.toHaveBeenCalled();
  });

  it("a 404 after an earlier failure clears the failed state", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    r.saver.resend(1);
    await r.calls[1]!.resolve("gone");
    expect(r.saver.failed(1)).toBe(false);
  });
});

describe("resend (reconnect, reload)", () => {
  it("sends the kept draft", () => {
    const r = rig();
    r.drafts.set(3, "kept");
    r.saver.resend(3);
    expect(r.calls.map((c) => [c.id, c.text])).toEqual([[3, "kept"]]);
  });

  it("does nothing when there is no draft", () => {
    const r = rig();
    r.saver.resend(3);
    expect(r.calls).toEqual([]);
  });
});

describe("forget (session removed)", () => {
  it("cancels the timer, drops the draft and the failed state", async () => {
    const r = rig();
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    r.saver.edit(1, "xy");
    r.saver.forget(1);
    expect(r.timers.size).toBe(0);
    expect(r.drafts.get(1)).toBeUndefined();
    expect(r.saver.failed(1)).toBe(false);
  });
});

// Review cycle 1 Major 1: a send never depends on the browser keeping the draft.
describe("a storage that refuses writes", () => {
  it("over throwing storage, the debounce sends the latest typed text to the right id", async () => {
    const r = rig(throwingStorage());
    r.saver.edit(7, "t");
    r.saver.edit(7, "typed");
    r.saver.edit(8, "other");
    await r.fire();
    expect(r.calls.map((c) => [c.id, c.text]).sort()).toEqual([
      [7, "typed"],
      [8, "other"],
    ]);
  });

  it("over throwing storage, flush and flushAll send the typed text", () => {
    const r = rig(throwingStorage());
    r.saver.edit(1, "a");
    r.saver.flush(1);
    r.saver.edit(2, "b");
    r.saver.flushAll({ keepalive: true });
    expect(r.calls.map((c) => [c.id, c.text, c.options.keepalive])).toEqual([
      [1, "a", false],
      [2, "b", true],
    ]);
  });

  it("when setItem throws after a first write, the later edit sends the new text, not the older stored one", async () => {
    const r = rig(failingAfter(1));
    await sendAll(r, r.saver, 1, "short");
    await r.calls[0]!.resolve("saved");
    r.saver.edit(1, "short");
    r.saver.edit(1, "a much longer text");
    await r.fire();
    expect(r.calls.map((c) => [c.id, c.text])).toEqual([
      [1, "short"],
      [1, "a much longer text"],
    ]);
  });

  it("an edit during an in-flight send is sent next, with the newest text, once the first is acknowledged", async () => {
    const r = rig(failingAfter(1));
    r.saver.edit(1, "short");
    r.saver.flush(1);
    r.saver.edit(1, "a much longer text");
    await r.calls[0]!.resolve("saved");
    expect(r.calls.map((c) => c.text)).toEqual(["short", "a much longer text"]);
    await r.calls[1]!.resolve("saved");
    expect(r.drafts.get(1)).toBeUndefined();
  });

  it("an unreachable send over throwing storage keeps the typed text for a resend", async () => {
    const r = rig(throwingStorage());
    r.saver.edit(1, "x");
    r.saver.flush(1);
    await r.calls[0]!.resolve("unreachable");
    r.saver.resend(1);
    expect(r.calls.map((c) => c.text)).toEqual(["x", "x"]);
  });
});
