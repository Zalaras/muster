//go:build renderfix

package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The focus feature's scenarios (web/render/focus.spec.ts), re-levelled from
// web/e2e/{effort-header,focus-header,sessions,focus-marker}.spec.ts on 2026-10-20
// (plans/_audit/relevel/focus.md). Each holds the states those display properties are
// read from: the header's bracketed effort and its warning strip, the plan
// title-crop-stop-resume-button state-table rows the give-way sweeps cover, and sessions
// that never bound a Claude id.
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"effort-header", driveEffortHeader},
		// Theme variants of one warned session: the dashboard adopts `theme` only from the
		// prefs broadcast (web/src/features/theme.ts), never from the Settings radio.
		renderScenario{"effort-warned-instrument", withPrefs(driveEffortWarned, map[string]any{"theme": "instrument"})},
		renderScenario{"effort-warned-dark", withPrefs(driveEffortWarned, map[string]any{"theme": "dark"})},
		renderScenario{"effort-warned-light", withPrefs(driveEffortWarned, map[string]any{"theme": "light"})},
		renderScenario{"focus-header-rows-a", driveFocusHeaderRows(focusRowsA)},
		renderScenario{"focus-header-rows-b", driveFocusHeaderRows(focusRowsB)},
		renderScenario{"unbound-sessions", driveUnboundSessions},
	)
}

// The status line's `model` for a model that offers effort and clamps `max` to `high`, and
// for one with no effort setting at all (kb:fact/effort-levels-per-model) — the two shapes
// web/e2e/helpers/effort.ts synthesises.
const (
	renderModelOpus45       = "claude-opus-4-5-20251101"
	renderModelOpus45Name   = "Opus 4.5"
	renderModelHaiku45Name  = "Haiku 4.5"
	renderEffortCrowdTitle  = "effort-width-with-a-rather-long-title-to-crowd-the-header"
	renderEffortWarnedTitle = "effort-clamped"
)

// launchEffort is the core rig's launch with the request's `effort`, through the same step
// so the repo's launch time is aligned to the session's as every launch's is.
func (r *renderRig) launchEffort(ctx context.Context, dir, title, model, effort string) (renderSession, error) {
	return r.launch(ctx, dir, launchOpts{title: title, model: model, effort: effort})
}

// statusEffort posts one full status line for s naming model and, when level is non-empty,
// `effort.level` — the first report the daemon checks against the launch's request.
func (r *renderRig) statusEffort(ctx context.Context, s renderSession, claudeID, dir, modelID, modelName, level string) error {
	return r.status(ctx, claudecodetest.EnvelopedStatusLineFull(claudeID, claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, CurrentDir: dir,
		ModelID: modelID, ModelDisplayName: modelName, EffortLevel: level,
	}))
}

// bindWarned launches `opus` at `max`, binds it with a SessionStart carrying no model (the
// optional field, kb:fact/sessionstart-model-optional-string) and reports `high` on Opus
// 4.5: the clamped warning `Asked for max — Opus 4.5 started at high.`
func (r *renderRig) bindWarned(ctx context.Context, dir, title, claudeID string) error {
	s, err := r.launchEffort(ctx, dir, title, "opus", "max")
	if err != nil {
		return err
	}
	if err = r.hook(ctx, claudecodetest.EnvelopedSessionStart(claudeID, claudecodetest.SessionStartOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, OmitModel: true, Cwd: dir,
	})); err != nil {
		return err
	}
	return r.statusEffort(ctx, s, claudeID, dir, renderModelOpus45, renderModelOpus45Name, "high")
}

func driveEffortWarned(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "rota", "main")
	if err != nil {
		return err
	}
	return r.bindWarned(ctx, dir, renderEffortWarnedTitle, "cs-effort-clamped")
}

