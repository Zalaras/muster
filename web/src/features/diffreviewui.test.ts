import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../api/http";
import { postDiffTicks } from "../api/diff";
import { applyTicks, flushPending, toggleChangeTick } from "./diffreviewui";
import { newViewerState, type ViewerCtx } from "./diffviewerstate";

vi.mock("../api/diff", () => ({ postDiffTicks: vi.fn() }));

const post = vi.mocked(postDiffTicks);
const OK: ApiResult<null> = { ok: true, value: null };
const FAIL: ApiResult<null> = {
  ok: false,
  error: { code: "network_error", message: "x" },
};

function deferred() {
  let resolve!: (r: ApiResult<null>) => void;
  const promise = new Promise<ApiResult<null>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function ctx(): ViewerCtx {
  const node = () => ({ hidden: false, textContent: "" });
  return {
    id: 7,
    s: newViewerState("unified"),
    reviewChanged: vi.fn(),
    chrome: { reviewTools: node(), map: node(), tickFail: node() },
  } as unknown as ViewerCtx;
}

beforeEach(() => post.mockReset());

describe("diffreviewui — tick posts are an ordered chain (ViewerState.flushing)", () => {
  it("does not start the second post until the first has settled, and sends the later state", async () => {
    const first = deferred();
    post.mockReturnValueOnce(first.promise).mockResolvedValue(OK);
    const c = ctx();
    applyTicks(c, ["a"], []);
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(7, ["a"], []);

    toggleChangeTick(c, "a"); // untick while the tick is in flight
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);

    first.resolve(OK);
    await flushPending(c);
    expect(post.mock.calls).toEqual([
      [7, ["a"], []],
      [7, [], ["a"]],
    ]);
    expect(c.s.pendingAdd.size + c.s.pendingRemove.size).toBe(0);
    expect(c.s.ticks.has("a")).toBe(false);
  });

  it("keeps a failed post's keys pending and shows the failure, then retries them on the next flush", async () => {
    post.mockResolvedValueOnce(FAIL).mockResolvedValue(OK);
    const c = ctx();
    applyTicks(c, ["a"], []);
    await c.s.flushing;
    expect([...c.s.pendingAdd]).toEqual(["a"]);
    expect(c.chrome.tickFail.hidden).toBe(false);
    expect(c.chrome.tickFail.textContent).not.toBe("");

    applyTicks(c, ["b"], []);
    await flushPending(c);
    expect(post).toHaveBeenLastCalledWith(7, ["a", "b"], []);
    expect(c.s.pendingAdd.size).toBe(0);
    expect(c.chrome.tickFail.hidden).toBe(true);
  });

  it("sends nothing when nothing is pending", async () => {
    post.mockResolvedValue(OK);
    await flushPending(ctx());
    expect(post).not.toHaveBeenCalled();
  });

  it("clears a key from reopened on every tick or untick", () => {
    post.mockResolvedValue(OK);
    const c = ctx();
    c.s.reopened.add("a");
    applyTicks(c, ["a"], []);
    expect(c.s.reopened.has("a")).toBe(false);
    c.s.reopened.add("a");
    applyTicks(c, [], ["a"]);
    expect(c.s.reopened.has("a")).toBe(false);
  });
});
