package triage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Scorer is an optional external classifier that rates a sanitised issue for prompt
// injection. Any command speaking the protocol plugs in: one JSON line {"id":N,"text":"…"}
// on stdin, one JSON object {"id":N,"p":0..1} on stdout. The program reads a number back,
// never text, so a poisoned body cannot talk its way into the reply; the thresholds that
// act on the number are ScoreRestrict and ScoreHold.
//
// No scorer ships with the repository. The hook exists so one can be measured on real
// issue bodies and adopted without touching the pipeline.
type Scorer struct {
	Argv    []string
	Timeout time.Duration
}

// ScorerEnv names the environment variable `--scorer` falls back to.
const ScorerEnv = "MUSTER_TRIAGE_SCORER"

const defaultScorerTimeout = 60 * time.Second

// ScorerFromEnv returns the configured scorer, if any. The flag value wins over the
// environment variable; an empty command means no scorer, which is the default.
func ScorerFromEnv(flag string) (*Scorer, bool) {
	cmd := flag
	if cmd == "" {
		cmd = os.Getenv(ScorerEnv)
	}
	argv := strings.Fields(cmd)
	if len(argv) == 0 {
		return nil, false
	}
	return &Scorer{Argv: argv, Timeout: defaultScorerTimeout}, true
}

type scoreRequest struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

type scoreReply struct {
	ID int     `json:"id"`
	P  float64 `json:"p"`
}

// Score runs the classifier over one artifact's sanitised title and body.
//
// Every failure is an error the caller folds into the flags ([Artifact.ApplyScore]) rather
// than a verdict: a timeout, a non-zero exit, a reply for another issue or a number outside
// [0,1] all leave the route exactly as it was. The error carries the command's name and the
// exit status, never its stderr — stderr is the scorer's own text and the report lands in
// the main session's context.
func (s *Scorer) Score(ctx context.Context, a Artifact) (float64, error) {
	if len(s.Argv) == 0 {
		return 0, fmt.Errorf("scorer: no command configured")
	}
	timeout := s.Timeout
	if timeout <= 0 {
		timeout = defaultScorerTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := json.Marshal(scoreRequest{ID: a.Number, Text: a.Title + "\n" + a.Body})
	if err != nil {
		return 0, fmt.Errorf("scorer request: %w", err)
	}
	cmd := exec.CommandContext(ctx, s.Argv[0], s.Argv[1:]...)
	cmd.Stdin = bytes.NewReader(append(req, '\n'))
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	// WaitDelay beside the timeout, so a grandchild holding the pipe cannot hang the run
	// (kb:adr/process-exec-waitdelay-on-pipe-owning-commands).
	cmd.WaitDelay = 2 * time.Second
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("scorer %s: %w", s.Argv[0], err)
	}

	var rep scoreReply
	if err := json.NewDecoder(&stdout).Decode(&rep); err != nil {
		return 0, fmt.Errorf("scorer %s: reply is not {\"id\",\"p\"}: %w", s.Argv[0], err)
	}
	if rep.ID != a.Number {
		return 0, fmt.Errorf("scorer %s: reply is for issue %d, asked about %d", s.Argv[0], rep.ID, a.Number)
	}
	if math.IsNaN(rep.P) || rep.P < 0 || rep.P > 1 {
		return 0, fmt.Errorf("scorer %s: p=%v is outside [0,1]", s.Argv[0], rep.P)
	}
	return rep.P, nil
}
