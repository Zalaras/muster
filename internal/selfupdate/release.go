package selfupdate

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

// CheckTimeout bounds one LatestTag call (REQ-7/D26) — a hung/slow GitHub must never
// stall the daemon's check loop.
const CheckTimeout = 10 * time.Second

// LatestTag resolves {base}/latest's redirect to a release tag (REQ-5): a HEAD request
// (the redirect is unmetered, unlike the rate-limited REST API scripts/install.sh also
// avoids), following no redirects itself — the Location header is read directly off the
// 3xx response. The Location may be absolute or path-relative (both measured against
// github.com's real redirect shape, plan's carried-over measurement); only its last path
// segment is used, and it must parse as a release tag (D8).
func LatestTag(ctx context.Context, client *http.Client, base string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, CheckTimeout)
	defer cancel()

	latestURL := strings.TrimRight(base, "/") + "/latest"
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, latestURL, nil)
	if err != nil {
		return "", fmt.Errorf("building latest-release request: %w", err)
	}

	if client == nil {
		client = http.DefaultClient
	}
	// A client that stops at the first redirect, without mutating the caller's shared
	// client (it may be reused by other checks/pollers) — CheckRedirect returning
	// ErrUseLastResponse is documented to hand back the 3xx response itself rather than
	// following it.
	noRedirect := &http.Client{
		Transport: client.Transport,
		Timeout:   client.Timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := noRedirect.Do(req)
	if err != nil {
		return "", fmt.Errorf("requesting %s: %w", latestURL, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 300 || resp.StatusCode >= 400 {
		return "", fmt.Errorf("latest release request returned status %d, want a redirect", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc == "" {
		return "", errors.New("latest release redirect carried no Location header")
	}

	u, err := url.Parse(loc)
	if err != nil {
		return "", fmt.Errorf("parsing redirect location %q: %w", loc, err)
	}
	tag := path.Base(u.Path)
	if _, ok := ParseRelease(tag); !ok {
		return "", fmt.Errorf("redirect tag %q is not a release version", tag)
	}
	return tag, nil
}

// AssetName is GoReleaser's archive name_template for the musterd build (REQ-14): ver is
// the bare version (Version.String(), no leading "v"); goos is always "darwin" in
// practice — callers pass it explicitly rather than this package hardcoding
// runtime.GOOS, since that constant belongs to the caller's own build context.
func AssetName(ver, goos, goarch string) string {
	return fmt.Sprintf("musterd_%s_%s_%s.tar.gz", ver, goos, goarch)
}

// DownloadURL builds a release download URL: {base}/download/{tag}/{asset} (REQ-5/14) —
// the same base LatestTag resolved against.
func DownloadURL(base, tag, asset string) string {
	return strings.TrimRight(base, "/") + "/download/" + tag + "/" + asset
}
