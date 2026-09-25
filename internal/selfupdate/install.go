package selfupdate

import (
	"fmt"
	"os"
	"path/filepath"
)

// Kind is the daemon's install classification (kb:adr/update-install-kinds-decide-who-may-apply).
// Dev and homebrew are decided once at startup and fixed for the daemon's life; installer
// and unmanaged are re-derived at the start of every release check
// (kb:adr/update-install-rechecked-on-every-check, kb:anchor/ws.update "install").
type Kind string

const (
	KindDev       Kind = "dev"
	KindHomebrew  Kind = "homebrew"
	KindUnmanaged Kind = "unmanaged"
	KindInstaller Kind = "installer"
)

// HomebrewRemedy is the one-line remedy shown for a homebrew install
// (kb:anchor/ws.update "remedy"), and `musterd -update`'s stderr message for the same kind.
// The unmanaged remedy is composed per-install by unwritableRemedy/gitTreeRemedy instead of
// a fixed constant, since it names the resolved path and the concrete reason
// (kb:adr/update-remedy-names-path-and-cause).
const HomebrewRemedy = "installed by Homebrew — run brew upgrade musterd"

// installScriptRemedy is the shared tail of both unmanaged remedies
// (kb:adr/update-remedy-names-path-and-cause).
const installScriptRemedy = "install with: curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh"

// Install is Classify's/Reclassify's result: the kind, the resolved path it was computed
// from, and — for homebrew/unmanaged only — the remedy to display (nil/"" otherwise).
type Install struct {
	Kind   Kind
	Path   string
	Remedy string
}

// MayApply is kb:adr/update-install-kinds-decide-who-may-apply's rule: only an
// installer-managed binary may be replaced in place — the one place this test is
// written, so cmd/musterd and internal/server can't diverge on it if a fifth kind is
// ever added.
func (i Install) MayApply() bool {
	return i.Kind == KindInstaller
}

// homebrewPrefixes are the fixed Homebrew install roots checked in addition to
// $HOMEBREW_PREFIX.
var homebrewPrefixes = []string{"/opt/homebrew", "/usr/local/Cellar", "/usr/local/Homebrew"}

// Classify determines the install kind from the resolved executable path at startup
// (kb:adr/update-install-kinds-decide-who-may-apply).
//
//   - version is the running binary's version string (as built) — anything that doesn't
//     parse via ParseRelease is a dev build, checked before path is examined at all.
//   - exePath must already be resolved through os.Executable + filepath.EvalSymlinks.
//   - env reads one environment variable (production: os.Getenv; tests: a fake map).
//   - home is the user's home directory (production: os.UserHomeDir()).
//   - access reports whether dir is writable by the current user: nil means writable, a
//     non-nil error means not (production: WritableDir). A nil access func is treated as
//     "writable" (a defensive default, never exercised by cmd/musterd's real wiring).
//
// dev and homebrew are decided here and never re-derived; installer/unmanaged are handed
// off to Reclassify, the same function a release check calls again later
// (kb:adr/update-install-rechecked-on-every-check).
func Classify(version, exePath string, env func(string) string, home string, access func(dir string) error) Install {
	if _, ok := ParseRelease(version); !ok {
		return Install{Kind: KindDev, Path: exePath}
	}
	if install, ok := classifyHomebrew(exePath, env); ok {
		return install
	}
	return Reclassify(exePath, home, access)
}

// Reclassify re-derives only the installer/unmanaged half of an install classification: the
// write probe and the git-tree walk Classify itself uses at startup for every non-dev,
// non-homebrew install. Called again at the start of every release check
// (kb:adr/update-install-rechecked-on-every-check) — dev and homebrew are decided once, at
// startup, and never reach this function a second time.
func Reclassify(exePath, home string, access func(dir string) error) Install {
	dir := filepath.Dir(exePath)

	if access != nil {
		if err := access(dir); err != nil {
			return Install{Kind: KindUnmanaged, Path: exePath, Remedy: unwritableRemedy(exePath, dir, err)}
		}
	}
	if root, ok := gitRootBelowHome(dir, home); ok {
		return Install{Kind: KindUnmanaged, Path: exePath, Remedy: gitTreeRemedy(exePath, root)}
	}
	return Install{Kind: KindInstaller, Path: exePath}
}

// classifyHomebrew reports the Homebrew classification for exePath, checked before the
// write probe/git walk since a Homebrew install is typically not user-writable and must
// still get the Homebrew remedy, never the generic unmanaged one.
func classifyHomebrew(exePath string, env func(string) string) (Install, bool) {
	if prefix := env("HOMEBREW_PREFIX"); prefix != "" && withinDir(exePath, prefix) {
		return Install{Kind: KindHomebrew, Path: exePath, Remedy: HomebrewRemedy}, true
	}
	for _, prefix := range homebrewPrefixes {
		if withinDir(exePath, prefix) {
			return Install{Kind: KindHomebrew, Path: exePath, Remedy: HomebrewRemedy}, true
		}
	}
	return Install{}, false
}

// unwritableRemedy composes the unwritable-directory remedy: the resolved path, the
// directory that failed the write probe, and the probe's innermost error text
// (kb:adr/update-remedy-names-path-and-cause).
func unwritableRemedy(path, dir string, probeErr error) string {
	return fmt.Sprintf("can't update %s: %s is not writable (%s) — %s", path, dir, innermostCause(probeErr), installScriptRemedy)
}

// gitTreeRemedy composes the git-checkout remedy: the resolved path and the checkout root
// the git walk found (kb:adr/update-remedy-names-path-and-cause).
func gitTreeRemedy(path, root string) string {
	return fmt.Sprintf("can't update %s: it is inside the git checkout %s — %s", path, root, installScriptRemedy)
}

// withinDir reports whether path is dir itself or lives somewhere below it.
func withinDir(path, dir string) bool {
	rel, err := filepath.Rel(filepath.Clean(dir), path)
	if err != nil {
		return false
	}
	return filepath.IsLocal(rel)
}

// gitRootBelowHome walks dir upward looking for a ".git" entry, stopping strictly below
// home without checking home itself: a dotfiles repo's .git at $HOME must not make every
// binary under $HOME "unmanaged". Returns the directory holding the ".git" entry found.
func gitRootBelowHome(dir, home string) (string, bool) {
	home = filepath.Clean(home)
	for {
		if dir == home || dir == string(filepath.Separator) || dir == "." {
			return "", false
		}
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

// WritableDir is the production `access` func for Classify/Reclassify: it reports whether
// dir is writable by the current user by attempting to create and immediately remove a
// probe file — Go's stdlib has no direct "is this writable" query.
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
