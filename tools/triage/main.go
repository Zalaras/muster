// Command triage is the program half of /triage. It does everything mechanical between
// GitHub and the TODO.md commit, and leaves a model only the one Read-only job — summarising
// a sanitised body into a bounded, validated proposal.
//
//	go run ./tools/triage fetch [--out DIR] [--issue N] [--scorer CMD]   # read issues, sanitise, route, write artifacts
//	go run ./tools/triage apply --artifacts DIR --proposals DIR [--section NAME] [--decisions FILE] [--no-labels] [--dry-run]
//	go run ./tools/triage table --artifacts DIR --proposals DIR
//	go run ./tools/triage audit                                           # compare TODO.md against the tracker
//	go run ./tools/triage scan [--state open|closed|all] [--scorer CMD]   # route every issue, print nothing but numbers and flags
//
// It is a dev tool, not part of the product: .goreleaser.yaml builds only ./cmd/musterd,
// so nothing here ships in a release. See docs/features/triage/spec.md.
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
	"sort"
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

const usage = "usage: triage <fetch|apply|table|audit|scan> [flags]"

func run(args []string, stdout io.Writer, runCmd triage.RunFunc) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", usage)
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
	case "table":
		return cmdTable(args[1:], stdout)
	case "audit":
		return cmdAudit(ctx, stdout, runCmd, root, module)
	case "scan":
		return cmdScan(ctx, args[1:], stdout, runCmd, module)
	default:
		return fmt.Errorf("unknown subcommand %q (want fetch, apply, table, audit or scan)", args[0])
	}
}

// cmdFetch reads every open issue and writes one sanitised artifact per untriaged one —
// or, with --issue N, for that one issue whether or not it is already in the backlog.
//
// Its stdout lands in the main session's context, so it prints numbers, URLs, fixed flag
// names and a rule family's name — never a title, never a slice of a body.
// Printing sanitised text would put attacker-shaped content into the one session all of
// this exists to keep it out of.
func cmdFetch(ctx context.Context, args []string, stdout io.Writer, runCmd triage.RunFunc, root, module string) error {
	out, err := flagValue(args, "--out")
	if err != nil {
		return err
	}
	scorerFlag, err := flagValue(args, "--scorer")
	if err != nil {
		return err
	}
	only, err := issueFlag(args)
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
	selected, err := selectIssues(issues, tracked, only)
	if err != nil {
		return err
	}

	arts, err := buildArtifacts(ctx, out, selected, scorerFlag)
	if err != nil {
		return err
	}

	if only > 0 {
		fmt.Fprintf(stdout, "%d open; fetched #%d on request.\n", len(issues), only)
	} else {
		fmt.Fprintf(stdout, "%d open, %d untriaged.\n", len(issues), len(selected))
	}
	printRoute(stdout, repo, arts, triage.PathNormal, "normal (the developer's own, no danger signal)")
	printRoute(stdout, repo, arts, triage.PathRestricted, "restricted (summarised by a Read-only proposer, filed as an unverified report)")
	printRoute(stdout, repo, arts, triage.PathHeld, "HELD — not sent to any model; review these yourself")
	fmt.Fprintf(stdout, "\nartifacts: %s\n", out)
	fmt.Fprintf(stdout, "dispatch:  %s\n", filepath.Join(out, triage.DispatchFile))
	return nil
}

// buildArtifacts sanitises, routes and scores every selected issue and writes the artifact
// files, the index and the dispatch list into out.
func buildArtifacts(ctx context.Context, out string, selected []triage.Issue, scorerFlag string) ([]triage.Artifact, error) {
	arts := make([]triage.Artifact, 0, len(selected))
	for _, iss := range selected {
		a, err := triage.Build(iss, triage.DefaultLimits())
		if err != nil {
			return nil, fmt.Errorf("issue %d: %w", iss.Number, err)
		}
		arts = append(arts, a)
	}
	scoreArtifacts(ctx, scorerFlag, arts)
	if err := triage.WriteArtifacts(out, arts); err != nil {
		return nil, err
	}
	if err := triage.WriteIndex(out, arts); err != nil {
		return nil, err
	}
	if err := triage.WriteDispatch(out, arts); err != nil {
		return nil, err
	}
	return arts, nil
}