// driveEffortHeader holds every effort display the header has (plan effort REQ-5 to REQ-8):
// a launch with no post yet, a bound session with none, a dead one that never reported, the
// clamped warning, the no-effort-setting warning, and a warned session with a long title.
func driveEffortHeader(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "rota", "main")
	if err != nil {
		return err
	}
	if _, err = r.launch(ctx, dir, launchOpts{title: "effort-no-post", model: "sonnet"}); err != nil {
		return err
	}
	if _, err = r.bind(ctx, dir, "cs-effort-bound", renderModelSonnet, launchOpts{title: "effort-bound"}); err != nil {
		return err
	}
	dead, err := r.bind(ctx, dir, "cs-effort-dead", renderModelSonnet, launchOpts{title: "effort-dead-never"})
	if err != nil {
		return err
	}
	if err = r.markDead(ctx, dead.id); err != nil {
		return err
	}
	if err = r.bindWarned(ctx, dir, renderEffortWarnedTitle, "cs-effort-clamped"); err != nil {
		return err
	}
	// A launch at `high` on a model with no effort setting: the first post carries no
	// `effort` key at all, so the brackets go and the strip reads "has no effort setting".
	none, err := r.launchEffort(ctx, dir, "effort-none", "haiku", "high")
	if err != nil {
		return err
	}
	if err = r.hook(ctx, claudecodetest.EnvelopedSessionStart("cs-effort-none", claudecodetest.SessionStartOpts{
		MusterSession: int(none.id), TmuxPane: none.pane, ModelID: renderModelHaiku, Cwd: dir,
	})); err != nil {
		return err
	}
	if err = r.statusEffort(ctx, none, "cs-effort-none", dir, renderModelHaiku, renderModelHaiku45Name, ""); err != nil {
		return err
	}
	return r.bindWarned(ctx, dir, renderEffortCrowdTitle, "cs-effort-crowd")
}

// focusRow is one cell of plan title-crop-stop-resume-button's state table, as
// web/e2e/focus-header.spec.ts's `Row` shaped it: a title (over 100 characters it lands
// through the status line's `session_name`, since a rename is capped there), the checkout
// it is launched in, whether it is in the group `Game`, whether Claude has moved into the
// checkout's `probe-worktree`, whether it has ended, whether it was launched in bypass
// mode (the danger chip) and whether a status line confirmed the full model id as the
// display name (the widest model readout; implied by a long title).
type focusRow struct {
	title    string
	checkout string
	grouped  bool
	moved    bool
	dead     bool
	bypass   bool
	full     bool
}

// focusCheckout is one scratch checkout of a rows scenario: its folder name and branch.
type focusCheckout struct{ folder, branch string }

type focusRows struct {
	checkouts []focusCheckout
	rows      []focusRow
}

// exactly cuts text repeated to exactly n characters, the last one never a space — the
// E2E file's `exactly`, so the fixture carries the same strings its tests did.
func exactly(text string, n int) string {
	body := strings.Repeat(text, (n+len(text)-1)/len(text))[:n-1]
	return body + "x"
}

const (
	focusTitle9   = "Game Play"
	focusFolder6  = "abc123"
	focusFolder35 = "economic-game-theory-simulation-lab"
	focusBranch4  = "main"
	// The status line that carries a long title names the full model id as the display
	// name too, the widest model readout.
	focusFullModel = renderModelHaiku
	focusWorktree  = "probe-worktree"
	focusGroup     = "Game"
	// renameCap is the daemon's title cap: a longer title lands through the status line.
	renameCap = 100
)

var (
	focusTitle29  = exactly("approve weekend shift swaps ", 29)
	focusTitle52  = exactly("rework shift-swap approval for the weekend rostering ", 52)
	focusTitle300 = exactly("a title that is far longer than any header can show ", 300)
	focusFolder60 = strings.Repeat("long-folder-name-for-wrapping-", 2)
	focusBranch80 = exactly("long-branch-name-for-wrapping-", 80)
)

// focusRowsA: the 35-character folder on `main`, the 60-character folder on the
// 80-character branch and the 6-character folder on `main`. Beside the state-table rows
// it holds, for each session the INV-6 sweeps stop, a dead twin — the same title, checkout
// and group, ended — so the header alive is compared with the header dead at every width.
var focusRowsA = focusRows{
	checkouts: []focusCheckout{
		{focusFolder35, focusBranch4}, {focusFolder60, focusBranch80}, {focusFolder6, focusBranch4},
	},
	rows: []focusRow{
		{title: focusTitle9, checkout: focusFolder35, grouped: true},
		{title: focusTitle9, checkout: focusFolder35, grouped: true, moved: true},
		{title: focusTitle52, checkout: focusFolder35, grouped: true},
		{title: focusTitle300, checkout: focusFolder35, grouped: true, dead: true},
		{title: focusTitle300, checkout: focusFolder35},
		{title: focusTitle9, checkout: focusFolder35},
		{title: focusTitle29, checkout: focusFolder35, grouped: true},
		{title: focusTitle9, checkout: focusFolder35, grouped: true, dead: true},
		{title: focusTitle29, checkout: focusFolder35, grouped: true, dead: true},
		{title: focusTitle52, checkout: focusFolder35, grouped: true, dead: true},
		{title: focusTitle300, checkout: focusFolder35, dead: true},
		{title: focusTitle300, checkout: focusFolder60, grouped: true, moved: true},
		{title: focusTitle52, checkout: focusFolder60, grouped: true, dead: true},
		{title: focusTitle9, checkout: focusFolder6},
	},
}

