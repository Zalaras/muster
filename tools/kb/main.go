// Command kb indexes and gates the docs/ knowledge base: the record frontmatters in the
// eight record directories kb.yaml names (rules, adr, diagrams, facts, lessons, runbooks,
// references, and the per-feature spec.md), the kb:anchor comments in the protocol file,
// and every generated file rendered from them.
//
//	go run ./tools/kb gen                       # regenerate; write only changed files
//	go run ./tools/kb check                     # every invariant incl. refs --all; exit 1 listing each finding
//	go run ./tools/kb pack --plan NAME --role ROLE [--features a,b] [--touches c,d]
//	go run ./tools/kb for PATH                  # features + records covering a repo path
//	go run ./tools/kb why PATH                  # decisions + facts explaining a path
//	go run ./tools/kb show ID | cite ID | find WORD... | ls [--type T] [--feature F] [--status S] [--role R] [--guard none]
//	go run ./tools/kb fences FILE...           # every mermaid fence opens with an allowed keyword; exit 1 listing each that does not
//	go run ./tools/kb refs [--all | FILE...]   # every cited repo path, make target and flag exists; default = files changed against main
//	go run ./tools/kb scope --plan NAME [--touch]  # every changed source file's feature is in the plan's headers; --touch widens Touches
//	go run ./tools/kb owners PATH...           # path<TAB>feature[,feature] per path, - when none (for scripts)
//
// All logic lives in internal/kb; this file only dispatches. It is a dev tool, not part
// of the product: .goreleaser.yaml builds only ./cmd/musterd.
package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Zalaras/muster/internal/kb"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "kb:", err)
		os.Exit(exitCode(err))
	}
}

// exitCode is 2 for a usage mistake and 1 for everything else.
func exitCode(err error) int {
	if errors.Is(err, kb.ErrUsage) {
		return 2
	}
	return 1
}

const usage = "usage: kb <gen|check|pack|for|why|show|cite|find|ls|fences|refs|scope|owners> [args]"

func run(args []string, stdout io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", usage)
	}
	if args[0] == "fences" {
		return cmdFences(args[1:], stdout)
	}
	cmd, ok := commands[args[0]]
	if !ok {
		return fmt.Errorf("unknown subcommand %q (want gen, check, pack, for, why, show, cite, find, ls, fences, refs, scope or owners)", args[0])
	}
	root, err := repoRoot()
	if err != nil {
		return err
	}
	ix, findings, err := kb.Load(root)
	if err != nil {
		return err
	}
	return cmd(ix, findings, args, stdout)
}

// command is one subcommand over a loaded index; args[0] is its own name.
type command func(ix *kb.Index, findings []kb.Finding, args []string, stdout io.Writer) error

var commands = map[string]command{
	"gen":   func(ix *kb.Index, f []kb.Finding, _ []string, w io.Writer) error { return cmdGen(ix, f, w) },
	"check": func(ix *kb.Index, f []kb.Finding, _ []string, w io.Writer) error { return cmdCheck(ix, f, w) },
	"pack":  func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdPack(ix, a[1:], w) },
	"for":   func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdPath(ix, a, w) },
	"why":   func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdPath(ix, a, w) },
	"show":  func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdID(ix, a, w, kb.Show) },
	"cite":  func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdID(ix, a, w, kb.Cite) },
	"find":  func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return kb.Find(ix, a[1:], w) },
	"ls":    func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdLs(ix, a[1:], w) },
	"refs":  func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdRefs(ix, a[1:], w) },
	"scope": func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error { return cmdScope(ix, a[1:], w) },
	"owners": func(ix *kb.Index, _ []kb.Finding, a []string, w io.Writer) error {
		return cmdOwners(ix, a[1:], w)
	},
}

// cmdID runs a one-id query (show, cite).
func cmdID(ix *kb.Index, args []string, stdout io.Writer, query func(*kb.Index, string, io.Writer) error) error {
	if len(args) != 2 {
		return fmt.Errorf("usage: kb %s <id>", args[0])
	}
	return query(ix, args[1], stdout)
}

