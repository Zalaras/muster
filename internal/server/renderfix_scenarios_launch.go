//go:build renderfix

package server

import (
	"context"

	"github.com/Zalaras/muster/internal/claudecode"
)

// The launch feature's scenarios (web/render/launch.spec.ts): what a launch leaves on the
// rail before any hook arrives. No session here is ever bound — the card's note derives
// from the absence of a Claude session, which is the point of each.
func init() {
	renderScenarios = append(renderScenarios,
		// Two launches into one directory: the second has firstLaunchHere false, no
		// claudeSessionId and state started, so once the page clock passes its createdAt by the
		// no-signal threshold the card reads "no signal yet"; the first still reads the
		// trust-prompt note.
		renderScenario{"second-launch-no-signal", driveSecondLaunchNoSignal},
		// One launch with permissionMode bypassPermissions and no hook: the bypass chip on the
		// card, the Focus mainhead and (under the Tiles view) the tile header, with the combined
		// trust-then-bypass-warning note.
		renderScenario{"bypass-launch", driveBypassLaunch},
		renderScenario{"bypass-launch-tiles", withPrefs(driveBypassLaunch, tilesView)},
	)
}

func driveSecondLaunchNoSignal(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "signal", "")
	if err != nil {
		return err
	}
	if _, err = r.launch(ctx, dir, launchOpts{title: "no-signal-seed"}); err != nil {
		return err
	}
	_, err = r.launch(ctx, dir, launchOpts{title: "no-signal-second"})
	return err
}

func driveBypassLaunch(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, "bypass", "")
	if err != nil {
		return err
	}
	_, err = r.launch(ctx, dir, launchOpts{title: "bypass-chip-e2", permissionMode: claudecode.PermissionBypass})
	return err
}
