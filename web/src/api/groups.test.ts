import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGroup, deleteGroup, putAllCollapsed, putGroupsOrder, updateGroup } from "./groups";
import { fakeResponse, fakeResponseThatThrows, fakeStatusResponse } from "./testfakes";

const group = { id: 3, name: "PR reviews", pos: 0, collapsed: false };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonCall(method: string, body: unknown) {
  return expect.objectContaining({
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("groups — createGroup (POST /api/groups, kb:anchor/groups.create)", () => {
  it("posts only the name when no session is named, and decodes the 201 Group", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, group));
    const result = await createGroup("PR reviews");
    expect(result).toEqual({ ok: true, value: group });
    expect(fetchMock).toHaveBeenCalledWith("/api/groups", jsonCall("POST", { name: "PR reviews" }));
  });

  it("posts sessionIds in listed order when sessions become its first members", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, group));
    await createGroup("PR reviews", [9, 4]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups",
      jsonCall("POST", { name: "PR reviews", sessionIds: [9, 4] }),
    );
  });

  it("sends an empty sessionIds list as given rather than dropping it", async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, group));
    await createGroup("PR reviews", []);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups",
      jsonCall("POST", { name: "PR reviews", sessionIds: [] }),
    );
  });

  it("decodes a 400 invalid_request carrying the daemon's own message", async () => {
    const error = {
      code: "invalid_request",
      message: "name must be 1-40 characters after trimming",
    };
    fetchMock.mockResolvedValue(fakeResponse(false, { error }));
    expect(await createGroup("")).toEqual({ ok: false, error });
  });

  it("decodes a 404 unknown_session (a listed session is gone; nothing was created)", async () => {
    const error = { code: "unknown_session", message: "unknown session" };
    fetchMock.mockResolvedValue(fakeResponse(false, { error }));
    expect(await createGroup("x", [99])).toEqual({ ok: false, error });
  });

  it.each([
    ["a body that is not a Group", { name: "x" }],
    ["a Group with a fractional id", { ...group, id: 1.5 }],
    ["null", null],
  ])("falls back to a generic error for a success body that is %s", async (_label, body) => {
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await createGroup("x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("never throws when the success body is not JSON", async () => {
    fetchMock.mockResolvedValue(fakeResponseThatThrows());
    const result = await createGroup("x");
    expect(result.ok).toBe(false);
  });
});

describe("groups — updateGroup (PUT /api/groups/{id}, kb:anchor/groups.update)", () => {
  it("renames a group and treats a bare 204 as success", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await updateGroup(3, { name: "Reviews" })).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/3", jsonCall("PUT", { name: "Reviews" }));
  });

  it("collapses a group", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await updateGroup(3, { collapsed: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/3", jsonCall("PUT", { collapsed: true }));
  });

  it("addresses the Ungrouped section as 0, and sends collapsed:false as false, not omitted", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    await updateGroup(0, { collapsed: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/0", jsonCall("PUT", { collapsed: false }));
  });

  it("decodes a 404 unknown_group", async () => {
    const error = { code: "unknown_group", message: "unknown group" };
    fetchMock.mockResolvedValue(fakeStatusResponse(404, { error }));
    expect(await updateGroup(99, { collapsed: true })).toEqual({ ok: false, error });
  });

  it("decodes a 400 for renaming Ungrouped", async () => {
    const error = { code: "invalid_request", message: "the Ungrouped section cannot be renamed" };
    fetchMock.mockResolvedValue(fakeStatusResponse(400, { error }));
    expect(await updateGroup(0, { name: "x" })).toEqual({ ok: false, error });
  });

  it("never throws when a non-204 response body is not JSON", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(500));
    const result = await updateGroup(3, { collapsed: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });
});

