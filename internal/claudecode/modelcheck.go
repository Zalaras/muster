package claudecode

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// modelCatalogSentence is the one signal the pre-check trusts
// (kb:fact/model-catalog-precheck-zero-token): the substring Claude Code's `--bare` run
// prints to stderr for a model its own catalog does not describe. Exit code is always 1
// either way, so it carries no information on its own.
const modelCatalogSentence = "isn't described by this version's model catalog"

// ModelVerdict is CheckModel's neutral result — the caller branches on it and never sees
// modelCatalogSentence itself (the package-boundary hard rule).
type ModelVerdict int

const (
	// ModelRecognised covers every outcome except the measured refusal: a known model, an
	// older binary with no catalog, or a check that could not run — the check fails open
	// (kb:adr/launch-model-check-cached-per-binary-identity).
	ModelRecognised ModelVerdict = iota
	// ModelUnrecognised means stderr carried modelCatalogSentence.
	ModelUnrecognised
)

// modelCheckRun is the injectable seam CheckModel calls instead of a real subprocess
// (docs/conventions.md § Testing, mirroring credentials.go's execFunc) — the production
// value is runModelCheck. It returns the run's stderr; a nil error covers any process
// completion, including the catalog run's own always-exit-1
// (kb:fact/model-catalog-precheck-zero-token). name/args carry the argv the same way
// every sibling run-func does; dir is prepended because the caller picks which directory
// the check runs in — the catalog is built into the binary, so the directory never feeds
// the verdict — the same "one signature per output need, plus a working-dir input where
// one is needed" shape gitutil.gitRunner's run field uses
// (kb:adr/process-adapter-run-seam-constructor-default).
type modelCheckRun func(ctx context.Context, dir, name string, args ...string) ([]byte, error)

// modelChecker holds the subprocess seam CheckModel crosses (the constructor-default
// shape docs/conventions.md § Testing names —
// kb:adr/process-adapter-run-seam-constructor-default): production always
// runModelCheck, same-package tests overwrite the field. Built fresh per call, like
// tmux.Preflight's newPreflighter().
type modelChecker struct {
	run modelCheckRun
}

func newModelChecker() *modelChecker {
	return &modelChecker{run: runModelCheck}
}

// modelCheckWaitDelay bounds the wait for a descendant that inherited the stderr pipe to
// close it once ctx fires (docs/conventions.md § Go).
const modelCheckWaitDelay = 2 * time.Second

// modelCheckTimeout bounds the pre-check subprocess (kb:fact/model-catalog-precheck-zero-token
// measured it at about 1 s; 5 s leaves slack for a wedged binary before the check's own
// fail-open (kb:adr/launch-model-check-cached-per-binary-identity) lets the launch
// proceed) — applied inside CheckModel itself, the way credentials.go's
// keychainExecTimeout is applied inside KeychainTokenReader.
const modelCheckTimeout = 5 * time.Second

// runModelCheck is CheckModel's production modelCheckRun: runs name with args, in dir,
// with empty stdin (kb:fact/model-catalog-precheck-zero-token's `</dev/null`), returning
// stderr. The catalog run always exits 1 (kb:fact/model-catalog-precheck-zero-token), so
// a plain *exec.ExitError is not reported as a failure — only a run that could not start
// or was killed by modelCheckWaitDelay/ctx is.
//
// A ctx-cancelled kill also surfaces as a plain *exec.ExitError ("signal: killed") — Go's
// exec package does not tag it any differently from a process that exited on its own — so
// errors.As alone cannot tell the two apart. modelCheckWaitDelay only ever fires once ctx
// is already done (it bounds the wait *after* Cancel/ctx-done, never before), so checking
// ctx.Err() first closes both the ctx-deadline kill and the WaitDelay-forced one with a
// single check, ahead of the ExitError swallow.
func runModelCheck(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader("")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.WaitDelay = modelCheckWaitDelay

	if err := cmd.Run(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return stderr.Bytes(), ctxErr
		}
		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) {
			return stderr.Bytes(), err
		}
	}
	return stderr.Bytes(), nil
}

// CheckModel runs the zero-token pre-check (kb:fact/model-catalog-precheck-zero-token) for
// model in dir: `<bin> --bare --no-session-persistence --model <model> -p ""`, bounded by
// modelCheckTimeout. A run error (the binary can't start, or blocks past the deadline) is
// returned to the caller — the model-catalog cache (modelsFeature) is what turns it into
// an uncached "unchecked" verdict and lets the launch fail open
// (kb:adr/launch-model-check-cached-per-binary-identity); the verdict is
// ModelUnrecognised iff stderr carries modelCatalogSentence, never the exit code.
func CheckModel(ctx context.Context, bin, dir, model string) (ModelVerdict, error) {
	return newModelChecker().check(ctx, bin, dir, model)
}

func (m *modelChecker) check(ctx context.Context, bin, dir, model string) (ModelVerdict, error) {
	ctx, cancel := context.WithTimeout(ctx, modelCheckTimeout)
	defer cancel()
	stderr, err := m.run(ctx, dir, bin, "--bare", "--no-session-persistence", "--model", model, "-p", "")
	if err != nil {
		return ModelRecognised, err
	}
	if stderrSaysUnrecognised(stderr) {
		return ModelUnrecognised, nil
	}
	return ModelRecognised, nil
}

// stderrSaysUnrecognised reports whether stderr carries Claude Code's model-catalog
// refusal sentence — the only thing the pre-check trusts.
func stderrSaysUnrecognised(stderr []byte) bool {
	return strings.Contains(string(stderr), modelCatalogSentence)
}

// BinaryIdentity is a resolved `claude` binary's cache key
// (kb:adr/launch-model-check-cached-per-binary-identity): the path exec.LookPath and
// EvalSymlinks resolve it to, plus that file's size and modification time. It is generic
// file identity, not anything about Claude Code's own versions/ layout — a Homebrew
// upgrade or an in-place binary replacement changes size and/or mtime either way, so both
// invalidate a cache keyed on this the same way. Comparable with ==, a plain value type.
type BinaryIdentity struct {
	Path    string
	Size    int64
	ModTime time.Time
}

// ResolveBinaryIdentity resolves bin on $PATH (following symlinks) and stats the result.
// A binary that can't be found, has a dangling symlink, or can't be stat'd returns an
// error — the caller treats that the same as a check that couldn't run: unchecked, and
// never cached.
func ResolveBinaryIdentity(bin string) (BinaryIdentity, error) {
	resolved, err := exec.LookPath(bin)
	if err != nil {
		return BinaryIdentity{}, fmt.Errorf("resolving %s on PATH: %w", bin, err)
	}
	resolved, err = filepath.EvalSymlinks(resolved)
	if err != nil {
		return BinaryIdentity{}, fmt.Errorf("resolving symlinks for %s: %w", resolved, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return BinaryIdentity{}, fmt.Errorf("stat %s: %w", resolved, err)
	}
	return BinaryIdentity{Path: resolved, Size: info.Size(), ModTime: info.ModTime()}, nil
}
