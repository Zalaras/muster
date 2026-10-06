// Command commentpass is the orchestrator's comment pass over a plan branch
// (kb:adr/process-comment-pass-owns-code-comments):
//
//	go run ./tools/commentpass strip  <plan> --out DIR [--all]            # remove added comments, write candidates for the judge
//	go run ./tools/commentpass apply  <plan> VERDICTS.json --cycle N --message MSG [--candidates PATH]
//	go run ./tools/commentpass verify <plan>                              # every added comment is a ledger keep (gates)
//	go run ./tools/commentpass drop   <plan> PATH:LINE... --cycle N --message MSG
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/Zalaras/muster/internal/commentpass"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "commentpass:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: commentpass <strip|apply|verify|drop> <plan> [args]")
	}
	root, err := repoRoot()
	if err != nil {
		return err
	}
	p := commentpass.New(root, args[1], stdout)
	ctx := context.Background()
	switch args[0] {
	case "strip":
		return stripCmd(ctx, p, args[2:])
	case "apply":
		return applyCmd(ctx, p, args[2:])
	case "verify":
		if len(args) != 2 {
			return fmt.Errorf("usage: commentpass verify <plan>")
		}
		return p.Verify(ctx)
	case "drop":
		return dropCmd(ctx, p, args[2:])
	default:
		return fmt.Errorf("unknown subcommand %q (want strip, apply, verify or drop)", args[0])
	}
}

func stripCmd(ctx context.Context, p *commentpass.Pass, args []string) error {
	fs := flag.NewFlagSet("strip", flag.ContinueOnError)
	out := fs.String("out", "", "directory for candidates.json and candidates.md (required)")
	all := fs.Bool("all", false, "re-judge comments the ledger already keeps")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *out == "" {
		return fmt.Errorf("strip: --out DIR is required")
	}
	return p.Strip(ctx, *out, *all)
}

func applyCmd(ctx context.Context, p *commentpass.Pass, args []string) error {
	fs := flag.NewFlagSet("apply", flag.ContinueOnError)
	cycle := fs.Int("cycle", 0, "review cycle number (required)")
	msg := fs.String("message", "", "commit message (required)")
	cands := fs.String("candidates", "", "candidates.json (default: beside the verdicts)")
	rest, err := parseMixed(fs, args)
	if err != nil {
		return err
	}
	if len(rest) != 1 || *cycle < 1 || *msg == "" {
		return fmt.Errorf("usage: commentpass apply <plan> VERDICTS.json --cycle N --message MSG")
	}
	return p.Apply(ctx, rest[0], *cands, *cycle, *msg)
}

func dropCmd(ctx context.Context, p *commentpass.Pass, args []string) error {
	fs := flag.NewFlagSet("drop", flag.ContinueOnError)
	cycle := fs.Int("cycle", 0, "review cycle number (required)")
	msg := fs.String("message", "", "commit message (required)")
	rest, err := parseMixed(fs, args)
	if err != nil {
		return err
	}
	if len(rest) == 0 || *cycle < 1 || *msg == "" {
		return fmt.Errorf("usage: commentpass drop <plan> PATH:LINE... --cycle N --message MSG")
	}
	return p.Drop(ctx, rest, *cycle, *msg)
}

// parseMixed lets flags follow positionals, as the skill's command lines write them.
func parseMixed(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string
	for len(args) > 0 {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) == 0 {
			break
		}
		positional = append(positional, args[0])
		args = args[1:]
	}
	return positional, nil
}

func repoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(cwd, "go.mod")); err != nil {
		return "", fmt.Errorf("must run from the repo root (no go.mod in %s)", cwd)
	}
	return cwd, nil
}
