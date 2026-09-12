// Command triage is the program half of /triage. It does everything the skill used to do
// by hand with a model holding Bash and Edit, and leaves the model only the one judgement
// that is genuinely Damian's: which section an item belongs in.
//
//	go run ./tools/triage fetch --out DIR   # read open issues, sanitise, route, write artifacts
//	go run ./tools/triage apply --artifacts DIR --proposals DIR --decisions FILE
//	go run ./tools/triage audit             # compare TODO.md against the tracker
//
// It is a dev tool, not part of the product: .goreleaser.yaml builds only ./cmd/musterd,
// so nothing here ships in a release. See docs/history/design/triage-hardening.md.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/triage"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, realRun); err != nil {
		fmt.Fprintln(os.Stderr, "triage:", err)
		os.Exit(1)
	}
}

func realRun(ctx context.Context, name string, args ...string) ([]byte, []byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	// WaitDelay so a wedged child cannot hold the run open indefinitely
	// (docs/conventions.md §Go).
	cmd.WaitDelay = 10 * time.Second
	err := cmd.Run()
	return []byte(stdout.String()), []byte(stderr.String()), err
}

func run(args []string, stdout io.Writer, runCmd triage.RunFunc) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: triage <fetch|apply|audit> [flags]")
	}
	root, module, err := repoRoot()
	if err != nil {
		return err
	}
	ctx := context.Background()
	switch args[0] {
	case "fetch":
		return cmdFetch(ctx, args[1:], stdout, runCmd, root, module)
	case "apply":
		return cmdApply(ctx, args[1:], stdout, runCmd, root, module)
	case "audit":
		return cmdAudit(ctx, stdout, runCmd, root, module)
	default:
		return fmt.Errorf("unknown subcommand %q (want fetch, apply or audit)", args[0])
	}
}

// cmdFetch reads every open issue and writes one sanitised artifact per untriaged one.
//
// Its stdout lands in the main session's context, so it prints numbers, URLs, fixed flag
// names and the constant tripwire phrase — never a title, never a slice of a body.
// Printing sanitised text would put attacker-shaped content into the one session all of
// this exists to keep it out of.
func cmdFetch(ctx context.Context, args []string, stdout io.Writer, runCmd triage.RunFunc, root, module string) error {
	out, err := flagValue(args, "--out")
	if err != nil {
		return err
	}
	if out == "" {
		if out, err = os.MkdirTemp("", "muster-triage-"); err != nil {
			return fmt.Errorf("creating artifact dir: %w", err)
		}
	}
	repo, err := triage.ResolveRepo(ctx, runCmd, module)
	if err != nil {
		return err
	}
	issues, err := (&triage.Fetcher{Run: runCmd, Repo: repo}).ListOpen(ctx)
	if err != nil {
		return err
	}
	_, tracked, err := triage.ReadTracked(root)
	if err != nil {
		return err
	}
	untriaged := triage.Untriaged(tracked, issues)

	arts := make([]triage.Artifact, 0, len(untriaged))
	for _, iss := range untriaged {
		a, err := triage.Build(iss, triage.DefaultLimits())
		if err != nil {
			return fmt.Errorf("issue %d: %w", iss.Number, err)
		}
		arts = append(arts, a)
	}
	if err := triage.WriteArtifacts(out, arts); err != nil {
		return err
	}
	if err := triage.WriteIndex(out, arts); err != nil {
		return err
	}
	if err := triage.WriteDispatch(out, arts); err != nil {
		return err
	}

	fmt.Fprintf(stdout, "%d open, %d untriaged.\n", len(issues), len(untriaged))
	printRoute(stdout, repo, arts, triage.PathNormal, "normal (trusted author, clean body)")
	printRoute(stdout, repo, arts, triage.PathFactsOnly, "facts-only (no model-authored prose reaches TODO.md)")
	printRoute(stdout, repo, arts, triage.PathHeld, "HELD — not sent to any model; review these yourself")
	fmt.Fprintf(stdout, "\nartifacts: %s\n", out)
	fmt.Fprintf(stdout, "dispatch:  %s\n", filepath.Join(out, triage.DispatchFile))
	return nil
}

func printRoute(stdout io.Writer, repo string, arts []triage.Artifact, p triage.Path, label string) {
	var rows []triage.Artifact
	for _, a := range arts {
		if a.Route == p {
			rows = append(rows, a)
		}
	}
	if len(rows) == 0 {
		return
	}
	fmt.Fprintf(stdout, "\n%s:\n", label)
	for _, a := range rows {
		fmt.Fprintf(stdout, "  #%-4d %s", a.Number, triage.IssueURL(repo, a.Number))
		if f := a.Flags.Strings(); len(f) > 0 {
			fmt.Fprintf(stdout, "  [%s]", strings.Join(f, " "))
		}
		fmt.Fprintln(stdout)
	}
}

