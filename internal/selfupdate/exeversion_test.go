package selfupdate

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeRun returns run funcs standing in for the injectable exec seam (never a $PATH
// shim, docs/conventions.md) — one returning a fixed stdout, one returning an error.
func fakeRunReturning(output string, err error) func(ctx context.Context, name string, args ...string) (string, error) {
	return func(context.Context, string, ...string) (string, error) { return output, err }
}

// TestProbeVersion_ParsesRecognisedFormats covers D25's accepted half: both the full
// "-version" output shape ("musterd 0.11.0 (Claude Code verified ...)") and the bare
// "musterd v0.11.0" shape parse to the same version string.
func TestProbeVersion_ParsesRecognisedFormats(t *testing.T) {
	tests := []struct {
		name   string
		output string
		want   string
	}{
		{"full -version output", "musterd 0.11.0 (Claude Code verified 2.1.200-2.1.233)\n", "0.11.0"},
		{"bare v-prefixed form", "musterd v0.11.0", "0.11.0"},
		{"bare unprefixed form", "musterd 0.11.0", "0.11.0"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ProbeVersion(context.Background(), fakeRunReturning(tt.output, nil), "/path/to/musterd")

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestProbeVersion_RejectsDevAndUnparseableOutput covers D25's rejected half: "musterd
// dev" has no digit run in the right place and must fail like any other unparseable
// output, not silently succeed with a bogus version.
func TestProbeVersion_RejectsDevAndUnparseableOutput(t *testing.T) {
	tests := []string{
		"musterd dev\n",
		"musterd dev (Claude Code verified 2.1.200-2.1.233)\n",
		"",
		"not musterd at all",
	}
	for _, output := range tests {
		t.Run(output, func(t *testing.T) {
			_, err := ProbeVersion(context.Background(), fakeRunReturning(output, nil), "/path/to/musterd")
			assert.Error(t, err)
		})
	}
}

// TestProbeVersion_RunFailurePropagates covers a failing/hanging run func (D24's
// underlying unit): ProbeVersion must surface the error rather than parsing empty output
// as if it were valid.
func TestProbeVersion_RunFailurePropagates(t *testing.T) {
	wantErr := errors.New("boom")

	_, err := ProbeVersion(context.Background(), fakeRunReturning("", wantErr), "/path/to/musterd")

	assert.ErrorIs(t, err, wantErr)
}

// TestRunVersionProbe_CapturesStdout covers the production run func against a real
// subprocess: a script's stdout is captured verbatim.
func TestRunVersionProbe_CapturesStdout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	out, err := RunVersionProbe(ctx, "/bin/echo", "musterd v0.11.0")

	require.NoError(t, err)
	assert.Equal(t, "musterd v0.11.0\n", out)
}

// TestRunVersionProbe_NonZeroExitIsAnError covers RunVersionProbe's error propagation
// from a real subprocess that exits non-zero.
func TestRunVersionProbe_NonZeroExitIsAnError(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := RunVersionProbe(ctx, "/usr/bin/false")

	assert.Error(t, err)
}
