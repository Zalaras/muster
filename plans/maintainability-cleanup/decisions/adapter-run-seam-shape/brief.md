# Decision brief: adapter-run-seam-shape

**Question**: Which single shape should every subprocess-running adapter's test seam take, to be written into `docs/conventions.md` § Testing and applied to all adapters?
**Source**: `plans/maintainability-cleanup/review.maintainability.c-adapters.md` Major 1 (adapters reviewer, 2026-09-23). The developer asked for it to be debated on 2026-09-24.
**Option A**: The constructor-default shape (today's `tmux` and `locate`, the package exemplars). Each adapter type sets its production run func inside its own constructor, as an unexported function. Tests override it through the type's field or an unexported option in the same package. The composition root never passes a run func. There is one signature per output need.
**Option B**: The root-injected shape (today's `claudecode`, `ghissue`, `selfupdate`). Each adapter exports its production run function, and the composition root (`internal/server/server.go`, `cmd/musterd`) passes it into the constructor or call. There is one signature per output need, and no two exported run functions share a name with different signatures.

## Pinned reading list (both advocates read all of it before turn 1)
- `plans/maintainability-cleanup/review.maintainability.c-adapters.md`: Major 1 (quoted below) plus Minors 1, 2 and 3 (gitutil, InstalledVersion and runCapture seams, which the chosen shape must also cover)
- `docs/conventions.md` § Testing (the run-func bullet, which names SpotlightFinder, tmux's preflighter and Client, and claudecode's execFunc), § Design ("seams where a test needs one and nowhere else"), § Composition roots, and § Go (the WaitDelay bullet)
- `docs/adr/process-composition-roots-registration-only.md`
- `internal/tmux/tmux.go` (Client, `exec` field, New), `internal/tmux/preflight.go`, and `internal/tmux/CLAUDE.md` (exemplar)
- `internal/locate/spotlight.go` and `internal/locate/CLAUDE.md` (exemplar)
- `internal/claudecode/credentials.go` (`execFunc`, `RunCommand`, `KeychainTokenReader`) and `internal/claudecode/modelcheck.go` (`ModelCheckRun`, `RunModelCheck`)
- `internal/ghissue/ghissue.go` (`execFunc`, `RunCommand`)
- `internal/selfupdate/exeversion.go` (`ProbeVersion`, `RunVersionProbe`)
- the root wiring: `rg -n 'RunCommand|RunModelCheck|RunVersionProbe' internal/server cmd` and `internal/server/server.go` `New`
- how tests use each seam today: `rg -ln 'exec\s*=|execFunc|runMdfind|RunCommand' --glob '*_test.go' internal`
- `docs/diagrams/daemon-components.md` (leaf adapters import nothing internal)

## The issue, verbatim
> **[daemon-impl]** The subprocess run-func seam, which conventions § Testing names as the model, comes in five shapes across the adapters, wired two opposite ways. claudecode/credentials.go:27 is an unexported `execFunc(ctx, name, args...) ([]byte, error)` returning stdout, taken as a parameter by the exported `KeychainTokenReader(user string, run execFunc)`. claudecode/modelcheck.go:34 is an exported `ModelCheckRun(ctx, dir, argv []string) ([]byte, error)` returning stderr, passed per call. ghissue/ghissue.go:53 is `execFunc(ctx, name, args...) (stdout, stderr string, err error)`. selfupdate/exeversion.go:27 is an anonymous `func(ctx, name, args...) (string, error)` passed per call. tmux/tmux.go:33, tmux/preflight.go:26 and locate/spotlight.go:19 hold `[]byte` fields. The wiring differs too: tmux and locate set their production default inside their own constructor (`tmux.New` → `execCombinedOutput`, `NewSpotlightFinder` → `runMdfind`, both unexported), while claudecode, ghissue and selfupdate export their production function for the composition root to pass in (`internal/server/usage.go:77` `claudecode.RunCommand`, `internal/server/issue.go:519` `ghissue.RunCommand`, `internal/server/server.go:193` `claudecode.RunModelCheck`, `cmd/musterd/main.go:445` `selfupdate.RunVersionProbe`). Two exported functions share the name `RunCommand` with different signatures. … A fix must make true: the adapters share one seam convention (where the production default is set, whether the production function is exported, one signature per output need), and no two exported production run functions share a name with different signatures. If the convention is not the tmux/locate shape, conventions § Testing must say which one it is.

(File:line numbers are from 2026-09-23. D6, D7a and D8 have since moved some wiring, so re-find the current lines with `rg`.)

## Constraints for both sides
- Leaf adapters import nothing internal (the diagram).
- Composition roots are registration-only (the ADR).
- `WaitDelay` stays inline next to each command (conventions § Go).
- Tests cross the subprocess boundary through the seam, never through a `$PATH` shim.
- Argue from what a newcomer has to learn, where a production default can be forgotten, how a cross-package test (for example `internal/server` testing issue filing) injects a fake, and how much wiring the root carries.

## Rules
Up to 3 turns each, ≤400 words per turn. advocate-a-seam opens. Argue from the pinned docs and measurable consequences, cite file:line, steelman before rebutting, and concede when convinced. Append each turn to `debate.md` before sending it. The author of the ending turn reports once to `main`. Agent names are advocate-a-seam (Option A) and advocate-b-seam (Option B).
