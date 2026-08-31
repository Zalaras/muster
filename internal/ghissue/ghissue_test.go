package ghissue

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- GhCLITokenReader (no test here may execute the real `gh` binary — every test
// injects its own lookPath/run) ---

func TestGhCLITokenReader_Success_ParsesTrimmedStdoutAndPassesExpectedArgs(t *testing.T) {
	var gotLookPathArg string
	lookPath := func(name string) (string, error) {
		gotLookPathArg = name
		return "/usr/local/bin/gh", nil
	}
	var gotName string
	var gotArgs []string
	run := func(_ context.Context, name string, args ...string) (string, string, error) {
		gotName = name
		gotArgs = args
		return "  tok-abc-123  \n", "", nil
	}

	token, err := GhCLITokenReader(lookPath, run)(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "tok-abc-123", token)
	assert.Equal(t, "gh", gotLookPathArg)
	assert.Equal(t, "gh", gotName, "GhCLITokenReader must never run anything but the injected exec func")
	assert.Equal(t, []string{"auth", "token"}, gotArgs)
}

func TestGhCLITokenReader_GhNotOnPath_ReturnsErrAuthFailed(t *testing.T) {
	lookPath := func(string) (string, error) { return "", errors.New("not found") }
	run := func(context.Context, string, ...string) (string, string, error) {
		t.Fatal("run must not be called when gh is not on PATH")
		return "", "", nil
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.Contains(t, authErr.Message, "gh auth login")
}

func TestGhCLITokenReader_NonZeroExit_ReturnsErrAuthFailedWithTrimmedStderr(t *testing.T) {
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	run := func(context.Context, string, ...string) (string, string, error) {
		return "", "  not logged in  \n", errors.New("exit status 1")
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.Contains(t, authErr.Message, "not logged in")
	assert.Contains(t, authErr.Message, "gh auth login")
}

func TestGhCLITokenReader_NonZeroExitEmptyStderr_UsesGenericMessage(t *testing.T) {
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	run := func(context.Context, string, ...string) (string, string, error) {
		return "", "", errors.New("exit status 1")
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.Contains(t, authErr.Message, "gh auth token exited with an error")
}

func TestGhCLITokenReader_EmptyToken_ReturnsErrAuthFailed(t *testing.T) {
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	run := func(context.Context, string, ...string) (string, string, error) {
		return "   \n", "", nil
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.Contains(t, authErr.Message, "empty token")
}

// TestGhCLITokenReader_AppliesFiveSecondTimeout covers the Implementation Notes' "5s,
// matching versionCheckTimeout in main.go" — a hung `gh auth token` must not stall a
// filing attempt forever.
func TestGhCLITokenReader_AppliesFiveSecondTimeout(t *testing.T) {
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	var gotDeadline time.Time
	var hasDeadline bool
	run := func(ctx context.Context, _ string, _ ...string) (string, string, error) {
		gotDeadline, hasDeadline = ctx.Deadline()
		return "tok", "", nil
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	require.NoError(t, err)
	require.True(t, hasDeadline, "the exec func must receive a context with a deadline")
	assert.WithinDuration(t, time.Now().Add(ghTokenTimeout), gotDeadline, 500*time.Millisecond)
}

// TestGhCLITokenReader_RespectsParentContextCancellation ensures a caller-cancelled ctx
// propagates into the exec seam rather than being silently swallowed.
func TestGhCLITokenReader_RespectsParentContextCancellation(t *testing.T) {
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var sawCanceled bool
	run := func(runCtx context.Context, _ string, _ ...string) (string, string, error) {
		sawCanceled = runCtx.Err() != nil
		return "", "", runCtx.Err()
	}

	_, err := GhCLITokenReader(lookPath, run)(ctx)

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.True(t, sawCanceled, "the parent's cancellation must be visible to the exec seam")
}

// TestGhCLITokenReader_StdoutNeverEchoedIntoTheErrorEvenOnFailure is D9's ghissue-level
// defense for the auth step: gh's stdout is where the token lives (REQ-11/INV-3), so an
// error must carry only the trimmed stderr, never stdout — even if a misbehaving `gh`
// build printed something to stdout on a non-zero exit.
func TestGhCLITokenReader_StdoutNeverEchoedIntoTheErrorEvenOnFailure(t *testing.T) {
	const secretToken = "gh-stdout-leak-sentinel-do-not-echo"
	lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
	run := func(context.Context, string, ...string) (string, string, error) {
		return secretToken, "permission denied", errors.New("exit status 1")
	}

	_, err := GhCLITokenReader(lookPath, run)(context.Background())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "permission denied", "stderr is legitimately reported")
	assert.NotContains(t, err.Error(), secretToken, "stdout must never appear in the error")
}

// --- FileTokenReader (the -issue-token-file test seam, REQ-14) ---

func TestFileTokenReader_Success(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.txt")
	require.NoError(t, os.WriteFile(path, []byte("  file-token-xyz  \n"), 0o600))

	token, err := FileTokenReader(path)(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "file-token-xyz", token)
}

func TestFileTokenReader_MissingFile_ReturnsErrAuthFailed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist.txt")

	_, err := FileTokenReader(path)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
}

func TestFileTokenReader_EmptyFile_ReturnsErrAuthFailed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.txt")
	require.NoError(t, os.WriteFile(path, []byte("   \n"), 0o600))

	_, err := FileTokenReader(path)(context.Background())

	var authErr *ErrAuthFailed
	require.ErrorAs(t, err, &authErr)
	assert.Contains(t, authErr.Message, "empty")
}

func TestFileTokenReader_ReReadsOnEveryCall(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token.txt")
	require.NoError(t, os.WriteFile(path, []byte("tok-old"), 0o600))
	reader := FileTokenReader(path)

	first, err := reader(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "tok-old", first)

	require.NoError(t, os.WriteFile(path, []byte("tok-new"), 0o600))

	second, err := reader(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "tok-new", second, "a changed file must be reflected on the very next call, not cached")
}

// --- Client.CreateIssue ---

type capturedRequest struct {
	method  string
	path    string
	headers http.Header
	body    createIssueRequest
}

// newIssueAPIStub returns an httptest.Server that decodes each request into a
// capturedRequest slot and replies with the given status/body — used by every
// CreateIssue test below so no test ever reaches real GitHub.
func newIssueAPIStub(t *testing.T, status int, body string) (*httptest.Server, *capturedRequest) {
	t.Helper()
	var got capturedRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.method = r.Method
		got.path = r.URL.Path
		got.headers = r.Header.Clone()
		_ = json.NewDecoder(r.Body).Decode(&got.body)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &got
}

func staticTokenReader(token string) TokenReader {
	return func(context.Context) (string, error) { return token, nil }
}

func TestClient_CreateIssue_Success_PostsExpectedHeadersPathAndBody(t *testing.T) {
	srv, got := newIssueAPIStub(t, http.StatusCreated, `{"number":14,"html_url":"https://github.com/acme/widgets/issues/14"}`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("secret-tok")}

	number, htmlURL, err := c.CreateIssue(context.Background(), "acme/widgets", "the title", "the body")

	require.NoError(t, err)
	assert.Equal(t, 14, number)
	assert.Equal(t, "https://github.com/acme/widgets/issues/14", htmlURL)

	assert.Equal(t, http.MethodPost, got.method)
	assert.Equal(t, "/repos/acme/widgets/issues", got.path)
	assert.Equal(t, "Bearer secret-tok", got.headers.Get("Authorization"))
	assert.Equal(t, "application/vnd.github+json", got.headers.Get("Accept"))
	assert.Equal(t, "2022-11-28", got.headers.Get("X-GitHub-Api-Version"))
	assert.Equal(t, "the title", got.body.Title)
	assert.Equal(t, "the body", got.body.Body)
}

func TestClient_CreateIssue_TokenReaderFailure_NeverHitsNetworkAndReturnsErrUnwrapped(t *testing.T) {
	var requests int
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests++ }))
	defer srv.Close()
	sentinel := &ErrAuthFailed{Message: "gh auth token: not logged in; run `gh auth login`"}
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: func(context.Context) (string, error) {
		return "", sentinel
	}}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	require.Error(t, err)
	assert.Same(t, sentinel, err, "an auth-step failure must be returned unwrapped (Implementation Notes)")
	assert.Zero(t, requests, "no request must reach GitHub when the token could not be obtained")
}

