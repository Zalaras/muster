// Command kb indexes and gates the docs/ knowledge base: the record frontmatters under
// docs/rules, docs/adr, docs/facts, docs/lessons, docs/runbooks, docs/references and
// docs/features/<name>/spec.md, the kb:anchor comments in docs/protocol.md, and every
// generated file rendered from them.
//
//	go run ./tools/kb gen                       # regenerate; write only changed files
//	go run ./tools/kb check                     # every invariant; exit 1 listing each finding
//	go run ./tools/kb pack --plan NAME --role ROLE [--features a,b]
//	go run ./tools/kb for PATH                  # features + records covering a repo path
//	go run ./tools/kb why PATH                  # decisions + facts explaining a path
//	go run ./tools/kb show ID | cite ID | find WORD... | ls [--type T] [--feature F] [--status S] [--role R] [--guard none]
//
// All logic lives in internal/kb; this file only dispatches. It is a dev tool, not part
// of the product: .goreleaser.yaml builds only ./cmd/musterd.
package main

import (
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
		os.Exit(1)
	}
}

const usage = "usage: kb <gen|check|pack|for|why|show|cite|find|ls> [args]"

func run(args []string, stdout io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", usage)
	}
	root, err := repoRoot()
	if err != nil {
		return err
	}
	ix, findings, err := kb.Load(root)
	if err != nil {
		return err
	}
	switch args[0] {
	case "gen":
		return cmdGen(ix, findings, stdout)
	case "check":
		return cmdCheck(ix, findings, stdout)
	case "pack":
		return cmdPack(ix, args[1:], stdout)
	case "for", "why":
		return cmdPath(ix, args, stdout)
	case "show", "cite":
		if len(args) != 2 {
			return fmt.Errorf("usage: kb %s <id>", args[0])
		}
		if args[0] == "show" {
			return kb.Show(ix, args[1], stdout)
		}
		return kb.Cite(ix, args[1], stdout)
	case "find":
		return kb.Find(ix, args[1:], stdout)
	case "ls":
		return cmdLs(ix, args[1:], stdout)
	default:
		return fmt.Errorf("unknown subcommand %q (want gen, check, pack, for, why, show, cite, find or ls)", args[0])
	}
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
	findings, err := kb.Check(ix, loadFindings)
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
	const packUsage = "usage: kb pack --plan NAME --role ROLE [--features a,b]"
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
	if plan == "" || role == "" {
		return fmt.Errorf("%s", packUsage)
	}
	planPath := filepath.Join(ix.Root, "plans", plan, "plan.md")
	if _, err = os.Stat(planPath); err != nil {
		return fmt.Errorf("plans/%s/plan.md does not exist", plan)
	}
	opts := kb.PackOptions{Plan: plan, Role: role}
	if features != "" {
		for _, f := range strings.Split(features, ",") {
			if f = strings.TrimSpace(f); f != "" {
				opts.Features = append(opts.Features, f)
			}
		}
	} else {
		opts.Features, err = kb.PlanFeatures(planPath)
		if err != nil {
			return fmt.Errorf("plans/%s/plan.md: %w (add one, or pass --features)", plan, err)
		}
	}
	_, err = kb.Pack(ix, opts, stdout)
	return err
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
