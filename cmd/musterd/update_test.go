package main

// D21 exercises runUpdate directly (the -update flag's actual logic, REQ-22) against a
// scratch exePath and a fake release origin, rather than through run() itself: run()
// resolves exePath via os.Executable(), which inside `go test` is the compiled test
// binary currently executing these very tests — driving a full download+verify+install
// through run() would rename a new file over that binary while it's running. Two of the
// six scenarios below (dev, homebrew, already-up-to-date) are also exercised through
// run() itself, since none of those three ever reaches AcquireLock/Apply and so never
// touches any file at all — see TestRun_UpdateFlag_SafeSubset below.
//
// D22's argv/env-passthrough claim (INV-7) is covered by TestReexec_PassesArgvAndEnvVerbatim
// via the classic TestHelperProcess subprocess pattern (os/exec's own tests use the same
// shape): a harness subprocess (this same test binary, re-invoked) calls reexec() for
// real, into a tiny recorder script — never the go test binary's own file. D22's "a
// startup with MUSTER_RESTARTED set skips openDashboard" is covered in open_test.go
// (TestOpen_MusterRestartedSuppressesAutoOpenEvenWithATerminalStdin), extending that
// file's existing real-subprocess+pty pattern.

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
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"aead.dev/minisign"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/selfupdate"
)

// newUpdateFakeOrigin serves /latest (redirecting to latestTag) and /download/<tag>/*
// for exactly one published release — enough for runUpdate's own logic, which never
// re-checks or retries.
type updateFakeReleaseFixture struct {
	archive, checksums, minisig []byte
}

func newUpdateFakeOrigin(t *testing.T, latestTag string, release map[string]updateFakeReleaseFixture) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/latest", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "/tag/"+latestTag)
		w.WriteHeader(http.StatusFound)
	})
	mux.HandleFunc("/download/", func(w http.ResponseWriter, r *http.Request) {
		rest := strings.TrimPrefix(r.URL.Path, "/download/")
		parts := strings.SplitN(rest, "/", 2)
		if len(parts) != 2 {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		tag, name := parts[0], parts[1]
		fixture, ok := release[tag]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var data []byte
		switch name {
		case "checksums.txt":
			data = fixture.checksums
		case "checksums.txt.minisig":
			data = fixture.minisig
		default:
			data = fixture.archive
		}
		if data == nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// buildSignedRelease builds a valid, minisign-signed release fixture for tag containing a
// "musterd" member with content.
func buildSignedRelease(t *testing.T, key minisign.PrivateKey, tag string, content []byte) updateFakeReleaseFixture {
	t.Helper()
	version, ok := selfupdate.ParseRelease(tag)
	require.True(t, ok)
	asset := selfupdate.AssetName(version.String(), "darwin", runtime.GOARCH)

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	require.NoError(t, tw.WriteHeader(&tar.Header{Name: "musterd", Mode: 0o755, Size: int64(len(content))}))
	_, err := tw.Write(content)
	require.NoError(t, err)
	require.NoError(t, tw.Close())
	require.NoError(t, gz.Close())
	archive := buf.Bytes()

	checksums := fmt.Appendf(nil, "%x  %s\n", sha256.Sum256(archive), asset)
	minisig := minisign.Sign(key, checksums)
	return updateFakeReleaseFixture{archive: archive, checksums: checksums, minisig: minisig}
}

func TestRunUpdate_DevInstallRefusesWithoutTouchingNetwork(t *testing.T) {
	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindDev}

	err := runUpdate(context.Background(), &stdout, &stderr, "http://should-never-be-hit.invalid", nil, "dev", "/irrelevant", install)

	require.ErrorIs(t, err, errUpdateFailed)
	assert.Contains(t, stderr.String(), "not a release build")
	assert.Empty(t, stdout.String())
}

func TestRunUpdate_HomebrewAndUnmanagedPrintTheirRemedy(t *testing.T) {
	tests := []struct {
		name string
		kind selfupdate.Kind
	}{
		{"homebrew", selfupdate.KindHomebrew},
		{"unmanaged", selfupdate.KindUnmanaged},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			remedy := "the " + tt.name + " remedy sentence"
			install := selfupdate.Install{Kind: tt.kind, Remedy: remedy}

			err := runUpdate(context.Background(), &stdout, &stderr, "http://should-never-be-hit.invalid", nil, "0.10.0", "/irrelevant", install)

			require.ErrorIs(t, err, errUpdateFailed)
			assert.Contains(t, stderr.String(), remedy)
		})
	}
}

func TestRunUpdate_AlreadyUpToDatePrintsAndExitsZero(t *testing.T) {
	origin := newUpdateFakeOrigin(t, "v0.10.0", nil)
	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}
	exePath := filepath.Join(t.TempDir(), "musterd")
	before := []byte("current binary bytes")
	require.NoError(t, os.WriteFile(exePath, before, 0o755))

	err := runUpdate(context.Background(), &stdout, &stderr, origin.URL, nil, "0.10.0", exePath, install)

	require.NoError(t, err)
	assert.Contains(t, stdout.String(), "already up to date")
	got, readErr := os.ReadFile(exePath)
	require.NoError(t, readErr)
	assert.Equal(t, before, got, "an up-to-date check must never touch the binary")
}

