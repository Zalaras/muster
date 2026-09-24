package selfupdate

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newRedirectServer starts an httptest.Server whose handler is swappable per-subtest via
// the returned setter — D8's fixture for both the happy path and every failure shape.
// LatestTag issues HEAD; the handler asserts that so a regression to GET is caught here
// rather than silently metering the real GitHub API.
func newRedirectServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodHead, r.Method, "LatestTag must issue HEAD, never GET (unmetered redirect)")
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// TestLatestTag_ResolvesAbsoluteAndRelativeRedirect covers D8's happy path: both an
// absolute and a path-relative Location resolve to the same tag.
func TestLatestTag_ResolvesAbsoluteAndRelativeRedirect(t *testing.T) {
	tests := []struct {
		name     string
		location func(base string) string
	}{
		{"absolute location", func(base string) string { return base + "/tag/v0.11.0" }},
		{"path-relative location", func(string) string { return "/tag/v0.11.0" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var srv *httptest.Server
			srv = newRedirectServer(t, func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Location", tt.location(srv.URL))
				w.WriteHeader(http.StatusFound)
			})

			tag, err := LatestTag(context.Background(), srv.Client(), srv.URL)

			require.NoError(t, err)
			assert.Equal(t, "v0.11.0", tag)
		})
	}
}

// TestLatestTag_Errors covers D8's refusal table: a 200 (no redirect at all), a redirect
// with no Location header, and a redirect tag that is not v<semver> must all error.
func TestLatestTag_Errors(t *testing.T) {
	t.Run("200 instead of a redirect errors", func(t *testing.T) {
		srv := newRedirectServer(t, func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
		assert.Error(t, err)
	})

	t.Run("redirect with no Location header errors", func(t *testing.T) {
		srv := newRedirectServer(t, func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusFound)
		})

		_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
		assert.Error(t, err)
	})

	t.Run("redirect tag not a release version errors", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "/tag/not-a-version")
			w.WriteHeader(http.StatusFound)
		}))
		t.Cleanup(srv.Close)

		_, err := LatestTag(context.Background(), srv.Client(), srv.URL)
		assert.Error(t, err)
	})

	t.Run("transport error errors", func(t *testing.T) {
		_, err := LatestTag(context.Background(), http.DefaultClient, "http://127.0.0.1:1")
		assert.Error(t, err)
	})
}

