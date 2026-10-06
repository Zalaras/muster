package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// cachedStub returns the path of an executable script holding body, keyed by its content
// under the system temp dir so the same inode survives between runs. macOS charges the
// first exec of a newly written executable a real, serialized cost
// (kb:lesson/first-exec-of-fresh-script-costs-270ms) — a stub written fresh per test pays
// it every time, and a full `go test ./...` queues those charges behind each other. Keyed
// this way, only the first run on a machine pays. Mirrors internal/server's
// ensureStubClaude. A stub must therefore never embed a per-test path: it reads anything
// per-test from its environment or arguments instead.
func cachedStub(name, body string) (string, error) {
	sum := sha256.Sum256([]byte(body))
	dir := filepath.Join(os.TempDir(), "muster-musterd-stub-"+hex.EncodeToString(sum[:8]))
	path := filepath.Join(dir, name)
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	// Written under a temp name and renamed into place, so a concurrent package run never
	// executes a half-written script.
	tmp, err := os.CreateTemp(dir, name+"-*.partial")
	if err != nil {
		return "", err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.WriteString(body); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(tmp.Name(), 0o755); err != nil {
		return "", err
	}
	return path, os.Rename(tmp.Name(), path)
}

// writeStub is cachedStub for a test body.
func writeStub(t *testing.T, name, body string) string {
	t.Helper()
	path, err := cachedStub(name, body)
	require.NoError(t, err)
	return path
}
