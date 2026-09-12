package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildTarGz packs files (name -> content) into an in-memory gzipped tar archive — the
// shape Apply's extractMember reads.
func buildTarGz(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		require.NoError(t, tw.WriteHeader(&tar.Header{
			Name: name, Mode: 0o755, Size: int64(len(content)),
		}))
		_, err := tw.Write(content)
		require.NoError(t, err)
	}
	require.NoError(t, tw.Close())
	require.NoError(t, gz.Close())
	return buf.Bytes()
}

// checksumsLineFor builds a single-entry checksums.txt naming asset with data's SHA-256.
func checksumsLineFor(data []byte, asset string) []byte {
	return fmt.Appendf(nil, "%x  %s\n", sha256.Sum256(data), asset)
}

// fakeReleaseAssets is one release's three downloadable files, keyed by fixed names
// (Apply always requests exactly asset/checksums.txt/checksums.txt.minisig).
type fakeReleaseAssets struct {
	archive   []byte // nil serves 404 for the archive
	checksums []byte // nil serves 404 for checksums.txt
	minisig   []byte // nil serves 404 for checksums.txt.minisig
}

// assetNameForTag computes the exact asset name Apply itself will request for tag
// (AssetName(version, releaseGOOS, runtime.GOARCH)) — a test helper, not a server, so
// callers can build checksums.txt content before any server exists.
func assetNameForTag(t *testing.T, tag string) string {
	t.Helper()
	version, ok := ParseRelease(tag)
	require.True(t, ok, "test tag %q must itself be a valid release version", tag)
	return AssetName(version.String(), releaseGOOS, runtime.GOARCH)
}

// newFakeReleaseServer serves assets at exactly the paths DownloadURL builds for tag.
func newFakeReleaseServer(t *testing.T, tag string, assets fakeReleaseAssets) (srv *httptest.Server, asset string) {
	t.Helper()
	asset = assetNameForTag(t, tag)

	mux := http.NewServeMux()
	serve := func(pattern string, data []byte) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, _ *http.Request) {
			if data == nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
		})
	}
	serve("/download/"+tag+"/"+asset, assets.archive)
	serve("/download/"+tag+"/checksums.txt", assets.checksums)
	serve("/download/"+tag+"/checksums.txt.minisig", assets.minisig)

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, asset
}

// recordingProgress collects Phase reports in order, safe for the concurrent call
// pattern Apply itself never actually uses (synchronous calls) but a test double should
// not assume away.
type recordingProgress struct {
	mu     sync.Mutex
	phases []Phase
}

func (r *recordingProgress) record(p Phase) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.phases = append(r.phases, p)
}

func (r *recordingProgress) get() []Phase {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Phase(nil), r.phases...)
}

// TestApply_SuccessfulInstall covers D11's happy path plus D19's phase-ordering claim at
// the Apply level (the manager-level "done" phase is added by internal/server, not by
// Apply itself): downloading -> verifying -> installing, in order, then the real exe
// file's content is the archive's musterd member, mode 0755.
func TestApply_SuccessfulInstall(t *testing.T) {
	key := newTestKeypair(t)
	tag := "v0.11.0"
	newContent := []byte("#!/bin/sh\necho new musterd\n")
	archive := buildTarGz(t, map[string][]byte{"musterd": newContent, "README.md": []byte("hi")})

	asset := assetNameForTag(t, tag)
	checksums := checksumsLineFor(archive, asset)
	minisig := key.signLegacy(checksums)
	srv, _ := newFakeReleaseServer(t, tag, fakeReleaseAssets{archive: archive, checksums: checksums, minisig: minisig})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("old musterd content"), 0o755))

	progress := &recordingProgress{}
	err := Apply(context.Background(), Options{
		Client: srv.Client(), Base: srv.URL, Tag: tag, ExePath: exePath, PubKey: key.pubFile,
		Progress: progress.record,
	})

	require.NoError(t, err)
	assert.Equal(t, []Phase{PhaseDownloading, PhaseVerifying, PhaseInstalling}, progress.get())

	got, err := os.ReadFile(exePath)
	require.NoError(t, err)
	assert.Equal(t, newContent, got)

	info, err := os.Stat(exePath)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o755), info.Mode().Perm())

	// The temp file must not survive a successful apply.
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Len(t, entries, 1, "only the final exePath must remain, no leftover .musterd-*.tmp")
}

