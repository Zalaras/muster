//go:build renderfix

package store

import (
	"context"
	"fmt"
	"time"
)

// AlignRepoLaunchedAt sets the repo row's last_launched_at to at — the render fixture
// generator's one write outside the daemon's own paths. A launch stamps the repo row and
// the session row with two time.Now calls (sessionLauncher.Launch: UpsertRepo, then the
// session's createdAt); at one-second wire resolution the two agree on a quiet machine and
// straddle a boundary on a loaded one, which the fixture normaliser would then number as two
// instants. The rig aligns the repo to the session's createdAt, the one instant the launch
// is, so a fixture is the same under any load (kb:adr/process-render-fixtures-generated-from-daemon).
func (s *Store) AlignRepoLaunchedAt(ctx context.Context, path string, at time.Time) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE repo SET last_launched_at = ? WHERE path = ?`, encodeTime(at), path); err != nil {
		return fmt.Errorf("aligning repo %q launch time: %w", path, err)
	}
	return nil
}
