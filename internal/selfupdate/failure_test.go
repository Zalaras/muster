package selfupdate

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeTimeoutErr implements net.Error with Timeout() true — the shape a hung request's
// own context deadline produces, without an actual clock wait.
type fakeTimeoutErr struct{}

func (fakeTimeoutErr) Error() string   { return "i/o timeout" }
func (fakeTimeoutErr) Timeout() bool   { return true }
func (fakeTimeoutErr) Temporary() bool { return true }

// connRefusedErr builds the *net.OpError -> *os.SyscallError -> syscall.Errno chain a
// real refused TCP dial produces, so innermostCause's unwrap loop is exercised against
// the actual shape net/http returns, not a hand-picked shortcut.
func connRefusedErr() error {
	return &net.OpError{
		Op: "dial", Net: "tcp",
		Err: &os.SyscallError{Syscall: "connect", Err: syscall.ECONNREFUSED},
	}
}

// TestNetworkCause_Table covers the Implementation Notes' unwrap rules directly: a
// timeout (both a net.Error reporting Timeout() and a wrapped context.DeadlineExceeded),
// a DNS failure, a connection-refused chain, and a plain error with nothing to unwrap.
func TestNetworkCause_Table(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"connection refused unwraps through OpError/SyscallError/Errno", connRefusedErr(), "connection refused"},
		{"a net.Error reporting Timeout() reads as timed out", fakeTimeoutErr{}, "timed out"},
		{"context.DeadlineExceeded reads as timed out", context.DeadlineExceeded, "timed out"},
		{"a wrapped context.DeadlineExceeded still reads as timed out", fmt.Errorf("doing the thing: %w", context.DeadlineExceeded), "timed out"},
		{"a DNS error reads as host not found", &net.DNSError{Err: "no such host", Name: "example.invalid", IsNotFound: true}, "host not found"},
		{"a plain error with no deeper wrap returns its own text", errors.New("weird failure"), "weird failure"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, networkCause(tt.err))
		})
	}
}

// TestInnermostCause_UnwrapsToTheDeepestError covers innermostCause directly: a chain
// several layers deep resolves to the root cause's own text, and an unwrapped error
// returns its own text unchanged.
func TestInnermostCause_UnwrapsToTheDeepestError(t *testing.T) {
	t.Run("multi-layer chain resolves to the root", func(t *testing.T) {
		inner := errors.New("root cause")
		wrapped := fmt.Errorf("layer two: %w", fmt.Errorf("layer one: %w", inner))

		assert.Equal(t, "root cause", innermostCause(wrapped))
	})

	t.Run("an error with nothing to unwrap returns its own text", func(t *testing.T) {
		assert.Equal(t, "flat error", innermostCause(errors.New("flat error")))
	})
}

// TestDescribeCheckFailure_Table covers D8 exhaustively: each of REQ-8's four sentence
// shapes, exactly.
func TestDescribeCheckFailure_Table(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			"transport failure: connection refused",
			&TransportError{Err: connRefusedErr()},
			"update check failed: couldn't reach the release host (connection refused)",
		},
		{
			"transport failure: timeout",
			&TransportError{Err: fakeTimeoutErr{}},
			"update check failed: couldn't reach the release host (timed out)",
		},
		{
			"transport failure: DNS",
			&TransportError{Err: &net.DNSError{Err: "no such host", Name: "example.invalid", IsNotFound: true}},
			"update check failed: couldn't reach the release host (host not found)",
		},
		{
			"non-3xx status",
			&StatusError{Status: 404},
			"update check failed: the release host answered 404, not a redirect",
		},
		{
			"unparseable tag",
			&TagError{Tag: "nightly"},
			`update check failed: the latest release tag "nightly" is not a release version`,
		},
		{
			"anything else falls through to the wrapped error's own text",
			errors.New("latest release redirect carried no Location header"),
			"update check failed: latest release redirect carried no Location header",
		},
		{
			"a double-wrapped TransportError (checkAvailability's own wrap shape) is still found via errors.As",
			fmt.Errorf("update check failed: %w", &TransportError{Err: connRefusedErr()}),
			"update check failed: couldn't reach the release host (connection refused)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, DescribeCheckFailure(tt.err))
		})
	}
}

