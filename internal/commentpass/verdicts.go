package commentpass

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// Verdicts is the judge's output: every candidate id exactly once.
type Verdicts struct {
	Keep []KeepVerdict `json:"keep"`
	Drop []string      `json:"drop"`
}

type KeepVerdict struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

func readVerdicts(path string) (*Verdicts, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var v Verdicts
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &v, nil
}

// validate matches verdicts to the manifest and returns every problem at once.
func (v *Verdicts) validate(m *Manifest) (map[string]string, error) {
	known := map[string]bool{}
	for _, f := range m.Files {
		for _, c := range f.Candidates {
			known[c.ID] = true
		}
	}
	seen := map[string]int{}
	reasons := map[string]string{}
	var problems []string
	for _, k := range v.Keep {
		seen[k.ID]++
		if !known[k.ID] {
			problems = append(problems, "unknown id "+k.ID)
		}
		if strings.TrimSpace(k.Reason) == "" {
			problems = append(problems, "keep without a reason: "+k.ID)
		}
		reasons[k.ID] = k.Reason
	}
	for _, id := range v.Drop {
		seen[id]++
		if !known[id] {
			problems = append(problems, "unknown id "+id)
		}
	}
	for id, n := range seen {
		if n > 1 {
			problems = append(problems, fmt.Sprintf("id %s appears %d times", id, n))
		}
	}
	for id := range known {
		if seen[id] == 0 {
			problems = append(problems, "missing verdict for "+id)
		}
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		return nil, fmt.Errorf("verdicts rejected:\n  %s", strings.Join(problems, "\n  "))
	}
	return reasons, nil
}