// TestApply_AcceptsPrehashedSignature covers REQ-15's second mode at the Apply level
// (verify_test.go covers VerifyChecksums directly; this proves Apply's own call site
// doesn't need to branch either).
func TestApply_AcceptsPrehashedSignature(t *testing.T) {
	key := newTestKeypair(t)
	tag := "v0.11.0"
	archive := buildTarGz(t, map[string][]byte{"musterd": []byte("new content")})
	asset := assetNameForTag(t, tag)
	checksums := checksumsLineFor(archive, asset)
	minisig := key.signPrehashed(checksums)
	srv, _ := newFakeReleaseServer(t, tag, fakeReleaseAssets{archive: archive, checksums: checksums, minisig: minisig})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("old"), 0o755))

	err := Apply(context.Background(), Options{
		Client: srv.Client(), Base: srv.URL, Tag: tag, ExePath: exePath, PubKey: key.pubFile,
	})

	require.NoError(t, err)
	got, err := os.ReadFile(exePath)
	require.NoError(t, err)
	assert.Equal(t, []byte("new content"), got)
}

// TestApply_SymlinkAtInvokedPathIsLeftAlone covers REQ-17's symlink clause: ExePath is
// always the already-resolved real path (os.Executable + EvalSymlinks, by contract), so
// Apply installs over the real file; a symlink elsewhere pointing at it is untouched —
// still a symlink, still pointing at the same real path — and following it now reads the
// new content.
func TestApply_SymlinkAtInvokedPathIsLeftAlone(t *testing.T) {
	key := newTestKeypair(t)
	tag := "v0.11.0"
	newContent := []byte("new real content")
	archive := buildTarGz(t, map[string][]byte{"musterd": newContent})
	asset := assetNameForTag(t, tag)
	checksums := checksumsLineFor(archive, asset)
	minisig := key.signLegacy(checksums)
	srv, _ := newFakeReleaseServer(t, tag, fakeReleaseAssets{archive: archive, checksums: checksums, minisig: minisig})

	realDir := t.TempDir()
	realPath := filepath.Join(realDir, "musterd-real")
	require.NoError(t, os.WriteFile(realPath, []byte("old real content"), 0o755))

	invokedDir := t.TempDir()
	invokedPath := filepath.Join(invokedDir, "musterd")
	require.NoError(t, os.Symlink(realPath, invokedPath))

	err := Apply(context.Background(), Options{
		Client: srv.Client(), Base: srv.URL, Tag: tag, ExePath: realPath, PubKey: key.pubFile,
	})
	require.NoError(t, err)

	lst, err := os.Lstat(invokedPath)
	require.NoError(t, err)
	assert.NotEqual(t, lst.Mode()&os.ModeSymlink, 0, "the invoked path must still be a symlink, not replaced")

	target, err := os.Readlink(invokedPath)
	require.NoError(t, err)
	assert.Equal(t, realPath, target, "the symlink's target must be unchanged")

	got, err := os.ReadFile(invokedPath) // follows the symlink
	require.NoError(t, err)
	assert.Equal(t, newContent, got, "following the symlink must now read the new content")
}

// exeUnchanged asserts exePath's bytes are byte-identical to before (INV-3/REQ-18) and
// no leftover .musterd-<tag>.tmp file remains beside it.
func exeUnchanged(t *testing.T, exePath string, before []byte, tag string) {
	t.Helper()
	got, err := os.ReadFile(exePath)
	require.NoError(t, err)
	assert.Equal(t, before, got, "the binary must be byte-identical after a refused apply")

	tmpPath := filepath.Join(filepath.Dir(exePath), fmt.Sprintf(".musterd-%s.tmp", tag))
	_, statErr := os.Stat(tmpPath)
	assert.True(t, os.IsNotExist(statErr), "no leftover temp file must survive a refusal")
}