func TestClient_CreateIssue_GitHubNon2xxWithMessage_ReturnsErrPostFailedWithStatusAndMessage(t *testing.T) {
	srv, _ := newIssueAPIStub(t, http.StatusForbidden, `{"message":"Forbidden — token lacks repo scope"}`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.Contains(t, postErr.Message, "403")
	assert.Contains(t, postErr.Message, "Forbidden")
	assert.False(t, postErr.MaybeCreated)
}

func TestClient_CreateIssue_GitHubNon2xxNonJSONBody_ReturnsErrPostFailedWithStatusOnly(t *testing.T) {
	srv, _ := newIssueAPIStub(t, http.StatusInternalServerError, `<html>internal error</html>`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.Contains(t, postErr.Message, "500")
	assert.False(t, postErr.MaybeCreated)
}

func TestClient_CreateIssue_TransportError_ReturnsErrPostFailed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	badURL := srv.URL
	srv.Close() // closed before use: connecting now fails at the transport layer

	c := &Client{HTTPClient: srv.Client(), BaseURL: badURL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.False(t, postErr.MaybeCreated)
}

func TestClient_CreateIssue_2xxUnparseableBody_ReturnsErrPostFailedMaybeCreatedTrue(t *testing.T) {
	srv, _ := newIssueAPIStub(t, http.StatusCreated, `not json at all`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.True(t, postErr.MaybeCreated, "a 2xx that failed to parse means the issue may have been created upstream")
	assert.Contains(t, postErr.Message, "may nonetheless have been created")
}

// TestClient_CreateIssue_2xxEmptyObjectBody_ReturnsErrPostFailedMaybeCreatedTrue covers
// review cycle 1 Minor 4: "{}" unmarshals cleanly (unlike the sibling unparseable-body
// test above), so it must be caught by the Number==0/HTMLURL=="" guard rather than
// slipping through as a (0, "", nil) success that would render "Filed <repo>#0" linked to
// an empty href with the capture consumed for nothing (Edge Case 9).
func TestClient_CreateIssue_2xxEmptyObjectBody_ReturnsErrPostFailedMaybeCreatedTrue(t *testing.T) {
	srv, _ := newIssueAPIStub(t, http.StatusCreated, `{}`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	number, htmlURL, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.True(t, postErr.MaybeCreated, "a 2xx with no usable issue number/URL means the issue may have been created upstream")
	assert.Contains(t, postErr.Message, "may nonetheless have been created")
	assert.Zero(t, number)
	assert.Empty(t, htmlURL)
}

// TestClient_CreateIssue_2xxZeroNumberNonEmptyURL_ReturnsErrPostFailedMaybeCreatedTrue
// covers the other half of the Number==0 || HTMLURL=="" guard: a body that supplies a
// URL but no usable issue number must also be treated as not-a-success.
func TestClient_CreateIssue_2xxZeroNumberNonEmptyURL_ReturnsErrPostFailedMaybeCreatedTrue(t *testing.T) {
	srv, _ := newIssueAPIStub(t, http.StatusCreated, `{"number":0,"html_url":"https://github.com/acme/widgets/issues/0"}`)
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

	var postErr *ErrPostFailed
	require.ErrorAs(t, err, &postErr)
	assert.True(t, postErr.MaybeCreated)
}

func TestClient_CreateIssue_DerivesRequestTimeoutFromCallerContext(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"number":1,"html_url":"https://x"}`))
		}
	}))
	defer func() { close(release); srv.Close() }()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // caller already gone
	c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: staticTokenReader("tok")}

	_, _, err := c.CreateIssue(ctx, "acme/widgets", "t", "b")

	require.Error(t, err, "a cancelled caller context must abort the request rather than hang")
}

// TestCreateIssue_ErrorMessagesNeverContainTheToken is D9: the same defensive shape as
// claudecode's TestFetchUsage_ErrorMessagesNeverContainTheToken, exercised across every
// INV-3 failure path reachable through CreateIssue itself (not just the token-reader
// unit tests above).
func TestCreateIssue_ErrorMessagesNeverContainTheToken(t *testing.T) {
	const secretToken = "super-secret-bearer-token-INV3"
	reader := staticTokenReader(secretToken)

	cases := []struct {
		name   string
		status int
		body   string
	}{
		{"github 401", http.StatusUnauthorized, `{"message":"Bad credentials"}`},
		{"github 403", http.StatusForbidden, `{"message":"Forbidden"}`},
		{"github 404", http.StatusNotFound, `{"message":"Not Found"}`},
		{"github 500", http.StatusInternalServerError, ``},
		{"unparseable 2xx", http.StatusCreated, `not json`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, _ := newIssueAPIStub(t, tc.status, tc.body)
			c := &Client{HTTPClient: srv.Client(), BaseURL: srv.URL, TokenReader: reader}

			_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

			require.Error(t, err)
			assert.NotContains(t, err.Error(), secretToken)
		})
	}

	t.Run("transport error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
		badURL := srv.URL
		srv.Close()
		c := &Client{HTTPClient: srv.Client(), BaseURL: badURL, TokenReader: reader}

		_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

		require.Error(t, err)
		assert.NotContains(t, err.Error(), secretToken)
	})

	// The auth-step paths (gh missing / non-zero exit / empty token) go through
	// GhCLITokenReader rather than a static reader, so CreateIssue's *own* returned
	// error is asserted against a stdout value shaped like a real token.
	t.Run("gh missing", func(t *testing.T) {
		lookPath := func(string) (string, error) { return "", errors.New("not found") }
		c := &Client{TokenReader: GhCLITokenReader(lookPath, nil)}

		_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

		require.Error(t, err)
		assert.NotContains(t, err.Error(), secretToken)
	})

	t.Run("gh auth token non-zero exit with stdout containing token-shaped text", func(t *testing.T) {
		lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
		run := func(context.Context, string, ...string) (string, string, error) {
			return secretToken, "not logged in", errors.New("exit 1")
		}
		c := &Client{TokenReader: GhCLITokenReader(lookPath, run)}

		_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

		require.Error(t, err)
		assert.NotContains(t, err.Error(), secretToken)
	})

	t.Run("gh auth token prints empty token", func(t *testing.T) {
		lookPath := func(string) (string, error) { return "/usr/bin/gh", nil }
		run := func(context.Context, string, ...string) (string, string, error) {
			return "   ", "", nil
		}
		c := &Client{TokenReader: GhCLITokenReader(lookPath, run)}

		_, _, err := c.CreateIssue(context.Background(), "acme/widgets", "t", "b")

		require.Error(t, err)
		assert.NotContains(t, err.Error(), secretToken)
	})
}

// TestRunCommand_HarmlessSmokeTestNeverUsedByGhCLITokenReaderTests documents that every
// GhCLITokenReader test above passes its own func literal, never RunCommand — mirrors
// claudecode/credentials_test.go's identical guard. Exercises RunCommand exactly once,
// against a harmless always-installed binary, never `gh`.
func TestRunCommand_HarmlessSmokeTestNeverUsedByGhCLITokenReaderTests(t *testing.T) {
	stdout, stderr, err := RunCommand(context.Background(), "echo", "hello")

	require.NoError(t, err)
	assert.Contains(t, stdout, "hello")
	assert.Empty(t, stderr)
}
