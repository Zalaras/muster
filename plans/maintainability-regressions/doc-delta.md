# Doc delta: maintainability-regressions

Seeded from `plan.md` § Doc Delta, then amended by the orchestrator with what the fix waves
changed (review cycles 1–3, `decisions/model-refusal-message-placement`). `plan.md` stays as
approved; this file is what doc-reconcile promotes.

## launch — becomes true

- `docs/features/launch/spec.md` § What launch does: when the New Session dialog opens, it asks
  the daemon (`kb:anchor/models.check`) whether the installed Claude Code recognises each of the
  four presets, and asks again for a restored non-preset model. A preset it does not recognise,
  and that is not selected, is disabled. A selected model it does not recognise stays selected,
  is marked invalid with the reason under the Model row (`#model-error`), and blocks Launch
  until another is picked. Verdicts are cached in the daemon against the resolved `claude`
  binary's path, size and modification time, so a Claude Code update re-checks; concurrent
  requests for one model share one check run. Launch reads the same cache and refuses an
  unrecognised model with `model_unrecognized`. A check that cannot run (an error, a timeout,
  or a binary that cannot be resolved) yields `unchecked`, lets the launch proceed and is not
  cached (kb:adr/launch-model-check-cached-per-binary-identity,
  kb:adr/launch-unrecognized-model-marked-blocks-launch).
  - *Fold-in (review cycle 1 decision, kb:adr/launch-model-refusal-shown-in-field-error-only):*
    a Launch refused with `model_unrecognized` shows its message only in `#model-error` —
    never also in the dialog's `#launch-error` line, which keeps the dialog's other errors.
    Editing the custom text or picking another model clears the mark and the message.
  - *Fold-in (review cycles 1–3):* after a launch-time `model_unrecognized` refusal, focus
    moves to the invalid control (the custom input or the refused preset's radio), wherever
    focus was, because `#model-error` is not a live region and the control is described by the
    message. A refusal from a dialog the developer cancelled and reopened is ignored entirely,
    focus included. A verdict from the dialog-open request never moves focus off a control that
    stays enabled; only a focused Launch it disables hands focus to the invalid control.
  - *Fold-in (review cycle 1, daemon-impl doc-delta):* every in-code citation of the
    superseded `kb:adr/launch-refuses-model-outside-binary-catalog` for the fail-open rationale
    now cites `kb:adr/launch-model-check-cached-per-binary-identity`; the spec's citation for
    the fail-open sentence moves the same way.
- `docs/features/launch/spec.md` "One launch, end to end": the pre-check step is the plan's
  § Diagrams delta (dialog-open `GET /api/models` → cache → adapter check on a miss, then
  `POST /api/sessions` reading the cache, normally a hit).
- `docs/protocol.md`: the `GET /api/models` section (anchor `models.check`) and the
  `POST /api/sessions` pre-check paragraph as in the plan's Protocol Contract; the feature
  spec's frontmatter protocol list names `models.check`. *(Already merged at plan approval —
  verify, do not re-add.)*

## launch — stops being true

- § What launch does: "Before anything is written, the launch checks the model … with a
  zero-token `--bare` run" as the only check, run on every launch, and its citation of
  `kb:adr/launch-refuses-model-outside-binary-catalog`. Replaced by the cached-verdict sentence
  above.
- `docs/protocol.md` `POST /api/sessions` pre-check: "the daemon runs `claude --bare
  --no-session-persistence --model <model> -p ""` in `directory`". *(Verify it is gone.)*
- Any spec sentence saying a `model_unrecognized` refusal shows in the dialog's launch error
  line (`#launch-error`).

## ingest — becomes true

- `docs/features/ingest/spec.md` § Transport: "The wrappers live in the data directory and are
  rewritten at every daemon start" becomes "…and are replaced atomically at daemon start when
  their content changed, so a hook never runs a partly written script"
  (kb:adr/ingest-wrapper-scripts-replaced-atomically). The same write path (write to a temp file
  in the same directory, fsync, rename; skip when unchanged) also writes the project-scoped
  `settings.local.json` at launch.

## ingest — stops being true

- nothing else.

## Orchestrator-owned (already done, listed for completeness — do not edit)

- `docs/design/design-system.md` §5 — the invalid-field pattern (commit b92ef54).
- `docs/diagrams/containers.md`, `docs/diagrams/web-components.md` — updated in review cycle 1.
