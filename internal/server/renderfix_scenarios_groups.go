//go:build renderfix

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The groups feature's scenarios (web/render/groups.spec.ts): rail sections with titled
// members, so the specs' locators read the card a title names, as the E2E journeys' do.
// Appended in init so the core list in renderfix_scenarios.go is never edited here.
func init() {
	renderScenarios = append(renderScenarios,
		// Two groups and a loose session, every one titled, all `started` (launched, no
		// hook) as `launchTitled` leaves them: Alpha [alpha-one, alpha-two], Bravo
		// [bravo-one], Ungrouped [loose-one]. The variant holds the same state under the
		// other sort.
		renderScenario{"groups-titled", driveGroupsTitled(false)},
		renderScenario{"groups-titled-attention", withPrefs(driveGroupsTitled(false), map[string]any{"railSort": "attention"})},
		// The header summary and popover: a group with a member in every state the summary
		// orders (needs input, failed, started, working ×2, idle, ended), a group of three
		// states with one title each, an empty group, and an Ungrouped section every
		// session has left.
		renderScenario{"groups-summary", driveGroupsSummary},
		// The same titled state with the first section (Alpha) collapsed through the real
		// `PUT /api/groups/{id}`, under each sort: the chords count displayed cards and the
		// page load's default focus skips the folded section.
		renderScenario{"groups-titled-collapsed", driveGroupsTitled(true)},
		renderScenario{"groups-titled-collapsed-attention", withPrefs(driveGroupsTitled(true), map[string]any{"railSort": "attention"})},
		// One group, Hidden [hidden-one needs_input], beside two ungrouped `started` sessions
		// (loose-one, loose-two): ⌥⌘0 reaches a grouped session the Ungrouped filter hides,
		// and a dialog over the rail keeps ⌥⌘1 and ⌥⌘0 inert.
		renderScenario{"groups-needs-input", driveGroupsNeedsInput},
		// The Focus header's group control at every width: two sessions under the 65-character
		// fit title, in checkouts `muster-app` (a folder longer than the repo block's 8-character
		// floor) and `muster` (exactly the floor) on `main`, both in the group Wide control.
		renderScenario{"groups-focus-header", driveGroupsFocusHeader},
	)
}

func driveGroupsNeedsInput(ctx context.Context, r *renderRig) error {
	hidden, err := r.bindTitled(ctx, "hidden-one")
	if err != nil {
		return err
	}
	if err = r.driveToState(ctx, hidden, "hidden-one", "needs_input"); err != nil {
		return err
	}
	if _, err = r.launchTitled(ctx, "loose-one", "loose-two"); err != nil {
		return err
	}
	_, err = r.createGroup(ctx, "Hidden", []renderSession{hidden})
	return err
}

func driveGroupsFocusHeader(ctx context.Context, r *renderRig) error {
	var members []renderSession
	for _, folder := range []string{"muster-app", "muster"} {
		dir, err := r.dir(ctx, folder, "main")
		if err != nil {
			return err
		}
		s, err := r.launch(ctx, dir, launchOpts{title: renderFitTitle})
		if err != nil {
			return err
		}
		members = append(members, s)
	}
	_, err := r.createGroup(ctx, "Wide control", members)
	return err
}

// createGroup posts one group through the real endpoint and returns its id.
func (r *renderRig) createGroup(ctx context.Context, name string, members []renderSession) (int64, error) {
	ids := make([]int64, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.id)
	}
	raw, err := r.api(ctx, http.MethodPost, "/api/groups", map[string]any{"name": name, "sessionIds": ids})
	if err != nil {
		return 0, err
	}
	var group struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(raw, &group); err != nil {
		return 0, err
	}
	return group.ID, nil
}

// launchTitled launches one session per title, each in its own checkout of that name on
// `main`, with no hook posted — the shape web/e2e/helpers/groups.ts's launchTitled makes.
func (r *renderRig) launchTitled(ctx context.Context, titles ...string) ([]renderSession, error) {
	sessions := make([]renderSession, 0, len(titles))
	for _, title := range titles {
		dir, err := r.dir(ctx, title, "main")
		if err != nil {
			return nil, err
		}
		s, err := r.launch(ctx, dir, launchOpts{title: title})
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func driveGroupsTitled(collapseFirst bool) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		sessions, err := r.launchTitled(ctx, "alpha-one", "alpha-two", "bravo-one", "loose-one")
		if err != nil {
			return err
		}
		alpha, err := r.createGroup(ctx, "Alpha", sessions[0:2])
		if err != nil {
			return err
		}
		if _, err = r.createGroup(ctx, "Bravo", sessions[2:3]); err != nil {
			return err
		}
		if !collapseFirst {
			return nil
		}
		_, err = r.api(ctx, http.MethodPut, fmt.Sprintf("/api/groups/%d", alpha), map[string]any{"collapsed": true})
		return err
	}
}

// bindTitled launches a titled session in its own checkout and binds a Claude session to
// it, so a turn can be driven through the ingest route.
func (r *renderRig) bindTitled(ctx context.Context, title string) (renderSession, error) {
	dir, err := r.dir(ctx, title, "main")
	if err != nil {
		return renderSession{}, err
	}
	return r.bind(ctx, dir, "cs-"+title, renderModelSonnet, launchOpts{title: title})
}

// driveToState walks a bound session to `state` exactly as the E2E helper of the same
// name does: a turn, then the closing event, whose timestamp the fixture keeps.
func (r *renderRig) driveToState(ctx context.Context, s renderSession, title, state string) error {
	claudeID := "cs-" + title
	if state == "started" {
		return nil
	}
	if state == "working" {
		r.nextSecond()
	}
	if err := r.promptSubmit(ctx, s, claudeID); err != nil {
		return err
	}
	switch state {
	case "working":
		return nil
	case "needs_input":
		return r.hookStamped(ctx, claudecodetest.RawNotification(claudeID, "p1", "permission_prompt"))
	case "failed":
		return r.hookStamped(ctx, claudecodetest.RawStopFailure(claudeID, claudecodetest.StopFailureOpts{}))
	case "idle":
		return r.hookStamped(ctx, claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
	}
	return fmt.Errorf("unknown state %q", state)
}

func driveGroupsSummary(ctx context.Context, r *renderRig) error {
	mixed := []struct{ title, state string }{
		{"e8-need", "needs_input"}, {"e8-fail", "failed"}, {"e8-new", "started"},
		{"e8-work1", "working"}, {"e8-work2", "working"}, {"e8-idle", "idle"}, {"e8-dead", "started"},
	}
	var members []renderSession
	for _, m := range mixed {
		s, err := r.bindTitled(ctx, m.title)
		if err != nil {
			return err
		}
		if err = r.driveToState(ctx, s, m.title, m.state); err != nil {
			return err
		}
		members = append(members, s)
	}
	if err := r.markDead(ctx, members[len(members)-1].id); err != nil {
		return err
	}
	if _, err := r.createGroup(ctx, "Mixed", members); err != nil {
		return err
	}

	hover := []struct{ title, state string }{
		{"e9-need", "needs_input"}, {"e9-work", "working"}, {"e9-new", "started"},
	}
	var hoverMembers []renderSession
	for _, m := range hover {
		s, err := r.bindTitled(ctx, m.title)
		if err != nil {
			return err
		}
		if err = r.driveToState(ctx, s, m.title, m.state); err != nil {
			return err
		}
		hoverMembers = append(hoverMembers, s)
	}
	if _, err := r.createGroup(ctx, "Hover me", hoverMembers); err != nil {
		return err
	}
	_, err := r.createGroup(ctx, "Void", nil)
	return err
}