func TestRunUpdate_OlderLatestThanRunningIsAlsoUpToDate(t *testing.T) {
	// A rollback / stale mirror (edge case 4): the latest tag is *older* than running.
	origin := newUpdateFakeOrigin(t, "v0.9.0", nil)
	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}

	err := runUpdate(context.Background(), &stdout, &stderr, origin.URL, nil, "0.10.0", filepath.Join(t.TempDir(), "musterd"), install)

	require.NoError(t, err)
	assert.Contains(t, stdout.String(), "already up to date")
}

func TestRunUpdate_SuccessfulUpdateInstallsAndPrintsRestartMessage(t *testing.T) {
	_, key, pubFile := newRunUpdateTestKey(t)
	newContent := []byte("#!/bin/sh\necho new musterd\n")
	release := buildSignedRelease(t, key, "v0.11.0", newContent)
	origin := newUpdateFakeOrigin(t, "v0.11.0", map[string]updateFakeReleaseFixture{"v0.11.0": release})

	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}
	exePath := filepath.Join(t.TempDir(), "musterd")
	require.NoError(t, os.WriteFile(exePath, []byte("old content"), 0o755))

	err := runUpdate(context.Background(), &stdout, &stderr, origin.URL, pubFile, "0.10.0", exePath, install)

	require.NoError(t, err, "stderr: %s", stderr.String())
	assert.Contains(t, stdout.String(), "updated to v0.11.0 — restart musterd to finish")
	got, readErr := os.ReadFile(exePath)
	require.NoError(t, readErr)
	assert.Equal(t, newContent, got)
}

func TestRunUpdate_BadSignatureRefusesAndLeavesBinaryUnchanged(t *testing.T) {
	_, _, pubFile := newRunUpdateTestKey(t)
	_, foreignPriv, _ := newRunUpdateTestKey(t)
	release := buildSignedRelease(t, foreignPriv, "v0.11.0", []byte("new content")) // signed by the WRONG key
	origin := newUpdateFakeOrigin(t, "v0.11.0", map[string]updateFakeReleaseFixture{"v0.11.0": release})

	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}
	exePath := filepath.Join(t.TempDir(), "musterd")
	before := []byte("old content, must survive")
	require.NoError(t, os.WriteFile(exePath, before, 0o755))

	err := runUpdate(context.Background(), &stdout, &stderr, origin.URL, pubFile, "0.10.0", exePath, install)

	require.ErrorIs(t, err, errUpdateFailed)
	assert.Empty(t, stdout.String())
	got, readErr := os.ReadFile(exePath)
	require.NoError(t, readErr)
	assert.Equal(t, before, got, "a refused update must leave the binary byte-identical (INV-3)")
}

func TestRunUpdate_LatestTagFailurePrintsAndFails(t *testing.T) {
	var stdout, stderr bytes.Buffer
	install := selfupdate.Install{Kind: selfupdate.KindInstaller}

	err := runUpdate(context.Background(), &stdout, &stderr, "http://127.0.0.1:1", nil, "0.10.0", filepath.Join(t.TempDir(), "musterd"), install)

	require.ErrorIs(t, err, errUpdateFailed)
	assert.Contains(t, stderr.String(), "checking latest release")
}

func newRunUpdateTestKey(t *testing.T) (minisign.PublicKey, minisign.PrivateKey, []byte) {
	t.Helper()
	pub, priv, err := minisign.GenerateKey(nil)
	require.NoError(t, err)
	pubFile, err := pub.MarshalText()
	require.NoError(t, err)
	return pub, priv, pubFile
}

