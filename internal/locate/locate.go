// Package locate resolves a dropped file's original on-disk path from its bytes alone
// (plan file-drop-fix): a browser hands a page a dropped file's name and bytes, never
// its path, so the daemon locates the original by asking a sequence of Finders for
// basename+size candidates and verifying each one byte-for-byte before it counts. The
// package never writes the uploaded bytes anywhere (INV-2) and imports nothing from
// internal/server, internal/session or internal/claudecode (D17) — it is pure
// filesystem logic, agnostic of sessions, HTTP and Claude Code.
package locate

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// Finder discovers filesystem paths that might match a dropped file's basename and
// size. A Finder does not verify byte-for-byte identity itself — Locate does that
// centrally so every Finder can return raw, unverified candidates and degrade to no
// candidates (nil, nil) rather than erroring whenever its own discovery mechanism is
// unavailable (e.g. SpotlightFinder when mdfind is missing or times out).
type Finder interface {
	Find(ctx context.Context, dir, name string, size int64) ([]string, error)
}

// DefaultWalkCap bounds WalkFinder's directory traversal (Edge Case 11): a huge session
// directory (node_modules, a monorepo) stops here rather than running unbounded.
const DefaultWalkCap = 200_000

// DefaultSpotlightTimeout bounds SpotlightFinder's mdfind call before it degrades to
// the walk (REQ-5).
const DefaultSpotlightTimeout = 2 * time.Second

// Locator resolves a dropped file's original path by asking each Finder in turn — REQ-5
// puts Spotlight ahead of the directory walk — and stopping at the first Finder that
// yields any verified (byte-identical) candidate.
type Locator struct {
	finders          []Finder
	walkCap          int
	spotlightTimeout time.Duration
}

// New builds the daemon's real Locator: Spotlight first, then a directory walk over the
// session's own directory (REQ-5).
func New() *Locator {
	return &Locator{
		finders: []Finder{
			NewSpotlightFinder(DefaultSpotlightTimeout),
			NewWalkFinder(DefaultWalkCap),
		},
		walkCap:          DefaultWalkCap,
		spotlightTimeout: DefaultSpotlightTimeout,
	}
}

// NewWithFinders builds a Locator over exactly the given Finders, in order. It is the
// seam for callers that must not reach Spotlight — internal/server's handler tests use
// NewWithFinders(NewWalkFinder(DefaultWalkCap)) so no unit test forks `mdfind`
// (docs/conventions.md §Testing) — and for environments without it.
func NewWithFinders(finders ...Finder) *Locator {
	return &Locator{
		finders:          finders,
		walkCap:          DefaultWalkCap,
		spotlightTimeout: DefaultSpotlightTimeout,
	}
}

// ErrNotLocated means no file on disk matched the dropped file's name, size and bytes.
var ErrNotLocated = errors.New("locate: no file matched")

// ErrAmbiguous means two or more distinct on-disk files matched — Paths lists every
// verified match, absolute and sorted (REQ-5, protocol.md §3.14).
type ErrAmbiguous struct {
	Paths []string
}

func (e *ErrAmbiguous) Error() string {
	return fmt.Sprintf("locate: %d identical files matched", len(e.Paths))
}

// Locate returns the absolute, symlink-resolved path of the single on-disk file whose
// basename, size and bytes equal upload. dir is the session's directory, used only by
// the walk Finder once Spotlight yields nothing verified. Returns ErrNotLocated when
// nothing matched, *ErrAmbiguous when two or more distinct files matched, or a wrapped
// error when a Finder itself failed for a reason other than "found nothing" (e.g. dir is
// unreadable).
func (l *Locator) Locate(ctx context.Context, dir, name string, upload []byte) (string, error) {
	size := int64(len(upload))

	for _, f := range l.finders {
		candidates, err := f.Find(ctx, dir, name, size)
		if err != nil {
			return "", fmt.Errorf("locate: %w", err)
		}

		verified := verifyCandidates(candidates, upload)

		switch len(verified) {
		case 0:
			continue
		case 1:
			return verified[0], nil
		default:
			return "", &ErrAmbiguous{Paths: verified}
		}
	}

	return "", ErrNotLocated
}

// verifyCandidates byte-compares every candidate against upload, resolves survivors
// through EvalSymlinks so the same file reached by two paths counts once (D7), and
// returns the sorted, deduplicated result (REQ-5). A candidate that vanishes or becomes
// unreadable between discovery and verification is dropped rather than treated as an
// error — it was never a real match to begin with.
func verifyCandidates(candidates []string, upload []byte) []string {
	seen := make(map[string]struct{}, len(candidates))
	var verified []string

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if !bytes.Equal(data, upload) {
			continue
		}

		resolved, err := filepath.EvalSymlinks(path)
		if err != nil {
			continue
		}
		if _, dup := seen[resolved]; dup {
			continue
		}
		seen[resolved] = struct{}{}
		verified = append(verified, resolved)
	}

	sort.Strings(verified)
	return verified
}