// cmdApply validates each proposer reply against the artifact it was given, then splices
// and commits. A model never runs Edit on TODO.md.
func cmdApply(ctx context.Context, args []string, stdout io.Writer, runCmd triage.RunFunc, root, module string) error {
	artDir, err := flagValue(args, "--artifacts")
	if err != nil {
		return err
	}
	propDir, err := flagValue(args, "--proposals")
	if err != nil {
		return err
	}
	decFile, err := flagValue(args, "--decisions")
	if err != nil {
		return err
	}
	if artDir == "" || propDir == "" || decFile == "" {
		return fmt.Errorf("usage: triage apply --artifacts DIR --proposals DIR --decisions FILE")
	}
	repo, err := triage.ResolveRepo(ctx, runCmd, module)
	if err != nil {
		return err
	}

	index, err := triage.ReadIndex(artDir)
	if err != nil {
		return err
	}
	arts := map[int]triage.Artifact{}
	for _, a := range index {
		arts[a.Number] = a
	}

	decRaw, err := os.ReadFile(decFile)
	if err != nil {
		return fmt.Errorf("reading decisions: %w", err)
	}
	var decMap map[string]string
	if derr := json.Unmarshal(decRaw, &decMap); derr != nil {
		return fmt.Errorf("decoding decisions: %w", derr)
	}

	props := map[int]triage.Proposal{}
	var decisions []triage.Decision
	var held []string
	for numStr, section := range decMap {
		n, nerr := strconv.Atoi(numStr)
		if nerr != nil {
			return fmt.Errorf("decisions key %q is not an issue number", numStr)
		}
		a, ok := arts[n]
		if !ok {
			return fmt.Errorf("no artifact for issue %d", n)
		}
		if a.Route == triage.PathHeld {
			return fmt.Errorf("issue %d is held and must not be filed", n)
		}
		raw, rerr := os.ReadFile(filepath.Join(propDir, fmt.Sprintf("%d.json", n)))
		if rerr != nil {
			return fmt.Errorf("reading proposal for issue %d: %w", n, rerr)
		}
		p, verr := triage.ValidateProposal(raw, a)
		if verr != nil {
			// A failed proposal holds its issue; it never falls back to a guess.
			held = append(held, fmt.Sprintf("  #%d held — %v", n, verr))
			continue
		}
		props[n] = p
		decisions = append(decisions, triage.Decision{Number: n, Section: section})
	}

	subject, err := triage.Apply(ctx, runCmd, root, repo, decisions, arts, props)
	if err != nil {
		return err
	}
	if subject == "" {
		fmt.Fprintln(stdout, "nothing to file.")
	} else {
		fmt.Fprintf(stdout, "committed: %s\n", subject)
	}
	if len(held) > 0 {
		fmt.Fprintf(stdout, "\n%d proposal(s) rejected:\n%s\n", len(held), strings.Join(held, "\n"))
	}
	return nil
}

// cmdAudit compares TODO.md and the history file against the tracker in both directions. Pure text comparison,
// so there is no reason a model with Bash should be doing it.
func cmdAudit(ctx context.Context, stdout io.Writer, runCmd triage.RunFunc, root, module string) error {
	repo, err := triage.ResolveRepo(ctx, runCmd, module)
	if err != nil {
		return err
	}
	issues, err := (&triage.Fetcher{Run: runCmd, Repo: repo}).List(ctx, "all")
	if err != nil {
		return err
	}
	// Ticked entries live in the history file, so the audit reads both — the `dropped`
	// verdict below only exists there.
	_, tracked, err := triage.ReadTracked(root)
	if err != nil {
		return err
	}

	var dropped, reverse, untriaged []string
	for _, iss := range issues {
		checked, found := triage.EntryState(tracked, iss.Number)
		switch {
		case iss.State == "open" && !found:
			untriaged = append(untriaged, fmt.Sprintf("  #%d %s", iss.Number, triage.IssueURL(repo, iss.Number)))
		case iss.State == "open" && found && checked:
			// The failure mode of the whole loop: a `closes #N` dropped from a squash
			// subject. This is the only thing that catches it.
			dropped = append(dropped, fmt.Sprintf("  #%d entry is ticked but the issue is open — `gh issue close %d --comment \"Fixed in <sha>.\"`", iss.Number, iss.Number))
		case iss.State == "closed" && found && !checked:
			reverse = append(reverse, fmt.Sprintf("  #%d issue is closed but the entry is open — tick it, or reopen the issue", iss.Number))
		}
	}

	section(stdout, "closes dropped from a squash subject", dropped)
	section(stdout, "reverse drift", reverse)
	section(stdout, "untriaged", untriaged)
	if len(dropped)+len(reverse)+len(untriaged) == 0 {
		fmt.Fprintln(stdout, "audit clean: every open issue has an entry and every ticked entry is closed.")
	}
	return nil
}

func section(stdout io.Writer, label string, rows []string) {
	if len(rows) == 0 {
		return
	}
	fmt.Fprintf(stdout, "%s (%d):\n%s\n\n", label, len(rows), strings.Join(rows, "\n"))
}

// flagValue reads --name VALUE or --name=VALUE.
func flagValue(args []string, name string) (string, error) {
	for i, a := range args {
		if a == name {
			if i+1 >= len(args) {
				return "", fmt.Errorf("%s needs a value", name)
			}
			return args[i+1], nil
		}
		if v, ok := strings.CutPrefix(a, name+"="); ok {
			return v, nil
		}
	}
	return "", nil
}

var reModule = regexp.MustCompile(`(?m)^module\s+(\S+)\s*$`)

// repoRoot walks up for go.mod and reads the module path from it, so the repository slug
// has exactly one source of truth rather than a fourth hardcoded copy.
func repoRoot() (root, module string, err error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", "", err
	}
	for {
		b, err := os.ReadFile(filepath.Join(dir, "go.mod"))
		if err == nil {
			m := reModule.FindSubmatch(b)
			if m == nil {
				return "", "", fmt.Errorf("no module line in %s/go.mod", dir)
			}
			return dir, string(m[1]), nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", fmt.Errorf("no go.mod above %s", dir)
		}
		dir = parent
	}
}
