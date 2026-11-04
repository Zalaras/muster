package session

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/store"
)

// migratedTemplate is a closed, fully migrated database file every openTestStore copies, so a
// test pays one file copy instead of replaying every migration (about 400 ms each under -race,
// measured 2026-11-04 on a store open alone).
var migratedTemplate string

func TestMain(m *testing.M) {
	os.Exit(runTestMain(m))
}

func runTestMain(m *testing.M) int {
	dir, err := os.MkdirTemp("", "muster-session-template-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "session test setup:", err)
		return 1
	}
	defer func() { _ = os.RemoveAll(dir) }()

	path := filepath.Join(dir, "muster.db")
	st, err := store.Open(context.Background(), path, zerolog.Nop())
	if err != nil {
		fmt.Fprintln(os.Stderr, "session test setup: migrating the template database:", err)
		return 1
	}
	if err := st.Close(); err != nil {
		fmt.Fprintln(os.Stderr, "session test setup: closing the template database:", err)
		return 1
	}
	migratedTemplate = path

	return m.Run()
}

// copyMigratedDB writes a private copy of the migrated template at dst, mode 0600 as
// store.Open leaves it.
func copyMigratedDB(dst string) error {
	body, err := os.ReadFile(migratedTemplate)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, body, 0o600)
}
