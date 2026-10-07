package kb

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/goccy/go-yaml"
)

// ConfigPath is the repo-root file that carries every repo-specific value the tool reads:
// the record directories, the closed tag and role lists, the paths it writes, the budgets,
// the pack scoping per role and the refs and scope settings. Load fails without it, exactly
// as it fails without the observed-versions record. The record model itself — types,
// statuses, fields, citation syntax, generated markers — is code, not configuration.
const ConfigPath = "kb.yaml"

// Config is the parsed kb.yaml. Unknown keys fail at any depth; dirs, tags and roles are
// required; every other section defaults to the value the file documents when absent.
type Config struct {
	Dirs      map[Type]string `yaml:"dirs"`
	Tags      []string        `yaml:"tags"`
	Roles     []string        `yaml:"roles"`
	Paths     PathsConfig     `yaml:"paths"`
	Budgets   Budgets         `yaml:"budgets"`
	Tree      TreeConfig      `yaml:"tree"`
	Citations CitationsConfig `yaml:"citations"`
	Ownership []string        `yaml:"ownership"`
	Pack      PackConfig      `yaml:"pack"`
	Refs      RefsConfig      `yaml:"refs"`
	Scope     ScopeConfig     `yaml:"scope"`
}

// PathsConfig names the files and directories the tool reads and writes outside the record
// directories. ObservedVersions may be empty, which turns the verified-range check off.
type PathsConfig struct {
	Protocol         string `yaml:"protocol"`
	RootIndex        string `yaml:"root_index"`
	RulesDir         string `yaml:"rules_dir"`
	Conventions      string `yaml:"conventions"`
	PlansDir         string `yaml:"plans_dir"`
	ObservedVersions string `yaml:"observed_versions"`
}

// TreeConfig shapes the walk: directories never entered, and the hidden directories that are.
type TreeConfig struct {
	SkipDirs       []string `yaml:"skip_dirs"`
	KeepHiddenDirs []string `yaml:"keep_hidden_dirs"`
}

// CitationsConfig lists the globs no citation scan, kb comment check or refs pass reads.
type CitationsConfig struct {
	Exclude []string `yaml:"exclude"`
}

// DesignDoc is one docs/design file a role packs, whole or by its level-two sections.
type DesignDoc struct {
	Path     string   `yaml:"path"`
	Sections []string `yaml:"sections,omitempty"`
}

// PackConfig scopes a pack per role (kb:adr/knowledge-pack-sections-scoped-by-role).
type PackConfig struct {
	TouchesFullRoles      []string               `yaml:"touches_full_roles"`
	ContractlessRoles     []string               `yaml:"contractless_roles"`
	FactlessRoles         []string               `yaml:"factless_roles"`
	DecisionlessRoles     []string               `yaml:"decisionless_roles"`
	SystemDiagramRoles    []string               `yaml:"system_diagram_roles"`
	ProposedDecisionRoles []string               `yaml:"proposed_decision_roles"`
	DesignDocs            map[string][]DesignDoc `yaml:"design_docs"`
	ConventionsSections   map[string][]string    `yaml:"conventions_sections"`
}

// RefsConfig shapes kb refs: the tracked files it reads, the directories a cited path may
// open with, the make file and flag source it checks tokens against, and the tokens that
// look like paths but are not.
type RefsConfig struct {
	Files     []string          `yaml:"files"`
	TopDirs   []string          `yaml:"top_dirs"`
	Makefile  string            `yaml:"makefile"`
	Flags     FlagsConfig       `yaml:"flags"`
	Whitelist map[string]string `yaml:"whitelist"`
}

// FlagsConfig names the binary whose flags a backticked `binary -flag` token is checked
// against and the directory its non-test Go sources define them in. An empty binary turns
// the check off.
type FlagsConfig struct {
	Binary string `yaml:"binary"`
	Source string `yaml:"source"`
}

