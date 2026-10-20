//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The rail feature's scenarios (web/render/rail.spec.ts): the card menu over every kind of
// card, the ended-cards order, the strip beside a full grid, the background-task line, the
// three densities over long text, the unread marker and the attention order, and the
// activity line under its prefs. Appended in init so the core list stays untouched.
func init() {
	renderScenarios = append(renderScenarios,
		// One live bound card and four ended ones — plain, pinned, in the group `review`, and
		// one that never bound a Claude session — the states the right-click menu's items
		// depend on. The ended cards end a second apart, plain first.
		renderScenario{"rail-menu-cards", driveRailMenuCards},
		// A live card ahead of two ended ones under attention sort: the ended cards sort after
		// every live one, most recently ended first.
		renderScenario{"rail-ended-order", withPrefs(driveRailEndedOrder, map[string]any{"railSort": "attention"})},
		// Six idle sessions in Tiles, the last pinned: the 2×2 grid takes the four longest idle,
		// the strip holds tile-6 then tile-5 in the rail's own order.
		renderScenario{"rail-strip-order", withPrefs(driveTilesIdle(sixTiles, "tile-6"), tilesView)},
		// Six idle sessions in Tiles, the last ended: the strip holds a live card and an ended one.
		renderScenario{"rail-strip-menu", withPrefs(driveRailStripMenu, tilesView)},
		// shortcuts-rail-pinned under attention sort: the pinned idle card leads the needs-input one.
		renderScenario{"rail-pinned-attention", withPrefs(driveShortcutsRail(true), map[string]any{"railSort": "attention"})},
		// The background-task line: one running shell, two running beside a finished one, a
		// running one on a card that has since ended, and a card with none.
		renderScenario{"rail-bg-tasks", driveRailBgTasks},
		// The density ramp over a wrapping title, a three-line reply, a short and a long reply,
		// a known and an unknown context, under each rail density.
		renderScenario{"rail-density", driveRailDensity},
		renderScenario{"rail-density-compact", withPrefs(driveRailDensity, map[string]any{"railDensity": "compact"})},
		renderScenario{"rail-density-expanded", withPrefs(driveRailDensity, map[string]any{"railDensity": "expanded"})},
		// A working session beside an unread idle one: ⌥⌘0 prefers the unread idle card.
		renderScenario{"rail-unread-pair", driveRailUnreadPair},
		// One session per attention band, launched in the reverse of the attention order so the
		// sort is told apart from launch order; the read idle one was marked seen the way an
		// attach does.
		renderScenario{"rail-attention-order", withPrefs(driveRailAttentionOrder, map[string]any{"railSort": "attention"})},
		// groups-titled with alpha-one pinned, under attention sort: a drop inside a card's own
		// section changes nothing there.
		renderScenario{"rail-groups-pinned-attention", withPrefs(driveRailGroupsPinned, map[string]any{"railSort": "attention"})},
		// `railActivity: both` over a card with no turn yet, one mid-turn and one whose turn closed.
		renderScenario{"rail-activity-both", withPrefs(driveRailActivityBoth, map[string]any{"railActivity": "both"})},
		// A failed turn after a successful one: the last reply is the earlier turn's.
		renderScenario{"rail-activity-failed", driveRailActivityFailed},
	)
}

var sixTiles = []string{"tile-1", "tile-2", "tile-3", "tile-4", "tile-5", "tile-6"}

// endedTitled is bindTitled followed by the liveness end, a bound session Resume can act on.
func (r *renderRig) endedTitled(ctx context.Context, title string) (renderSession, error) {
	s, err := r.bindTitled(ctx, title)
	if err != nil {
		return s, err
	}
	return s, r.markDead(ctx, s.id)
}

func (r *renderRig) pin(ctx context.Context, s renderSession) error {
	_, err := r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", s.id), map[string]any{"pinned": true})
	return err
}

