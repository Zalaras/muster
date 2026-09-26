import { describe, expect, it } from "vitest";
import type { ModelVerdict } from "../api/launch";
import type { ModelSelection } from "../render/launch";
import {
  applyVerdicts,
  deriveModelRowState,
  EMPTY_VERDICT_STORE,
  isPresetModel,
  MODEL_PRESETS,
  resetVerdictStore,
  type ModelVerdicts,
} from "./launchmodels";

function verdictMap(...entries: ModelVerdict[]): ModelVerdicts {
  return new Map(entries.map((v) => [v.model, v]));
}

const unrecognized = (model: string, message = `${model} unrecognized`): ModelVerdict => ({
  model,
  verdict: "unrecognized",
  message,
});
const recognized = (model: string): ModelVerdict => ({ model, verdict: "recognized" });
const unchecked = (model: string): ModelVerdict => ({ model, verdict: "unchecked" });

describe("isPresetModel", () => {
  it.each(MODEL_PRESETS)("recognizes preset %s", (preset) => {
    expect(isPresetModel(preset)).toBe(true);
  });

  it("rejects a custom model string, including one that looks close to a preset", () => {
    expect(isPresetModel("zephyr")).toBe(false);
    expect(isPresetModel("Sonnet")).toBe(false);
    expect(isPresetModel("")).toBe(false);
  });
});

// W1: INV-1 (Launch disabled iff the selected model's latest verdict is unrecognized) and
// INV-2 (#model-error visible iff INV-1 holds, text is that verdict's message), across every
// row of selection (each preset, custom with text, custom empty) x verdict (none,
// recognized, unchecked, unrecognized) — including the "verdict for the unselected preset"
// rows that prove REQ-7/REQ-8 are mutually exclusive on one radio.
describe("deriveModelRowState — INV-1/INV-2 table (W1)", () => {
  const presetSelection = (model: string): ModelSelection => ({ selected: model, isCustom: false });
  const customSelection = (text: string): ModelSelection => ({ selected: text, isCustom: true });

  it.each([
    ["sonnet", presetSelection("sonnet")],
    ["opus", presetSelection("opus")],
    ["haiku", presetSelection("haiku")],
    ["fable", presetSelection("fable")],
  ] as const)(
    "preset %s selected, no verdict at all: not invalid, nothing disabled",
    (model, selection) => {
      const state = deriveModelRowState(verdictMap(), selection);
      expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
      void model;
    },
  );

  it.each(MODEL_PRESETS)(
    "preset %s selected and recognized: not invalid, nothing disabled",
    (model) => {
      const state = deriveModelRowState(verdictMap(recognized(model)), presetSelection(model));
      expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
    },
  );

  it.each(MODEL_PRESETS)(
    "preset %s selected and unchecked: not invalid, not disabled (INV-4 — unchecked never marks or disables)",
    (model) => {
      const state = deriveModelRowState(verdictMap(unchecked(model)), presetSelection(model));
      expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
    },
  );

  it.each(MODEL_PRESETS)(
    "preset %s selected and unrecognized: invalid with its message, and NOT in disabledPresets " +
      "(REQ-7/REQ-8 exclusivity — the selected control is marked, never disabled)",
    (model) => {
      const state = deriveModelRowState(
        verdictMap(unrecognized(model, `${model} is bad`)),
        presetSelection(model),
      );
      expect(state.disabledPresets.has(model)).toBe(false);
      expect(state.invalid).toBe(true);
      expect(state.errorMessage).toBe(`${model} is bad`);
    },
  );

  it("an unrecognized, unselected preset is disabled and does not mark the selection", () => {
    const state = deriveModelRowState(
      verdictMap(unrecognized("fable", "fable is bad")),
      presetSelection("sonnet"),
    );
    expect(state).toEqual({
      disabledPresets: new Set(["fable"]),
      invalid: false,
      errorMessage: null,
    });
  });

  it("two unrecognized, unselected presets are both disabled", () => {
    const state = deriveModelRowState(
      verdictMap(unrecognized("sonnet", "m1"), unrecognized("opus", "m2")),
      presetSelection("haiku"),
    );
    expect(state.disabledPresets).toEqual(new Set(["sonnet", "opus"]));
    expect(state.invalid).toBe(false);
    expect(state.errorMessage).toBeNull();
  });

  it("custom selected with non-empty text and no verdict: not invalid", () => {
    const state = deriveModelRowState(verdictMap(), customSelection("zephyr"));
    expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
  });

  it("custom selected with non-empty text, recognized: not invalid", () => {
    const state = deriveModelRowState(verdictMap(recognized("zephyr")), customSelection("zephyr"));
    expect(state.invalid).toBe(false);
    expect(state.errorMessage).toBeNull();
  });

  it("custom selected with non-empty text, unchecked: not invalid (INV-4)", () => {
    const state = deriveModelRowState(verdictMap(unchecked("zephyr")), customSelection("zephyr"));
    expect(state.invalid).toBe(false);
    expect(state.errorMessage).toBeNull();
  });

  it("custom selected with non-empty text, unrecognized: invalid with its message (REQ-9)", () => {
    const state = deriveModelRowState(
      verdictMap(unrecognized("zephyr", "zephyr is bad")),
      customSelection("zephyr"),
    );
    expect(state.invalid).toBe(true);
    expect(state.errorMessage).toBe("zephyr is bad");
    // The custom field's own verdict never disables a preset radio.
    expect(state.disabledPresets.size).toBe(0);
  });

  it("custom selected with empty text: never invalid regardless of any stored verdict (nothing to look up)", () => {
    const state = deriveModelRowState(
      verdictMap(unrecognized("", "should never be read")),
      customSelection(""),
    );
    expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
  });

  it("a verdict for a custom value the developer has since edited away from is never read (REQ-13, edge case 3)", () => {
    // The in-flight request was for "zephyr"; the field now reads "other-model" — the
    // stored verdict is keyed by the old text, so the lookup for the new text simply
    // misses.
    const state = deriveModelRowState(
      verdictMap(unrecognized("zephyr", "zephyr is bad")),
      customSelection("other-model"),
    );
    expect(state).toEqual({ disabledPresets: new Set(), invalid: false, errorMessage: null });
  });

  it("an unrecognized preset stays disabled even while a custom model is selected", () => {
    const state = deriveModelRowState(
      verdictMap(unrecognized("fable", "fable is bad")),
      customSelection("zephyr"),
    );
    expect(state.disabledPresets).toEqual(new Set(["fable"]));
    expect(state.invalid).toBe(false);
  });
});

