// The restart notice (W1, W2, W4): who it counts, the readout label, the panel text and the
// per-tab Ignore. Pure, no DOM; storage is a fake.
import { describe, expect, it } from "vitest";
import type { Session } from "../protocol/session";
import { makeSession } from "../sessions/testfixtures";
import type { StorageLike } from "../storage";
import {
  buildPanelModel,
  deriveRestartNotice,
  readIgnoredInstalled,
  writeIgnoredInstalled,
} from "./restartnotice";

function behind(id: number, running = "2.1.316", overrides: Partial<Session> = {}): Session {
  return makeSession({ id, claudeVersion: { running, behind: true }, ...overrides });
}

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const throwingStorage: StorageLike = {
  getItem() {
    throw new Error("disabled");
  },
  setItem() {
    throw new Error("disabled");
  },
  removeItem() {
    throw new Error("disabled");
  },
};

describe("deriveRestartNotice — when it shows (W1)", () => {
  it("is null when the installed version is unknown, even with a behind session", () => {
    expect(deriveRestartNotice([behind(1)], null, false)).toBeNull();
  });

  it("is null with no sessions, with only current or unknown-version sessions, and with dead ones", () => {
    expect(deriveRestartNotice([], "2.1.318", false)).toBeNull();
    expect(
      deriveRestartNotice(
        [
          makeSession({ id: 1 }),
          makeSession({ id: 2, claudeVersion: { running: "2.1.318", behind: false } }),
          behind(3, "2.1.316", { alive: false }),
        ],
        "2.1.318",
        false,
      ),
    ).toBeNull();
  });

  it("shows for a behind session", () => {
    const notice = deriveRestartNotice([behind(1)], "2.1.318", false);
    expect(notice?.behind.map((s) => s.id)).toEqual([1]);
    expect(notice?.pending).toEqual([]);
  });

  it("Ignore hides the behind part; pending sessions show regardless", () => {
    expect(deriveRestartNotice([behind(1)], "2.1.318", true)).toBeNull();
    const notice = deriveRestartNotice(
      [behind(1), behind(2, "2.1.316", { restartPending: true })],
      "2.1.318",
      true,
    );
    expect(notice?.behind).toEqual([]);
    expect(notice?.pending.map((s) => s.id)).toEqual([2]);
    expect(notice?.label).toBe("claude ↻1 queued");
  });

  it("a pending session is not also counted as behind", () => {
    const notice = deriveRestartNotice(
      [behind(1), behind(2, "2.1.316", { restartPending: true })],
      "2.1.318",
      false,
    );
    expect(notice?.behind.map((s) => s.id)).toEqual([1]);
    expect(notice?.pending.map((s) => s.id)).toEqual([2]);
  });

  it("a dead pending session does not count", () => {
    expect(
      deriveRestartNotice(
        [behind(1, "2.1.316", { alive: false, restartPending: true })],
        "2.1.318",
        false,
      ),
    ).toBeNull();
  });
});

describe("deriveRestartNotice — label (W2)", () => {
  it.each<[string, string[], string, string]>([
    ["same major.minor", ["2.1.316"], "2.1.318", "claude 2.1.316→318"],
    ["the oldest of several", ["2.1.317", "2.1.312", "2.1.316"], "2.1.318", "claude 2.1.312→318"],
    ["numeric, not lexical, order", ["2.1.9", "2.1.10"], "2.1.318", "claude 2.1.9→318"],
    ["a minor apart", ["2.0.99"], "2.1.318", "claude →2.1.318"],
    ["a major apart", ["1.9.9"], "2.1.318", "claude →2.1.318"],
    [
      "the oldest differing from installed in minor",
      ["2.0.5", "2.1.316"],
      "2.1.318",
      "claude →2.1.318",
    ],
  ])("%s", (_label, running, installed, label) => {
    const sessions = running.map((r, i) => behind(i + 1, r));
    expect(deriveRestartNotice(sessions, installed, false)?.label).toBe(label);
  });

  it("only pending sessions read claude ↻N queued; behind wins when both exist", () => {
    const pending = (id: number) => behind(id, "2.1.316", { restartPending: true });
    expect(deriveRestartNotice([pending(1), pending(2)], "2.1.318", false)?.label).toBe(
      "claude ↻2 queued",
    );
    expect(deriveRestartNotice([pending(1), behind(2)], "2.1.318", false)?.label).toBe(
      "claude 2.1.316→318",
    );
  });
});

describe("buildPanelModel", () => {
  it("counts free and busy behind sessions and omits the queued list when none are pending", () => {
    const notice = deriveRestartNotice(
      [
        behind(1),
        behind(2, "2.1.316", { state: "failed" }),
        behind(3, "2.1.316", { state: "working" }),
        behind(4, "2.1.316", { state: "idle", backgroundTasks: 1 }),
        behind(5, "2.1.316", { state: "planning" }),
      ],
      "2.1.318",
      false,
    )!;
    const model = buildPanelModel(notice);
    expect(model.head).toBe("Claude Code 2.1.318");
    expect(model.behind).toMatchObject({ now: 2, whenFree: 3 });
    expect(model.behind?.intro).toBe(
      "5 live sessions run an older version and pick it up only when restarted.",
    );
    expect(model.queued).toBeNull();
  });

  it("uses the singular for one behind session", () => {
    const model = buildPanelModel(deriveRestartNotice([behind(1)], "2.1.318", false)!);
    expect(model.behind?.intro).toBe(
      "1 live session runs an older version and picks it up only when restarted.",
    );
  });

  it("lists pending sessions with title and reason and drops the behind part when only they remain", () => {
    const notice = deriveRestartNotice(
      [behind(1, "2.1.316", { restartPending: true, state: "planning", title: "plan it" })],
      "2.1.318",
      false,
    )!;
    const model = buildPanelModel(notice);
    expect(model.behind).toBeNull();
    expect(model.queued).toEqual({
      heading: "Restart when free · 1",
      rows: [{ id: 1, title: "plan it", reason: "planning" }],
    });
  });
});

describe("Ignore storage (W4)", () => {
  it("round-trips the installed version it was pressed for", () => {
    const storage = fakeStorage();
    expect(readIgnoredInstalled(storage)).toBeNull();
    writeIgnoredInstalled(storage, "2.1.318");
    expect(readIgnoredInstalled(storage)).toBe("2.1.318");
  });

  it("a different installed version is not the ignored one", () => {
    const storage = fakeStorage();
    writeIgnoredInstalled(storage, "2.1.318");
    expect(readIgnoredInstalled(storage) === "2.1.319").toBe(false);
  });

  it.each([
    ["a foreign shape", JSON.stringify({ v: 1 })],
    ["an empty string", JSON.stringify("")],
    ["invalid JSON", "{nope"],
  ])("%s reads as not ignored", (_label, raw) => {
    expect(readIgnoredInstalled(fakeStorage({ "muster.claude-restart-ignored": raw }))).toBeNull();
  });

  it("a throwing storage reads as not ignored and writing does not throw", () => {
    expect(readIgnoredInstalled(throwingStorage)).toBeNull();
    expect(() => writeIgnoredInstalled(throwingStorage, "2.1.318")).not.toThrow();
  });
});
