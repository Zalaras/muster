package main

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	portTestWait = 5 * time.Second
	portTestTick = 10 * time.Millisecond
	// portTestQuiet is how long a "never happens" check watches: the prompt goroutine
	// starts inside the call under test, so a bug shows within milliseconds.
	portTestQuiet = 250 * time.Millisecond
)

func writeSavedPort(t *testing.T, dataDir, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(savedPortPath(dataDir), []byte(content), 0o600))
}

func TestParsePortFlag(t *testing.T) {
	tests := []struct {
		name    string
		arg     string
		want    int
		wantErr bool
	}{
		{name: "zero is the ephemeral port", arg: "0", want: 0},
		{name: "lowest real port", arg: "1", want: 1},
		{name: "ordinary port", arg: "18765", want: 18765},
		{name: "highest port", arg: "65535", want: 65535},
		{name: "the word default is 8765", arg: "default", want: defaultPort},
		{name: "past the highest port", arg: "65536", wantErr: true},
		{name: "far past the highest port", arg: "70000", wantErr: true},
		{name: "negative", arg: "-1", wantErr: true},
		{name: "not a number", arg: "abc", wantErr: true},
		{name: "empty", arg: "", wantErr: true},
		{name: "fraction", arg: "80.5", wantErr: true},
		{name: "host and port", arg: "127.0.0.1:8765", wantErr: true},
		{name: "default is case sensitive", arg: "Default", wantErr: true},
		{name: "surrounding space", arg: " 80", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePortFlag(tc.arg)
			if tc.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "-port", "the message names the flag")
				assert.Contains(t, err.Error(), `"`+tc.arg+`"`, "the message names the bad value")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestPortFromArg_AbsentIsNotGiven(t *testing.T) {
	zero := "0"
	def := "default"
	bad := "nope"
	tests := []struct {
		name    string
		arg     *string
		want    portFlag
		wantErr bool
	}{
		{name: "absent", arg: nil, want: portFlag{}},
		{name: "zero is given", arg: &zero, want: portFlag{value: 0, given: true}},
		{name: "default is given", arg: &def, want: portFlag{value: defaultPort, given: true}},
		{name: "bad", arg: &bad, wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := portFromArg(tc.arg)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

// TestParseFlags_Port covers REQ-1 at the flag set: -addr is gone, -port is validated by
// parseFlags itself with the message unwrapped, and absent differs from -port 0.
func TestParseFlags_Port(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		want    portFlag
		wantErr string
	}{
		{name: "absent", args: nil, want: portFlag{}},
		{name: "separate value", args: []string{"-port", "18765"}, want: portFlag{value: 18765, given: true}},
		{name: "equals form", args: []string{"-port=0"}, want: portFlag{value: 0, given: true}},
		{name: "default word", args: []string{"-port", "default"}, want: portFlag{value: defaultPort, given: true}},
		{name: "last one wins", args: []string{"-port", "1", "-port", "2"}, want: portFlag{value: 2, given: true}},
		{name: "not a number", args: []string{"-port", "abc"}, wantErr: `invalid -port value "abc"`},
		{name: "too big", args: []string{"-port", "70000"}, wantErr: `invalid -port value "70000"`},
		{name: "negative", args: []string{"-port", "-1"}, wantErr: `invalid -port value "-1"`},
		{name: "empty", args: []string{"-port", ""}, wantErr: `invalid -port value ""`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var stderr bytes.Buffer
			f, err := parseFlags(tc.args, &stderr)
			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, f.port)
		})
	}
}

// TestRun_InvalidPortFailsBeforePreflightAndDataDir covers D1: with tmux absent the run
// would fail the preflight, so an error naming -port instead proves the flag is checked
// first, and the data dir proves nothing else ran.
func TestRun_InvalidPortFailsBeforePreflightAndDataDir(t *testing.T) {
	for _, bad := range []string{"abc", "70000", "-1", ""} {
		t.Run("value_"+bad, func(t *testing.T) {
			t.Setenv("PATH", t.TempDir())
			dataDir := filepath.Join(t.TempDir(), "not-yet-created")

			err := run([]string{"-port", bad, "-data-dir", dataDir}, nil, io.Discard, io.Discard)

			require.Error(t, err)
			assert.Contains(t, err.Error(), "-port")
			assert.NotContains(t, err.Error(), "tmux is required", "D1: the flag is rejected before the tmux preflight")
			_, statErr := os.Stat(dataDir)
			assert.True(t, os.IsNotExist(statErr), "D1: the data dir must not be created")
		})
	}
}

func TestLoadSavedPort(t *testing.T) {
	tests := []struct {
		name     string
		content  *string
		wantPort int
		wantOK   bool
		wantErr  bool
	}{
		{name: "no file", content: nil},
		{name: "number with newline", content: ptr("18765\n"), wantPort: 18765, wantOK: true},
		{name: "number without newline", content: ptr("18765"), wantPort: 18765, wantOK: true},
		{name: "surrounding space", content: ptr("  18765 \n"), wantPort: 18765, wantOK: true},
		{name: "highest", content: ptr("65535"), wantPort: 65535, wantOK: true},
		{name: "empty", content: ptr(""), wantErr: true},
		{name: "zero is never saved", content: ptr("0"), wantErr: true},
		{name: "negative", content: ptr("-5"), wantErr: true},
		{name: "too big", content: ptr("65536"), wantErr: true},
		{name: "text", content: ptr("abc"), wantErr: true},
		{name: "two lines", content: ptr("18765\n18766\n"), wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			if tc.content != nil {
				writeSavedPort(t, dataDir, *tc.content)
			}

			port, ok, err := loadSavedPort(dataDir)

			if tc.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), savedPortPath(dataDir), "the message names the file")
				assert.False(t, ok)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.wantPort, port)
		})
	}
}