describe("VerdictStore — resetVerdictStore/applyVerdicts (W3, REQ-13)", () => {
  it("resetVerdictStore bumps the generation and clears any accumulated verdicts", () => {
    const withData = applyVerdicts(EMPTY_VERDICT_STORE, EMPTY_VERDICT_STORE.generation, [
      recognized("sonnet"),
    ]);
    const reset = resetVerdictStore(withData);
    expect(reset.generation).toBe(withData.generation + 1);
    expect(reset.verdicts.size).toBe(0);
  });

  it("applyVerdicts merges a batch when the generation still matches the store's current one", () => {
    const store = resetVerdictStore(EMPTY_VERDICT_STORE);
    const applied = applyVerdicts(store, store.generation, [
      recognized("sonnet"),
      unchecked("opus"),
    ]);
    expect(applied.verdicts.get("sonnet")).toEqual(recognized("sonnet"));
    expect(applied.verdicts.get("opus")).toEqual(unchecked("opus"));
    expect(applied.generation).toBe(store.generation);
  });

  it("two requests within the same open both accumulate onto one generation (four presets, then a restored custom model)", () => {
    const store = resetVerdictStore(EMPTY_VERDICT_STORE);
    const afterPresets = applyVerdicts(
      store,
      store.generation,
      MODEL_PRESETS.map((m) => recognized(m)),
    );
    const afterCustom = applyVerdicts(afterPresets, afterPresets.generation, [
      unrecognized("zephyr", "no"),
    ]);
    expect(afterCustom.verdicts.size).toBe(5);
    expect(afterCustom.verdicts.get("zephyr")).toEqual(unrecognized("zephyr", "no"));
    for (const m of MODEL_PRESETS) expect(afterCustom.verdicts.get(m)).toEqual(recognized(m));
  });

  it("a later verdict for the same model overwrites the earlier one", () => {
    const store = resetVerdictStore(EMPTY_VERDICT_STORE);
    const first = applyVerdicts(store, store.generation, [unchecked("sonnet")]);
    const second = applyVerdicts(first, first.generation, [recognized("sonnet")]);
    expect(second.verdicts.get("sonnet")).toEqual(recognized("sonnet"));
  });

  it("a verdict batch for a stale generation (the dialog was closed and reopened) is dropped whole", () => {
    const opened = resetVerdictStore(EMPTY_VERDICT_STORE);
    const staleGeneration = opened.generation;
    const reopened = resetVerdictStore(opened);
    // The late response from the closed dialog's request lands after the reopen.
    const result = applyVerdicts(reopened, staleGeneration, [unrecognized("fable", "stale")]);
    expect(result).toBe(reopened);
    expect(result.verdicts.size).toBe(0);
  });

  it("a stale batch never overwrites a newer generation's already-applied verdict", () => {
    const opened = resetVerdictStore(EMPTY_VERDICT_STORE);
    const staleGeneration = opened.generation;
    const reopened = resetVerdictStore(opened);
    const withFreshData = applyVerdicts(reopened, reopened.generation, [recognized("sonnet")]);
    const result = applyVerdicts(withFreshData, staleGeneration, [unrecognized("sonnet", "stale")]);
    expect(result.verdicts.get("sonnet")).toEqual(recognized("sonnet"));
  });
});
