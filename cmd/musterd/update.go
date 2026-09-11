package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"syscall"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// errRestart is run()'s sentinel for "an applied update wants an in-place restart"
// (REQ-19): every step of a graceful shutdown (HTTP, WS, ingest, store) has already run
// by the time run() returns this — main performs the actual syscall.Exec itself
// (Implementation Notes "Re-exec"), so run() stays testable without ever replacing the
// test binary's own process image.
type errRestart struct {
	exe string
}

func (e *errRestart) Error() string {
	return "restart requested to apply an update"
}

// errUpdateFailed is runUpdate's generic non-nil return for every failure path — the
// user-facing text is already written to stderr by the time it's returned, so the
// message itself carries nothing further (main's own "musterd: <err>" line, printed
// after it, is a redundant but harmless second line).
var errUpdateFailed = errors.New("update failed")

// reexec replaces the current process image with exe, passing os.Args verbatim and
// os.Environ() plus MUSTER_RESTARTED=1 (REQ-19/INV-7: no flag added, dropped or
// reordered). Only returns on failure — syscall.Exec never returns on success.
func reexec(exe string) error {
	return syscall.Exec(exe, os.Args, append(os.Environ(), "MUSTER_RESTARTED=1"))
}

// runUpdate implements `musterd -update` (REQ-22): checks the latest release against
// the running version and, if strictly newer, downloads/verifies/installs it — never
// restarting anything. Prints the exact REQ-22 stdout messages on success; on failure it
// writes the remedy or verification error to stderr itself and returns errUpdateFailed
// (a non-nil error is enough for main to exit non-zero).
func runUpdate(ctx context.Context, stdout, stderr io.Writer, base string, pubKey []byte, running, exePath string, install selfupdate.Install) error {
	if install.Kind == selfupdate.KindDev {
		fmt.Fprintln(stderr, "not a release build")
		return errUpdateFailed
	}
	if install.Kind == selfupdate.KindHomebrew || install.Kind == selfupdate.KindUnmanaged {
		fmt.Fprintln(stderr, install.Remedy)
		return errUpdateFailed
	}

	client := http.DefaultClient

	tag, err := selfupdate.LatestTag(ctx, client, base)
	if err != nil {
		fmt.Fprintln(stderr, "checking latest release:", err)
		return errUpdateFailed
	}
	latest, ok := selfupdate.ParseRelease(tag)
	if !ok {
		fmt.Fprintln(stderr, "checking latest release: latest tag is not a release version")
		return errUpdateFailed
	}
	runningVersion, ok := selfupdate.ParseRelease(running)
	if !ok {
		// install.Kind would already be "dev" for this — belt and braces.
		fmt.Fprintln(stderr, "not a release build")
		return errUpdateFailed
	}
	if latest.Compare(runningVersion) <= 0 {
		fmt.Fprintln(stdout, "already up to date")
		return nil
	}

	release, err := selfupdate.AcquireLock(filepath.Dir(exePath))
	if err != nil {
		fmt.Fprintln(stderr, err)
		return errUpdateFailed
	}
	defer release()

	if err := selfupdate.Apply(ctx, selfupdate.Options{
		Client:  client,
		Base:    base,
		Tag:     tag,
		ExePath: exePath,
		PubKey:  pubKey,
	}); err != nil {
		fmt.Fprintln(stderr, err)
		return errUpdateFailed
	}

	fmt.Fprintf(stdout, "updated to v%s — restart musterd to finish\n", latest.String())
	return nil
}