func TestLoadSavedPort_UnreadableFileIsAnError(t *testing.T) {
	dataDir := t.TempDir()
	require.NoError(t, os.Mkdir(savedPortPath(dataDir), 0o700), "a directory where the file belongs cannot be read")

	_, ok, err := loadSavedPort(dataDir)

	require.Error(t, err)
	assert.False(t, ok)
}

func ptr(s string) *string { return &s }

// TestResolvePort is REQ-2 / REQ-4's "differs from what it would pick without the flag"
// rule over every combination of flag and saved state: D2-D7 and D13.
func TestResolvePort(t *testing.T) {
	given := func(n int) portFlag { return portFlag{value: n, given: true} }
	tests := []struct {
		name    string
		flag    portFlag
		saved   *string
		want    portChoice
		wantErr []string
	}{
		{name: "D2 nothing at all", flag: portFlag{}, want: portChoice{listen: 8765}},
		{name: "D3 saved port, no flag", flag: portFlag{}, saved: ptr("18765\n"), want: portChoice{listen: 18765}},
		{name: "D13 no flag, corrupt text", flag: portFlag{}, saved: ptr("abc"), wantErr: []string{"-port default", "does not hold a port"}},
		{name: "D13 no flag, zero", flag: portFlag{}, saved: ptr("0"), wantErr: []string{"-port default"}},
		{name: "D13 no flag, too big", flag: portFlag{}, saved: ptr("70000"), wantErr: []string{"-port default"}},
		{name: "D13 no flag, empty", flag: portFlag{}, saved: ptr(""), wantErr: []string{"-port default"}},
		{name: "D4 flag, nothing saved", flag: given(18765), want: portChoice{listen: 18765, offerSave: true}},
		{name: "D4 flag overrides saved", flag: given(18766), saved: ptr("18765"), want: portChoice{listen: 18766, offerSave: true}},
		{name: "D5 flag equals saved", flag: given(18765), saved: ptr("18765"), want: portChoice{listen: 18765}},
		{name: "D5 flag is 8765 with nothing saved", flag: given(8765), want: portChoice{listen: 8765}},
		{name: "D6 default word with a saved port", flag: given(8765), saved: ptr("18765"), want: portChoice{listen: 8765, offerSave: true}},
		{name: "D7 zero, nothing saved", flag: given(0), want: portChoice{listen: 0}},
		{name: "D7 zero, saved port", flag: given(0), saved: ptr("18765"), want: portChoice{listen: 0}},
		{name: "D7 zero, corrupt saved", flag: given(0), saved: ptr("abc"), want: portChoice{listen: 0}},
		{name: "D13 flag is the way out of a corrupt file", flag: given(18765), saved: ptr("abc"), want: portChoice{listen: 18765, offerSave: true}},
		{name: "D13 default word is the way out of a corrupt file", flag: given(8765), saved: ptr("abc"), want: portChoice{listen: 8765, offerSave: true}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			if tc.saved != nil {
				writeSavedPort(t, dataDir, *tc.saved)
			}

			got, err := resolvePort(tc.flag, dataDir)

			if len(tc.wantErr) > 0 {
				require.Error(t, err)
				for _, want := range tc.wantErr {
					assert.Contains(t, err.Error(), want)
				}
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

// TestResolvePort_SavedPortIsScopedToTheDataDir covers REQ-3: -data-dir scopes the saved
// port, so two profiles keep their own.
func TestResolvePort_SavedPortIsScopedToTheDataDir(t *testing.T) {
	a, b := t.TempDir(), t.TempDir()
	require.NoError(t, savePort(a, 18765))
	require.NoError(t, savePort(b, 18766))

	gotA, err := resolvePort(portFlag{}, a)
	require.NoError(t, err)
	gotB, err := resolvePort(portFlag{}, b)
	require.NoError(t, err)
	gotNone, err := resolvePort(portFlag{}, t.TempDir())
	require.NoError(t, err)

	assert.Equal(t, 18765, gotA.listen)
	assert.Equal(t, 18766, gotB.listen)
	assert.Equal(t, defaultPort, gotNone.listen)
}

// TestSavePort covers D14 (a saved port is read back) and REQ-6 (saving the default
// clears it) from every starting state.
func TestSavePort(t *testing.T) {
	tests := []struct {
		name      string
		before    *string
		save      int
		wantFile  string
		wantExist bool
	}{
		{name: "fresh save", save: 18765, wantFile: "18765\n", wantExist: true},
		{name: "replaces another port", before: ptr("18766\n"), save: 18765, wantFile: "18765\n", wantExist: true},
		{name: "replaces a corrupt file", before: ptr("abc"), save: 18765, wantFile: "18765\n", wantExist: true},
		{name: "default clears a saved port", before: ptr("18765\n"), save: defaultPort},
		{name: "default clears a corrupt file", before: ptr("abc"), save: defaultPort},
		{name: "default with nothing saved is fine", save: defaultPort},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			if tc.before != nil {
				writeSavedPort(t, dataDir, *tc.before)
			}

			require.NoError(t, savePort(dataDir, tc.save))

			raw, err := os.ReadFile(savedPortPath(dataDir))
			if !tc.wantExist {
				assert.True(t, os.IsNotExist(err), "no saved port file remains")
				choice, resolveErr := resolvePort(portFlag{}, dataDir)
				require.NoError(t, resolveErr)
				assert.Equal(t, defaultPort, choice.listen, "later starts use 8765")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantFile, string(raw))
			choice, resolveErr := resolvePort(portFlag{}, dataDir)
			require.NoError(t, resolveErr)
			assert.Equal(t, tc.save, choice.listen, "D14: the next start reads it back")
			info, statErr := os.Stat(savedPortPath(dataDir))
			require.NoError(t, statErr)
			assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
		})
	}
}

func TestSavePort_FailsWhenTheDataDirIsMissing(t *testing.T) {
	err := savePort(filepath.Join(t.TempDir(), "missing"), 18765)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "saving port")
}

// TestOfferSavePort covers REQ-5 / D11 / V1: the exact prompt text, and only y or yes in
// any case saving.
func TestOfferSavePort(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantSaved bool
	}{
		{name: "y", input: "y\n", wantSaved: true},
		{name: "Y", input: "Y\n", wantSaved: true},
		{name: "yes", input: "yes\n", wantSaved: true},
		{name: "YES", input: "YES\n", wantSaved: true},
		{name: "Yes with padding", input: "  Yes  \n", wantSaved: true},
		{name: "windows line ending", input: "y\r\n", wantSaved: true},
		{name: "n", input: "n\n"},
		{name: "no", input: "no\n"},
		{name: "empty line", input: "\n"},
		{name: "EOF with nothing", input: ""},
		{name: "yep", input: "yep\n"},
		{name: "ye", input: "ye\n"},
		{name: "sure", input: "sure\n"},
		{name: "1", input: "1\n"},
		{name: "answer on the second line is not read", input: "\ny\n"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			var stderr bytes.Buffer

			offerSavePort(context.Background(), newLineInput(strings.NewReader(tc.input), true), &stderr, dataDir, 18765, zerolog.Nop())

			assert.Equal(t, "Save port 18765 for future starts? [y/N] ", stderr.String())
			raw, err := os.ReadFile(savedPortPath(dataDir))
			if tc.wantSaved {
				require.NoError(t, err)
				assert.Equal(t, "18765\n", string(raw))
				return
			}
			assert.True(t, os.IsNotExist(err), "an answer other than yes saves nothing")
		})
	}
}

