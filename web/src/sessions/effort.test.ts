import { describe, expect, it } from "vitest";
import { EFFORT_LEVELS, isEffortLevel, type EffortWarning } from "../protocol/session";
import {
  DEFAULT_EFFORT,
  effortBrackets,
  effortReadout,
  effortStripParts,
  effortToCheck,
} from "./effort";

// The Effort radio value for a repo's stored lastEffort: a known level is checked, anything
// else (null, "", a level this build has no radio for) falls back to the `default` radio.
describe("effort — effortToCheck / isEffortLevel", () => {
  it.each(EFFORT_LEVELS)("checks the %s radio", (level) => {
    expect(effortToCheck(level)).toBe(level);
  });

  it.each([null, "", "turbo", "HIGH"])("falls back to the default radio for %p", (stored) => {
    expect(effortToCheck(stored)).toBe(DEFAULT_EFFORT);
    expect(DEFAULT_EFFORT).toBe("");
  });

  it("isEffortLevel accepts only the five named levels", () => {
    expect([...EFFORT_LEVELS]).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(isEffortLevel("max")).toBe(true);
    expect(isEffortLevel("default")).toBe(false);
    expect(isEffortLevel(undefined)).toBe(false);
    expect(isEffortLevel(3)).toBe(false);
  });
});

// The header's bracket suffix. Never reported and alive reads `(…)` (unknown, never an
// empty value); a model with no effort setting reads no brackets; a dead session that never
// reported reads no brackets, with the width reserved separately (effortReadout).
describe("effort — effortBrackets", () => {
  it.each([
    ["a reported level", { effort: { level: "high" }, alive: true }, " (high)"],
    ["a reported level on a dead session", { effort: { level: "max" }, alive: false }, " (max)"],
    ["never reported, alive", { effort: null, alive: true }, " (…)"],
    ["never reported, dead", { effort: null, alive: false }, null],
    ["a model with no effort setting", { effort: { level: null }, alive: true }, null],
    ["no effort setting, dead", { effort: { level: null }, alive: false }, null],
  ])("%s", (_label, session, expected) => {
    expect(effortBrackets(session)).toBe(expected);
  });
});

describe("effort — effortStripParts", () => {
  const text = (warning: EffortWarning) =>
    effortStripParts(warning)
      .map((part) => part.text)
      .join("");

  it("words a clamp, bolding the requested and actual levels", () => {
    const warning = { requested: "max", actual: "high", model: "Opus 4.5" };
    expect(effortStripParts(warning)).toEqual([
      { text: "Asked for ", bold: false },
      { text: "max", bold: true },
      { text: " — Opus 4.5 started at ", bold: false },
      { text: "high", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("words a model with no effort setting, bolding only the requested level", () => {
    const warning = { requested: "max", actual: null, model: "Haiku 4.5" };
    expect(effortStripParts(warning)).toEqual([
      { text: "Asked for ", bold: false },
      { text: "max", bold: true },
      { text: " — Haiku 4.5 has no effort setting, so it started without one.", bold: false },
    ]);
  });

  it.each([
    ["a clamp", { requested: "max", actual: "high", model: null }],
    ["no effort setting", { requested: "max", actual: null, model: null }],
  ])("reads `the model` when the model is unnamed (%s)", (_label, warning) => {
    expect(text(warning)).toContain("— the model ");
  });
});

describe("effort — effortReadout", () => {
  it("bundles brackets, width reservation, warn flag and strip", () => {
    const warning = { requested: "max", actual: "high", model: "Opus 4.5" };
    const readout = effortReadout({
      effort: { level: "high" },
      effortWarning: warning,
      alive: true,
    });
    expect(readout.brackets).toBe(" (high)");
    expect(readout.reservesBrackets).toBe(false);
    expect(readout.warn).toBe(true);
    expect(readout.strip).toEqual(effortStripParts(warning));
  });

  it("has no warn and no strip without a warning", () => {
    const readout = effortReadout({ effort: { level: "low" }, effortWarning: null, alive: true });
    expect(readout.warn).toBe(false);
    expect(readout.strip).toBeNull();
  });

  // Stop/Resume never moves the Focus header, so the dead-and-never-reported case reads no
  // brackets yet holds the width of ` (…)`.
  it.each([
    ["alive, never reported", { effort: null, alive: true }, false, " (…)"],
    ["dead, never reported", { effort: null, alive: false }, true, null],
    ["dead, reported", { effort: { level: "high" }, alive: false }, false, " (high)"],
    ["alive, no effort setting", { effort: { level: null }, alive: true }, false, null],
  ])("%s", (_label, base, reserves, brackets) => {
    const readout = effortReadout({ ...base, effortWarning: null });
    expect(readout.reservesBrackets).toBe(reserves);
    expect(readout.brackets).toBe(brackets);
  });
});