// TestRun_UpdateFlag_SafeSubset covers D21's "run([]string{"-update", ...})" claim
// directly, for exactly the scenarios that never touch any file: run() resolves exePath
// via the real os.Executable() (this test binary), so only paths that short-circuit
// before ever reaching AcquireLock/Apply are safe to drive through run() itself.
func TestRun_UpdateFlag_SafeSubset(t *testing.T) {
	t.Run("dev build (the package's default version) exits non-zero naming the reason", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		err := run([]string{"-update", "-update-base-url", "http://should-never-be-hit.invalid"}, nil, &stdout, &stderr)

		require.Error(t, err)
	})

	t.Run("homebrew classification via HOMEBREW_PREFIX exits non-zero naming brew", func(t *testing.T) {
		exe, err := os.Executable()
		require.NoError(t, err)
		resolved, err := filepath.EvalSymlinks(exe)
		require.NoError(t, err)

		oldVersion := version
		version = "0.10.0" // pretend this is a release build so Classify looks at the path
		t.Cleanup(func() { version = oldVersion })
		t.Setenv("HOMEBREW_PREFIX", filepath.Dir(resolved))

		var stdout, stderr bytes.Buffer
		runErr := run([]string{"-update", "-update-base-url", "http://should-never-be-hit.invalid"}, nil, &stdout, &stderr)

		require.Error(t, runErr)
		assert.Contains(t, stderr.String(), "brew upgrade musterd")
	})

	t.Run("already up to date exits zero and never touches the running binary", func(t *testing.T) {
		exe, err := os.Executable()
		require.NoError(t, err)
		resolved, err := filepath.EvalSymlinks(exe)
		require.NoError(t, err)
		before, err := os.ReadFile(resolved)
		require.NoError(t, err)

		origin := newUpdateFakeOrigin(t, "v0.10.0", nil)
		oldVersion := version
		version = "0.10.0"
		t.Cleanup(func() { version = oldVersion })

		var stdout, stderr bytes.Buffer
		runErr := run([]string{"-update", "-update-base-url", origin.URL}, nil, &stdout, &stderr)

		require.NoError(t, runErr, "stderr: %s", stderr.String())
		assert.Contains(t, stdout.String(), "already up to date")
		after, err := os.ReadFile(resolved)
		require.NoError(t, err)
		assert.Equal(t, before, after, "an up-to-date check must never touch the running test binary")
	})
}

// ---------------------------------------------------------------------------------------
// D22/INV-7: reexec passes os.Args and os.Environ()+MUSTER_RESTARTED=1 verbatim.

// TestReexecHelperProcess is not a real test: it's the subprocess body for
// TestReexec_PassesArgvAndEnvVerbatim, following the standard library's own
// TestHelperProcess pattern (see os/exec's tests) so that reexec's real syscall.Exec runs
// in a disposable subprocess, never in the go test binary that is executing this file.
func TestReexecHelperProcess(t *testing.T) {
	if os.Getenv("MUSTERD_REEXEC_HELPER") != "1" {
		t.Skip("not invoked as the reexec helper subprocess")
	}
	script := os.Getenv("MUSTERD_REEXEC_SCRIPT")
	err := reexec(script)
	// Only reached on failure — success replaces this process image entirely.
	fmt.Fprintln(os.Stderr, "reexec unexpectedly returned:", err)
	os.Exit(3)
}

// TestReexec_PassesArgvAndEnvVerbatim covers D22/INV-7: the re-exec'd process receives
// exactly the harness's own os.Args (verbatim, whatever they happen to be — nothing
// added, dropped or reordered) plus os.Environ() with MUSTER_RESTARTED=1 appended.
func TestReexec_PassesArgvAndEnvVerbatim(t *testing.T) {
	dir := t.TempDir()
	recordFile := filepath.Join(dir, "record.txt")
	script := filepath.Join(dir, "recorder.sh")
	scriptBody := "#!/bin/sh\n{\n  printf 'ARGC:%s\\n' \"$#\"\n  i=0\n  for a in \"$@\"; do i=$((i+1)); printf 'ARG%s:%s\\n' \"$i\" \"$a\"; done\n  env\n} > \"$RECORD_FILE\"\n"
	require.NoError(t, os.WriteFile(script, []byte(scriptBody), 0o755))

	selfPath, err := os.Executable()
	require.NoError(t, err)

	cmd := exec.Command(selfPath, "-test.run=^TestReexecHelperProcess$", "-test.v=false",
		"--", "fake-musterd-arg", "-tmux-socket", "custom-socket-name")
	cmd.Env = append(os.Environ(),
		"MUSTERD_REEXEC_HELPER=1",
		"MUSTERD_REEXEC_SCRIPT="+script,
		"RECORD_FILE="+recordFile,
	)
	out, runErr := cmd.CombinedOutput()
	require.NoError(t, runErr, "helper process output: %s", out)

	recorded, readErr := os.ReadFile(recordFile)
	require.NoError(t, readErr, "helper output: %s", out)
	lines := strings.Split(string(recorded), "\n")

	require.NotEmpty(t, lines)
	assert.Equal(t, fmt.Sprintf("ARGC:%d", len(cmd.Args)-1), lines[0],
		"the recorder must see exactly the harness's own argv (minus argv[0]), unchanged")
	for i, want := range cmd.Args[1:] {
		require.Greater(t, len(lines), i+1)
		assert.Equal(t, fmt.Sprintf("ARG%d:%s", i+1, want), lines[i+1],
			"INV-7: no flag may be added, dropped or reordered across the re-exec")
	}

	recordedText := string(recorded)
	assert.Contains(t, recordedText, "MUSTER_RESTARTED=1", "reexec must append MUSTER_RESTARTED=1")
	assert.Contains(t, recordedText, "MUSTERD_REEXEC_HELPER=1", "the harness's own environment must survive verbatim")
}