// issueFlag reads --issue N; zero means every untriaged issue.
func issueFlag(args []string) (int, error) {
	v, err := flagValue(args, "--issue")
	if err != nil || v == "" {
		return 0, err
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("--issue wants a positive issue number, got %q", v)
	}
	return n, nil
}

// selectIssues picks what fetch works on: every untriaged open issue, or the one named by
// --issue regardless of its triage state (a re-triage, or a dry run on a filed issue).
func selectIssues(issues []triage.Issue, tracked string, only int) ([]triage.Issue, error) {
	if only == 0 {
		return triage.Untriaged(tracked, issues), nil
	}
	for _, iss := range issues {
		if iss.Number == only {
			return []triage.Issue{iss}, nil
		}
	}
	return nil, fmt.Errorf("issue #%d is not an open issue", only)
}

// scoreArtifacts runs the optional classifier over every artifact, in place. No scorer
// configured means no change; a failing one marks its artifacts and leaves their routes.
func scoreArtifacts(ctx context.Context, flag string, arts []triage.Artifact) {
	sc, ok := triage.ScorerFromEnv(flag)
	if !ok {
		return
	}
	for i := range arts {
		p, err := sc.Score(ctx, arts[i])
		arts[i].ApplyScore(p, err)
	}
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

// applyOptions are apply's flags. Only the two directories are required.
type applyOptions struct {
	artDir, propDir, decFile, section string
	noLabels, dryRun                  bool
}

// cmdApply validates each proposer reply against the artifact it was given, then splices,
// commits and labels. A model never runs Edit on TODO.md and never names a label.
func cmdApply(ctx context.Context, args []string, stdout io.Writer, runCmd triage.RunFunc, root, module string) error {
	opts, err := applyFlags(args)
	if err != nil {
		return err
	}
	repo, err := triage.ResolveRepo(ctx, runCmd, module)
	if err != nil {
		return err
	}

	index, err := triage.ReadIndex(opts.artDir)
	if err != nil {
		return err
	}
	arts := map[int]triage.Artifact{}
	for _, a := range index {
		arts[a.Number] = a
	}
	decMap, err := readDecisions(opts.decFile)
	if err != nil {
		return err
	}
	decisions, props, held, err := resolveSections(index, arts, opts.propDir, opts.section, decMap)
	if err != nil {
		return err
	}

	if opts.dryRun {
		preview, derr := triage.DryRun(root, repo, decisions, arts, props)
		if derr != nil {
			return derr
		}
		fmt.Fprint(stdout, "dry run — nothing written, committed or labelled.\n\n"+preview)
		reportHeld(stdout, held)
		return nil
	}

	subject, filed, err := triage.Apply(ctx, runCmd, root, repo, decisions, arts, props)
	if err != nil {
		return err
	}
	if subject == "" {
		fmt.Fprintln(stdout, "nothing to file.")
	} else {
		fmt.Fprintf(stdout, "committed: %s\n", subject)
	}
	if len(filed) > 0 && !opts.noLabels {
		for _, lerr := range triage.Label(ctx, runCmd, repo, filed, props) {
			fmt.Fprintf(stdout, "label failed — %v\n", lerr)
		}
	}
	reportHeld(stdout, held)
	return nil
}

func reportHeld(stdout io.Writer, held []string) {
	if len(held) > 0 {
		fmt.Fprintf(stdout, "\n%d proposal(s) rejected:\n%s\n", len(held), strings.Join(held, "\n"))
	}
}

// cmdTable prints the ranking table: one row per issue with a validated proposal.
//
// It exists so that step is served by validated pipeline output rather than by a gh call: on
// 2026-09-21 the session reached for `gh issue list` to get titles, because dispatch.json
// carried none. Read-only by construction — it opens no file for writing and never touches
// TODO.md or the tracker.
//
// A title is printed only for a row the artifact marks readable (owner-filed, normal path);
// every other row shows its labels alone, so a restricted body still reaches no session.
func cmdTable(args []string, stdout io.Writer) error {
	artDir, err := flagValue(args, "--artifacts")
	if err != nil {
		return err
	}
	propDir, perr := flagValue(args, "--proposals")
	if perr != nil {
		return perr
	}
	if artDir == "" || propDir == "" {
		return fmt.Errorf("usage: triage table --artifacts DIR --proposals DIR")
	}

	index, err := triage.ReadIndex(artDir)
	if err != nil {
		return err
	}
	sort.Slice(index, func(i, j int) bool { return index[i].Number < index[j].Number })

	fmt.Fprintln(stdout, "| # | title | kind | area | modifiers | section hint |")
	fmt.Fprintln(stdout, "|---|---|---|---|---|---|")
	var held []string
	for _, a := range index {
		if a.Route == triage.PathHeld {
			held = append(held, fmt.Sprintf("  #%d held — %s", a.Number, strings.Join(a.Flags.Strings(), " ")))
			continue
		}
		p, verr := readProposal(propDir, a)
		if verr != nil {
			held = append(held, fmt.Sprintf("  #%d held — %v", a.Number, verr))
			continue
		}
		title := "—"
		if triage.Readable(a.AuthorAssociation, a.Route) {
			title = triage.HeaderSafe(a.Title)
		}
		fmt.Fprintf(stdout, "| %d | %s | %s | %s | %s | %s |\n",
			a.Number, title, p.Kind, strings.Join(p.Area, " "), strings.Join(p.Modifiers, " "), p.SectionHint)
	}
	if len(held) > 0 {
		fmt.Fprintf(stdout, "\n%d issue(s) not in the table:\n%s\n", len(held), strings.Join(held, "\n"))
	}
	return nil
}

// applyFlags reads apply's flags. The two directories are required; the section defaults to
// triage.DefaultSection; the decisions file is an optional per-issue override.
func applyFlags(args []string) (applyOptions, error) {
	var o applyOptions
	var err error
	if o.artDir, err = flagValue(args, "--artifacts"); err != nil {
		return o, err
	}
	if o.propDir, err = flagValue(args, "--proposals"); err != nil {
		return o, err
	}
	if o.decFile, err = flagValue(args, "--decisions"); err != nil {
		return o, err
	}
	if o.section, err = flagValue(args, "--section"); err != nil {
		return o, err
	}
	o.noLabels = hasFlag(args, "--no-labels")
	o.dryRun = hasFlag(args, "--dry-run")
	if o.artDir == "" || o.propDir == "" {
		return o, fmt.Errorf("usage: triage apply --artifacts DIR --proposals DIR [--section NAME] [--decisions FILE] [--no-labels] [--dry-run]")
	}
	return o, nil
}

// readDecisions loads the optional issue-number-to-section overrides.
func readDecisions(decFile string) (map[string]string, error) {
	if decFile == "" {
		return map[string]string{}, nil
	}
	decRaw, err := os.ReadFile(decFile)
	if err != nil {
		return nil, fmt.Errorf("reading decisions: %w", err)
	}
	var decMap map[string]string
	if derr := json.Unmarshal(decRaw, &decMap); derr != nil {
		return nil, fmt.Errorf("decoding decisions: %w", derr)
	}
	return decMap, nil
}

// resolveSections pairs every non-held artifact with its validated proposal and a section:
// the per-issue override when one exists, otherwise the run's `--section`, otherwise the
// proposal's kind decides (triage.SectionForKind). A bad override key,
// an unknown artifact, an unknown section or a held issue named in the overrides aborts the
// whole pass; a proposal that fails the schema (or is missing) only holds its own issue, and
// is returned in held rather than guessed at.
func resolveSections(index []triage.Artifact, arts map[int]triage.Artifact, propDir, section string, decMap map[string]string) ([]triage.Decision, map[int]triage.Proposal, []string, error) {
	overrides, err := checkOverrides(decMap, arts)
	if err != nil {
		return nil, nil, nil, err
	}
	if section != "" && !inSections(section) {
		return nil, nil, nil, fmt.Errorf("section %q is not one of %s", section, strings.Join(triage.Sections, ", "))
	}
	props := map[int]triage.Proposal{}
	var decisions []triage.Decision
	var held []string
	sort.Slice(index, func(i, j int) bool { return index[i].Number < index[j].Number })
	for _, a := range index {
		if a.Route == triage.PathHeld {
			continue
		}
		p, verr := readProposal(propDir, a)
		if verr != nil {
			// A failed proposal holds its issue; it never falls back to a guess.
			held = append(held, fmt.Sprintf("  #%d held — %v", a.Number, verr))
			continue
		}
		s := section
		if s == "" {
			s = triage.SectionForKind(p.Kind)
		}
		if o, ok := overrides[a.Number]; ok {
			s = o
		}
		props[a.Number] = p
		decisions = append(decisions, triage.Decision{Number: a.Number, Section: s})
	}
	return decisions, props, held, nil
}

// checkOverrides validates the decisions file against the artifacts: every key an issue
// number with an artifact that is not held, every value a known section.
func checkOverrides(decMap map[string]string, arts map[int]triage.Artifact) (map[int]string, error) {
	out := map[int]string{}
	for numStr, section := range decMap {
		n, nerr := strconv.Atoi(numStr)
		if nerr != nil {
			return nil, fmt.Errorf("decisions key %q is not an issue number", numStr)
		}
		a, ok := arts[n]
		if !ok {
			return nil, fmt.Errorf("no artifact for issue %d", n)
		}
		if a.Route == triage.PathHeld {
			return nil, fmt.Errorf("issue %d is held and must not be filed", n)
		}
		if !inSections(section) {
			return nil, fmt.Errorf("issue %d: section %q is not one of %s", n, section, strings.Join(triage.Sections, ", "))
		}
		out[n] = section
	}
	return out, nil
}

func inSections(s string) bool {
	for _, v := range triage.Sections {
		if v == s {
			return true
		}
	}
	return false
}

// readProposal loads and validates one proposer reply for an artifact.
func readProposal(propDir string, a triage.Artifact) (triage.Proposal, error) {
	raw, err := os.ReadFile(filepath.Join(propDir, fmt.Sprintf("%d.json", a.Number)))
	if err != nil {
		return triage.Proposal{}, fmt.Errorf("no proposal: %w", err)
	}
	return triage.ValidateProposal(raw, a)
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

// cmdScan routes every issue the tracker has — open by default, or closed or all — and
// prints one line per issue: number, association, route and flags. It is the calibration
// tool for the routing rules and an optional scorer: run it over the real corpus before and
// after a change and compare. It writes nothing anywhere, and like fetch it prints no title
// and no body text.
func cmdScan(ctx context.Context, args []string, stdout io.Writer, runCmd triage.RunFunc, module string) error {
	state, err := flagValue(args, "--state")
	if err != nil {
		return err
	}
	if state == "" {
		state = "open"
	}
	if state != "open" && state != "closed" && state != "all" {
		return fmt.Errorf("--state wants open, closed or all, got %q", state)
	}
	scorerFlag, err := flagValue(args, "--scorer")
	if err != nil {
		return err
	}
	repo, err := triage.ResolveRepo(ctx, runCmd, module)
	if err != nil {
		return err
	}
	issues, err := (&triage.Fetcher{Run: runCmd, Repo: repo}).List(ctx, state)
	if err != nil {
		return err
	}
	sort.Slice(issues, func(i, j int) bool { return issues[i].Number < issues[j].Number })

	totals := map[triage.Path]int{}
	fmt.Fprintf(stdout, "%d %s issue(s)\n", len(issues), state)
	for _, iss := range issues {
		a, berr := triage.Build(iss, triage.DefaultLimits())
		if berr != nil {
			return fmt.Errorf("issue %d: %w", iss.Number, berr)
		}
		if sc, ok := triage.ScorerFromEnv(scorerFlag); ok {
			p, serr := sc.Score(ctx, a)
			a.ApplyScore(p, serr)
		}
		totals[a.Route]++
		fmt.Fprintf(stdout, "  #%-4d %-12s %-10s [%s]\n", a.Number, a.AuthorAssociation, a.Route, strings.Join(a.Flags.Strings(), " "))
	}
	fmt.Fprintf(stdout, "normal %d, restricted %d, held %d\n", totals[triage.PathNormal], totals[triage.PathRestricted], totals[triage.PathHeld])
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

// hasFlag reports a bare boolean flag.
func hasFlag(args []string, name string) bool {
	for _, a := range args {
		if a == name {
			return true
		}
	}
	return false
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
