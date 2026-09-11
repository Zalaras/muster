package selfupdate

import (
	"errors"
	"os"
	"path/filepath"
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
			name: "non-writable exe dir is unmanaged", version: "0.10.0", exePath: "/scratch/bin/musterd",
			access: unwritableAccess, wantKind: KindUnmanaged, wantRemedy: InstallerRemedy,
		},
		{
			name: "git tree below home is unmanaged", version: "0.10.0",
			access: writableAccess, wantKind: KindUnmanaged, wantRemedy: InstallerRemedy,
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
			switch tt.name {
			case "git tree below home is unmanaged":
				root := t.TempDir()
				home = filepath.Join(root, "home")
				repo := filepath.Join(home, "projects", "scratch")
				require.NoError(t, os.MkdirAll(filepath.Join(repo, ".git"), 0o755))
				require.NoError(t, os.MkdirAll(filepath.Join(repo, "bin"), 0o755))
				exePath = filepath.Join(repo, "bin", "musterd")
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
			if tt.wantRemedy != "" {
				assert.Equal(t, tt.wantRemedy, got.Remedy)
			} else {
				assert.Empty(t, got.Remedy)
			}
		})
	}
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
