package session

import (
	"context"
	"fmt"
)

// RepoTarget is what the repo poll needs to know about one session, copied under m.mu so
// the poll can run git outside the lock.
type RepoTarget struct {
	ID        int64
	Directory string
	ClaudeDir string
	AddedDirs []string
	Alive     bool
	// Epoch is how many times the session had died when this was copied; the reading taken
	// for it carries it back in RepoState.Epoch.
	Epoch uint64
}

type RepoState struct {
	Branch     *string
	IsWorktree bool
	ClaudeDir  string
	Location   *Location
	AddedRepos map[string]*LocationRepo
	Epoch      uint64
}

func (m *Manager) RepoTargets() []RepoTarget {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]RepoTarget, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, RepoTarget{ID: s.ID, Directory: s.Directory, ClaudeDir: s.ClaudeDir, AddedDirs: addedDirPaths(s.AddedDirs), Alive: s.Alive, Epoch: s.repoEpoch})
	}
	return out
}

// SetRepoState adopts one repo-poll reading and, only when the wire-visible repo or
// claudeLocation changed, persists and broadcasts it as one sessionUpsert. A reading that
// finds nothing new touches nothing.
//
// The reading was taken outside the lock, so it is checked against the session as it stands
// now. A reading taken before the session died is dropped whole, branch included, however
// soon a resume made it alive again: a checkout made after the card showed ended must not
// reach the dead card, and the resumed session's first tick reads it afresh. A Location
// derived from a ClaudeDir that has since been replaced or cleared is dropped alone; the
// ClaudeDir change that outdated it has already nudged the poll for a fresh reading. An
// added directory's reading applies only to a directory still listed: the list as it stands
// now decides which entries exist, and one the reading never saw stays unread until the
// next tick.
func (m *Manager) SetRepoState(ctx context.Context, id int64, state RepoState) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	if !sess.Alive || sess.repoEpoch != state.Epoch {
		m.mu.Unlock()
		return nil
	}
	location := state.Location
	if sess.ClaudeDir != state.ClaudeDir {
		location = sess.ClaudeLocation
	}
	added := withAddedRepos(sess.AddedDirs, state.AddedRepos)
	if stringPtrEqual(sess.Branch, state.Branch) && sess.IsWorktree == state.IsWorktree && locationEqual(sess.ClaudeLocation, location) && addedDirsEqual(sess.AddedDirs, added) {
		m.mu.Unlock()
		return nil
	}
	prev := sess.Clone()
	sess.Branch = state.Branch
	sess.IsWorktree = state.IsWorktree
	sess.ClaudeLocation = location
	sess.AddedDirs = added
	post := sess.Clone()

	if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true); err != nil {
		return fmt.Errorf("persisting repo state for session %d: %w", id, err)
	}
	return nil
}

// locationEqual compares two derived locations by value; Location is replaced on a real
// change, so pointer identity alone would report an identical re-derivation as a change.
func locationEqual(a, b *Location) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if a.Directory != b.Directory {
		return false
	}
	if a.Repo == nil || b.Repo == nil {
		return a.Repo == nil && b.Repo == nil
	}
	return *a.Repo == *b.Repo
}

func addedDirPaths(dirs []Location) []string {
	if len(dirs) == 0 {
		return nil
	}
	paths := make([]string, len(dirs))
	for i, d := range dirs {
		paths[i] = d.Directory
	}
	return paths
}

// withAddedRepos is held with each entry's Repo replaced by its reading in repos, when there
// is one. Always a fresh slice, so the held one is never written through.
func withAddedRepos(held []Location, repos map[string]*LocationRepo) []Location {
	if len(held) == 0 {
		return held
	}
	out := make([]Location, len(held))
	for i, d := range held {
		if repo, read := repos[d.Directory]; read {
			d.Repo = repo
		}
		out[i] = d
	}
	return out
}
