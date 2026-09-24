package selfupdate

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"time"
)

// ProbeVersionTimeout bounds `<exe> -version` — a hung swapped binary must
// never wedge the update manager's tick loop.
const ProbeVersionTimeout = 5 * time.Second

// VersionLinePrefix is the literal prefix of musterd's own `-version` output, immediately
// followed by the version itself: cmd/musterd's -version printer and versionPattern below
// are the format's only two consumers, and both build off this one declaration rather than
// each spelling "musterd " by hand.
const VersionLinePrefix = "musterd "

// versionPattern matches musterd's own `-version` output (VersionLinePrefix followed by
// "%s (Claude Code verified %s)", cmd/musterd's -version printer): an optional "v" then
// MAJOR.MINOR.PATCH, immediately after VersionLinePrefix. "musterd dev" has no digit run
// at this position and correctly fails to match.
var versionPattern = regexp.MustCompile(`^` + regexp.QuoteMeta(VersionLinePrefix) + `v?(\d+\.\d+\.\d+)\b`)

// versionProbeRun is the injectable seam ProbeVersion crosses instead of a real
// subprocess (docs/conventions.md § Testing) — the production value is runVersionProbe.
type versionProbeRun func(ctx context.Context, name string, args ...string) (string, error)

// versionProber holds the subprocess seam ProbeVersion crosses (the constructor-default
// shape docs/conventions.md § Testing names —
// kb:adr/process-adapter-run-seam-constructor-default): production always
// runVersionProbe, same-package tests overwrite the field. Built fresh per call, like
// tmux.Preflight's newPreflighter().
type versionProber struct {
	run versionProbeRun
}

func newVersionProber() *versionProber {
	return &versionProber{run: runVersionProbe}
}

// ProbeVersion runs `exePath -version`, never a $PATH shim, and parses the leading
// "musterd v?X.Y.Z" from its output. ctx should already carry ProbeVersionTimeout; a
// non-parseable or non-release version (e.g. "musterd dev") is an error, exactly like a
// probe that fails or hangs.
func ProbeVersion(ctx context.Context, exePath string) (string, error) {
	return newVersionProber().probe(ctx, exePath)
}

func (p *versionProber) probe(ctx context.Context, exePath string) (string, error) {
	out, err := p.run(ctx, exePath, "-version")
	if err != nil {
		return "", fmt.Errorf("running %s -version: %w", exePath, err)
	}
	m := versionPattern.FindStringSubmatch(out)
	if m == nil {
		return "", fmt.Errorf("unrecognised version output: %q", out)
	}
	return m[1], nil
}

// runVersionProbe is the production versionProbeRun: runs name with args, capturing
// stdout, with WaitDelay bounding the wait for a hung descendant (docs/conventions.md
// §Go).
func runVersionProbe(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.WaitDelay = 2 * time.Second
	err := cmd.Run()
	return buf.String(), err
}
