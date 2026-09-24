package claudecode

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"strings"
	"time"
)

// ErrNoCredentials is returned by a TokenReader when no Claude Code OAuth token is
// available — a fresh Mac, a logged-out Claude Code, a Keychain access prompt that
// can't be answered non-interactively, or (FileTokenReader) a missing/unreadable
// scratch file.
var ErrNoCredentials = errors.New("no claude code credentials available")

// TokenReader returns the Claude Code OAuth access token. It is re-read on every call —
// callers must never cache a value across polls, because Claude Code refreshes the
// Keychain item itself on its own runs.
type TokenReader func(ctx context.Context) (string, error)

// execFunc abstracts running an external command for KeychainTokenReader's tests
// (kb:adr/usage-keychain-token-read-only: no test may execute the real `security`
// binary). RunCommand is the production value.
type execFunc func(ctx context.Context, name string, args ...string) ([]byte, error)

// RunCommand is the production execFunc: runs name with args, returning stdout. Stderr
// is discarded — nothing on this path is ever logged (kb:adr/usage-keychain-token-read-only),
// including a Keychain access-prompt's own stderr text.
func RunCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	// WaitDelay bounds the wait for a descendant that inherited this stdout pipe
	// to close it. The timer starts when ctx is done or when Wait sees the
	// process exit, whichever comes first — without it, Run's Wait can block on
	// that descendant forever even with ctx never firing (docs/conventions.md
	// §Go).
	cmd.WaitDelay = 2 * time.Second
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	return stdout.Bytes(), nil
}

// keychainExecTimeout bounds the `security` invocation — a hung or prompting `security`
// process must not stall a poll tick forever.
const keychainExecTimeout = 2 * time.Second

// KeychainTokenReader reads the Claude Code OAuth token from the macOS Keychain item
// "Claude Code-credentials" (kb:fact/oauth-token-in-keychain), read-only
// (kb:adr/usage-keychain-token-read-only) — musterd never writes to the Keychain and
// never refreshes the token itself. user is the account name `security` looks the item
// up under (main passes os/user.Current()'s value); run is the exec seam that ADR
// requires for testing.
func KeychainTokenReader(user string, run execFunc) TokenReader {
	return func(ctx context.Context) (string, error) {
		cctx, cancel := context.WithTimeout(ctx, keychainExecTimeout)
		defer cancel()
		out, err := run(cctx, "security", "find-generic-password", "-a", user, "-w", "-s", "Claude Code-credentials")
		if err != nil {
			return "", ErrNoCredentials
		}
		return decodeOAuthToken(out)
	}
}

// FileTokenReader reads the same {"claudeAiOauth":{"accessToken":"…"}} shape from a
// plain file — the -usage-token-file test seam (kb:adr/usage-keychain-token-read-only)
// that makes it structurally impossible for a test to fall through to the real Keychain.
func FileTokenReader(path string) TokenReader {
	return func(_ context.Context) (string, error) {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", ErrNoCredentials
		}
		return decodeOAuthToken(data)
	}
}

// oauthCredentials is the Keychain item's (and the equivalent scratch file's) JSON
// shape — the only fields musterd reads (kb:fact/oauth-token-in-keychain).
type oauthCredentials struct {
	ClaudeAiOauth struct {
		AccessToken string `json:"accessToken"`
	} `json:"claudeAiOauth"`
}

func decodeOAuthToken(data []byte) (string, error) {
	var creds oauthCredentials
	if err := json.Unmarshal(bytes.TrimSpace(data), &creds); err != nil {
		return "", ErrNoCredentials
	}
	token := strings.TrimSpace(creds.ClaudeAiOauth.AccessToken)
	if token == "" {
		return "", ErrNoCredentials
	}
	return token, nil
}
