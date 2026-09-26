// Pure decisions for the launch dialog's model-catalog check
// (kb:adr/launch-model-check-cached-per-binary-identity, kb:adr/launch-unrecognized-model-marked-blocks-launch)
// — used only by features/launch.ts, its one caller, so this lives beside it rather than
// in render/ or sessions/ (docs/conventions.md § Composition roots; same shape as
// launchcrumbs.ts/launchrestore.ts).
import type { ModelVerdict } from "../api/launch";
import type { ModelRowState, ModelSelection } from "../render/launch";

/** The launch form's model presets — the one place this list is written; `launch.ts`'s
 * radio guard and `index.html`'s markup both name the same four values. */
export const MODEL_PRESETS = ["sonnet", "opus", "haiku", "fable"] as const;
export type ModelPreset = (typeof MODEL_PRESETS)[number];

export function isPresetModel(value: string): value is ModelPreset {
  return (MODEL_PRESETS as readonly string[]).includes(value);
}

export type ModelVerdicts = ReadonlyMap<string, ModelVerdict>;

/** The Model row's whole derived state from (verdicts so far, current selection) — the
 * one seam unit-tested against `deriveModelRowState`. `features/launch.ts` recomputes this
 * on every verdict arrival and every selection change; `render/launch.ts` draws whatever it
 * returns onto the DOM. */
export function deriveModelRowState(
  verdicts: ModelVerdicts,
  selection: ModelSelection,
): ModelRowState {
  const disabledPresets = new Set<string>();
  for (const preset of MODEL_PRESETS) {
    const isCurrentSelection = !selection.isCustom && selection.selected === preset;
    if (!isCurrentSelection && verdicts.get(preset)?.verdict === "unrecognized") {
      disabledPresets.add(preset);
    }
  }
  const selectedVerdict = selection.selected ? verdicts.get(selection.selected) : undefined;
  const invalid = selectedVerdict?.verdict === "unrecognized";
  return {
    disabledPresets,
    invalid,
    errorMessage: invalid ? (selectedVerdict?.message ?? null) : null,
  };
}

/** The accumulated verdicts for one dialog "session" plus the generation that owns them —
 * `resetVerdictStore` bumps the generation on every open, so a response still in flight
 * from a closed dialog is dropped whole rather than merged. A request within the *same*
 * open (the four presets, then a restored custom model) shares one generation and simply
 * accumulates — only a fresh open invalidates. */
export interface VerdictStore {
  generation: number;
  verdicts: ModelVerdicts;
}

export const EMPTY_VERDICT_STORE: VerdictStore = { generation: 0, verdicts: new Map() };

/** Call once per dialog open — never per verdict request within that open. */
export function resetVerdictStore(store: VerdictStore): VerdictStore {
  return { generation: store.generation + 1, verdicts: new Map() };
}

/** Merges `models` into `store` iff `generation` still matches — the caller captures
 * `store.generation` at request time and passes it back here when the response lands, the
 * same "capture a counter, compare on arrival" idiom as `features/launch.ts`'s own
 * `navigate()`/`browseRequestId` (`rg -n "requestId !== browseRequestId" web/src` — one
 * hit, that guard), applied at dialog-open granularity instead of per-navigation. */
export function applyVerdicts(
  store: VerdictStore,
  generation: number,
  models: readonly ModelVerdict[],
): VerdictStore {
  if (generation !== store.generation) return store;
  const verdicts = new Map(store.verdicts);
  for (const model of models) verdicts.set(model.model, model);
  return { ...store, verdicts };
}
