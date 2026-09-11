package selfupdate

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"time"
)

// ProbeVersionTimeout bounds `<exe> -version` (REQ-26/D24) — a hung swapped binary must
// never wedge the update manager's tick loop.
const ProbeVersionTimeout = 5 * time.Second

// versionPattern matches musterd's own `-version` output ("musterd %s (Claude Code
// verified %s)", cmd/musterd/main.go): an optional "v" then MAJOR.MINOR.PATCH,
// immediately after "musterd ". "musterd dev" has no digit run at this position and
// correctly fails to match (D25).
var versionPattern = regexp.MustCompile(`^musterd v?(\d+\.\d+\.\d+)\b`)

// ProbeVersion runs `exePath -version` via run — an injectable seam
// (docs/conventions.md "every subprocess call gets an injectable run func"), never a
// $PATH shim — and parses the leading "musterd v?X.Y.Z" from its output (REQ-26). ctx
// should already carry ProbeVersionTimeout; a non-parseable or non-release version
// (e.g. "musterd dev") is an error, exactly like a probe that fails or hangs.
func ProbeVersion(ctx context.Context, run func(ctx context.Context, name string, args ...string) (string, error), exePath string) (string, error) {
	out, err := run(ctx, exePath, "-version")
	if err != nil {
		return "", fmt.Errorf("running %s -version: %w", exePath, err)
	}
	m := versionPattern.FindStringSubmatch(out)
	if m == nil {
		return "", fmt.Errorf("unrecognised version output: %q", out)
	}
	return m[1], nil
}

// RunVersionProbe is the production run func for ProbeVersion: runs name with args,
// capturing stdout, with WaitDelay bounding the wait for a hung descendant
// (docs/conventions.md §Go).
func RunVersionProbe(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.WaitDelay = 2 * time.Second
	err := cmd.Run()
	return buf.String(), err
}