func driveRailMenuCards(ctx context.Context, r *renderRig) error {
	if _, err := r.bindTitled(ctx, "menu-live"); err != nil {
		return err
	}
	if _, err := r.endedTitled(ctx, "menu-plain"); err != nil {
		return err
	}
	pinned, err := r.endedTitled(ctx, "menu-pinned")
	if err != nil {
		return err
	}
	if err = r.pin(ctx, pinned); err != nil {
		return err
	}
	grouped, err := r.endedTitled(ctx, "menu-group")
	if err != nil {
		return err
	}
	if _, err = r.createGroup(ctx, "review", []renderSession{grouped}); err != nil {
		return err
	}
	unbound, err := r.launchTitled(ctx, "menu-unbound")
	if err != nil {
		return err
	}
	return r.markDead(ctx, unbound[0].id)
}

func driveRailEndedOrder(ctx context.Context, r *renderRig) error {
	if _, err := r.bindTitled(ctx, "sort-live"); err != nil {
		return err
	}
	for _, title := range []string{"sort-ended-first", "sort-ended-second"} {
		if _, err := r.endedTitled(ctx, title); err != nil {
			return err
		}
	}
	return nil
}

func driveRailStripMenu(ctx context.Context, r *renderRig) error {
	var last renderSession
	for _, name := range sixTiles {
		s, err := r.idleSession(ctx, name)
		if err != nil {
			return err
		}
		last = s
	}
	return r.markDead(ctx, last.id)
}

// stoppedWith closes one turn of a bound, titled session with the given Stop.
func (r *renderRig) stoppedWith(ctx context.Context, title string, stop claudecodetest.StopOpts) (renderSession, error) {
	s, err := r.bindTitled(ctx, title)
	if err != nil {
		return s, err
	}
	if err = r.promptSubmit(ctx, s, "cs-"+title); err != nil {
		return s, err
	}
	return s, r.hookStamped(ctx, claudecodetest.RawStop("cs-"+title, stop))
}

func driveRailBgTasks(ctx context.Context, r *renderRig) error {
	if _, err := r.stoppedWith(ctx, "bgtasks-one", claudecodetest.StopOpts{RunningShells: 1}); err != nil {
		return err
	}
	if _, err := r.stoppedWith(ctx, "bgtasks-two", claudecodetest.StopOpts{RunningShells: 2, CompletedShells: 1}); err != nil {
		return err
	}
	ended, err := r.stoppedWith(ctx, "bgtasks-ended", claudecodetest.StopOpts{RunningShells: 1})
	if err != nil {
		return err
	}
	if err = r.markDead(ctx, ended.id); err != nil {
		return err
	}
	_, err = r.bindTitled(ctx, "bgtasks-none")
	return err
}

const (
	// railLongTitle wraps past one line in the rail's column (web/e2e/rail-layout.spec.ts E11).
	railLongTitle = "a very long session title that should need more than one line to display in full at the rail's fixed column width"
	// railLongReply stays under the adapter's 200-character cut so the line's full text is known.
	railLongReply = "the retry logic now backs off exponentially and logs each attempt with its delay, " +
		"the flaky assertion in the queue drain test was rewritten to poll instead of sleep, " +
		"and the suite passed twice"
	railLongerReply = "a very long assistant reply that needs to run past three lines even in the widest " +
		"rail column this suite ever measures, repeated with enough words to guarantee it " +
		"overflows regardless of viewport width or font metrics on the run machine"
)

func driveRailDensity(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "wrap-repo", "main")
	if err != nil {
		return err
	}
	if _, err = r.launch(ctx, dir, launchOpts{title: railLongTitle}); err != nil {
		return err
	}
	if _, err = r.stoppedWith(ctx, "density-clamp-e1", claudecodetest.StopOpts{LastAssistantMessage: railLongReply}); err != nil {
		return err
	}
	if _, err = r.stoppedWith(ctx, "density-ramp-short", claudecodetest.StopOpts{LastAssistantMessage: "done"}); err != nil {
		return err
	}
	if _, err = r.stoppedWith(ctx, "density-ramp-long", claudecodetest.StopOpts{LastAssistantMessage: railLongerReply}); err != nil {
		return err
	}
	known, err := r.bindTitled(ctx, "density-e3-known")
	if err != nil {
		return err
	}
	used := 42.0
	if err = r.status(ctx, claudecodetest.EnvelopedStatusLineFull("cs-density-e3-known", claudecodetest.StatusLineFullOpts{
		MusterSession: int(known.id),
		TmuxPane:      known.pane,
		ModelID:       renderModelSonnet,
		UsedPct:       &used,
	})); err != nil {
		return err
	}
	_, err = r.launchTitled(ctx, "density-e6-unknown")
	return err
}

