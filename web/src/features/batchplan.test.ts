import { describe, expect, it } from "vitest";
import { makeSession } from "../sessions/testfixtures";
import { batchPlan } from "./batchplan";

// Ids 1 and 2 are live, 3 and 4 are ended: the mixed rail the e2e specs never select across.
const rail = [
  makeSession({ id: 1 }),
  makeSession({ id: 2 }),
  makeSession({ id: 3, alive: false }),
  makeSession({ id: 4, alive: false }),
];

describe("batchPlan — Stop reaches only live sessions", () => {
  it.each([
    ["all live", [1, 2], [1, 2], 2],
    ["live and ended together", [1, 3, 2], [1, 2], 2],
    ["one live among ended", [3, 1, 4], [1], 1],
  ])("%s: the request carries only the live ids", (_name, ids, want, live) => {
    expect(batchPlan("end", ids, rail)).toEqual({ ids: want, live });
  });

  it("is null when every chosen session is ended", () => {
    expect(batchPlan("end", [3, 4], rail)).toBeNull();
  });
});

describe("batchPlan — Remove keeps every known session and says how many are live", () => {
  it.each([
    ["all live", [1, 2], [1, 2], 2],
    ["live and ended together", [1, 3, 2, 4], [1, 2, 3, 4], 2],
    ["all ended", [3, 4], [3, 4], 0],
    ["one ended", [3], [3], 0],
  ])("%s", (_name, ids, want, live) => {
    expect(batchPlan("remove", ids, rail)).toEqual({ ids: want, live });
  });
});

describe.each(["end", "remove"] as const)("batchPlan — %s", (action) => {
  it("drops an id no session carries, such as one removed by another window", () => {
    expect(batchPlan(action, [1, 99], rail)).toEqual({ ids: [1], live: 1 });
  });

  it("is null with no ids, with only unknown ids, and with an empty rail", () => {
    expect(batchPlan(action, [], rail)).toBeNull();
    expect(batchPlan(action, [98, 99], rail)).toBeNull();
    expect(batchPlan(action, [1, 2], [])).toBeNull();
  });

  it("orders the ids as `sessions` does, not as they were chosen", () => {
    const got = batchPlan(action, [2, 1], rail);
    expect(got?.ids).toEqual([1, 2]);
  });

  it("counts a repeated id once", () => {
    expect(batchPlan(action, [2, 2, 1], rail)).toEqual({ ids: [1, 2], live: 2 });
  });

  it("does not change its inputs", () => {
    const ids = [3, 1];
    const copy = rail.map((s) => ({ ...s }));
    batchPlan(action, ids, rail);
    expect(ids).toEqual([3, 1]);
    expect(rail).toEqual(copy);
  });
});

it("takes the two fields it reads, so a bare { id, alive } is enough", () => {
  expect(
    batchPlan(
      "remove",
      [7, 8],
      [
        { id: 8, alive: false },
        { id: 7, alive: true },
      ],
    ),
  ).toEqual({ ids: [8, 7], live: 1 });
});
