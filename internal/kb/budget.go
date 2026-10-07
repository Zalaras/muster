package kb

// Budgets every check enforces. Each is a hard failure, never a warning (design K7): a repo
// sets them in kb.yaml under budgets, and changing one is a visible commit, not a flag. A
// key left out takes the default beside its field.
type Budgets struct {
	// BodyWords is the body budget for every record type except spec and runbook.
	BodyWords int `yaml:"body_words"`
	// SpecWords is the body budget for a spec record.
	SpecWords int `yaml:"spec_words"`
	// RunbookWords is the body budget for a runbook record.
	RunbookWords int `yaml:"runbook_words"`
	// SummaryChars bounds the one-line summary.
	SummaryChars int `yaml:"summary_chars"`
	// RootClaudeLines bounds the root CLAUDE.md, fragments included.
	RootClaudeLines int `yaml:"root_claude_lines"`
	// NestedClaudeWords bounds a nested CLAUDE.md, counted outside kb fragments.
	NestedClaudeWords int `yaml:"nested_claude_words"`
	// RuleFileLines bounds a generated rules file; gen truncates past it and check fails on
	// the source side.
	RuleFileLines int `yaml:"rule_file_lines"`
	// PackWords is the pack budget; pack warns past it and never fails. With the sections
	// scoped by role (kb:adr/knowledge-pack-sections-scoped-by-role) a three-feature plan's
	// largest pack measured 26,500 words (orchestrator, plans/settings-update-failures,
	// 2026-10-06), so the default sits above that floor and warns on growth, not on every pack.
	PackWords int `yaml:"pack_words"`
}

// defaultBudgets are the values a budgets key takes when absent.
var defaultBudgets = Budgets{
	BodyWords: 300, SpecWords: 800, RunbookWords: 600, SummaryChars: 160,
	RootClaudeLines: 150, NestedClaudeWords: 400, RuleFileLines: 60, PackWords: 30000,
}

func (b *Budgets) applyDefaults() {
	for _, f := range []struct {
		dst *int
		d   int
	}{
		{&b.BodyWords, defaultBudgets.BodyWords}, {&b.SpecWords, defaultBudgets.SpecWords},
		{&b.RunbookWords, defaultBudgets.RunbookWords}, {&b.SummaryChars, defaultBudgets.SummaryChars},
		{&b.RootClaudeLines, defaultBudgets.RootClaudeLines}, {&b.NestedClaudeWords, defaultBudgets.NestedClaudeWords},
		{&b.RuleFileLines, defaultBudgets.RuleFileLines}, {&b.PackWords, defaultBudgets.PackWords},
	} {
		if *f.dst == 0 {
			*f.dst = f.d
		}
	}
}
