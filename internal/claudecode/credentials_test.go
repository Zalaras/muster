package claudecode

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- KeychainTokenReader (D8: every test here uses an injected exec func; none may
// execute the real `security` binary) ---

func TestKeychainTokenReader_Success_ParsesAccessTokenAndPassesExpectedArgs(t *testing.T) {
	var gotName string
	var gotArgs []string
	run := func(_ context.Context, name string, args ...string) ([]byte, error) {
		gotName = name
		gotArgs = args
		return []byte(`{"claudeAiOauth":{"accessToken":"tok-abc-123"}}`), nil
	}

	token, err := KeychainTokenReader("damian", run)(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "tok-abc-123", token)
	assert.Equal(t, "security", gotName, "KeychainTokenReader must never call anything but the injected exec func")
	assert.Equal(t, []string{"find-generic-password", "-a", "damian", "-w", "-s", "Claude Code-credentials"}, gotArgs)
}

func TestKeychainTokenReader_ExecFailure_ReturnsErrNoCredentials(t *testing.T) {
	run := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return nil, errors.New("exit status 44")
	}

	_, err := KeychainTokenReader("damian", run)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials, "a fresh Mac / logged-out Claude Code / unanswerable Keychain prompt must all map to ErrNoCredentials")
}

func TestKeychainTokenReader_MalformedJSON_ReturnsErrNoCredentials(t *testing.T) {
	run := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return []byte(`not json at all`), nil
	}

	_, err := KeychainTokenReader("damian", run)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials)
}

func TestKeychainTokenReader_EmptyAccessToken_ReturnsErrNoCredentials(t *testing.T) {
	run := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return []byte(`{"claudeAiOauth":{"accessToken":""}}`), nil
	}

	_, err := KeychainTokenReader("damian", run)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials)
}

func TestKeychainTokenReader_MissingAccessTokenKey_ReturnsErrNoCredentials(t *testing.T) {
	run := func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return []byte(`{"claudeAiOauth":{}}`), nil
	}

	_, err := KeychainTokenReader("damian", run)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials)
}

// TestKeychainTokenReader_AppliesTwoSecondExecTimeout covers the Implementation Notes'
// "2 s exec timeout" — a hung or Keychain-prompting `security` process must not stall a
// poll tick forever (Edge Case 2).
func TestKeychainTokenReader_AppliesTwoSecondExecTimeout(t *testing.T) {
	var gotDeadline time.Time
	var hasDeadline bool
	run := func(ctx context.Context, _ string, _ ...string) ([]byte, error) {
		gotDeadline, hasDeadline = ctx.Deadline()
		return []byte(`{"claudeAiOauth":{"accessToken":"tok"}}`), nil
	}

	_, err := KeychainTokenReader("damian", run)(context.Background())

	require.NoError(t, err)
	require.True(t, hasDeadline, "the exec func must receive a context with a deadline")
	assert.WithinDuration(t, time.Now().Add(keychainExecTimeout), gotDeadline, 500*time.Millisecond)
}

// TestKeychainTokenReader_RespectsParentContextCancellation ensures a caller-cancelled
// ctx propagates into the exec seam rather than being silently swallowed.
func TestKeychainTokenReader_RespectsParentContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var sawCanceled bool
	run := func(runCtx context.Context, _ string, _ ...string) ([]byte, error) {
		sawCanceled = runCtx.Err() != nil
		return nil, runCtx.Err()
	}

	_, err := KeychainTokenReader("damian", run)(ctx)

	assert.ErrorIs(t, err, ErrNoCredentials)
	assert.True(t, sawCanceled, "the parent's cancellation must be visible to the exec seam")
}

// --- FileTokenReader (the -usage-token-file test seam, REQ-13) ---

func TestFileTokenReader_Success(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"claudeAiOauth":{"accessToken":"file-token-xyz"}}`), 0o600))

	token, err := FileTokenReader(path)(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "file-token-xyz", token)
}

func TestFileTokenReader_MissingFile_ReturnsErrNoCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist.json")

	_, err := FileTokenReader(path)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials)
}

func TestFileTokenReader_MalformedJSON_ReturnsErrNoCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(path, []byte(`not json`), 0o600))

	_, err := FileTokenReader(path)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials)
}

func TestFileTokenReader_EmptyAccessToken_ReturnsErrNoCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"claudeAiOauth":{"accessToken":"  "}}`), 0o600))

	_, err := FileTokenReader(path)(context.Background())

	assert.ErrorIs(t, err, ErrNoCredentials, "a whitespace-only token must trim to empty and be rejected")
}

func TestFileTokenReader_WhitespacePaddedFileStillParses(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(path, []byte("\n\t {\"claudeAiOauth\":{\"accessToken\":\"tok-1\"}} \n"), 0o600))

	token, err := FileTokenReader(path)(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "tok-1", token)
}

// TestFileTokenReader_ReReadsOnEveryCall covers the TokenReader doc comment directly:
// "re-read on every call — callers must never cache a value across polls" (Edge Case 3:
// Claude Code refreshes the Keychain item itself between musterd's ticks).
func TestFileTokenReader_ReReadsOnEveryCall(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"claudeAiOauth":{"accessToken":"tok-old"}}`), 0o600))
	reader := FileTokenReader(path)

	first, err := reader(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "tok-old", first)

	require.NoError(t, os.WriteFile(path, []byte(`{"claudeAiOauth":{"accessToken":"tok-new"}}`), 0o600))

	second, err := reader(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "tok-new", second, "a changed file must be reflected on the very next call, not cached")
}

// --- decodeOAuthToken (shared by both readers) ---

func TestDecodeOAuthToken_TrimsWhitespaceFromToken(t *testing.T) {
	token, err := decodeOAuthToken([]byte(`{"claudeAiOauth":{"accessToken":"  padded-token  "}}`))

	require.NoError(t, err)
	assert.Equal(t, "padded-token", token)
}

func TestDecodeOAuthToken_IgnoresUnknownSiblingKeys(t *testing.T) {
	token, err := decodeOAuthToken([]byte(`{"claudeAiOauth":{"accessToken":"tok","refreshToken":"rt","expiresAt":123},"otherTopLevel":true}`))

	require.NoError(t, err)
	assert.Equal(t, "tok", token)
}

// TestRunCommand_NeverExecutedByAnyOtherTestInThisFile documents D8 rather than testing
// RunCommand's own behaviour (which would require running a real external process) —
// every KeychainTokenReader test above passes its own func literal, never RunCommand
// itself. This test exists so a future edit that swaps a test's exec func back to
// RunCommand by accident fails obviously: it exercises RunCommand exactly once, against
// a harmless, always-installed binary, not `security`.
func TestRunCommand_HarmlessSmokeTestNeverUsedByKeychainTests(t *testing.T) {
	out, err := RunCommand(context.Background(), "echo", "hello")

	require.NoError(t, err)
	assert.Contains(t, string(out), "hello")
}
