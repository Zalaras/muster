package claudecode

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- stderrSaysUnrecognised (D4/INV-2: only the measured sentence blocks) ---

func TestStderrSaysUnrecognised(t *testing.T) {
	tests := []struct {
		name   string
		stderr string
		want   bool
	}{
		{
			name:   "the measured full line",
			stderr: `"zephyr" isn't described by this version's model catalog; update Claude Code, or map it with behavesAs on a modelPicker row.`,
			want:   true,
		},
		{
			name:   "empty stderr",
			stderr: "",
			want:   false,
		},
		{
			name:   "the Input must be provided line alone",
			stderr: "Error: Input must be provided either through stdin or as a prompt argument when using --print",
			want:   false,
		},
		{
			// Edge Case 4: the unauthenticated tag line appears without the sentence and
			// must not block on its own.
			name:   "the unauthenticated tag line alone",
			stderr: `[claude-code:unrecognized_model] {"model":"zephyr"}`,
			want:   false,
		},
		{
			// Edge Case 3: an older binary that rejects --bare prints an unknown-option
			// error with no catalog sentence.
			name:   "an unknown-option error",
			stderr: "error: unknown option '--bare'",
			want:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, stderrSaysUnrecognised([]byte(tt.stderr)))
		})
	}
}

// --- CheckModel (D5/D6: the argv it builds, the dir it runs in, and how it fails open) ---

// TestCheckModel_ArgvAndDir is D5: CheckModel invokes its run func with exactly the seven
// REQ-1 argv elements, in the given directory.
func TestCheckModel_ArgvAndDir(t *testing.T) {
	var gotDir string
	var gotArgv []string
	run := func(_ context.Context, dir, name string, args ...string) ([]byte, error) {
		gotDir = dir
		gotArgv = append([]string{name}, args...)
		return nil, nil
	}

	_, err := (&modelChecker{run: run}).check(context.Background(), "claude", "/some/dir", "zephyr")

	require.NoError(t, err)
	assert.Equal(t, "/some/dir", gotDir)
	assert.Equal(t, []string{"claude", "--bare", "--no-session-persistence", "--model", "zephyr", "-p", ""}, gotArgv)
}

// TestCheckModel_VerdictFollowsStderr proves CheckModel's verdict is wired to
// stderrSaysUnrecognised's result — the exhaustive sentence-parsing table lives in
// TestStderrSaysUnrecognised above; this only checks the two outcomes reach the caller
// as the right ModelVerdict.
func TestCheckModel_VerdictFollowsStderr(t *testing.T) {
	tests := []struct {
		name   string
		stderr string
		want   ModelVerdict
	}{
		{"unrecognised", `"zephyr" isn't described by this version's model catalog; update Claude Code.`, ModelUnrecognised},
		{"recognised", "", ModelRecognised},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			run := func(context.Context, string, string, ...string) ([]byte, error) {
				return []byte(tt.stderr), nil
			}

			verdict, err := (&modelChecker{run: run}).check(context.Background(), "claude", "/dir", "zephyr")

			require.NoError(t, err)
			assert.Equal(t, tt.want, verdict)
		})
	}
}

// TestCheckModel_ExitErrorIsNotAFailure covers REQ-2's "the exit code is not a signal: it
// is 1 for known and unknown models alike" — a run func reporting the process merely
// exited non-zero (the shape runModelCheck itself never returns as an error, since it
// unwraps *exec.ExitError) must not surface as a CheckModel error either.
func TestCheckModel_ExitErrorIsNotAFailure(t *testing.T) {
	run := func(context.Context, string, string, ...string) ([]byte, error) {
		return []byte("some stderr"), nil // runModelCheck's own contract: exit 1 -> nil error
	}

	verdict, err := (&modelChecker{run: run}).check(context.Background(), "claude", "/dir", "sonnet")

	require.NoError(t, err)
	assert.Equal(t, ModelRecognised, verdict)
}

// TestCheckModel_RunError_FailsOpen is D6's CheckModel half: a run func reporting an
// error (the binary could not start, or was killed past its deadline) yields an error
// from CheckModel and a ModelRecognised verdict — REQ-2's fail-open default, so a caller
// that ignores the error and only branches on ModelUnrecognised never blocks a launch on
// a broken check.
func TestCheckModel_RunError_FailsOpen(t *testing.T) {
	wantErr := errors.New("exec: \"claude\": executable file not found in $PATH")
	run := func(context.Context, string, string, ...string) ([]byte, error) {
		return nil, wantErr
	}

	verdict, err := (&modelChecker{run: run}).check(context.Background(), "claude", "/dir", "zephyr")

	require.ErrorIs(t, err, wantErr)
	assert.Equal(t, ModelRecognised, verdict, "a run error must fail open, never refuse a launch on its own")
}

