package selfupdate

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writableAccess(string) error   { return nil }
func unwritableAccess(string) error { return errors.New("not writable") }

func envMap(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

// TestClassify_Table covers D13 exhaustively: every named case from REQ-21's table.
func TestClassify_Table(t *testing.T) {
	tests := []struct {
		name       string
		version    string
		exePath    string
		env        map[string]string
		home       string
		access     func(string) error
		wantKind   Kind
		wantRemedy string
	}{
		{
			name:    "dev string classifies dev regardless of path",
			version: "dev", exePath: "/opt/homebrew/bin/musterd",
			access: writableAccess, wantKind: KindDev,
		},
		{
			name:    "git-describe suffix classifies dev",
			version: "v0.10.0-4-ge5102b8", exePath: "/usr/local/bin/musterd",
			access: writableAccess, wantKind: KindDev,
		},
		{
			name: "opt homebrew prefix", version: "0.10.0", exePath: "/opt/homebrew/bin/musterd",
			access: writableAccess, wantKind: KindHomebrew, wantRemedy: HomebrewRemedy,
		},
		{
			name: "usr local Cellar prefix", version: "0.10.0", exePath: "/usr/local/Cellar/musterd/1/bin/musterd",
			access: writableAccess, wantKind: KindHomebrew, wantRemedy: HomebrewRemedy,
		},
		{
			name: "HOMEBREW_PREFIX env var", version: "0.10.0", exePath: "/some/custom/prefix/bin/musterd",
			env:    map[string]string{"HOMEBREW_PREFIX": "/some/custom/prefix"},
			access: writableAccess, wantKind: KindHomebrew, wantRemedy: HomebrewRemedy,
		},
		{
			// D1: the composed remedy (wantRemedy filled in below, once exePath/dir are
			// both known) names the resolved path, its directory, and the probe's
			// innermost error text — not a shared fixed string; InstallerRemedy no longer
			// exists (kb:adr/update-remedy-names-path-and-cause).
			name: "non-writable exe dir is unmanaged", version: "0.10.0", exePath: "/scratch/bin/musterd",
			access: unwritableAccess, wantKind: KindUnmanaged,
		},
		{
			// D2: the composed remedy (wantRemedy filled in below) names the resolved
			// path and the checkout root the git walk found.
			name: "git tree below home is unmanaged", version: "0.10.0",
			access: writableAccess, wantKind: KindUnmanaged,
			// exePath/home are set up per-case below via a real .git directory.
		},
		{
			name: "git at home itself is installer, not unmanaged (D13)", version: "0.10.0",
			access: writableAccess, wantKind: KindInstaller,
		},
		{
			name: "plain writable dir is installer", version: "0.10.0", exePath: "/scratch/bin/musterd",
			access: writableAccess, wantKind: KindInstaller,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exePath, home := tt.exePath, tt.home
			wantRemedy := tt.wantRemedy
			switch tt.name {
			case "non-writable exe dir is unmanaged":
				// D1's exact composed sentence: unwritableAccess's own error ("not
				// writable") is innermostCause's whole (unwrapped) text here.
				wantRemedy = fmt.Sprintf("can't update %s: %s is not writable (%s) — %s",
					exePath, filepath.Dir(exePath), "not writable", installScriptRemedy)
			case "git tree below home is unmanaged":
				root := t.TempDir()
				home = filepath.Join(root, "home")
				repo := filepath.Join(home, "projects", "scratch")
				require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
				require.NoError(t, os.MkdirAll(filepath.Join(repo, "bin"), 0o755))
				exePath = filepath.Join(repo, "bin", "musterd")
				// D2's exact composed sentence: the checkout root is repo, not exePath's
				// own immediate directory.
				wantRemedy = fmt.Sprintf("can't update %s: it is inside the git checkout %s — %s",
					exePath, repo, installScriptRemedy)
			case "git at home itself is installer, not unmanaged (D13)":
				root := t.TempDir()
				home = root
				require.NoError(t, os.MkdirAll(filepath.Join(home, ".git"), 0o755))
				require.NoError(t, os.MkdirAll(filepath.Join(home, "bin"), 0o755))
				exePath = filepath.Join(home, "bin", "musterd")
			}
			if home == "" {
				home = t.TempDir()
			}

			got := Classify(tt.version, exePath, envMap(tt.env), home, tt.access)

			assert.Equal(t, tt.wantKind, got.Kind)
			assert.Equal(t, exePath, got.Path)
			if wantRemedy != "" {
				assert.Equal(t, wantRemedy, got.Remedy)
			} else {
				assert.Empty(t, got.Remedy)
			}
		})
	}
}

