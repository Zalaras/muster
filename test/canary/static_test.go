//go:build canary

package canary

import (
	"bytes"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// scanChunkSize and scanOverlap bound TestInstalledBinaryCarriesInterfaceStrings' read of
// the installed binary (the Mach-O bundle is ~200 MB — D8/Edge Case 18): read in fixed
// chunks, never the whole file into memory, keeping the tail of the previous chunk as
// overlap so a needle spanning a chunk boundary is still found. The longest needle below
// is "CLAUDE_CODE_SCROLL_SPEED" at 24 bytes; scanOverlap is comfortably above that.
const (
	scanChunkSize = 4 << 20
	scanOverlap   = 64
)

// TestInstalledBinaryCarriesInterfaceStrings is the static tier (REQ-7): it resolves the
// `claude` on PATH to the real binary it symlinks to and asserts, by byte-string
// presence only, that interface surface Muster depends on but cannot drive through a
// canary run is still there — CLAUDE_CODE_SCROLL_SPEED (read from
// claudecode.LaunchEnv() so the assertion follows production, never spelling the
// variable itself), the theme enum members, the usage endpoint path and beta header, the
// credential JSON key, the Keychain mechanism, and the permission-mode flag name. A
// string surviving does not prove semantics — it catches rename or removal, the
// silent-degrade failure class named for CLAUDE_CODE_SCROLL_SPEED in launch.go. Launches
// no session and opens no network connection, so it runs under MUSTER_CANARY_OFFLINE=1
// (REQ-10/INV-1) — it does not call harness(t) or live(t) at all.
func TestInstalledBinaryCarriesInterfaceStrings(t *testing.T) {
	binPath, err := exec.LookPath("claude")
	require.NoError(t, err, "claude must be on PATH")
	resolved, err := filepath.EvalSymlinks(binPath)
	require.NoErrorf(t, err, "resolving symlinks for %s", binPath)

	needles := map[string]string{}
	for k := range claudecode.LaunchEnv() {
		needles["LaunchEnv env var "+k] = k
	}
	for _, theme := range []string{"light-daltonized", "dark-daltonized", "light-ansi", "dark-ansi"} {
		needles["theme enum "+theme] = theme
	}
	needles["usage endpoint path"] = "/api/oauth/usage"
	needles["usage beta header"] = "oauth-2025-04-20"
	needles["credential JSON key"] = "claudeAiOauth"
	needles["Keychain mechanism"] = "find-generic-password"
	needles["permission-mode flag"] = "permission-mode"

	misses, err := scanForNeedles(resolved, needles)
	require.NoErrorf(t, err, "scanning %s", resolved)
	assert.Emptyf(t, misses, "installed binary %s lacks interface strings: %v", resolved, misses)
}

// scanForNeedles reads path in bounded, overlapping chunks and returns the name of every
// needle in needles that never appeared anywhere in it. It never holds the whole file in
// memory at once (D8).
func scanForNeedles(path string, needles map[string]string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()

	found := make(map[string]bool, len(needles))
	buf := make([]byte, scanChunkSize)
	var carry []byte
	for {
		n, readErr := f.Read(buf)
		if n > 0 {
			chunk := make([]byte, 0, len(carry)+n)
			chunk = append(chunk, carry...)
			chunk = append(chunk, buf[:n]...)
			for name, needle := range needles {
				if found[name] {
					continue
				}
				if bytes.Contains(chunk, []byte(needle)) {
					found[name] = true
				}
			}
			if len(chunk) > scanOverlap {
				carry = append([]byte(nil), chunk[len(chunk)-scanOverlap:]...)
			} else {
				carry = append([]byte(nil), chunk...)
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			return nil, readErr
		}
	}

	var misses []string
	for name := range needles {
		if !found[name] {
			misses = append(misses, name)
		}
	}
	return misses, nil
}
