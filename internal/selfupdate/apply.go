package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// Phase is one step of an Apply call, mirrored on the wire as `update.apply.phase`
// (kb:anchor/ws.update).
type Phase string

// The seven phases Apply/the update manager walk through, in order (kb:anchor/ws.update):
// Idle is never reported by Apply itself (it's the pre-apply/at-rest phase the manager
// starts at).
const (
	PhaseIdle        Phase = "idle"
	PhaseDownloading Phase = "downloading"
	PhaseVerifying   Phase = "verifying"
	PhaseInstalling  Phase = "installing"
	PhaseRestarting  Phase = "restarting"
	PhaseFailed      Phase = "failed"
	PhaseDone        Phase = "done"
)

// ApplyTimeout bounds one whole Apply call — three small files and one
// archive must never hang the daemon indefinitely.
const ApplyTimeout = 120 * time.Second

// releaseGOOS is the fixed asset OS component — muster only ships darwin builds, so
// this is a constant, never runtime.GOOS (which would still happen to be "darwin" on the
// only platform muster runs on, but a constant makes the asset name's OS component
// explicit rather than implicit).
const releaseGOOS = "darwin"

// FetchStatusError is a non-200 response to one of Apply's three small downloads — its
// "status <code>" cause classified by failure.go's fetchCause.
type FetchStatusError struct{ Status int }

func (e *FetchStatusError) Error() string { return fmt.Sprintf("status %d", e.Status) }

// DownloadError marks a failed download of one release asset — classified by failure.go's
// DescribeApplyFailure into the "couldn't download <file> (<cause>); nothing was installed"
// wire sentence (kb:adr/update-failure-one-sentence-chain-in-log). Asset is the file's own
// name (e.g. "checksums.txt", or the archive's own name); Err is the fetch failure, a
// *FetchStatusError or a transport error.
type DownloadError struct {
	Asset string
	Err   error
}

func (e *DownloadError) Error() string { return fmt.Sprintf("downloading %s: %s", e.Asset, e.Err) }
func (e *DownloadError) Unwrap() error { return e.Err }

// MissingSignatureError is a 404 on checksums.txt.minisig specifically, checked ahead of
// the generic DownloadError so failure.go's DescribeApplyFailure can give a missing
// signature its own distinct wire sentence rather than the generic download-failure one.
// Error() is the log-only text; failure.go owns the wire sentence (§ Design "One owner
// per concept" — this package has one home per user-facing failure sentence, this type's
// own Error() is deliberately not it).
type MissingSignatureError struct{ Status int }

func (e *MissingSignatureError) Error() string {
	return fmt.Sprintf("checksums.txt.minisig: status %d (missing signature)", e.Status)
}

// Options configures one Apply call.
type Options struct {
	// Client makes the three downloads. Nil defaults to http.DefaultClient.
	Client *http.Client
	// Base is the update base URL (e.g. https://github.com/Zalaras/muster/releases).
	Base string
	// Tag is the release tag to install, e.g. "v0.11.0".
	Tag string
	// ExePath is the resolved (os.Executable + filepath.EvalSymlinks) real path of the
	// running binary — the temp file is written beside it and renamed over it.
	ExePath string
	// PubKey is the compiled-in (or -update-public-key-file-overridden) minisign public
	// key file's raw bytes.
	PubKey []byte
	// Progress, if non-nil, is called synchronously as each phase begins.
	Progress func(Phase)
}

// Apply downloads the release archive plus checksums.txt/checksums.txt.minisig for
// runtime.GOARCH, verifies them, extracts the musterd member, and
// installs it over opts.ExePath, reporting phases via opts.Progress. Any
// failure returns before installBinary is ever reached, so opts.ExePath stays
// byte-identical to before the call (kb:adr/update-trust-root-minisign-signed-checksums)
// — including a failure during
// installBinary itself, which removes its own temp file on every error path.
func Apply(ctx context.Context, opts Options) error {
	ctx, cancel := context.WithTimeout(ctx, ApplyTimeout)
	defer cancel()

	report := opts.Progress
	if report == nil {
		report = func(Phase) {}
	}

	client := opts.Client
	if client == nil {
		client = http.DefaultClient
	}

	version, ok := ParseRelease(opts.Tag)
	if !ok {
		return fmt.Errorf("release tag %q is not a valid version", opts.Tag)
	}
	asset := AssetName(version.String(), releaseGOOS, runtime.GOARCH)

	report(PhaseDownloading)
	archiveData, err := fetch(ctx, client, DownloadURL(opts.Base, opts.Tag, asset))
	if err != nil {
		return &DownloadError{Asset: asset, Err: err}
	}
	checksumsData, err := fetch(ctx, client, DownloadURL(opts.Base, opts.Tag, "checksums.txt"))
	if err != nil {
		return &DownloadError{Asset: "checksums.txt", Err: err}
	}
	minisigData, err := fetch(ctx, client, DownloadURL(opts.Base, opts.Tag, "checksums.txt.minisig"))
	if err != nil {
		var statusErr *FetchStatusError
		if errors.As(err, &statusErr) && statusErr.Status == http.StatusNotFound {
			return &MissingSignatureError{Status: statusErr.Status}
		}
		return &DownloadError{Asset: "checksums.txt.minisig", Err: err}
	}

	report(PhaseVerifying)
	if err = VerifyChecksums(opts.PubKey, checksumsData, minisigData); err != nil {
		return err
	}
	wantSum, err := ChecksumFor(checksumsData, asset)
	if err != nil {
		return err
	}
	if SHA256Of(archiveData) != wantSum {
		return ErrChecksumMismatch
	}

	report(PhaseInstalling)
	member, err := extractMember(archiveData, "musterd")
	if err != nil {
		return err
	}
	if err := installBinary(opts.ExePath, opts.Tag, member); err != nil {
		return err
	}

	return nil
}

// fetch GETs url and returns its body, or a *FetchStatusError for a non-200 response —
// callers (Apply) wrap either into a *DownloadError/*MissingSignatureError naming which
// asset failed.
func fetch(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, &FetchStatusError{Status: resp.StatusCode}
	}
	return io.ReadAll(resp.Body)
}

// extractMember returns name's contents from a gzipped tar archive, matched by
// basename so a leading directory entry in the tar (if any) doesn't matter. An archive
// with no such member (e.g. one carrying only README.md) is an error, not
// a zero-length result.
func extractMember(archive []byte, name string) ([]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, fmt.Errorf("opening archive: %w", err)
	}
	defer func() { _ = gz.Close() }()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading archive: %w", err)
		}
		if filepath.Base(hdr.Name) != name {
			continue
		}
		data, err := io.ReadAll(tr)
		if err != nil {
			return nil, fmt.Errorf("reading %s from archive: %w", name, err)
		}
		return data, nil
	}
	return nil, fmt.Errorf("archive has no %s member", name)
}

// installBinary writes data to a fixed-name temp file beside exePath (same filesystem,
// so the final rename is atomic) named ".musterd-<tag>.tmp",
// chmods it 0755, then renames it over exePath. exePath itself is never opened for
// writing — the temp file is removed on every failure path, so a write error or a
// disk-full mid-write leaves exePath untouched
// (kb:adr/update-trust-root-minisign-signed-checksums).
func installBinary(exePath, tag string, data []byte) error {
	dir := filepath.Dir(exePath)
	tmpPath := filepath.Join(dir, fmt.Sprintf(".musterd-%s.tmp", tag))

	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("writing new binary: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("chmod new binary: %w", err)
	}
	if err := os.Rename(tmpPath, exePath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("installing new binary: %w", err)
	}
	return nil
}