// TestReclassify_UnwritableDirectoryRemedy covers D1 exhaustively: the composed remedy
// names the resolved path, its directory, and the write probe's innermost error text, for
// both a plain unwrapped error and the wrapped os.PathError/syscall.Errno chain
// WritableDir's own production error actually forms.
func TestReclassify_UnwritableDirectoryRemedy(t *testing.T) {
	tests := []struct {
		name      string
		probeErr  error
		wantCause string
	}{
		{"a plain unwrapped error reports its own text", errors.New("boom"), "boom"},
		{
			"a wrapped os.PathError/syscall.Errno chain unwraps to the errno text",
			fmt.Errorf("directory not writable: %w", &os.PathError{Op: "open", Path: "/scratch/bin/.musterd-writable-x", Err: syscall.EACCES}),
			syscall.EACCES.Error(),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exePath := "/scratch/bin/musterd"

			got := Reclassify(exePath, t.TempDir(), func(string) error { return tt.probeErr })

			require.Equal(t, KindUnmanaged, got.Kind)
			want := fmt.Sprintf("can't update %s: %s is not writable (%s) — %s", exePath, "/scratch/bin", tt.wantCause, installScriptRemedy)
			assert.Equal(t, want, got.Remedy)
		})
	}
}

// TestReclassify_UnwritableDirectory_RealFilesystem covers D1 against a real chmod'd
// directory through the production access func (WritableDir) — the same fixture E2
// drives end to end, proven here at the pure-function level too.
func TestReclassify_UnwritableDirectory_RealFilesystem(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory write permission bits")
	}
	dir := t.TempDir()
	require.NoError(t, os.Chmod(dir, 0o555))
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) }) // let t.TempDir()'s own cleanup remove it
	exePath := filepath.Join(dir, "musterd")

	got := Reclassify(exePath, t.TempDir(), WritableDir)

	require.Equal(t, KindUnmanaged, got.Kind)
	want := fmt.Sprintf("can't update %s: %s is not writable (permission denied) — %s", exePath, dir, installScriptRemedy)
	assert.Equal(t, want, got.Remedy)
}

// TestReclassify_GitTreeRemedy covers D2 exhaustively: the composed remedy names the
// checkout root the walk actually found — one level up, several levels up, and never for
// a .git at home itself — plus the write-probe/git-tree precedence Reclassify's own code
// order implies (an unwritable directory reports REQ-1's remedy even when it also sits
// inside a git checkout, never REQ-2's).
func TestReclassify_GitTreeRemedy(t *testing.T) {
	t.Run("git in the immediate parent directory", func(t *testing.T) {
		home := t.TempDir()
		repo := filepath.Join(home, "projects", "scratch")
		require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
		require.NoError(t, os.MkdirAll(filepath.Join(repo, "bin"), 0o755))
		exePath := filepath.Join(repo, "bin", "musterd")

		got := Reclassify(exePath, home, writableAccess)

		require.Equal(t, KindUnmanaged, got.Kind)
		want := fmt.Sprintf("can't update %s: it is inside the git checkout %s — %s", exePath, repo, installScriptRemedy)
		assert.Equal(t, want, got.Remedy)
	})

	t.Run("git two levels above the executable", func(t *testing.T) {
		home := t.TempDir()
		repo := filepath.Join(home, "code", "scratch")
		require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
		nested := filepath.Join(repo, "cmd", "bin")
		require.NoError(t, os.MkdirAll(nested, 0o755))
		exePath := filepath.Join(nested, "musterd")

		got := Reclassify(exePath, home, writableAccess)

		require.Equal(t, KindUnmanaged, got.Kind)
		want := fmt.Sprintf("can't update %s: it is inside the git checkout %s — %s", exePath, repo, installScriptRemedy)
		assert.Equal(t, want, got.Remedy)
	})

	t.Run("git at home itself is installer, not unmanaged", func(t *testing.T) {
		home := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Join(home, ".git"), 0o755))
		exePath := filepath.Join(home, "bin", "musterd")
		require.NoError(t, os.MkdirAll(filepath.Dir(exePath), 0o755))

		got := Reclassify(exePath, home, writableAccess)

		assert.Equal(t, KindInstaller, got.Kind)
		assert.Empty(t, got.Remedy)
	})

	t.Run("an unwritable directory reports the write-probe remedy, not the git one, even inside a checkout", func(t *testing.T) {
		home := t.TempDir()
		repo := filepath.Join(home, "projects", "scratch")
		require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
		require.NoError(t, os.MkdirAll(filepath.Join(repo, "bin"), 0o755))
		exePath := filepath.Join(repo, "bin", "musterd")

		got := Reclassify(exePath, home, unwritableAccess)

		require.Equal(t, KindUnmanaged, got.Kind)
		assert.Contains(t, got.Remedy, "is not writable")
		assert.NotContains(t, got.Remedy, "git checkout")
	})
}