// TestOfferSavePort_NoAnswerNeverTouchesAnExistingSavedPort is the other half of D11: a
// declined prompt leaves what was saved before exactly as it was.
func TestOfferSavePort_NoAnswerNeverTouchesAnExistingSavedPort(t *testing.T) {
	dataDir := t.TempDir()
	writeSavedPort(t, dataDir, "18765\n")

	offerSavePort(context.Background(), newLineInput(strings.NewReader("n\n"), true), io.Discard, dataDir, 18766, zerolog.Nop())

	raw, err := os.ReadFile(savedPortPath(dataDir))
	require.NoError(t, err)
	assert.Equal(t, "18765\n", string(raw))
}

// TestOfferSavePort_DefaultAnsweredYesClearsTheSavedPort covers D6 end to end over the
// pure pieces: the start that would prompt, the answer, and the next resolution.
func TestOfferSavePort_DefaultAnsweredYesClearsTheSavedPort(t *testing.T) {
	dataDir := t.TempDir()
	require.NoError(t, savePort(dataDir, 18765))

	choice, err := resolvePort(portFlag{value: defaultPort, given: true}, dataDir)
	require.NoError(t, err)
	require.True(t, choice.offerSave)
	require.Equal(t, defaultPort, choice.listen)

	var logs bytes.Buffer
	offerSavePort(context.Background(), newLineInput(strings.NewReader("y\n"), true), io.Discard, dataDir, choice.listen, zerolog.New(&logs))

	_, statErr := os.Stat(savedPortPath(dataDir))
	assert.True(t, os.IsNotExist(statErr), "D6: no saved port is left")
	next, err := resolvePort(portFlag{}, dataDir)
	require.NoError(t, err)
	assert.Equal(t, portChoice{listen: defaultPort}, next, "the next start uses 8765 without prompting")
	assert.Contains(t, logs.String(), "saved port cleared")
}

