//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The shortcuts feature's scenarios (web/render/shortcuts.spec.ts): the rail orders a chord
// indexes into — manual, attention, and manual with a pinned card ahead of the needs-input
// one — and the all-ended rail that ⌥⌘0 must leave alone.
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"shortcuts-rail", driveShortcutsRail(false)},
		// The dashboard adopts railSort only from the prefs broadcast, so the attention order
		// is a fixture of its own rather than a click in the test.
		renderScenario{"shortcuts-rail-attention", withPrefs(driveShortcutsRail(false), map[string]any{"railSort": "attention"})},
		renderScenario{"shortcuts-rail-pinned", driveShortcutsRail(true)},
		renderScenario{"ended-pair", driveEndedPair},
	)
}

// driveShortcutsRail binds three sessions in launch order — rail-a idle, rail-b idle,
// rail-c needs input — so the manual order is [a, b, c] and the attention order [c, a, b].
// pinFirst pins rail-a, putting a card ahead of the needs-input one that ⌥⌘1 reaches and
// ⌥⌘0 skips.
func driveShortcutsRail(pinFirst bool) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		first, err := r.idleSession(ctx, "rail-a")
		if err != nil {
			return err
		}
		if _, err = r.idleSession(ctx, "rail-b"); err != nil {
			return err
		}
		if _, err = r.blockedSession(ctx, "rail-c"); err != nil {
			return err
		}
		if !pinFirst {
			return nil
		}
		_, err = r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", first.id), map[string]any{"pinned": true})
		return err
	}
}

// workingSession launches a session titled name in a checkout of the same name, binds
// Claude session cs-<name> and submits its first prompt — the step before idle (a Stop) or
// needs input (a permission prompt), as the state machine orders them.
func (r *renderRig) workingSession(ctx context.Context, name string) (renderSession, error) {
	dir, err := r.dir(ctx, name, "main")
	if err != nil {
		return renderSession{}, err
	}
	s, err := r.bind(ctx, dir, "cs-"+name, renderModelSonnet, launchOpts{title: name})
	if err != nil {
		return renderSession{}, err
	}
	return s, r.promptSubmit(ctx, s, "cs-"+name)
}

// idleSession is workingSession stopped: idle since the Stop's stamp.
func (r *renderRig) idleSession(ctx context.Context, name string) (renderSession, error) {
	s, err := r.workingSession(ctx, name)
	if err != nil {
		return s, err
	}
	return s, r.hookStamped(ctx, claudecodetest.RawStop("cs-"+name, claudecodetest.StopOpts{}))
}

// blockedSession is workingSession at a permission prompt: needs input since the
// notification's stamp.
func (r *renderRig) blockedSession(ctx context.Context, name string) (renderSession, error) {
	s, err := r.workingSession(ctx, name)
	if err != nil {
		return s, err
	}
	return s, r.hookStamped(ctx, claudecodetest.RawNotification("cs-"+name, "p1", "permission_prompt"))
}

// driveEndedPair ends two idle sessions a second apart — ended-old first, ended-new last —
// so "most recently ended" is a different card from the first in rail order.
func driveEndedPair(ctx context.Context, r *renderRig) error {
	for _, name := range []string{"ended-old", "ended-new"} {
		s, err := r.idleSession(ctx, name)
		if err != nil {
			return err
		}
		if err := r.markDead(ctx, s.id); err != nil {
			return err
		}
	}
	return nil
}
