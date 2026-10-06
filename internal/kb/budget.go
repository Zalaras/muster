package kb

// Budgets every check enforces. Each is a hard failure, never a warning (design K7):
// changing one is a visible commit, not a flag.
const (
	// BodyWords is the body budget for every record type except spec and runbook.
	BodyWords = 300
	// SpecWords is the body budget for a spec record.
	SpecWords = 800
	// RunbookWords is the body budget for a runbook record.
	RunbookWords = 600
	// SummaryChars bounds the one-line summary.
	SummaryChars = 160
	// RootClaudeLines bounds the root CLAUDE.md, fragments included.
	RootClaudeLines = 150
	// NestedClaudeWords bounds a nested CLAUDE.md, counted outside kb fragments.
	NestedClaudeWords = 400
	// RuleFileLines bounds a generated .claude/rules file; gen truncates past it and
	// check fails on the source side.
	RuleFileLines = 60
	// PackWords is the pack budget; pack warns past it and never fails. With the sections
	// scoped by role (kb:adr/knowledge-pack-sections-scoped-by-role) a three-feature plan's
	// largest pack measured 26,500 words (orchestrator, plans/settings-update-failures,
	// 2026-10-06), so the budget sits above that floor and warns on growth, not on every pack.
	PackWords = 30000
)