func TestOfferSavePort_AFailedSaveIsLoggedNotFatal(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	var logs bytes.Buffer

	offerSavePort(context.Background(), newLineInput(strings.NewReader("y\n"), true), io.Discard, missing, 18765, zerolog.New(&logs))

	assert.Contains(t, logs.String(), "port not saved")
	assert.NotContains(t, logs.String(), "port saved for future starts")
}

// TestMaybeOfferSavePort_Guards covers D5/D7 (the serving flag), D8 (stdin must be a
// terminal) and D9 (a restarted daemon) at the one function that applies them, with a
// pty for the terminal and "y" already typed so a prompt that wrongly appears would save.
func TestMaybeOfferSavePort_Guards(t *testing.T) {
	tests := []struct {
		name       string
		offer      bool
		restarted  bool
		stdin      string // "pty", "pipe" or "nil"
		wantPrompt bool
	}{
		{name: "terminal, offered, first start", offer: true, stdin: "pty", wantPrompt: true},
		{name: "D9 restarted daemon never prompts", offer: true, restarted: true, stdin: "pty"},
		{name: "D5/D7 not offered never prompts", offer: false, stdin: "pty"},
		{name: "D8 pipe stdin never prompts", offer: true, stdin: "pipe"},
		{name: "D8 nil stdin never prompts", offer: true, stdin: "nil"},
		{name: "D8 restarted and not a terminal", offer: true, restarted: true, stdin: "pipe"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			var stdin *os.File
			switch tc.stdin {
			case "pty":
				ptmx, tty := newPTYPair(t)
				_, err := ptmx.WriteString("y\n")
				require.NoError(t, err)
				stdin = tty
			case "pipe":
				r, w, err := os.Pipe()
				require.NoError(t, err)
				t.Cleanup(func() { _ = r.Close(); _ = w.Close() })
				_, err = w.WriteString("y\n")
				require.NoError(t, err)
				stdin = r
			}
			stderr := &syncBuf{}
			serving := &servingEnv{offerSavePort: tc.offer, port: 18765}

			stop := maybeOfferSavePort(context.Background(), &cliFlags{dataDir: dataDir}, newLineInput(stdin, isTerminal(stdin)), tc.restarted, serving, stderr, zerolog.Nop())
			t.Cleanup(stop)

			if tc.wantPrompt {
				assert.Eventually(t, func() bool {
					return strings.Contains(stderr.String(), "Save port 18765 for future starts? [y/N] ")
				}, portTestWait, portTestTick)
				assert.Eventually(t, func() bool {
					raw, err := os.ReadFile(savedPortPath(dataDir))
					return err == nil && string(raw) == "18765\n"
				}, portTestWait, portTestTick, "the typed y is saved")
				return
			}
			assert.Never(t, func() bool {
				_, err := os.Stat(savedPortPath(dataDir))
				return stderr.String() != "" || err == nil
			}, portTestQuiet, portTestTick, "no prompt and nothing saved")
		})
	}
}