// focusRowsB: the 35-character folder on the 80-character branch, the 6-character folder
// on it too, and the 60-character folder on `main` — the other half of the folder × branch
// pairs, which cannot share a scratch root with A's (one folder name, one checkout).
var focusRowsB = focusRows{
	checkouts: []focusCheckout{
		{focusFolder35, focusBranch80}, {focusFolder6, focusBranch80}, {focusFolder60, focusBranch4},
	},
	rows: []focusRow{
		{title: focusTitle52, checkout: focusFolder35, grouped: true, moved: true, bypass: true},
		{title: focusTitle52, checkout: focusFolder35, grouped: true, moved: true, bypass: true, full: true},
		{title: focusTitle52, checkout: focusFolder35, grouped: true, moved: true, bypass: true, full: true, dead: true},
		{title: focusTitle9, checkout: focusFolder6, dead: true},
		{title: focusTitle300, checkout: focusFolder6},
		{title: focusTitle9, checkout: focusFolder60, grouped: true, moved: true},
	},
}

func driveFocusHeaderRows(rows focusRows) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		dirs := map[string]string{}
		worktrees := map[string]string{}
		for _, c := range rows.checkouts {
			dir, err := r.dir(ctx, c.folder, c.branch)
			if err != nil {
				return err
			}
			wt, err := r.worktree(ctx, dir, focusWorktree, "worktree-"+focusWorktree)
			if err != nil {
				return err
			}
			dirs[c.folder] = dir
			worktrees[c.folder] = wt
		}
		// markDead reloads every session from the store, which drops a derived Claude
		// location, so the dead rows end before any move is reported; the group is made
		// before the moves for the same reason; the one repo tick runs last.
		var grouped []int64
		type move struct {
			s        renderSession
			claudeID string
			wt       string
		}
		var moves []move
		for i, row := range rows.rows {
			claudeID := "cs-row-" + string(rune('a'+i))
			s, err := r.bindFocusRow(ctx, row, claudeID, dirs[row.checkout])
			if err != nil {
				return err
			}
			if row.grouped {
				grouped = append(grouped, s.id)
			}
			// A moved row that has ended holds no location (kb:spec/card-location: a dead
			// session's claudeLocation is null), as the E2E's move-then-end left it.
			switch {
			case row.dead:
				if err = r.markDead(ctx, s.id); err != nil {
					return err
				}
			case row.moved:
				moves = append(moves, move{s: s, claudeID: claudeID, wt: worktrees[row.checkout]})
			}
		}
		if _, err := r.api(ctx, http.MethodPost, "/api/groups", map[string]any{"name": focusGroup, "sessionIds": grouped}); err != nil {
			return err
		}
		for _, m := range moves {
			if err := r.hookStamped(ctx, claudecodetest.EnvelopedHookInDirectory(int(m.s.id), m.s.pane, "UserPromptSubmit", m.claudeID, m.wt)); err != nil {
				return err
			}
		}
		r.repoTick(ctx)
		return nil
	}
}

// bindFocusRow launches and binds one state-table row in dir: a title within the rename cap
// goes on the launch, a longer one (or a row wanting the full model id as display name)
// lands through a status line, and bypass mode is the launch's permission mode.
func (r *renderRig) bindFocusRow(ctx context.Context, row focusRow, claudeID, dir string) (renderSession, error) {
	opts := launchOpts{}
	if len(row.title) <= renameCap {
		opts.title = row.title
	}
	if row.bypass {
		opts.permissionMode = claudecode.PermissionBypass
	}
	s, err := r.bind(ctx, dir, claudeID, renderModelHaiku, opts)
	if err != nil {
		return s, err
	}
	if len(row.title) <= renameCap && !row.full {
		return s, nil
	}
	statusOpts := claudecodetest.StatusLineFullOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, CurrentDir: dir,
		ModelID: focusFullModel, ModelDisplayName: focusFullModel,
	}
	if len(row.title) > renameCap {
		statusOpts.SessionName = row.title
	}
	return s, r.status(ctx, claudecodetest.EnvelopedStatusLineFull(claudeID, statusOpts))
}

// driveUnboundSessions holds sessions no SessionStart ever bound: two titled and one
// untitled fresh launch (`started`, `ctx unknown`), and a dead one whose Resume has no
// Claude id to resume.
func driveUnboundSessions(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "theta", "main")
	if err != nil {
		return err
	}
	for _, title := range []string{"marker-a", "marker-b", ""} {
		if _, err = r.launch(ctx, dir, launchOpts{title: title}); err != nil {
			return err
		}
	}
	noID, err := r.launch(ctx, dir, launchOpts{title: "no-id"})
	if err != nil {
		return err
	}
	return r.markDead(ctx, noID.id)
}
