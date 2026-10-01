# Doc delta: stale-dirs-models-branches

Seeded from plan.md § Doc Delta, amended with the implementation logs' `doc-delta:` lines and the run's decisions (orchestrator, 2026-10-01).


**lifecycle** — becomes true:
- The card shows the launch directory. While the session is alive, its branch and worktree flag are re-read from it on a repo poll (default 5 s), so a checkout from anywhere shows within one tick. A dead card keeps its last-known branch.
- Where Claude is working is recorded from main-agent hooks and the status line, and is surfaced as `claudeLocation` only while Claude is in a different checkout. It is display-only, and launch and resume clear it.
- A bind naming a different model sets its display name to the id until the status line confirms one.

**lifecycle** — stops being true:
- Any sentence saying branch and worktree flag are recorded at launch and fixed.

**ingest** — becomes true: every main-agent hook's `cwd` and the status line's `workspace.current_dir` are read. `CwdChanged` stays unregistered.
**ingest** — stops being true: nothing.

**rail** — becomes true: the repo line wraps at the `/`, folder over branch, each line truncated (one line in compact). A `↳` block shows where Claude is when it works in another checkout.
**rail** — stops being true: "then the repo and branch line" as one line.

**focus** — becomes true: the meta's repo readout is folder over branch, each capped, the model never truncates, `↳` shows a move, and the repo readout and session name carry hover text.
**focus** — stops being true: "a meta line of repo and branch, model" as one line.

**tiles** — becomes true: the tile header's repo readout carries hover text, and a `↳` glyph marks a move.
**tiles** — stops being true: nothing.

**usage**, **launch**, **connection**, **actions** — No doc change (they are in **Features** for file ownership: `status.go`, `gitutil.go`, `server.go`/`main.go`/`protocol/session.ts`; **actions** added mid-run by the developer, 2026-10-01, because two of its test fixtures gained `claudeLocation: null`).

**protocol.md**: the Session object's `claudeLocation`, the refreshed `repo` comment and the `model` comment, as the Protocol Contract above.

## Amendments from the run

**lifecycle** — also becomes true: "a dead session keeps its last-known repo" holds for a repo
reading that was in flight when the session died, including one that lands after a resume; that
reading is dropped whole and the next tick reads afresh (daemon log, Fix Attempt 2). A launch
directory that is gone or not a directory keeps both `repo` and `claudeLocation` as last known.

**focus** — also becomes true (developer decision, kb:adr/focus-model-never-truncates-name-blocks-give-way;
kb:adr/focus-mainhead-wraps-to-second-row-when-narrow): the model never truncates at **any**
width. As the row narrows the `↳` block hides whole first (never half-drawn),
then the title shortens, and the repo block never hides: the mainhead wraps its surface switch and actions onto a second row as soon as the repo block
would drop below its floor, so the repo readout never vanishes and returns as the window narrows
(developer decision, review cycle 3). In the narrowest windows with the ended age or the bypass
chip (about 740 px and below) the header takes a third row. The location readout never holds room it does not
show (a `↳` block that gave way, a folder line under the floor): the model follows the location
text at every width (review cycle 4). The `↳` block may show again at a narrower width once the
header has gained a row (developer decision, review cycle 4).
The session name's hover replaces the old "Rename · clear to use Claude Code's name" title on the
Focus header (tiles keep that hint).

**protocol.md** — the `-repo-poll` daemon flag: `0` disables the timer; the poll still runs once at
start and then on a nudge only (plan amended in review cycle 1; protocol.md already says so —
verify, don't re-add).

**ingest** — unchanged from the plan: the `cwd` read lives in `internal/claudecode/interpret.go` and
`status.go`; `ingest.go` is unchanged (kb:adr/ingest-claude-cwd-read-in-interpret-only).

**actions** — no doc change (added to **Features** mid-run for two test fixtures only).

## Split (developer decision, 2026-10-01, after doc-reconcile blocked)

The lifecycle spec is at its 800-word budget, so the developer chose to split: a new feature
**card-location** (named for its existing seam, `web/e2e/card-location.spec.ts` and
`web/e2e/helpers/card-location.ts`, per kb:adr/process-one-name-per-feature) holds every
"becomes true" line listed under **lifecycle** above — the card stays on the launch directory
and its branch is refreshed by the repo poll (dead sessions and in-flight readings included), the
recorded Claude directory and `claudeLocation`, and the bind's model display name — and owns
`internal/server/reporefresh*.go`, `internal/session/location*.go`, `internal/session/repo*.go`
and the two card-location e2e files (moved out of lifecycle's globs). Lifecycle's own body
changes only by a one-line pointer to kb:spec/card-location, if it fits.