// TestSavePromptThenKillPrompt_OneTerminalOneReader covers the shutdown interaction
// between the two prompts that share terminal stdin (correctness review cycle 1, Major
// 1): the save prompt is stopped as shutdown begins (stopSavePrompt in run), and the line
// typed at the -on-exit prompt must answer that prompt alone. Each row is the same pty
// and the same *lineInput run builds, driven in run's order.
func TestSavePromptThenKillPrompt_OneTerminalOneReader(t *testing.T) {
	tests := []struct {
		name        string
		saveAnswer  string // typed before shutdown; empty leaves the save prompt unanswered
		killAnswer  string
		wantDecided onExitDecision
		wantSaved   bool
	}{
		{name: "unanswered save prompt, y kills and saves nothing", killAnswer: "y\n", wantDecided: onExitKill},
		{name: "unanswered save prompt, yes kills and saves nothing", killAnswer: "yes\n", wantDecided: onExitKill},
		{name: "unanswered save prompt, n leaves and saves nothing", killAnswer: "n\n", wantDecided: onExitLeave},
		{name: "unanswered save prompt, empty line leaves and saves nothing", killAnswer: "\n", wantDecided: onExitLeave},
		{name: "save y typed first saves, its own line never answers the kill prompt", saveAnswer: "y\n", killAnswer: "n\n", wantDecided: onExitLeave, wantSaved: true},
		{name: "save n typed first saves nothing, kill y kills", saveAnswer: "n\n", killAnswer: "y\n", wantDecided: onExitKill},
		{name: "save y then kill y saves and kills", saveAnswer: "y\n", killAnswer: "y\n", wantDecided: onExitKill, wantSaved: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := t.TempDir()
			ptmx, tty := newPTYPair(t)
			in := newLineInput(tty, true)
			stderr := &syncBuf{}
			serving := &servingEnv{offerSavePort: true, port: 18765}
			stop := maybeOfferSavePort(context.Background(), &cliFlags{dataDir: dataDir}, in, false, serving, stderr, zerolog.Nop())
			t.Cleanup(stop)
			require.Eventually(t, func() bool {
				return strings.Contains(stderr.String(), "Save port 18765 for future starts? [y/N] ")
			}, portTestWait, portTestTick)

			if tc.saveAnswer != "" {
				_, err := ptmx.WriteString(tc.saveAnswer)
				require.NoError(t, err)
				require.Eventually(t, func() bool {
					return pendingRead(in) == nil
				}, portTestWait, portTestTick, "the save prompt took its own answer")
			}
			stop() // run's stopSavePrompt: Ctrl-C arrived, shutdown starts

			decided := make(chan onExitDecision, 1)
			go func() { decided <- askKillPrompt(in, stderr, 1, 1, "muster") }()
			require.Eventually(t, func() bool {
				return strings.Contains(stderr.String(), "kill them? [y/N] ")
			}, portTestWait, portTestTick)
			_, err := ptmx.WriteString(tc.killAnswer)
			require.NoError(t, err)

			select {
			case got := <-decided:
				assert.Equal(t, tc.wantDecided, got, "the kill prompt got the line typed at it")
			case <-time.After(portTestWait):
				require.Fail(t, "the kill prompt never received the line typed at it (it would have timed out into leave)")
			}
			raw, readErr := os.ReadFile(savedPortPath(dataDir))
			if tc.wantSaved {
				require.NoError(t, readErr)
				assert.Equal(t, "18765\n", string(raw))
				return
			}
			assert.True(t, os.IsNotExist(readErr), "an answer typed at the kill prompt never saves the port")
		})
	}
}