describe("groups — putGroupsOrder (PUT /api/groups/order, kb:anchor/groups.order)", () => {
  it("sends every id plus 0 for Ungrouped, in order, and treats 204 as success", async () => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await putGroupsOrder([3, 0, 5])).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/order",
      jsonCall("PUT", { order: [3, 0, 5] }),
    );
  });

  it("decodes a 400 invalid_request", async () => {
    const error = {
      code: "invalid_request",
      message: "order must list every group id and 0 exactly once",
    };
    fetchMock.mockResolvedValue(fakeStatusResponse(400, { error }));
    expect(await putGroupsOrder([3])).toEqual({ ok: false, error });
  });
});

describe("groups — putAllCollapsed (PUT /api/groups/collapsed, kb:anchor/groups.collapsed)", () => {
  it.each([true, false])("sends collapsed:%s", async (collapsed) => {
    fetchMock.mockResolvedValue(fakeStatusResponse(204));
    expect(await putAllCollapsed(collapsed)).toEqual({ ok: true, value: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/groups/collapsed", jsonCall("PUT", { collapsed }));
  });

  it("decodes a 400 invalid_request", async () => {
    const error = {
      code: "invalid_request",
      message: "collapsed is required and must be a boolean",
    };
    fetchMock.mockResolvedValue(fakeStatusResponse(400, { error }));
    expect(await putAllCollapsed(true)).toEqual({ ok: false, error });
  });
});

describe("groups — deleteGroup (DELETE /api/groups/{id}, kb:anchor/groups.delete)", () => {
  const report = { done: [4, 9], skipped: [], failed: [] };

  it.each([
    ["ungroup", { sessions: "ungroup" }],
    ["move", { sessions: "move", to: 5 }],
    ["remove", { sessions: "remove" }],
  ] as const)(
    "sends the %s disposition as the body and decodes the 200 report",
    async (_name, disposition) => {
      fetchMock.mockResolvedValue(fakeResponse(true, { deleted: true, sessions: report }));
      const result = await deleteGroup(3, disposition);
      expect(result).toEqual({ ok: true, value: { deleted: true, sessions: report } });
      expect(fetchMock).toHaveBeenCalledWith("/api/groups/3", jsonCall("DELETE", disposition));
    },
  );

  it("decodes deleted:false, the one case where a remove left a failed member in the group", async () => {
    const partial = { done: [4], skipped: [], failed: [9] };
    fetchMock.mockResolvedValue(fakeResponse(true, { deleted: false, sessions: partial }));
    expect(await deleteGroup(3, { sessions: "remove" })).toEqual({
      ok: true,
      value: { deleted: false, sessions: partial },
    });
  });

  it("decodes an empty group's report", async () => {
    const empty = { done: [], skipped: [], failed: [] };
    fetchMock.mockResolvedValue(fakeResponse(true, { deleted: true, sessions: empty }));
    const result = await deleteGroup(3, { sessions: "ungroup" });
    expect(result).toEqual({ ok: true, value: { deleted: true, sessions: empty } });
  });

  it.each([
    ["deleted missing", { sessions: report }],
    ["deleted not a boolean", { deleted: "yes", sessions: report }],
    ["sessions missing", { deleted: true }],
    ["a malformed report", { deleted: true, sessions: { done: [1], skipped: [] } }],
    ["not an object", "ok"],
  ])("falls back to a generic error for a 200 with %s", async (_label, body) => {
    fetchMock.mockResolvedValue(fakeResponse(true, body));
    const result = await deleteGroup(3, { sessions: "ungroup" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown_error");
  });

  it("decodes a 404 unknown_group whose message says the target is the one gone", async () => {
    const error = { code: "unknown_group", message: "unknown target group" };
    fetchMock.mockResolvedValue(fakeResponse(false, { error }));
    expect(await deleteGroup(3, { sessions: "move", to: 99 })).toEqual({ ok: false, error });
  });

  it("decodes a 400 invalid_request", async () => {
    const error = { code: "invalid_request", message: "the Ungrouped section cannot be deleted" };
    fetchMock.mockResolvedValue(fakeResponse(false, { error }));
    expect(await deleteGroup(0, { sessions: "ungroup" })).toEqual({ ok: false, error });
  });
});