// TestDescribeCheckFailure_TransportErrorStripsTheURLEvenThoughTheWrappedErrorCarriesOne
// covers INV-2 against the actual shape net/http's Client.Do failure takes: *url.Error,
// whose own Error() text embeds the request URL. DescribeCheckFailure must reduce this
// all the way to the syscall-level cause, never echo the *url.Error's own text — this is
// the Overview's own before/after ("puts the URL on screen twice").
func TestDescribeCheckFailure_TransportErrorStripsTheURLEvenThoughTheWrappedErrorCarriesOne(t *testing.T) {
	realShaped := &url.Error{Op: "Head", URL: "http://example.test/releases/latest", Err: connRefusedErr()}
	require.Contains(t, realShaped.Error(), "://", "sanity: the wrapped error itself does carry a URL")

	got := DescribeCheckFailure(&TransportError{Err: realShaped})

	assert.Equal(t, "update check failed: couldn't reach the release host (connection refused)", got)
	assert.NotContains(t, got, "://")
}

// TestDescribeCheckFailure_NeverContainsAURL covers INV-2 across D8's three typed
// failure classes.
func TestDescribeCheckFailure_NeverContainsAURL(t *testing.T) {
	tests := []error{
		&TransportError{Err: &url.Error{Op: "Head", URL: "http://example.test/latest", Err: connRefusedErr()}},
		&StatusError{Status: 500},
		&TagError{Tag: "not-a-version"},
	}
	for _, err := range tests {
		t.Run(err.Error(), func(t *testing.T) {
			assert.NotContains(t, DescribeCheckFailure(err), "://")
		})
	}
}

// TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL covers REQ-10/INV-2's
// remaining gap: a malformed 3xx Location header fails inside net/http's own Client.Do —
// it resolves Location to build the redirect request
// before LatestTag's CheckRedirect ever gets a say — so the failure surfaces as a
// *TransportError wrapping a *url.Error whose own Error() text embeds the raw,
// unparseable Location value. Driven through the real LatestTag/httptest path, not a
// hand-built error, so this exercises net/http's actual shape rather than an assumed one.
func TestDescribeCheckFailure_MalformedLocationNeverLeaksTheURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://github.com/Zalaras/muster/releases/tag/v1%zz")
		w.WriteHeader(http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
	require.Error(t, err)
	var transportErr *TransportError
	require.ErrorAs(t, err, &transportErr, "sanity: net/http's own Location-parse failure must still be a TransportError")
	require.Contains(t, transportErr.Err.Error(), "://", "sanity: the wrapped error itself does carry the malformed URL")

	got := DescribeCheckFailure(err)

	assert.Equal(t, "update check failed: couldn't reach the release host (an unreadable response)", got)
	assert.NotContains(t, got, "://")
}

// TestDescribeCheckFailure_FourthClassNeverLeaksTheURL covers INV-2's remaining gap: the
// fourth, unclassified failure class. net/http only auto-follows and auto-parses Location
// for 301/302/303/307/308 (those become *TransportError); a 300, 304, 305 or 306 response
// reaches LatestTag itself, which does its own url.Parse of the Location header and
// returns a plain wrapped error, not one of DescribeCheckFailure's three typed classes.
// Driven through the real LatestTag/httptest path against a 300 (GitHub's real redirect is
// a 302, so this class is unreachable in practice, not untestable), covering both a
// malformed Location and a missing one so every one of D8's four classes has a case.
func TestDescribeCheckFailure_FourthClassNeverLeaksTheURL(t *testing.T) {
	t.Run("300 with a malformed Location", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "https://github.com/Zalaras/muster/releases/tag/v1%zz")
			w.WriteHeader(http.StatusMultipleChoices)
		}))
		t.Cleanup(srv.Close)

		_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
		require.Error(t, err)
		var transportErr *TransportError
		require.NotErrorAs(t, err, &transportErr, "sanity: a 300 falls through LatestTag's own url.Parse, not net/http's redirect following")
		require.Contains(t, err.Error(), "://", "sanity: the plain, unclassified error does carry the malformed URL before DescribeCheckFailure runs")

		got := DescribeCheckFailure(err)

		assert.Equal(t, "update check failed: the release host's response couldn't be read", got)
		assert.NotContains(t, got, "://")
	})

	t.Run("300 with no Location header", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusMultipleChoices)
		}))
		t.Cleanup(srv.Close)

		_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "://", "sanity: this error never carried a URL to begin with")

		got := DescribeCheckFailure(err)

		assert.Equal(t, "update check failed: latest release redirect carried no Location header", got)
		assert.NotContains(t, got, "://")
	})
}