// cmdFences checks the mermaid fences of files outside the record tree (a plan, a scratch
// draft) with the rule check-kb applies to records. It needs no index, so it runs anywhere.
func cmdFences(paths []string, stdout io.Writer) error {
	if len(paths) == 0 {
		return fmt.Errorf("usage: kb fences <file> [file ...]")
	}
	n := 0
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			return fmt.Errorf("reading %s: %w", p, err)
		}
		for _, f := range kb.CheckFences(p, string(data), 0) {
			fmt.Fprintln(stdout, f)
			n++
		}
	}
	if n > 0 {
		return fmt.Errorf("kb fences: %d problem(s)", n)
	}
	fmt.Fprintf(stdout, "kb: %d file(s), every mermaid fence opens with an allowed keyword\n", len(paths))
	return nil
}

// repoRoot walks up from the working directory to the directory holding go.mod.
func repoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getting working directory: %w", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no go.mod above %s", dir)
		}
		dir = parent
	}
}

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

func cmdGen(ix *kb.Index, findings []kb.Finding, stdout io.Writer) error {
	outs, fragFindings, err := kb.Outputs(ix)
	if err != nil {
		return err
	}
	findings = append(findings, fragFindings...)
	if len(findings) > 0 {
		for _, f := range findings {
			fmt.Fprintln(stdout, f)
		}
		return fmt.Errorf("kb gen: %d problem(s) in the sources — fix them first", len(findings))
	}
	written, err := kb.Apply(ix.Root, outs)
	if err != nil {
		return err
	}
	if len(written) == 0 {
		fmt.Fprintln(stdout, "kb: all generated files fresh")
		return nil
	}
	fmt.Fprintf(stdout, "kb: regenerated %d file(s): %s\n", len(written), strings.Join(written, ", "))
	return nil
}

func cmdCheck(ix *kb.Index, loadFindings []kb.Finding, stdout io.Writer) error {
	findings, err := kb.CheckRepo(ix, loadFindings)
	if err != nil {
		return err
	}
	for _, f := range findings {
		fmt.Fprintln(stdout, f)
	}
	fmt.Fprintf(stdout, "kb: %d records, %d features, %d problem(s)\n", len(ix.Records), len(ix.Features), len(findings))
	if len(findings) > 0 {
		return fmt.Errorf("kb check: %d problem(s)", len(findings))
	}
	fmt.Fprintln(stdout, "kb: all checks pass")
	return nil
}

func cmdPack(ix *kb.Index, args []string, stdout io.Writer) error {
	const packUsage = "usage: kb pack --plan NAME --role ROLE [--features a,b] [--touches c,d]"
	plan, err := flagValue(args, "--plan")
	if err != nil {
		return err
	}
	role, err := flagValue(args, "--role")
	if err != nil {
		return err
	}
	features, err := flagValue(args, "--features")
	if err != nil {
		return err
	}
	touches, err := flagValue(args, "--touches")
	if err != nil {
		return err
	}
	if plan == "" || role == "" {
		return fmt.Errorf("%s", packUsage)
	}
	planRel := ix.Config.PlanPath(plan)
	planPath := filepath.Join(ix.Root, filepath.FromSlash(planRel))
	if _, err = os.Stat(planPath); err != nil {
		return fmt.Errorf("%s does not exist", planRel)
	}
	opts := kb.PackOptions{Plan: plan, Role: role}
	// --features overrides the plan's headers outright (the planner packs before the plan
	// exists); --touches alone adds to what the plan's Touches header says.
	if features != "" {
		opts.Features = splitFlagList(features)
	} else {
		opts.Features, err = kb.PlanFeatures(planPath)
		if err != nil {
			return fmt.Errorf("%s: %w (add one, or pass --features)", planRel, err)
		}
		if opts.Touches, err = kb.PlanTouches(planPath); err != nil {
			return err
		}
	}
	opts.Touches = append(opts.Touches, splitFlagList(touches)...)
	_, err = kb.Pack(ix, opts, stdout)
	return err
}

