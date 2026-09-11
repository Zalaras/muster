package selfupdate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Kind is the daemon's startup install classification (REQ-21) — constant for the
// daemon's life (kb:anchor/ws.update "install").
type Kind string

const (
	KindDev       Kind = "dev"
	KindHomebrew  Kind = "homebrew"
	KindUnmanaged Kind = "unmanaged"
	KindInstaller Kind = "installer"
)

// InstallerRemedy and HomebrewRemedy are the one-line remedies shown for unmanaged and
// homebrew installs respectively (REQ-21; kb:anchor/ws.update "remedy"), and
// `musterd -update`'s stderr message for the same two kinds (REQ-22).
const (
	InstallerRemedy = "not installed by the muster installer — run: curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh"
	HomebrewRemedy  = "installed by Homebrew — run brew upgrade musterd"
)

// Install is Classify's result: the kind, the resolved path it was computed from, and —
// for homebrew/unmanaged only — the remedy to display (nil/"" otherwise).
type Install struct {
	Kind   Kind
	Path   string
	Remedy string
}

// homebrewPrefixes are the fixed Homebrew install roots checked in addition to
// $HOMEBREW_PREFIX (REQ-21).
var homebrewPrefixes = []string{"/opt/homebrew", "/usr/local/Cellar", "/usr/local/Homebrew"}

// Classify determines the install kind from the resolved executable path (REQ-21).
//
//   - version is the running binary's version string (as built) — anything that doesn't
//     parse via ParseRelease is a dev build (REQ-8), checked before path is examined at all.
//   - exePath must already be resolved through os.Executable + filepath.EvalSymlinks.
//   - env reads one environment variable (production: os.Getenv; tests: a fake map).
//   - home is the user's home directory (production: os.UserHomeDir()).
//   - access reports whether dir is writable by the current user: nil means writable, a
//     non-nil error means not (production: WritableDir). A nil access func is treated as
//     "writable" (a defensive default, never exercised by cmd/musterd's real wiring).
func Classify(version, exePath string, env func(string) string, home string, access func(dir string) error) Install {
	if _, ok := ParseRelease(version); !ok {
		return Install{Kind: KindDev, Path: exePath}
	}

	dir := filepath.Dir(exePath)

	if prefix := env("HOMEBREW_PREFIX"); prefix != "" && withinDir(exePath, prefix) {
		return Install{Kind: KindHomebrew, Path: exePath, Remedy: HomebrewRemedy}
	}
	for _, prefix := range homebrewPrefixes {
		if withinDir(exePath, prefix) {
			return Install{Kind: KindHomebrew, Path: exePath, Remedy: HomebrewRemedy}
		}
	}

	if access != nil && access(dir) != nil {
		return Install{Kind: KindUnmanaged, Path: exePath, Remedy: InstallerRemedy}
	}
	if inGitTreeBelowHome(dir, home) {
		return Install{Kind: KindUnmanaged, Path: exePath, Remedy: InstallerRemedy}
	}

	return Install{Kind: KindInstaller, Path: exePath}
}

// withinDir reports whether path is dir itself or lives somewhere below it.
func withinDir(path, dir string) bool {
	rel, err := filepath.Rel(filepath.Clean(dir), path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// inGitTreeBelowHome walks dir upward looking for a ".git" entry, stopping strictly
// below home without checking home itself (D13: a dotfiles repo's .git at $HOME must not
// make every binary under $HOME "unmanaged").
func inGitTreeBelowHome(dir, home string) bool {
	home = filepath.Clean(home)
	for {
		if dir == home || dir == string(filepath.Separator) || dir == "." {
			return false
		}
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return false
		}
		dir = parent
	}
}

// WritableDir is the production `access` func for Classify: it reports whether dir is
// writable by the current user by attempting to create and immediately remove a probe
// file — Go's stdlib has no direct "is this writable" query.
func WritableDir(dir string) error {
	f, err := os.CreateTemp(dir, ".musterd-writable-*")
	if err != nil {
		return fmt.Errorf("directory not writable: %w", err)
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return nil
}