func driveRailUnreadPair(ctx context.Context, r *renderRig) error {
	if _, err := r.workingSession(ctx, "e6-working"); err != nil {
		return err
	}
	_, err := r.idleSession(ctx, "e6-unread")
	return err
}

// markSeen clears a session's unread flag the way an attach does, as a step of its own.
func (r *renderRig) markSeen(ctx context.Context, id int64) error {
	r.freshSecond()
	defer r.stepDone()
	return r.srv.manager.MarkSeen(ctx, id)
}

func driveRailAttentionOrder(ctx context.Context, r *renderRig) error {
	read, err := r.idleSession(ctx, "order5-ri")
	if err != nil {
		return err
	}
	if err = r.markSeen(ctx, read.id); err != nil {
		return err
	}
	if _, err = r.workingSession(ctx, "order5-w"); err != nil {
		return err
	}
	dir, err := r.dir(ctx, "order5-pl", "main")
	if err != nil {
		return err
	}
	if _, err = r.bind(ctx, dir, "cs-order5-pl", renderModelSonnet, launchOpts{title: "order5-pl", permissionMode: claudecode.PermissionPlan}); err != nil {
		return err
	}
	if err = r.hook(ctx, claudecodetest.RawUserPromptSubmit("cs-order5-pl", claudecodetest.PromptSubmitOpts{PermissionMode: claudecode.PermissionPlan})); err != nil {
		return err
	}
	if _, err = r.bindTitled(ctx, "order5-st"); err != nil {
		return err
	}
	if _, err = r.idleSession(ctx, "order5-ui"); err != nil {
		return err
	}
	failed, err := r.bindTitled(ctx, "order5-f")
	if err != nil {
		return err
	}
	if err = r.driveToState(ctx, failed, "order5-f", "failed"); err != nil {
		return err
	}
	_, err = r.blockedSession(ctx, "order5-ni")
	return err
}

func driveRailGroupsPinned(ctx context.Context, r *renderRig) error {
	sessions, err := r.launchTitled(ctx, "alpha-one", "alpha-two", "bravo-one", "loose-one")
	if err != nil {
		return err
	}
	if _, err = r.createGroup(ctx, "Alpha", sessions[0:2]); err != nil {
		return err
	}
	if _, err = r.createGroup(ctx, "Bravo", sessions[2:3]); err != nil {
		return err
	}
	return r.pin(ctx, sessions[0])
}

// promptWith submits one prompt with its text on a bound, titled session.
func (r *renderRig) promptWith(ctx context.Context, title, promptID, prompt string) error {
	return r.hook(ctx, claudecodetest.RawUserPromptSubmit("cs-"+title, claudecodetest.PromptSubmitOpts{PromptID: promptID, Prompt: prompt}))
}

func driveRailActivityBoth(ctx context.Context, r *renderRig) error {
	if _, err := r.bindTitled(ctx, "both-none"); err != nil {
		return err
	}
	if _, err := r.bindTitled(ctx, "both-prompt"); err != nil {
		return err
	}
	if err := r.promptWith(ctx, "both-prompt", "p1", "do it"); err != nil {
		return err
	}
	if _, err := r.bindTitled(ctx, "both-reply"); err != nil {
		return err
	}
	if err := r.promptWith(ctx, "both-reply", "p1", "do it"); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStop("cs-both-reply", claudecodetest.StopOpts{LastAssistantMessage: "ok, done"}))
}

func driveRailActivityFailed(ctx context.Context, r *renderRig) error {
	if _, err := r.bindTitled(ctx, "activity-failed"); err != nil {
		return err
	}
	if err := r.promptWith(ctx, "activity-failed", "p1", "try this"); err != nil {
		return err
	}
	if err := r.hookStamped(ctx, claudecodetest.RawStop("cs-activity-failed", claudecodetest.StopOpts{PromptID: "p1", LastAssistantMessage: "here's an attempt"})); err != nil {
		return err
	}
	if err := r.promptWith(ctx, "activity-failed", "p2", "try again"); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStopFailure("cs-activity-failed", claudecodetest.StopFailureOpts{PromptID: "p2", LastAssistantMessage: "hit an error"}))
}