// splitFlagList splits a comma-separated flag value, trimming and dropping empties.
func splitFlagList(s string) []string {
	var out []string
	for _, f := range strings.Split(s, ",") {
		if f = strings.TrimSpace(f); f != "" {
			out = append(out, f)
		}
	}
	return out
}

func cmdPath(ix *kb.Index, args []string, stdout io.Writer) error {
	if len(args) != 2 {
		return fmt.Errorf("usage: kb %s <path>", args[0])
	}
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("getting working directory: %w", err)
	}
	rel, err := kb.RelPath(ix.Root, cwd, args[1])
	if err != nil {
		return err
	}
	if args[0] == "for" {
		return kb.For(ix, rel, stdout)
	}
	return kb.Why(ix, rel, stdout)
}

func cmdLs(ix *kb.Index, args []string, stdout io.Writer) error {
	var f kb.ListFilter
	var err error
	for _, kv := range []struct {
		flag string
		dst  *string
	}{{"--type", &f.Type}, {"--feature", &f.Feature}, {"--status", &f.Status}, {"--role", &f.Role}, {"--guard", &f.Guard}} {
		if *kv.dst, err = flagValue(args, kv.flag); err != nil {
			return err
		}
	}
	return kb.List(ix, f, stdout)
}

// relPaths normalises every argument to a repo-relative slash path.
func relPaths(root string, args []string) ([]string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("getting working directory: %w", err)
	}
	out := make([]string, 0, len(args))
	for _, a := range args {
		rel, err := kb.RelPath(root, cwd, a)
		if err != nil {
			return nil, err
		}
		out = append(out, rel)
	}
	return out, nil
}

// cmdRefs prints every dead reference and the dead-refs summary line the gates and retro
// read; it fails only when a reference is missing.
func cmdRefs(ix *kb.Index, args []string, stdout io.Writer) error {
	var opts kb.RefsOptions
	var files []string
	for _, a := range args {
		switch a {
		case "--all":
			opts.All = true
		case "--changed":
		default:
			files = append(files, a)
		}
	}
	if opts.All && len(files) > 0 {
		return fmt.Errorf("%w: kb refs [--all | --changed | FILE...]", kb.ErrUsage)
	}
	var err error
	if opts.Files, err = relPaths(ix.Root, files); err != nil {
		return err
	}
	res, err := kb.Refs(ix, opts)
	if err != nil {
		return err
	}
	for _, h := range res.Hits {
		fmt.Fprintln(stdout, h)
	}
	for _, w := range res.StaleWhitelist {
		fmt.Fprintf(stdout, "dead-refs: whitelist entry %q now exists — remove it from %s\n", w, kb.ConfigPath)
	}
	if res.Checked == 0 {
		fmt.Fprintf(stdout, "dead-refs: 0 references checked (nothing to scan in %d file(s))\n", res.Files)
		return nil
	}
	fmt.Fprintf(stdout, "dead-refs: %d references checked, %d missing\n", res.Checked, res.Missing)
	if res.Missing > 0 {
		return fmt.Errorf("kb refs: %d missing", res.Missing)
	}
	return nil
}

func cmdScope(ix *kb.Index, args []string, stdout io.Writer) error {
	plan, err := flagValue(args, "--plan")
	if err != nil {
		return err
	}
	opts := kb.ScopeOptions{Plan: plan}
	for _, a := range args {
		if a == "--touch" {
			opts.Touch = true
		}
	}
	n, err := kb.Scope(ix, opts, stdout)
	if err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("kb scope: %d file(s) outside the plan's features", n)
	}
	return nil
}

func cmdOwners(ix *kb.Index, args []string, stdout io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("%w: kb owners <path> [<path> ...]", kb.ErrUsage)
	}
	rels, err := relPaths(ix.Root, args)
	if err != nil {
		return err
	}
	return kb.Owners(ix, rels, stdout)
}
