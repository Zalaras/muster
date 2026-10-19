package session

import (
	"path/filepath"
	"slices"
)

// adoptAddedDirs replaces the session's added directories with reported (the status line's
// full list, nil when the post did not carry the key) once normalised, reporting whether the
// list changed. A dead session never adopts one, so a straggler post cannot refill what a
// death emptied. A directory already held keeps its git reading across the replacement.
// The caller holds Manager.mu.
func adoptAddedDirs(sess *Session, reported *[]string) bool {
	if reported == nil || !sess.Alive {
		return false
	}
	next := normalizeAddedDirs(sess.Directory, *reported, sess.AddedDirs)
	if addedDirsEqual(sess.AddedDirs, next) {
		return false
	}
	sess.AddedDirs = next
	return true
}

func normalizeAddedDirs(launchDir string, reported []string, held []Location) []Location {
	launch := ResolvePath(launchDir)
	out := make([]Location, 0, len(reported))
	for _, entry := range reported {
		if entry == "" {
			continue
		}
		if !filepath.IsAbs(entry) {
			entry = filepath.Join(launchDir, entry)
		}
		dir := ResolvePath(entry)
		if dir == launch || slices.ContainsFunc(out, func(l Location) bool { return l.Directory == dir }) {
			continue
		}
		loc := Location{Directory: dir}
		if i := slices.IndexFunc(held, func(l Location) bool { return l.Directory == dir }); i >= 0 {
			loc.Repo = held[i].Repo
		}
		out = append(out, loc)
	}
	return out
}

func addedDirsEqual(a, b []Location) bool {
	return slices.EqualFunc(a, b, func(x, y Location) bool { return locationEqual(&x, &y) })
}

func (s *Session) clearAddedDirs() {
	s.AddedDirs = nil
}