// TestMaybeOfferSavePort_StopEndsAnUnansweredPrompt covers the stop func: it returns
// promptly with the prompt unanswered, ends the line the prompt left open, and saves
// nothing.
func TestMaybeOfferSavePort_StopEndsAnUnansweredPrompt(t *testing.T) {
	dataDir := t.TempDir()
	_, tty := newPTYPair(t)
	stderr := &syncBuf{}
	serving := &servingEnv{offerSavePort: true, port: 18765}
	stop := maybeOfferSavePort(context.Background(), &cliFlags{dataDir: dataDir}, newLineInput(tty, true), false, serving, stderr, zerolog.Nop())
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "[y/N] ")
	}, portTestWait, portTestTick)

	stopped := make(chan struct{})
	go func() { stop(); close(stopped) }()

	select {
	case <-stopped:
	case <-time.After(portTestWait):
		require.Fail(t, "stop blocked on the unanswered read")
	}
	assert.True(t, strings.HasSuffix(stderr.String(), "[y/N] \n"), "the prompt line is ended, not left dangling: %q", stderr.String())
	_, statErr := os.Stat(savedPortPath(dataDir))
	assert.True(t, os.IsNotExist(statErr))
}

// TestMaybeOfferSavePort_ParentContextEndsThePrompt covers the SIGTERM/serve-error paths:
// no kill prompt reads, so the prompt must end with run's context rather than outlive it.
func TestMaybeOfferSavePort_ParentContextEndsThePrompt(t *testing.T) {
	_, tty := newPTYPair(t)
	stderr := &syncBuf{}
	ctx, cancel := context.WithCancel(context.Background())
	serving := &servingEnv{offerSavePort: true, port: 18765}
	stop := maybeOfferSavePort(ctx, &cliFlags{dataDir: t.TempDir()}, newLineInput(tty, true), false, serving, stderr, zerolog.Nop())
	require.Eventually(t, func() bool {
		return strings.Contains(stderr.String(), "[y/N] ")
	}, portTestWait, portTestTick)

	cancel()

	assert.Eventually(t, func() bool {
		return strings.HasSuffix(stderr.String(), "[y/N] \n")
	}, portTestWait, portTestTick, "the goroutine ended with its parent context")
	stop()
}
