package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestElsewhere is D4 / INV-1's rule as a table. Paths arrive already resolved and cleaned,
// and the git top levels are passed in, so no git runs: a git-checkout row decides by top
// level, a non-git row by path containment.
func TestElsewhere(t *testing.T) {
	cases := []struct {
		name      string
		launchTop *string
		claudeTop *string
		launchDir string
		claudeDir string
		wantAway  bool
	}{
		{name: "same directory", launchTop: strPtr("/r"), claudeTop: strPtr("/r"), launchDir: "/r", claudeDir: "/r", wantAway: false},
		{name: "subdirectory of the launch checkout (cd sub)", launchTop: strPtr("/r"), claudeTop: strPtr("/r"), launchDir: "/r", claudeDir: "/r/sub", wantAway: false},
		{name: "launched in a subdirectory, Claude at the checkout root", launchTop: strPtr("/r"), claudeTop: strPtr("/r"), launchDir: "/r/sub", claudeDir: "/r", wantAway: false},
		{name: "worktree under .claude/worktrees: inside the launch path, own top level", launchTop: strPtr("/r"), claudeTop: strPtr("/r/.claude/worktrees/probewt"), launchDir: "/r", claudeDir: "/r/.claude/worktrees/probewt", wantAway: true},
		{name: "sibling worktree", launchTop: strPtr("/code/muster"), claudeTop: strPtr("/code/muster-foo"), launchDir: "/code/muster", claudeDir: "/code/muster-foo", wantAway: true},
		{name: "another repo added with /add-dir", launchTop: strPtr("/code/muster"), claudeTop: strPtr("/code/other"), launchDir: "/code/muster", claudeDir: "/code/other/pkg", wantAway: true},
		{name: "launch directory is not a checkout, Claude is in one", launchTop: nil, claudeTop: strPtr("/code/other"), launchDir: "/scratch", claudeDir: "/code/other", wantAway: true},
		{name: "non-git inside the launch directory", launchTop: nil, claudeTop: nil, launchDir: "/scratch", claudeDir: "/scratch/sub", wantAway: false},
		{name: "non-git, same directory", launchTop: nil, claudeTop: nil, launchDir: "/scratch", claudeDir: "/scratch", wantAway: false},
		{name: "non-git outside the launch directory", launchTop: nil, claudeTop: nil, launchDir: "/scratch", claudeDir: "/elsewhere", wantAway: true},
		{name: "non-git sharing only a name prefix with the launch directory", launchTop: nil, claudeTop: nil, launchDir: "/scratch", claudeDir: "/scratch2", wantAway: true},
		{name: "launch is a checkout, Claude is in a plain directory outside it", launchTop: strPtr("/r"), claudeTop: nil, launchDir: "/r", claudeDir: "/tmp/x", wantAway: true},
		{name: "launch is a checkout, Claude is in a plain directory inside its path", launchTop: strPtr("/r"), claudeTop: nil, launchDir: "/r", claudeDir: "/r/build", wantAway: false},
		{name: "filesystem root as the launch directory contains everything", launchTop: nil, claudeTop: nil, launchDir: "/", claudeDir: "/a/b", wantAway: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.wantAway, Elsewhere(tc.launchTop, tc.claudeTop, tc.launchDir, tc.claudeDir))
		})
	}
}

// TestAdoptClaudeDir covers REQ-3's absent/empty rule and the change report the nudge hangs
// off: only a non-empty, different directory records and reports a change.
func TestAdoptClaudeDir(t *testing.T) {
	cases := []struct {
		name        string
		before      string
		cwd         *string
		wantDir     string
		wantChanged bool
	}{
		{name: "first report", before: "", cwd: strPtr("/r/sub"), wantDir: "/r/sub", wantChanged: true},
		{name: "a move", before: "/r", cwd: strPtr("/r/sub"), wantDir: "/r/sub", wantChanged: true},
		{name: "the same directory again", before: "/r", cwd: strPtr("/r"), wantDir: "/r", wantChanged: false},
		{name: "absent changes nothing", before: "/r", cwd: nil, wantDir: "/r", wantChanged: false},
		{name: "empty changes nothing", before: "/r", cwd: strPtr(""), wantDir: "/r", wantChanged: false},
		{name: "absent with nothing recorded", before: "", cwd: nil, wantDir: "", wantChanged: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sess := &Session{ClaudeDir: tc.before}

			changed := adoptClaudeDir(sess, tc.cwd)

			assert.Equal(t, tc.wantChanged, changed)
			assert.Equal(t, tc.wantDir, sess.ClaudeDir)
		})
	}
}

// TestLocationEqual: derived locations compare by value, because SetRepoState gets a fresh
// pointer on every tick and an unchanged derivation must not look like a change.
func TestLocationEqual(t *testing.T) {
	repo := func(name, branch string, wt bool) *LocationRepo {
		return &LocationRepo{Name: name, Branch: branch, IsWorktree: wt}
	}
	cases := []struct {
		name string
		a, b *Location
		want bool
	}{
		{name: "both nil", want: true},
		{name: "nil against non-nil", a: nil, b: &Location{Directory: "/x"}, want: false},
		{name: "equal by value, distinct pointers", a: &Location{Directory: "/x", Repo: repo("x", "b", true)}, b: &Location{Directory: "/x", Repo: repo("x", "b", true)}, want: true},
		{name: "equal with nil repos", a: &Location{Directory: "/x"}, b: &Location{Directory: "/x"}, want: true},
		{name: "directory differs", a: &Location{Directory: "/x"}, b: &Location{Directory: "/y"}, want: false},
		{name: "branch differs", a: &Location{Directory: "/x", Repo: repo("x", "a", false)}, b: &Location{Directory: "/x", Repo: repo("x", "b", false)}, want: false},
		{name: "worktree flag differs", a: &Location{Directory: "/x", Repo: repo("x", "a", false)}, b: &Location{Directory: "/x", Repo: repo("x", "a", true)}, want: false},
		{name: "repo present against absent", a: &Location{Directory: "/x", Repo: repo("x", "a", false)}, b: &Location{Directory: "/x"}, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, locationEqual(tc.a, tc.b))
			assert.Equal(t, tc.want, locationEqual(tc.b, tc.a), "symmetric")
		})
	}
}
