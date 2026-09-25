package selfupdate

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
)

// networkCause reduces a failed network operation's error chain to one of the wire
// message's <cause> words: "timed out" for any timeout (including the daemon's own context
// deadlines — CheckTimeout/ApplyTimeout), "host not found" for a DNS failure, and otherwise
// the innermost wrapped error's own text (e.g. "connection refused") — never a URL or the
// transport chain around it (kb:adr/update-failure-one-sentence-chain-in-log).
func networkCause(err error) string {
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timed out"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timed out"
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "host not found"
	}
	cause := innermostCause(err)
	if strings.Contains(cause, "://") {
		// A malformed redirect Location fails inside net/http's own request-building step
		// (Client.do parses Location before CheckRedirect ever runs), whose own error text
		// embeds the raw Location value — never a URL reaches the wire, even one this
		// function otherwise returns verbatim as the syscall.Errno leaf text.
		return "an unreadable response"
	}
	return cause
}

// innermostCause unwraps err to its deepest wrapped error and returns that error's own
// text — the syscall.Errno string ("connection refused", "permission denied", …) beneath
// the *net.OpError/*url.Error/*os.PathError chain net/http and os build around it.
func innermostCause(err error) string {
	for {
		next := errors.Unwrap(err)
		if next == nil {
			return err.Error()
		}
		err = next
	}
}

// DescribeCheckFailure composes the one-sentence, URL-free `check_failed` wire message for
// a failed release check from LatestTag/CheckNewer's returned error, un-prefixed and
// unwrapped — checkAvailability returns that error as-is, never adding its own wrapper, so
// this function's fallback branch (an error that isn't one of the three typed classes)
// never has to strip a caller-added prefix back off before adding its own. The full error
// (still carrying its wrapped chain, from wherever the caller itself logs it) is what the
// daemon log keeps (kb:adr/update-failure-one-sentence-chain-in-log) — this function only
// ever produces the short wire text.
func DescribeCheckFailure(err error) string {
	var transportErr *TransportError
	if errors.As(err, &transportErr) {
		return fmt.Sprintf("update check failed: couldn't reach the release host (%s)", networkCause(transportErr.Err))
	}
	var statusErr *StatusError
	if errors.As(err, &statusErr) {
		return fmt.Sprintf("update check failed: the release host answered %d, not a redirect", statusErr.Status)
	}
	var tagErr *TagError
	if errors.As(err, &tagErr) {
		return fmt.Sprintf("update check failed: the latest release tag %q is not a release version", tagErr.Tag)
	}
	// Fourth-class fallback: covers a redirect status net/http itself never auto-parses
	// Location for (300/304/305/306 — only 301/302/303/307/308 go through TransportError),
	// where LatestTag's own url.Parse of a malformed Location, or of a malformed base URL
	// while building the request, produces a plain error whose wrapped *url.Error quotes
	// the URL. Guarded the same way networkCause guards the transport path, so no URL
	// reaches the wire for any error LatestTag/CheckNewer can return, not just the typed
	// ones (kb:adr/update-failure-one-sentence-chain-in-log).
	msg := err.Error()
	if strings.Contains(msg, "://") {
		return "update check failed: the release host's response couldn't be read"
	}
	return fmt.Sprintf("update check failed: %s", msg)
}

// DescribeApplyFailure composes the one-sentence, URL-free `apply.error` wire text from
// Apply's returned error. A download-shaped failure (*DownloadError/*MissingSignatureError,
// both introduced for this composition) is classified here into its own wire sentence,
// distinct from and never reusing that type's own log-only Error() text. Anything else —
// a verification refusal or install error (verify.go's pre-existing sentinels, or an
// installBinary failure) — falls through to err.Error() unchanged: those sentinels were
// already written as complete, static UI sentences (internal/selfupdate/CLAUDE.md's
// "Sentinel error text is user-facing" gotcha), so they need no classification here. A new
// selfupdate failure that needs to name something the caller only learns at the call site
// (a path, a status code, a cause word) takes the typed-error-plus-classification shape
// this function and DescribeCheckFailure both use; only a failure whose entire sentence is
// static text known in advance may stay a plain sentinel.
func DescribeApplyFailure(err error) string {
	var missingSig *MissingSignatureError
	if errors.As(err, &missingSig) {
		return fmt.Sprintf("couldn't download checksums.txt.minisig (status %d) — this release has no signature, refusing to apply", missingSig.Status)
	}
	var downloadErr *DownloadError
	if errors.As(err, &downloadErr) {
		return fmt.Sprintf("couldn't download %s (%s); nothing was installed", downloadErr.Asset, fetchCause(downloadErr.Err))
	}
	return err.Error()
}

// fetchCause is a download failure's <cause>: "status <code>" for a non-200 response,
// otherwise networkCause's own words.
func fetchCause(err error) string {
	var statusErr *FetchStatusError
	if errors.As(err, &statusErr) {
		return fmt.Sprintf("status %d", statusErr.Status)
	}
	return networkCause(err)
}