// TestReclassify_FlipsBetweenInstallerAndUnmanaged covers D4 at the pure-function level:
// Reclassify is stateless, so the same exePath/home flips kind whenever the caller's
// access func's own answer changes — installer to unmanaged and back, matching a
// directory's writability changing between two checks.
func TestReclassify_FlipsBetweenInstallerAndUnmanaged(t *testing.T) {
	exePath := filepath.Join(t.TempDir(), "musterd")
	home := t.TempDir()
	writable := true
	access := func(string) error {
		if writable {
			return nil
		}
		return errors.New("blocked")
	}

	got := Reclassify(exePath, home, access)
	require.Equal(t, KindInstaller, got.Kind)
	assert.Empty(t, got.Remedy)

	writable = false
	got = Reclassify(exePath, home, access)
	require.Equal(t, KindUnmanaged, got.Kind)
	assert.NotEmpty(t, got.Remedy)

	writable = true
	got = Reclassify(exePath, home, access)
	assert.Equal(t, KindInstaller, got.Kind)
	assert.Empty(t, got.Remedy)
}

// TestReclassify_FlipsWhenGitTreeIsRemoved covers D4/edge case 1 at the pure-function
// level: removing the .git ancestor between two Reclassify calls flips unmanaged back to
// installer.
func TestReclassify_FlipsWhenGitTreeIsRemoved(t *testing.T) {
	home := t.TempDir()
	repo := filepath.Join(home, "scratch")
	gitDir := filepath.Join(repo, ".git")
	require.NoError(t, os.MkdirAll(gitDir, 0o755))
	bin := filepath.Join(repo, "bin")
	require.NoError(t, os.MkdirAll(bin, 0o755))
	exePath := filepath.Join(bin, "musterd")

	got := Reclassify(exePath, home, writableAccess)
	require.Equal(t, KindUnmanaged, got.Kind)

	require.NoError(t, os.RemoveAll(gitDir))

	got = Reclassify(exePath, home, writableAccess)
	assert.Equal(t, KindInstaller, got.Kind)
	assert.Empty(t, got.Remedy)
}

// TestClassify_HomebrewChecksBeforeWritability covers REQ-21's precedence: a homebrew
// path wins even when the access func would separately report it unwritable — Homebrew
// installs are typically not user-writable, and REQ-21's remedy for that case must still
// be the Homebrew one, never the generic installer one.
func TestClassify_HomebrewChecksBeforeWritability(t *testing.T) {
	got := Classify("0.10.0", "/opt/homebrew/bin/musterd", envMap(nil), t.TempDir(), unwritableAccess)

	assert.Equal(t, KindHomebrew, got.Kind)
	assert.Equal(t, HomebrewRemedy, got.Remedy)
}

// TestClassify_NilAccessFuncIsTreatedAsWritable covers Classify's documented defensive
// default: a nil access func (never exercised by cmd/musterd's real wiring) must not
// panic and must not itself classify unmanaged.
func TestClassify_NilAccessFuncIsTreatedAsWritable(t *testing.T) {
	got := Classify("0.10.0", "/scratch/bin/musterd", envMap(nil), t.TempDir(), nil)

	assert.Equal(t, KindInstaller, got.Kind)
}

// TestInstall_MayApply covers kb:adr/update-install-kinds-decide-who-may-apply's rule
// over every Kind that exists: only KindInstaller may apply in place.
// cmd/musterd/update.go (pre-refactor) blocked KindDev/KindHomebrew/KindUnmanaged as a
// deny-list; internal/server/update.go allowed only KindInstaller as an allow-list — this
// table pins both down as the same rule, so a fifth Kind can no longer silently diverge
// them.
func TestInstall_MayApply(t *testing.T) {
	tests := []struct {
		kind Kind
		want bool
	}{
		{KindDev, false},
		{KindHomebrew, false},
		{KindUnmanaged, false},
		{KindInstaller, true},
	}
	for _, tt := range tests {
		t.Run(string(tt.kind), func(t *testing.T) {
			got := Install{Kind: tt.kind}.MayApply()
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestWritableDir covers the production access func: a writable dir and an unwritable
// one (mode 0o500, no write bit) report accordingly.
func TestWritableDir(t *testing.T) {
	t.Run("writable dir succeeds", func(t *testing.T) {
		assert.NoError(t, WritableDir(t.TempDir()))
	})

	t.Run("unwritable dir fails", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.Chmod(dir, 0o500))
		t.Cleanup(func() { _ = os.Chmod(dir, 0o700) }) // let t.TempDir()'s own cleanup remove it
		if os.Geteuid() == 0 {
			t.Skip("root ignores directory write permission bits")
		}

		assert.Error(t, WritableDir(dir))
	})
}
