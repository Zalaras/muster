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
// (docs/protocol.md §5.7).
type Phase string

// The seven phases Apply/the update manager walk through, in order (D19): Idle is never
// reported by Apply itself (it's the pre-apply/at-rest phase the manager starts at).
const (
	PhaseIdle        Phase = "idle"
	PhaseDownloading Phase = "downloading"
	PhaseVerifying   Phase = "verifying"
	PhaseInstalling  Phase = "installing"
	PhaseRestarting  Phase = "restarting"
	PhaseFailed      Phase = "failed"
	PhaseDone        Phase = "done"
)

// ApplyTimeout bounds one whole Apply call (REQ-14/D26) — three small files and one
// archive must never hang the daemon indefinitely.
const ApplyTimeout = 120 * time.Second

// releaseGOOS is REQ-14's fixed asset OS component — muster only ships darwin builds, so
// this is a constant, never runtime.GOOS (which would still happen to be "darwin" on the
// only platform muster runs on, but the plan calls the asset name's OS component out
// explicitly rather than implicitly).
const releaseGOOS = "darwin"

// Options configures one Apply call.
type Options struct {
	// Client makes the three downloads. Nil defaults to http.DefaultClient.
	Client *http.Client
	// Base is the update base URL (e.g. https://github.com/Zalaras/muster/releases).
	Base string
	// Tag is the release tag to install, e.g. "v0.11.0".
	Tag string
	// ExePath is the resolved (os.Executable + filepath.EvalSymlinks) real path of the
	// running binary — the temp file is written beside it and renamed over it (REQ-17).
	ExePath string
	// PubKey is the compiled-in (or -update-public-key-file-overridden) minisign public
	// key file's raw bytes.
	PubKey []byte
	// Progress, if non-nil, is called synchronously as each phase begins.
	Progress func(Phase)
}

// Apply downloads the release archive plus checksums.txt/checksums.txt.minisig for
// runtime.GOARCH (REQ-14), verifies them (REQ-15/16), extracts the musterd member, and
// installs it over opts.ExePath (REQ-17), reporting phases via opts.Progress. Any
// failure returns before installBinary is ever reached, so opts.ExePath stays
// byte-identical to before the call (REQ-18/INV-3) — including a failure during
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
		return fmt.Errorf("downloading %s: %w", asset, err)
	}
	checksumsData, err := fetch(ctx, client, DownloadURL(opts.Base, opts.Tag, "checksums.txt"))
	if err != nil {
		return fmt.Errorf("downloading checksums.txt: %w", err)
	}
	minisigData, err := fetch(ctx, client, DownloadURL(opts.Base, opts.Tag, "checksums.txt.minisig"))
	if err != nil {
		return fmt.Errorf("downloading checksums.txt.minisig: %w — this release has no signature, refusing to apply", err)
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
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// extractMember returns name's contents from a gzipped tar archive (REQ-17), matched by
// basename so a leading directory entry in the tar (if any) doesn't matter. An archive
// with no such member (edge case 18, e.g. one carrying only README.md) is an error, not
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
// so the final rename is atomic) named ".musterd-<tag>.tmp" (Implementation Notes),
// chmods it 0755, then renames it over exePath. exePath itself is never opened for
// writing — the temp file is removed on every failure path, so a write error or a
// disk-full mid-write (edge case 19) leaves exePath untouched (REQ-18).
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
