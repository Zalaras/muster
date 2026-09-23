package claudecode

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"strings"
	"time"
)

// modelCatalogSentence is the one signal REQ-1's pre-check trusts
// (kb:fact/model-catalog-precheck-zero-token): the substring Claude Code's `--bare` run
// prints to stderr for a model its own catalog does not describe. Exit code is always 1
// either way, so it carries no information (INV-2).
const modelCatalogSentence = "isn't described by this version's model catalog"

// ModelVerdict is CheckModel's neutral result — the caller branches on it and never sees
// modelCatalogSentence itself (the package-boundary hard rule; D11).
type ModelVerdict int

const (
	// ModelRecognised covers every outcome except the measured refusal: a known model, an
	// older binary with no catalog, or a check that could not run (fails open, REQ-2).
	ModelRecognised ModelVerdict = iota
	// ModelUnrecognised means stderr carried modelCatalogSentence.
	ModelUnrecognised
)

// ModelCheckRun is the injectable seam CheckModel calls instead of a real subprocess
// (docs/conventions.md § Testing, mirroring credentials.go's execFunc) — the production
// value is RunModelCheck. It returns the run's stderr; a nil error covers any process
// completion, including the catalog run's own always-exit-1 (REQ-2).
type ModelCheckRun func(ctx context.Context, dir string, argv []string) ([]byte, error)

// modelCheckWaitDelay bounds the wait for a descendant that inherited the stderr pipe to
// close it once ctx fires (docs/conventions.md § Go).
const modelCheckWaitDelay = 2 * time.Second

// modelCheckTimeout bounds REQ-1's pre-check subprocess (kb:fact/model-catalog-precheck-zero-token
// measured it at about 1 s; 5 s leaves slack for a wedged binary before the check's own
// fail-open, REQ-2, lets the launch proceed) — applied inside CheckModel itself, the way
// credentials.go's keychainExecTimeout is applied inside KeychainTokenReader.
const modelCheckTimeout = 5 * time.Second

// RunModelCheck is CheckModel's production ModelCheckRun: runs argv[0] with the rest as
// args, in dir, with empty stdin (kb:fact/model-catalog-precheck-zero-token's `</dev/null`),
// returning stderr. The catalog run always exits 1 (REQ-2), so a plain *exec.ExitError is
// not reported as a failure — only a run that could not start or was killed by
// modelCheckWaitDelay/ctx is.
//
// A ctx-cancelled kill also surfaces as a plain *exec.ExitError ("signal: killed") — Go's
// exec package does not tag it any differently from a process that exited on its own — so
// errors.As alone cannot tell the two apart. modelCheckWaitDelay only ever fires once ctx
// is already done (it bounds the wait *after* Cancel/ctx-done, never before), so checking
// ctx.Err() first closes both the ctx-deadline kill and the WaitDelay-forced one with a
// single check, ahead of the ExitError swallow.
func RunModelCheck(ctx context.Context, dir string, argv []string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
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

// CheckModel runs REQ-1's zero-token pre-check for model in dir: `<bin> --bare
// --no-session-persistence --model <model> -p ""` through run (D5), bounded by
// modelCheckTimeout. A run error (the binary can't start, or blocks past the deadline) is
// returned to the caller so Launch can fail open and log a warning without the stderr body
// (REQ-2); the verdict is ModelUnrecognised iff stderr carries modelCatalogSentence
// (INV-2), never the exit code.
func CheckModel(ctx context.Context, run ModelCheckRun, bin, dir, model string) (ModelVerdict, error) {
	ctx, cancel := context.WithTimeout(ctx, modelCheckTimeout)
	defer cancel()
	argv := []string{bin, "--bare", "--no-session-persistence", "--model", model, "-p", ""}
	stderr, err := run(ctx, dir, argv)
	if err != nil {
		return ModelRecognised, err
	}
	if stderrSaysUnrecognised(stderr) {
		return ModelUnrecognised, nil
	}
	return ModelRecognised, nil
}

// stderrSaysUnrecognised reports whether stderr carries Claude Code's model-catalog
// refusal sentence — the only thing REQ-1's check trusts (INV-2).
func stderrSaysUnrecognised(stderr []byte) bool {
	return strings.Contains(string(stderr), modelCatalogSentence)
}
