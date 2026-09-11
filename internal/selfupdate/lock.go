package selfupdate

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// ErrInProgress is AcquireLock's failure when another process already holds the update
// lock (REQ-20's cross-process serialisation: `musterd -update` racing the daemon's own
// apply).
var ErrInProgress = errors.New("another musterd update is in progress")

// lockFileName is the flock target, beside the binary (Implementation Notes).
const lockFileName = ".musterd-update.lock"

// AcquireLock takes a non-blocking exclusive flock on <exeDir>/.musterd-update.lock,
// returning a release func the caller must call exactly once when its apply is done.
// Fails fast with ErrInProgress — never blocks — when another process already holds it.
func AcquireLock(exeDir string) (release func(), err error) {
	path := filepath.Join(exeDir, lockFileName)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("opening update lock file: %w", err)
	}

	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrInProgress
		}
		return nil, fmt.Errorf("locking update lock file: %w", err)
	}

	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}, nil
}