// TestCheckModel_ContextDeadlineExceeded_FailsOpen is D6's other half: a run func that
// reports the context's own deadline error (the shape a blocked-past-deadline run
// produces) is treated the same as any other run error.
func TestCheckModel_ContextDeadlineExceeded_FailsOpen(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel()
	<-ctx.Done()
	run := func(runCtx context.Context, _, _ string, _ ...string) ([]byte, error) {
		return nil, runCtx.Err()
	}

	verdict, err := (&modelChecker{run: run}).check(ctx, "claude", "/dir", "zephyr")

	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Equal(t, ModelRecognised, verdict)
}

// --- runModelCheck (the production modelCheckRun seam: real subprocess mechanics only —
// argv/verdict wiring is CheckModel's own and already covered above without a subprocess) ---

// TestRunModelCheck_ReturnsStderrRegardlessOfExitCode is REQ-2's "the exit code is not a
// signal" at the seam that actually runs a process: a plain non-zero exit must not be
// reported as an error, and stderr must come back byte for byte.
func TestRunModelCheck_ReturnsStderrRegardlessOfExitCode(t *testing.T) {
	dir := t.TempDir()

	stderr, err := runModelCheck(context.Background(), dir, "sh", "-c", "printf hello-stderr 1>&2; exit 1")

	require.NoError(t, err)
	assert.Equal(t, "hello-stderr", string(stderr))
}

// TestRunModelCheck_StdinIsEmpty is D5's stdin clause: the run must not inherit the
// test process's stdin — a `cat` fed runModelCheck's stdin exits at once with nothing to
// echo, which would hang instead if a live terminal or pipe were attached.
func TestRunModelCheck_StdinIsEmpty(t *testing.T) {
	dir := t.TempDir()

	stderr, err := runModelCheck(context.Background(), dir, "sh", "-c", "cat 1>&2")

	require.NoError(t, err)
	assert.Empty(t, string(stderr), "stdin must already be at EOF, never blocking on input")
}

// TestRunModelCheck_UsesGivenDirectory is D5's dir clause.
func TestRunModelCheck_UsesGivenDirectory(t *testing.T) {
	dir := t.TempDir()

	stderr, err := runModelCheck(context.Background(), dir, "sh", "-c", "pwd 1>&2")

	require.NoError(t, err)
	assert.Equal(t, dir, string(bytes.TrimSpace(stderr)))
}

// TestRunModelCheck_CommandCannotStart_ReturnsError covers "the binary can't start" half
// of D6/REQ-2's fail-open trigger.
func TestRunModelCheck_CommandCannotStart_ReturnsError(t *testing.T) {
	dir := t.TempDir()

	_, err := runModelCheck(context.Background(), dir, filepath.Join(dir, "does-not-exist"))

	require.Error(t, err)
}

// TestRunModelCheck_ContextDeadlineBoundsAHungProcess covers "blocks past the context
// deadline" (D6/REQ-2/Edge Case 1: "the launch proceeds and a warn line is logged").
// The warn line is Launch's own `if err != nil` branch (internal/server/sessions.go), so
// a killed-by-ctx run must come back as an error, the same as a run that could not start
// at all — CheckModel's fail-open path only fires the warning when runModelCheck reports
// one.
func TestRunModelCheck_ContextDeadlineBoundsAHungProcess(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := runModelCheck(ctx, dir, "sh", "-c", "sleep 30")
	elapsed := time.Since(start)

	assert.Lessf(t, elapsed, modelCheckWaitDelay+2*time.Second,
		"runModelCheck must return once ctx fires and modelCheckWaitDelay elapses, not wait for the full sleep; took %s", elapsed)
	require.Error(t, err)
}

// TestRunModelCheck_HarmlessSmokeTestNeverUsesRealClaude documents D11's boundary the
// same way credentials_test.go's TestRunCommand_HarmlessSmokeTestNeverUsedByKeychainTests
// does: every test above passes its own sh -c script, never a real `claude` invocation —
// this is the one place runModelCheck itself runs, against a harmless, always-installed
// binary.
func TestRunModelCheck_HarmlessSmokeTestNeverUsesRealClaude(t *testing.T) {
	dir := t.TempDir()

	stderr, err := runModelCheck(context.Background(), dir, "echo", "harmless")

	require.NoError(t, err)
	assert.Empty(t, string(stderr), "echo writes to stdout, not stderr")
}
