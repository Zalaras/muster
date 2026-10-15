package triage

// The GitHub label scheme, mirrored from docs/conventions.md § Issue labels. The lists are
// closed: a proposer picks from them and nothing else ever reaches `gh issue edit`, so a
// label name GitHub has not already defined cannot be written by a model.
// TestLabelNamesAppearInConventions keeps the two in step.
var (
	LabelKinds     = []string{"bug", "enhancement", "question", "chore"}
	LabelAreas     = []string{"rail", "lifecycle", "launch", "focus", "shell", "tiles", "masthead", "documents", "sessions", "update", "usage", "settings", "install", "hooks", "process"}
	LabelModifiers = []string{"ux", "perf", "regression", "claude-code", "needs-info", "security"}
)

// Labels is the label set a validated proposal applies: the kind, then each area, then each
// modifier, every one already checked against the lists above by ValidateProposal.
func (p Proposal) Labels() []string {
	out := make([]string, 0, 1+len(p.Area)+len(p.Modifiers))
	out = append(out, p.Kind)
	out = append(out, p.Area...)
	out = append(out, p.Modifiers...)
	return out
}