// TestApply_RefusalsLeaveTheBinaryByteIdentical covers D10/D11/INV-3 across every
// verification and install failure point named in the plan's edge cases: each must
// refuse with a non-nil error and leave exePath completely untouched.
func TestApply_RefusalsLeaveTheBinaryByteIdentical(t *testing.T) {
	key := newTestKeypair(t)
	foreignKey := newTestKeypair(t)
	tag := "v0.11.0"
	goodArchive := buildTarGz(t, map[string][]byte{"musterd": []byte("new content")})
	asset := assetNameForTag(t, tag)
	goodChecksums := checksumsLineFor(goodArchive, asset)

	tests := []struct {
		name   string
		assets fakeReleaseAssets
	}{
		{
			name: "missing .minisig (404), no unsigned fallback",
			assets: fakeReleaseAssets{
				archive: goodArchive, checksums: goodChecksums, minisig: nil,
			},
		},
		{
			name: "tampered checksums.txt no longer matches its own signature",
			assets: fakeReleaseAssets{
				archive:   goodArchive,
				checksums: append(append([]byte{}, goodChecksums...), []byte("extra unsigned line\n")...),
				minisig:   key.signLegacy(goodChecksums),
			},
		},
		{
			name: "minisig signed by a foreign key",
			assets: fakeReleaseAssets{
				archive: goodArchive, checksums: goodChecksums, minisig: foreignKey.signLegacy(goodChecksums),
			},
		},
		{
			name: "truncated minisig",
			assets: fakeReleaseAssets{
				archive: goodArchive, checksums: goodChecksums,
				minisig: key.signLegacy(goodChecksums)[:10],
			},
		},
		{
			name: "archive SHA-256 differs from the signed checksums.txt line",
			assets: fakeReleaseAssets{
				archive:   append(append([]byte{}, goodArchive...), 0xff), // different bytes, same recorded checksum
				checksums: goodChecksums,
				minisig:   key.signLegacy(goodChecksums),
			},
		},
		{
			name: "checksums.txt has no line for this asset",
			assets: fakeReleaseAssets{
				archive:   goodArchive,
				checksums: checksumsLineFor(goodArchive, "musterd_0.11.0_linux_amd64.tar.gz"),
				minisig:   key.signLegacy(checksumsLineFor(goodArchive, "musterd_0.11.0_linux_amd64.tar.gz")),
			},
		},
		{
			name: "archive has no musterd member",
			assets: func() fakeReleaseAssets {
				readmeOnly := buildTarGz(t, map[string][]byte{"README.md": []byte("just docs")})
				sums := checksumsLineFor(readmeOnly, asset)
				return fakeReleaseAssets{archive: readmeOnly, checksums: sums, minisig: key.signLegacy(sums)}
			}(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, _ := newFakeReleaseServer(t, tag, tt.assets)

			dir := t.TempDir()
			exePath := filepath.Join(dir, "musterd")
			before := []byte("original untouched content")
			require.NoError(t, os.WriteFile(exePath, before, 0o755))

			err := Apply(context.Background(), Options{
				Client: srv.Client(), Base: srv.URL, Tag: tag, ExePath: exePath, PubKey: key.pubFile,
			})

			require.Error(t, err)
			exeUnchanged(t, exePath, before, tag)
		})
	}
}

// TestApply_WriteFailureDuringInstallLeavesBinaryUnchanged covers edge case 19 (disk
// full / write error during extract): the exe directory is made unwritable so the temp
// file can never be created; installBinary's own cleanup removes what it can and the
// original binary is never touched.
func TestApply_WriteFailureDuringInstallLeavesBinaryUnchanged(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory write permission bits")
	}
	key := newTestKeypair(t)
	tag := "v0.11.0"
	archive := buildTarGz(t, map[string][]byte{"musterd": []byte("new content")})
	asset := assetNameForTag(t, tag)
	checksums := checksumsLineFor(archive, asset)
	minisig := key.signLegacy(checksums)
	srv, _ := newFakeReleaseServer(t, tag, fakeReleaseAssets{archive: archive, checksums: checksums, minisig: minisig})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "musterd")
	before := []byte("original untouched content")
	require.NoError(t, os.WriteFile(exePath, before, 0o755))
	require.NoError(t, os.Chmod(dir, 0o500)) // read+execute only: no new file can be created
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })

	err := Apply(context.Background(), Options{
		Client: srv.Client(), Base: srv.URL, Tag: tag, ExePath: exePath, PubKey: key.pubFile,
	})

	require.Error(t, err)
	got, readErr := os.ReadFile(exePath)
	require.NoError(t, readErr)
	assert.Equal(t, before, got)
}

// TestApply_RequestsCarryA120SecondDeadline covers D26's Apply half via the same
// deadline-inspection technique as TestLatestTag_RequestCarriesTenSecondDeadline
// (release_test.go, same package): a fake transport captures the first request's
// context deadline and fails fast, so the assertion never actually waits 120s.
func TestApply_RequestsCarryA120SecondDeadline(t *testing.T) {
	transport := &deadlineCapturingTransport{remaining: make(chan time.Duration, 1)}
	client := &http.Client{Transport: transport}

	_ = Apply(context.Background(), Options{
		Client: client, Base: "http://example.invalid", Tag: "v0.11.0", ExePath: filepath.Join(t.TempDir(), "musterd"),
	})

	select {
	case remaining := <-transport.remaining:
		require.GreaterOrEqual(t, remaining, time.Duration(0), "Apply's request must carry a deadline")
		assert.InDelta(t, ApplyTimeout.Seconds(), remaining.Seconds(), 3, "the request's deadline must be ~ApplyTimeout (120s) from now")
	case <-time.After(2 * time.Second):
		t.Fatal("transport was never invoked")
	}
}
