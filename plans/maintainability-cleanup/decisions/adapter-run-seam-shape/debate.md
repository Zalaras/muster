# Debate: adapter-run-seam-shape

### Turn 1 — advocate-a (argument)

Steelman of B: an exported run func lets a test in *any* package reach the subprocess boundary, and the root makes every process dependency visible in one place.

**1. Under B the production default can be forgotten, silently, and already needed a guard.** `updatemanager.go:209` returns early when `m.exeRun == nil`, so a root that omits `ExeRun` turns swap detection off with no error. `cmd/musterd/main_test.go:329` exists only to catch that (`assert.NotNil(t, cfg.Update.ExeRun, ...)`). Under A the constructor sets the default (`tmux.go:41`, `spotlight.go:25-31`, `preflight.go:31-33`), so there is nothing to forget and no guard test to write.

**2. Cross-package tests do not inject at the run func today, even where B is in force.** Every `internal/server` fake sits one level up, at the consumer: the launcher replaces its `checkModel` closure (`sessions_test.go:564-580`) rather than `RunModelCheck`; usage and issue tests switch readers through `TokenFile` (`usage.go:70-73`, `issue.go:87-91`); tmux is faked through the `paneSpawner` port. The one exception is `update_test.go:364`, and it overrides the server's own `updateManagerConfig.ExeRun`, a consumer field. § Design line 124 asks for "small interfaces at the consumer; seams where a test needs one and nowhere else". Under B, `claudecode.RunCommand`, `ghissue.RunCommand` and `RunModelCheck` are exported only to be passed back into their own package. `rg` finds no test outside the owning package that uses them.

**3. B makes the root carry wiring the ADR forbids.** The ADR says roots "build dependencies and register each feature in one line". `ExeRun` now threads `main.go:434` → `UpdateConfig.ExeRun` (`update.go:40`) → `updateManagerConfig.ExeRun` (`updatemanager.go:44`) → `m.exeRun` (`:62`). That is four declarations for a value no production caller ever varies.

**4. A covers every shape the Minors need, using an exemplar that already exists.** For a function-shaped API, `Preflight(ctx)` (`preflight.go:136-138`) is exported with no seam and delegates to an unexported `preflighter` with fields. `CheckModel`, `ProbeVersion`, `KeychainTokenReader`, `GhCLITokenReader` and `InstalledVersion` (Minor 2) can take that same form. For gitutil (Minor 1), B leaves `reader_test.go:163-167` faking git's `-z` byte stream from `internal/server`. That is git argv knowledge outside the adapter, which Minor 1 forbids. Under A, server fakes a neutral `listFiles` result at its consumer instead. runCapture (Minor 3) becomes a second `Client` field with a stdout/stderr signature, and either option handles that the same way.

In my reading, a newcomer then learns one rule: "the constructor sets it, and same-package tests overwrite it". Under B they have to learn which exported function to pass and through how many hops.

### Turn 2 — advocate-b (concession)

Steelman of A: B's only real benefit would be letting a test in another package fake the subprocess boundary. No test does that. Every cross-package fake already sits at a consumer port, as § Design:124 and § Go ("Interfaces live where they are *consumed*") ask. Meanwhile B's export-and-pass costs a forgettable default and extra wiring hops.

I checked this and it holds. `rg 'RunCommand|RunModelCheck|RunVersionProbe|KeychainTokenReader\(|GhCLITokenReader\(|ProbeVersion\(' --glob '*_test.go'` finds no fake injected through an exported run func outside the owning package. One correction to the brief's framing: `test/canary/live_test.go:42` and `test/canary/harness_test.go:783,789` do call these functions from outside the package. They pass only the production value, though (`claudecode.RunCommand`, `claudecode.RunModelCheck`). That supports A: under B, every out-of-package caller has to hand the default back in, and under A they would call `CheckModel(ctx, bin, dir, model)` directly.

`updatemanager.go:209` (`m.exeRun == nil` → return) together with its guard `cmd/musterd/main_test.go:329` is a measured case where B's default was forgettable and failed silently. I had planned to answer that positional parameters make forgetting a compile error. That covers only part of it. The config-field path exists today, and the root still carries a value no production caller varies. Two further points close it:
- Conventions § Testing:163 already says the run func lives "on the type that owns it", which is A's placement.
- For Minor 1, B would have server tests fake git's byte stream (`reader_test.go:163-167`), and that is the git knowledge Minor 1 wants moved back into gitutil.

I concede: no cross-package test uses an exported run func. Cross-package fakes already live at consumer ports (`sessions_test.go:564-580` `checkModel`, `TokenFile`, `paneSpawner`, the server-owned `ExeRun`), so exporting production run funcs buys nothing. It also creates a forgettable, silently nil default (`updatemanager.go:209`, guarded only by `main_test.go:329`). A, the constructor default with an exported no-seam wrapper over an unexported struct in the `Preflight` shape, meets every Minor and the existing wording of conventions § Testing.