// ScopeConfig shapes kb scope: the source roots whose changed files need an owner in the
// plan's headers, and the globs judged by what they mirror rather than by their owner.
type ScopeConfig struct {
	Roots []string `yaml:"roots"`
	Skip  []string `yaml:"skip"`
}

// LoadConfig reads and validates root/kb.yaml, applying the documented defaults to every
// absent optional key.
func LoadConfig(root string) (*Config, error) {
	data, err := os.ReadFile(filepath.Join(root, ConfigPath))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("%s is missing: the kb tool reads its repo settings from it", ConfigPath)
	}
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", ConfigPath, err)
	}
	cfg := &Config{}
	if err := yaml.UnmarshalWithOptions(data, cfg, yaml.Strict()); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", ConfigPath, err)
	}
	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", ConfigPath, err)
	}
	return cfg, nil
}

// DefaultConfig returns the values the optional keys take when absent, plus the dirs, tags
// and roles the fixtures use; a real repo spells every key out in its kb.yaml.
func DefaultConfig() *Config {
	cfg := &Config{
		Dirs: map[Type]string{
			TypeRule: "docs/rules", TypeDecision: "docs/adr", TypeSpec: "docs/features", TypeDiagram: "docs/diagrams",
			TypeFact: "docs/facts", TypeLesson: "docs/lessons", TypeRunbook: "docs/runbooks", TypeReference: "docs/references",
		},
	}
	cfg.applyDefaults()
	return cfg
}

func (c *Config) applyDefaults() {
	c.Paths.Protocol = orDefault(c.Paths.Protocol, "docs/protocol.md")
	c.Paths.RootIndex = orDefault(c.Paths.RootIndex, "docs/INDEX.md")
	c.Paths.RulesDir = orDefault(c.Paths.RulesDir, ".claude/rules")
	c.Paths.Conventions = orDefault(c.Paths.Conventions, "docs/conventions.md")
	c.Paths.PlansDir = orDefault(c.Paths.PlansDir, "plans")
	c.Budgets.applyDefaults()
	c.Tree.SkipDirs = orList(c.Tree.SkipDirs, ".git", "node_modules", "web/dist", "dist", "bin", "internal/webui/assets")
	c.Tree.KeepHiddenDirs = orList(c.Tree.KeepHiddenDirs, ".claude", ".githooks", ".github")
	c.Citations.Exclude = orList(c.Citations.Exclude, "plans/**", "docs/history/**", "docs/research/**", "web/dist/**", "dist/**", "**/node_modules/**", "web/e2e/**/*.spec.ts")
	c.Ownership = orList(c.Ownership, "internal", "web/src", "web/e2e")
	c.Pack.applyDefaults()
	c.Refs.Files = orList(c.Refs.Files, "*.md", "*.go", "*.ts", "*.sh", "Makefile", ".githooks/*")
	c.Refs.TopDirs = orList(c.Refs.TopDirs, "docs", "internal", "web", "cmd", "spikes", "scripts", "tools", "test", ".claude", ".githooks", ".github")
	c.Refs.Makefile = orDefault(c.Refs.Makefile, "Makefile")
	c.Scope.Roots = orList(c.Scope.Roots, "cmd", "internal", "web/src", "web/e2e")
	c.Scope.Skip = orList(c.Scope.Skip, "**/CLAUDE.md", "web/src/protocol.ts")
	for i, d := range c.Ownership {
		c.Ownership[i] = strings.TrimSuffix(d, "/")
	}
	for i, d := range c.Scope.Roots {
		c.Scope.Roots[i] = strings.TrimSuffix(d, "/")
	}
	for t, d := range c.Dirs {
		c.Dirs[t] = strings.TrimSuffix(d, "/")
	}
	c.Paths.RulesDir = strings.TrimSuffix(c.Paths.RulesDir, "/")
	c.Paths.PlansDir = strings.TrimSuffix(c.Paths.PlansDir, "/")
}

