package locate

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// SpotlightFinder discovers candidates via macOS Spotlight (mdfind) — REQ-5's fast
// path, checked before the directory walk. It degrades to no candidates and no error
// (D11) whenever mdfind is absent or the query times out, since a Spotlight miss just
// means the walk finder gets a turn — never a reason to fail the request.
type SpotlightFinder struct {
	timeout  time.Duration
	lookPath func(string) (string, error)
	run      func(ctx context.Context, name string, args ...string) ([]byte, error)
}

// NewSpotlightFinder builds a SpotlightFinder bounded by timeout (DefaultSpotlightTimeout
// in production).
func NewSpotlightFinder(timeout time.Duration) *SpotlightFinder {
	return &SpotlightFinder{
		timeout:  timeout,
		lookPath: exec.LookPath,
		run:      runMdfind,
	}
}

func runMdfind(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	return out.Bytes(), err
}

// BuildQuery builds the exact mdfind query string for an exact basename and size match
// (REQ-5, D10). A single quote embedded in name is escaped for mdfind's own query
// syntax — a quote becomes backslash then quote — since this string is passed straight
// to mdfind's argv, never through a shell.
func BuildQuery(name string, size int64) string {
	escaped := strings.ReplaceAll(name, "'", `\'`)
	return fmt.Sprintf("kMDItemFSName == '%s' && kMDItemFSSize == %d", escaped, size)
}

// Find runs mdfind with BuildQuery's exact-match query. Any failure — missing binary,
// timeout, or mdfind itself erroring — degrades to (nil, nil): only the walk finder's
// own failures are treated as real errors (D11, Implementation Notes).
func (f *SpotlightFinder) Find(ctx context.Context, _, name string, size int64) ([]string, error) {
	if _, err := f.lookPath("mdfind"); err != nil {
		return nil, nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, f.timeout)
	defer cancel()

	out, err := f.run(timeoutCtx, "mdfind", BuildQuery(name, size))
	if err != nil {
		return nil, nil
	}

	var candidates []string
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line != "" {
			candidates = append(candidates, line)
		}
	}
	return candidates, nil
}
