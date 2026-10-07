package kb

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// ErrUsage marks a command-line mistake (a missing flag, a plan that does not exist); the
// CLI exits 2 on it rather than 1.
var ErrUsage = errors.New("usage")

// ScopeOptions names the plan whose headers bound the change, and whether a missing owner is
// appended to its Touches header rather than reported.
type ScopeOptions struct {
	Plan  string
	Touch bool
}

var touchesLineRE = regexp.MustCompile(`(?m)^\*\*Touches\*\*:[ \t]*(.*?)[ \t]*$`)

// Scope checks that every source file this branch changed belongs to a feature the plan's
// Features or Touches header names (kb:adr/process-touched-features-widen-without-stopping),
// and returns how many could not be placed. With Touch, a missing owner is appended to
// Touches instead and the file passes: a touched feature packs as spec and contract only,
// so widening into it costs no developer stop. Lines keep the shape the orchestrator reads.
func Scope(ix *Index, opts ScopeOptions, w io.Writer) (int, error) {
	if opts.Plan == "" {
		return 0, fmt.Errorf("%w: kb scope --plan NAME [--touch]", ErrUsage)
	}
	planRel := ix.Config.PlanPath(opts.Plan)
	planPath := filepath.Join(ix.Root, filepath.FromSlash(planRel))
	if _, err := os.Stat(planPath); err != nil {
		return 0, fmt.Errorf("%w: kb scope --plan NAME [--touch] (%s must exist)", ErrUsage, planRel)
	}
	features, touches, err := planHeaders(planPath)
	if err != nil {
		return 0, err
	}
	header := append(append([]string{}, features...), touches...)
	changed, err := changedSourceFiles(ix)
	if err != nil {
		return 0, err
	}
	if len(changed) == 0 {
		_, err = io.WriteString(w, "features-scope: no changed source files\n")
		return 0, err
	}
	unplaced := 0
	for _, f := range changed {
		for _, owner := range ix.Owners(f) {
			if contains(header, owner) {
				continue
			}
			if !opts.Touch {
				fmt.Fprintf(w, "%s → feature '%s', in neither **Features** (%s) nor **Touches** (%s)\n", f, owner, strings.Join(features, " "), strings.Join(touches, " "))
				unplaced++
				continue
			}
			if terr := touchPlan(planPath, owner); terr != nil {
				return 0, fmt.Errorf("features-scope: could not edit %s: %w", planRel, terr)
			}
			header = append(header, owner)
			fmt.Fprintf(w, "features-scope: touched %s for %s (plan.md edited — commit it as docs(%s): touch %s)\n", owner, f, opts.Plan, owner)
		}
	}
	if unplaced > 0 {
		_, err = io.WriteString(w, "Run with --touch to add each missing owner to **Touches** (packs spec and contract only, no stop).\n")
		return unplaced, err
	}
	if _, touches, err = planHeaders(planPath); err != nil {
		return 0, err
	}
	_, err = fmt.Fprintf(w, "features-scope: every changed source file's feature is in **Features** (%s) or **Touches** (%s)\n", strings.Join(features, " "), strings.Join(touches, " "))
	return 0, err
}

// planHeaders reads a plan's Features and Touches headers; an absent header is an empty list.
func planHeaders(planPath string) (features, touches []string, err error) {
	data, err := os.ReadFile(planPath)
	if err != nil {
		return nil, nil, fmt.Errorf("reading %s: %w", planPath, err)
	}
	if m := featuresHeaderRE.FindSubmatch(data); m != nil {
		features = splitList(string(m[1]))
	}
	if m := touchesHeaderRE.FindSubmatch(data); m != nil {
		touches = splitList(string(m[1]))
	}
	return features, touches, nil
}

// changedSourceFiles lists, sorted and deduplicated, every file under the config's scope
// roots that the branch changed against main or the working tree changed since, that still
// exists and that no scope.skip glob names. A path git reports as renamed counts as its new
// name; a deleted file's owner is judged by what replaced it.
func changedSourceFiles(ix *Index) ([]string, error) {
	var listed []string
	if base, err := gitOut(ix.Root, "", nil, "merge-base", "main", "HEAD"); err == nil {
		committed, err := gitLines(ix.Root, "diff", "--name-only", strings.TrimSpace(base), "HEAD")
		if err != nil {
			return nil, err
		}
		listed = append(listed, committed...)
	}
	status, err := gitLines(ix.Root, "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	for _, row := range status {
		if len(row) < 4 {
			continue
		}
		p := row[3:]
		if _, after, ok := strings.Cut(p, " -> "); ok {
			p = after
		}
		listed = append(listed, p)
	}
	seen := map[string]bool{}
	var out []string
	for _, f := range listed {
		if seen[f] || !underRoots(ix.Config.Scope.Roots, f) || skippedByScope(ix.Config.Scope.Skip, f) {
			continue
		}
		seen[f] = true
		if st, err := os.Stat(filepath.Join(ix.Root, filepath.FromSlash(f))); err == nil && st.Mode().IsRegular() {
			out = append(out, f)
		}
	}
	sort.Strings(out)
	return out, nil
}

func underRoots(roots []string, rel string) bool {
	for _, r := range roots {
		if strings.HasPrefix(rel, r+"/") {
			return true
		}
	}
	return false
}

func skippedByScope(skip []string, rel string) bool {
	for _, g := range skip {
		if MatchGlob(g, rel) {
			return true
		}
	}
	return false
}

// touchPlan appends name to the plan's Touches header, creating the header on the line after
// Features when absent.
func touchPlan(planPath, name string) error {
	data, err := os.ReadFile(planPath)
	if err != nil {
		return err
	}
	text := string(data)
	if loc := touchesLineRE.FindStringSubmatchIndex(text); loc != nil {
		names := splitList(text[loc[2]:loc[3]])
		if !contains(names, name) {
			names = append(names, name)
		}
		text = text[:loc[0]] + "**Touches**: " + strings.Join(names, ", ") + text[loc[1]:]
	} else if loc := featuresHeaderRE.FindStringIndex(text); loc != nil {
		text = text[:loc[1]] + "\n**Touches**: " + name + text[loc[1]:]
	} else {
		return errors.New("no **Features** header to place **Touches** after")
	}
	return os.WriteFile(planPath, []byte(text), 0o644)
}