func (p *PackConfig) applyDefaults() {
	p.TouchesFullRoles = orList(p.TouchesFullRoles, "review")
	p.ContractlessRoles = orList(p.ContractlessRoles, "review-browser", "review-maintainability")
	p.FactlessRoles = orList(p.FactlessRoles, "web-impl", "web-tests", "review-browser", "review-maintainability", "doc-reconcile")
	p.DecisionlessRoles = orList(p.DecisionlessRoles, "daemon-tests", "web-tests", "review-browser", "doc-reconcile")
	p.SystemDiagramRoles = orList(p.SystemDiagramRoles, "planner", "review", "orchestrator", "review-maintainability")
	p.ProposedDecisionRoles = orList(p.ProposedDecisionRoles, "review", "planner")
	if p.DesignDocs == nil {
		p.DesignDocs = map[string][]DesignDoc{
			"web-impl":       {{Path: "docs/design/design-system.md"}, {Path: "docs/design/ux-flows.md"}},
			"review-browser": {{Path: "docs/design/design-system.md", Sections: []string{"6.", "7."}}, {Path: "docs/design/ux-flows.md"}},
		}
	}
	if p.ConventionsSections == nil {
		p.ConventionsSections = map[string][]string{
			"daemon-impl":            {"Stack", "Go", "Composition roots", "Design", "Knowledge records"},
			"web-impl":               {"Stack", "TypeScript", "Composition roots", "Design", "Knowledge records"},
			"daemon-tests":           {"Stack", "Go", "Design", "Testing", "Knowledge records"},
			"web-tests":              {"Design", "Testing", "Knowledge records"},
			"e2e-specs":              {"Testing", "Knowledge records"},
			"review":                 {"Stack", "Go", "TypeScript", "Composition roots", "Testing", "Knowledge records"},
			"review-browser":         {"Stack", "TypeScript", "Testing", "Knowledge records"},
			"review-maintainability": {"Stack", "Go", "TypeScript", "Composition roots", "Design", "Knowledge records"},
		}
	}
}

// validate holds the required keys to their contract: a directory for every type, and a
// non-empty tag and role list.
func (c *Config) validate() error {
	for _, t := range typeOrder {
		if c.Dirs[t] == "" {
			return fmt.Errorf("dirs is missing type %q", t)
		}
	}
	for t := range c.Dirs {
		if !contains(typeNames(), string(t)) {
			return fmt.Errorf("dirs names unknown type %q (want %s)", t, joinOr(typeNames()))
		}
	}
	if len(c.Tags) == 0 {
		return errors.New("tags must list at least one tag")
	}
	if len(c.Roles) == 0 {
		return errors.New("roles must list at least one role")
	}
	return nil
}

// bodyBudget is the word budget for a record type.
func (c *Config) bodyBudget(t Type) int {
	switch t {
	case TypeSpec:
		return c.Budgets.SpecWords
	case TypeRunbook:
		return c.Budgets.RunbookWords
	default:
		return c.Budgets.BodyWords
	}
}

// Excluded reports whether a citations.exclude glob matches rel.
func (c *Config) Excluded(rel string) bool {
	for _, g := range c.Citations.Exclude {
		if MatchGlob(g, rel) {
			return true
		}
	}
	return false
}

// SpecDir is the feature directory; a feature's spec sits at SpecDir/<name>/spec.md.
func (c *Config) SpecDir() string { return c.Dirs[TypeSpec] }

// PlanPath is the plan file for a named plan.
func (c *Config) PlanPath(plan string) string { return c.Paths.PlansDir + "/" + plan + "/plan.md" }

func orDefault(v, d string) string {
	if v == "" {
		return d
	}
	return v
}

// orList keeps an explicit list, empty included, and fills only an absent (nil) one.
func orList(v []string, d ...string) []string {
	if v == nil {
		return d
	}
	return v
}
