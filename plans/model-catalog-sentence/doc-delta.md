# Doc delta: model-catalog-sentence

Seeded from plan.md § Doc Delta. The orchestrator then amended it per review cycle 1, correctness Minor 1 `[orchestrator]`.

**launch** (becomes true): the model pre-check counts a model as unrecognised when stderr carries either the pre-2.1.299 sentence (kb:fact/model-catalog-precheck-zero-token, now retired) or the 2.1.299+ one (kb:fact/unknown-model-warning-names-assumed-window). It does not consult the installed version (kb:adr/launch-model-check-matches-either-catalog-sentence).

**protocol** (`docs/protocol.md`, the models verdict comment):
- `recognized` (becomes true): the installed binary printed neither unknown-model sentence. Cite kb:fact/unknown-model-warning-names-assumed-window alongside the retired kb:fact/model-catalog-precheck-zero-token.
- `unrecognized` (becomes true): stderr carried either unknown-model sentence.
- Stops being true: "its stderr carried the catalog sentence", which names only one of the two.