// TestLatestTag_NeverFollowsTheRedirectItself covers REQ-5's "unmetered HEAD, no
// following" claim directly: if LatestTag actually followed the redirect it would hit
// the target handler (which fails the test), rather than reading the 3xx's own Location.
func TestLatestTag_NeverFollowsTheRedirectItself(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Fatal("LatestTag must never follow the redirect to the target server")
	}))
	t.Cleanup(target.Close)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", target.URL+"/tag/v0.11.0")
		w.WriteHeader(http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	tag, err := LatestTag(context.Background(), srv.Client(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, "v0.11.0", tag)
}

// deadlineCapturingTransport records the deadline attached to the first request's
// context (relative to when it observed it) and fails the request immediately — used to
// assert a timeout constant is actually wired in without ever waiting for it to fire
// (D26).
type deadlineCapturingTransport struct {
	remaining chan time.Duration
}

func (d *deadlineCapturingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	deadline, ok := r.Context().Deadline()
	if ok {
		select {
		case d.remaining <- time.Until(deadline):
		default:
		}
	} else {
		select {
		case d.remaining <- -1:
		default:
		}
	}
	return nil, errors.New("deadlineCapturingTransport: refusing to actually send")
}

// TestLatestTag_RequestCarriesTenSecondDeadline covers D26's LatestTag half: the request
// context's deadline is ~CheckTimeout (10s) from now, asserted by inspection rather than
// by actually waiting for a hang to time out.
func TestLatestTag_RequestCarriesTenSecondDeadline(t *testing.T) {
	transport := &deadlineCapturingTransport{remaining: make(chan time.Duration, 1)}
	client := &http.Client{Transport: transport}

	_, _ = LatestTag(context.Background(), client, "http://example.invalid")

	select {
	case remaining := <-transport.remaining:
		require.GreaterOrEqual(t, remaining, time.Duration(0), "LatestTag's request must carry a deadline")
		assert.InDelta(t, CheckTimeout.Seconds(), remaining.Seconds(), 2, "the request's deadline must be ~CheckTimeout (10s) from now")
	case <-time.After(2 * time.Second):
		t.Fatal("transport was never invoked")
	}
}

func TestAssetName(t *testing.T) {
	assert.Equal(t, "musterd_0.11.0_darwin_arm64.tar.gz", AssetName("0.11.0", "darwin", "arm64"))
}

func TestDownloadURL(t *testing.T) {
	assert.Equal(t, "https://example.com/releases/download/v0.11.0/musterd_0.11.0_darwin_arm64.tar.gz",
		DownloadURL("https://example.com/releases", "v0.11.0", "musterd_0.11.0_darwin_arm64.tar.gz"))
	assert.Equal(t, "https://example.com/releases/download/v0.11.0/asset", DownloadURL("https://example.com/releases/", "v0.11.0", "asset"),
		"a trailing slash on base must not produce a doubled slash")
}

// TestReleaseTag pins the one place the tag<->version mapping is spelled out.
func TestReleaseTag(t *testing.T) {
	assert.Equal(t, "v0.11.0", ReleaseTag("0.11.0"))
}

// TestReleaseTag_RoundTripsWithParseRelease covers the round trip both former callers
// (cmd/musterd, internal/server) relied on: a Version's tag form parses back to the same
// Version.
func TestReleaseTag_RoundTripsWithParseRelease(t *testing.T) {
	v := Version{Major: 1, Minor: 2, Patch: 3}

	parsed, ok := ParseRelease(ReleaseTag(v.String()))

	require.True(t, ok)
	assert.Equal(t, v, parsed)
}

// TestCheckNewer covers the newer/equal/older/unparseable-running cells cmd/musterd's
// `-update` and internal/server's periodic/manual checks each compared by hand before
// this unified them (kb:adr/update-release-knowledge-in-selfupdate-package).
func TestCheckNewer(t *testing.T) {
	tests := []struct {
		name       string
		tag        string
		running    string
		wantLatest Version
		wantNewer  bool
	}{
		{"latest is newer than running", "v0.12.0", "0.11.0", Version{0, 12, 0}, true},
		{"latest equals running", "v0.11.0", "0.11.0", Version{0, 11, 0}, false},
		{"latest is older than running", "v0.10.0", "0.11.0", Version{0, 10, 0}, false},
		{
			"running does not parse (dev build) reports not-newer with no error",
			"v0.11.0", "dev", Version{0, 11, 0}, false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newRedirectServer(t, func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Location", "/tag/"+tt.tag)
				w.WriteHeader(http.StatusFound)
			})

			latest, _, newer, err := CheckNewer(context.Background(), srv.Client(), srv.URL, tt.running)

			require.NoError(t, err)
			assert.Equal(t, tt.wantLatest, latest)
			assert.Equal(t, tt.wantNewer, newer)
		})
	}
}

// TestCheckNewer_Errors covers CheckNewer's own two failure shapes: LatestTag failing
// outright (transport error) and LatestTag resolving a tag that isn't a release version —
// both must propagate a non-nil error rather than reporting a (silently wrong) result.
func TestCheckNewer_Errors(t *testing.T) {
	t.Run("transport error", func(t *testing.T) {
		_, _, _, err := CheckNewer(context.Background(), http.DefaultClient, "http://127.0.0.1:1", "0.11.0")
		assert.Error(t, err)
	})

	t.Run("redirect tag not a release version", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "/tag/not-a-version")
			w.WriteHeader(http.StatusFound)
		}))
		t.Cleanup(srv.Close)

		_, _, _, err := CheckNewer(context.Background(), srv.Client(), srv.URL, "0.11.0")
		assert.Error(t, err)
	})
}

// TestCheckNewer_ReturnsTheRawResolvedTagNotAReconstructedOne covers review-work Note 8:
// cmd/musterd's `-update` passes CheckNewer's tag straight to Apply rather than
// rebuilding one with ReleaseTag(latest.String()) — the Decisions section's own
// reasoning is that ReleaseTag is only exact for a tag already shaped
// "v"+Version.String(), and GitHub's own tag isn't guaranteed to be. This resolves a tag
// with no leading "v" (still a valid ParseRelease match, per releasePattern's own
// optional-"v" clause) precisely so the two would diverge if tag were reconstructed
// instead of returned raw: ReleaseTag(latest.String()) would come back "v0.11.0", but the
// server's own redirect said "0.11.0".
func TestCheckNewer_ReturnsTheRawResolvedTagNotAReconstructedOne(t *testing.T) {
	srv := newRedirectServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "/tag/0.11.0")
		w.WriteHeader(http.StatusFound)
	})

	latest, tag, _, err := CheckNewer(context.Background(), srv.Client(), srv.URL, "0.10.0")

	require.NoError(t, err)
	assert.Equal(t, "0.11.0", tag, "tag must be the raw string LatestTag resolved, never rebuilt via ReleaseTag(latest.String())")
	assert.NotEqual(t, ReleaseTag(latest.String()), tag, "sanity: this case is chosen so a reconstructed tag would visibly differ")
}
