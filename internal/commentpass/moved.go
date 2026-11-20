package commentpass

import (
	"context"
	"errors"
	"os/exec"
	"strings"
)

// minNeedle is the shortest line worth a tree-wide search: anything shorter matches by chance.
const minNeedle = 16

// markMoved relabels each `added` candidate whose every line already stands in one file of
// base: the comment came with code the branch moved, so the branch did not write it.
func (p *Pass) markMoved(ctx context.Context, base string, cands []Candidate) error {
	for i := range cands {
		if cands[i].Origin != "added" {
			continue
		}
		from, err := p.foundOnBase(ctx, base, cands[i].Lines)
		if err != nil {
			return err
		}
		if from != "" {
			cands[i].Origin = "moved"
			cands[i].From = from
		}
	}
	return nil
}

// foundOnBase returns the first file of base holding every trimmed line of lines, or "".
func (p *Pass) foundOnBase(ctx context.Context, base string, lines []string) (string, error) {
	needle := longestTrimmed(lines)
	if len(needle) < minNeedle {
		return "", nil
	}
	out, stderr, err := p.Run(ctx, p.Root, "git", "grep", "-F", "-l", "-e", needle, base, "--")
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == 1 {
			return "", nil
		}
		return "", errors.Join(err, errors.New(strings.TrimSpace(string(stderr))))
	}
	for hit := range strings.SplitSeq(strings.TrimSpace(string(out)), "\n") {
		path := strings.TrimPrefix(hit, base+":")
		src, gerr := p.git(ctx, "show", base+":"+path)
		if gerr != nil {
			return "", gerr
		}
		if holdsEvery(src, lines) {
			return path, nil
		}
	}
	return "", nil
}

func longestTrimmed(lines []string) string {
	best := ""
	for _, l := range lines {
		if t := strings.TrimSpace(l); len(t) > len(best) {
			best = t
		}
	}
	return best
}

func holdsEvery(src string, lines []string) bool {
	have := map[string]bool{}
	for _, l := range strings.Split(src, "\n") {
		have[strings.TrimSpace(l)] = true
	}
	for _, l := range lines {
		if t := strings.TrimSpace(l); t != "" && !have[t] {
			return false
		}
	}
	return true
}
