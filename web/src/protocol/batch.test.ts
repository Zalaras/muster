import { describe, expect, it } from "vitest";
import { parseBatchResult, parseRestartResult } from "./batch";

describe("parseBatchResult (kb:anchor/sessions.end-many, kb:anchor/sessions.remove-many)", () => {
  it("parses the three outcome lists", () => {
    expect(parseBatchResult({ done: [4], skipped: [9], failed: [2] })).toEqual({
      done: [4],
      skipped: [9],
      failed: [2],
    });
  });

  it("parses a batch where nothing happened to anyone: three empty lists", () => {
    expect(parseBatchResult({ done: [], skipped: [], failed: [] })).toEqual({
      done: [],
      skipped: [],
      failed: [],
    });
  });

  it("keeps listed order and ignores unknown fields", () => {
    expect(parseBatchResult({ done: [9, 4, 7], skipped: [], failed: [], extra: 1 })).toEqual({
      done: [9, 4, 7],
      skipped: [],
      failed: [],
    });
  });

  it.each([null, undefined, "x", 3, [], [[1]]])("rejects the non-object %p", (value) => {
    expect(parseBatchResult(value)).toBeNull();
  });

  it.each([
    ["done missing", { skipped: [], failed: [] }],
    ["skipped missing", { done: [], failed: [] }],
    ["failed missing", { done: [], skipped: [] }],
    ["a list null", { done: null, skipped: [], failed: [] }],
    ["a list an object", { done: {}, skipped: [], failed: [] }],
    ["a string id", { done: ["4"], skipped: [], failed: [] }],
    ["a fractional id", { done: [], skipped: [1.5], failed: [] }],
    ["one bad id among good ones", { done: [], skipped: [], failed: [1, null, 3] }],
  ])("rejects a report with %s", (_label, value) => {
    expect(parseBatchResult(value)).toBeNull();
  });
});

describe("parseRestartResult (kb:anchor/sessions.restart-many)", () => {
  it("parses the four outcome lists", () => {
    expect(parseRestartResult({ done: [4], queued: [9], skipped: [12], failed: [2] })).toEqual({
      done: [4],
      queued: [9],
      skipped: [12],
      failed: [2],
    });
  });

  it("parses a report where nothing happened: four empty lists", () => {
    expect(parseRestartResult({ done: [], queued: [], skipped: [], failed: [] })).toEqual({
      done: [],
      queued: [],
      skipped: [],
      failed: [],
    });
  });

  it.each([null, undefined, "x", 3, []])("rejects the non-object %p", (value) => {
    expect(parseRestartResult(value)).toBeNull();
  });

  it.each([
    ["queued missing (an end/remove report)", { done: [], skipped: [], failed: [] }],
    ["queued null", { done: [], queued: null, skipped: [], failed: [] }],
    ["a string queued id", { done: [], queued: ["9"], skipped: [], failed: [] }],
    ["a fractional queued id", { done: [], queued: [1.5], skipped: [], failed: [] }],
    ["done missing", { queued: [], skipped: [], failed: [] }],
    ["failed a bad id", { done: [], queued: [], skipped: [], failed: [null] }],
  ])("rejects a report with %s", (_label, value) => {
    expect(parseRestartResult(value)).toBeNull();
  });
});
