//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"
)

// tilesView is the prefs patch every Tiles scenario ends with: the dashboard adopts the view
// only from the prefs broadcast, so a render test cannot click its way into Tiles.
var tilesView = map[string]any{"view": "tiles"}

// The tiles feature's scenarios (web/render/tiles.spec.ts, web/render/shortcuts.spec.ts):
// the Tiles view over no session, one, four (a full 2×2 grid, one tile needing input) and
// five (a full grid plus one strip card, pinned or not).
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"empty-tiles", withPrefs(func(context.Context, *renderRig) error { return nil }, tilesView)},
		renderScenario{"tiles-one", withPrefs(driveTilesIdle([]string{"solo"}, ""), tilesView)},
		renderScenario{"tiles-four", withPrefs(driveTilesFour, tilesView)},
		renderScenario{"tiles-five", withPrefs(driveTilesIdle(fiveTiles, ""), tilesView)},
		// tile-5 is the one session a 2×2 grid leaves on the strip (idle sessions enter the grid
		// longest-idle first); pinned, it is also the rail's first card.
		renderScenario{"tiles-five-pinned", withPrefs(driveTilesIdle(fiveTiles, "tile-5"), tilesView)},
	)
}

var fiveTiles = []string{"tile-1", "tile-2", "tile-3", "tile-4", "tile-5"}

// driveTilesIdle takes every named session to idle in launch order, then pins the one
// named pinTitle (none when empty).
func driveTilesIdle(titles []string, pinTitle string) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		for _, name := range titles {
			s, err := r.idleSession(ctx, name)
			if err != nil {
				return err
			}
			if name != pinTitle {
				continue
			}
			if _, err = r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", s.id), map[string]any{"pinned": true}); err != nil {
				return err
			}
		}
		return nil
	}
}

// driveTilesFour fills a 2×2 grid: three idle sessions and a fourth that needs input.
func driveTilesFour(ctx context.Context, r *renderRig) error {
	if err := driveTilesIdle([]string{"quad-1", "quad-2", "quad-3"}, "")(ctx, r); err != nil {
		return err
	}
	_, err := r.blockedSession(ctx, "quad-4")
	return err
}