// TestDescribeCheckFailure_MalformedBaseURLNeverLeaksTheURL covers the same fourth,
// unclassified failure class from its other source: LatestTag's own request-building
// url.Parse of a malformed base, rather than a malformed Location. No server is needed —
// http.NewRequestWithContext fails before any round trip.
func TestDescribeCheckFailure_MalformedBaseURLNeverLeaksTheURL(t *testing.T) {
	_, err := LatestTag(context.Background(), http.DefaultClient, "http://exa mple.test")
	require.Error(t, err)
	require.Contains(t, err.Error(), "://", "sanity: the plain, unclassified error does carry the malformed URL before DescribeCheckFailure runs")

	got := DescribeCheckFailure(err)

	assert.Equal(t, "update check failed: the release host's response couldn't be read", got)
	assert.NotContains(t, got, "://")
}

// TestDescribeApplyFailure_Table covers D9 exhaustively: both of REQ-9's sentence shapes
// (a download failure by status or by network cause, and the distinct missing-signature
// 404), plus REQ-9's "every other failure keeps its current sentence" clause pinned
// against every verify.go sentinel and a representative install-step error.
func TestDescribeApplyFailure_Table(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			"download failure: non-200 status",
			&DownloadError{Asset: "musterd_0.12.0_darwin_arm64.tar.gz", Err: &FetchStatusError{Status: 500}},
			"couldn't download musterd_0.12.0_darwin_arm64.tar.gz (status 500); nothing was installed",
		},
		{
			"download failure: connection refused",
			&DownloadError{Asset: "checksums.txt", Err: connRefusedErr()},
			"couldn't download checksums.txt (connection refused); nothing was installed",
		},
		{
			"download failure: timeout",
			&DownloadError{Asset: "checksums.txt", Err: fakeTimeoutErr{}},
			"couldn't download checksums.txt (timed out); nothing was installed",
		},
		{
			"missing signature (404 on checksums.txt.minisig)",
			&MissingSignatureError{Status: 404},
			"couldn't download checksums.txt.minisig (status 404) — this release has no signature, refusing to apply",
		},
		{"bad signature refusal keeps its own sentence unchanged", ErrBadSignature, ErrBadSignature.Error()},
		{"checksum mismatch refusal keeps its own sentence unchanged", ErrChecksumMismatch, ErrChecksumMismatch.Error()},
		{"no checksum line refusal keeps its own sentence unchanged", ErrNoChecksumLine, ErrNoChecksumLine.Error()},
		{
			"an install-step error keeps its wrapped sentence unchanged",
			fmt.Errorf("installing new binary: %w", errors.New("disk full")),
			"installing new binary: disk full",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, DescribeApplyFailure(tt.err))
		})
	}
}

// TestDescribeApplyFailure_NeverContainsAURL covers INV-2 against the real shape a
// download's Client.Do failure takes, matching the check-side test above.
func TestDescribeApplyFailure_NeverContainsAURL(t *testing.T) {
	realShaped := &DownloadError{
		Asset: "musterd_0.12.0_darwin_arm64.tar.gz",
		Err:   &url.Error{Op: "Get", URL: "http://example.test/releases/download/v0.12.0/musterd_0.12.0_darwin_arm64.tar.gz", Err: connRefusedErr()},
	}

	got := DescribeApplyFailure(realShaped)

	assert.Equal(t, "couldn't download musterd_0.12.0_darwin_arm64.tar.gz (connection refused); nothing was installed", got)
	assert.NotContains(t, got, "://")
}
